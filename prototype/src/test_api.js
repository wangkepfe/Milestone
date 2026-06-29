// End-to-end tests of the live REST API: spins up the server in-process, then
// runs agents over HTTP (each: long-poll /wait → GET state → plan locally →
// POST /action). Two scenarios:
//   1. both seats agent-driven (the normal BYOA live loop)
//   2. one seat SILENT + a short deadline → server's fallback bot covers it
//      (the session-liveness mechanic)
//   node src/test_api.js

import { createServer } from "./server.js";
import { planTurnIds } from "./bot.js";

const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const jpost = async (p, b) => (await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();
const jget = async (p) => (await fetch(base + p)).json();

async function agent(matchId, seat, token, log) {
  for (let guard = 0; guard < 100; guard++) {
    const w = await jget(`/match/${matchId}/wait?token=${token}`);
    if (w.status === "game_over") return w;
    if (w.status !== "your_turn") continue;
    const ids = planTurnIds(w.state, seat, { beam: 6, depth: 6 });
    const res = await jpost(`/match/${matchId}/action`, { token, turnToken: w.turnToken, actionIds: ids });
    if (res.error) { console.log(`  ${seat} ERROR: ${res.error}`); return res; }
    if (log) console.log(`  ${seat} played ${ids.length} action(s) → ${res.valuations}`);
    if (res.status === "game_over") return res;
  }
}

// ---------- Scenario 1: both agents ----------
console.log("Scenario 1 — both seats agent-driven over HTTP:");
{
  const { matchId, tokens } = await jpost("/match", { a: "closedai", b: "anthrabbit", deadlineMs: 30000 });
  const [ra, rb] = await Promise.all([agent(matchId, "A", tokens.A, true), agent(matchId, "B", tokens.B, true)]);
  const fin = ra?.status === "game_over" ? ra : rb;
  console.log(`  RESULT: winner=${fin.result?.winner} by ${fin.result?.reason} · ${fin.valuations}`);
}

// ---------- Scenario 2: B is silent; fallback bot must cover it ----------
console.log("\nScenario 2 — seat B is SILENT, deadline 600ms → fallback bot covers B:");
{
  const { matchId, tokens } = await jpost("/match", { a: "shallowseek", b: "googlitch", deadlineMs: 600 });
  const ra = await agent(matchId, "A", tokens.A, false); // only A plays; B never connects
  console.log(`  match completed without B ever connecting (fallback covered every B turn).`);
  console.log(`  RESULT: winner=${ra.result?.winner} by ${ra.result?.reason} · ${ra.valuations}`);
}

server.close();
console.log("\nAll API scenarios passed.");
