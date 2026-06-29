// Tests for HUMAN-vs-HUMAN mode of the live API (server.js mode:"human").
// Verifies the three things human play needs that bot mode does not:
//   1. incremental single-action posts that do NOT auto-end the turn (turnToken stable),
//   2. no deadline fallback bot stealing a slow human's turn,
//   3. per-seat redaction — a seat never receives the opponent's hand/deck identities.
// Plus: join tracking, illegal-action resync (400 + fresh redacted state), concede.
//   node src/test_pvp.js

import { createServer } from "./server.js";
import { initMatch } from "./engine.js";
import { DECKS } from "./cards.js";

const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const jpost = async (p, b) => { const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { code: r.status, body: await r.json() }; };
const jget = async (p) => { const r = await fetch(base + p); return { code: r.status, body: await r.json() }; };

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.log("  ✗ FAIL: " + msg); } else { console.log("  ✓ " + msg); } }

// ---------- 1. create a human match ----------
console.log("Human match — setup, redaction, incremental play:");
const { body: created } = await jpost("/match", { a: "closedai", b: "anthrabbit", mode: "human" });
ok(created.human === true, "match reports human:true");
const { A: tokA, B: tokB } = created.tokens;
const id = created.matchId;

// joined tracking: nobody joined until they hit /state or /wait
let s = (await jget(`/match/${id}/state?token=${tokA}`)).body;
ok(s.joined.A === true && s.joined.B === false, "joining seat A flips joined.A only");
s = (await jget(`/match/${id}/state?token=${tokB}`)).body;
ok(s.bothJoined === true, "joining seat B sets bothJoined");

// ---------- 2. redaction: the active seat must not see the opponent's hand/deck ----------
const aView = (await jget(`/match/${id}/state?token=${tokA}`)).body;
const me = aView.seat;                 // whichever seat A actually is (always "A")
const opp = me === "A" ? "B" : "A";
ok(aView.state.players[opp].hand === undefined, "opponent hand array is stripped");
ok(typeof aView.state.players[opp].handCount === "number", "opponent handCount is present");
ok(aView.state.players[opp].deck === undefined, "opponent deck is stripped");
ok(aView.state.players[me].deck === undefined, "your own deck order is stripped too");
ok(Array.isArray(aView.state.players[me].hand), "your own hand is visible");
// belt-and-suspenders: no opponent card identity anywhere in the serialized payload
const rawA = JSON.stringify(aView);
const oppHandIds = new Set(); // we can't read them from A's view (good) — check via B's own view instead
const bSelf = (await jget(`/match/${id}/state?token=${tokB}`)).body;
for (const c of bSelf.state.players[opp === "B" ? "B" : "A"].hand || []) oppHandIds.add(c.cardId);
let leaked = [...oppHandIds].filter((cid) => cid && rawA.includes(`"${cid}"`));
ok(leaked.length === 0, "no opponent card id leaks into the other seat's payload");

// The deck shuffle is deterministic in (seed, public faction lists), so the seed/rngState
// are as sensitive as the hand itself. They MUST NOT survive redaction.
ok(aView.state.seed === undefined, "RNG seed stripped from redacted state");
ok(aView.state.rngState === undefined, "live rngState stripped from redacted state");
ok(aView.state.iidSeq === undefined, "iidSeq stripped from redacted state");
// ...and the seed must not be guessable from the matchId. Reconstruct with the OLD derivable
// seed scheme (1234 + seq, where matchId is "m<seq>") and confirm it no longer yields B's hand.
{
  const seqNum = Number(id.slice(1));
  const guess = initMatch(1234 + seqNum + 1, DECKS[aView.aKey], DECKS[aView.bKey], { log: false });
  const reconHand = JSON.stringify(guess.players[opp].hand.map((c) => c.cardId));
  const realHand = JSON.stringify((bSelf.state.players.B.hand || []).map((c) => c.cardId));
  ok(reconHand !== realHand, "opponent hand NOT reconstructable from the matchId-derived seed (seed is randomized)");
}

// ---------- 3. incremental action: turn stays OPEN, turnToken stable ----------
// The seed (and coin flip) is randomized, so create fresh matches until the active
// seat has a real (non-end) action, then drive ONE action and assert the turn doesn't end.
function activeSeat(state) { return state.turnOf; }
{
  let asserted = false;
  for (let t = 0; t < 30 && !asserted; t++) {
    const c = (await jpost("/match", { a: "shallowseek", b: "closedai", mode: "human" })).body;
    const av = (await jget(`/match/${c.matchId}/state?token=${c.tokens.A}`)).body;
    const actorTok = av.status === "your_turn" ? c.tokens.A : c.tokens.B;
    const sv = (await jget(`/match/${c.matchId}/state?token=${actorTok}`)).body;
    const moves = sv.legalActions.filter((a) => a.id !== "end");
    if (!moves.length) continue;
    const r = await jpost(`/match/${c.matchId}/action`, { token: actorTok, turnToken: sv.turnToken, actionIds: [moves[0].id] });
    ok(r.code === 200, "single mid-turn action returns 200");
    ok(r.body.status === "your_turn", "turn stays OPEN after one action (no auto-end)");
    ok(r.body.turnToken === sv.turnToken, "turnToken is STABLE mid-turn");
    asserted = true;
  }
  ok(asserted, "found a match exercising the mid-turn incremental path");
}

// ---------- 4. illegal / stale action → resync, never a hard error ----------
// (operate on the active seat of the original match `id`)
let act = aView.state.turnOf === "A" ? { tok: tokA, seat: "A" } : { tok: tokB, seat: "B" };
const stale = await jpost(`/match/${id}/action`, { token: act.tok, turnToken: "t999", actionIds: ["end"] });
ok(stale.code === 409 && stale.body.legalActions !== undefined, "stale turnToken → 409 with fresh legal actions");
const other = (s) => (s === "A" ? "B" : "A");
const bogus = await jpost(`/match/${id}/action`, { token: act.tok, turnToken: (await jget(`/match/${id}/state?token=${act.tok}`)).body.turnToken, actionIds: ["atk:m999:HERO_A"] });
ok(bogus.code === 400 && bogus.body.state.players[other(act.seat)].hand === undefined, "illegal action → 400 with REDACTED fresh state");

// ---------- 5. the opponent's /wait is blocking and resolves on end-turn ----------
console.log("\nLong-poll handoff:");
const live = (await jget(`/match/${id}/state?token=${act.tok}`)).body;
const oppTok = act.seat === "A" ? tokB : tokA;
let resolved = false;
const waitP = jget(`/match/${id}/wait?token=${oppTok}`).then((r) => { resolved = true; return r; });
await new Promise((r) => setTimeout(r, 120));
ok(resolved === false, "opponent's /wait blocks while it is not their turn");
await jpost(`/match/${id}/action`, { token: act.tok, turnToken: live.turnToken, actionIds: ["end"] });
const w = await waitP;
ok(w.body.status === "your_turn", "ending the turn wakes the opponent's /wait");

// ---------- 6. full game by two incremental "human" drivers, no bot fallback ----------
console.log("\nFull incremental game (two human drivers, no deadline bot):");
async function humanTurn(matchId, seat, token) {
  // mimic a human clicking actions one at a time, then ending — re-reading legal actions each click
  let st = (await jget(`/match/${matchId}/state?token=${token}`)).body;
  let guard = 0;
  while (st.status === "your_turn" && guard++ < 40) {
    const choices = st.legalActions.filter((a) => a.id !== "end");
    if (!choices.length) break;
    const r = await jpost(`/match/${matchId}/action`, { token, turnToken: st.turnToken, actionIds: [choices[0].id] });
    st = r.body;
    if (st.status === "game_over") return st;
  }
  if (st.status === "your_turn") { const r = await jpost(`/match/${matchId}/action`, { token, turnToken: st.turnToken, actionIds: ["end"] }); st = r.body; }
  return st;
}
async function driver(matchId, seat, token) {
  for (let guard = 0; guard < 200; guard++) {
    const wv = (await jget(`/match/${matchId}/wait?token=${token}`)).body;
    if (wv.status === "game_over") return wv;
    if (wv.status !== "your_turn") continue;
    const after = await humanTurn(matchId, seat, token);
    if (after.status === "game_over") return after;
  }
}
{
  const c = (await jpost("/match", { a: "shallowseek", b: "googlitch", mode: "human" })).body;
  const [ra, rb] = await Promise.all([driver(c.matchId, "A", c.tokens.A), driver(c.matchId, "B", c.tokens.B)]);
  const fin = ra?.status === "game_over" ? ra : rb;
  ok(!!fin && fin.status === "game_over", "incremental human game reaches game_over");
  ok(["lethal", "burnout", "draw_mutual", "draw_ply_cap"].includes(fin.result.reason), `terminated by a real reason (${fin.result?.reason})`);
  console.log(`  RESULT: winner=${fin.result?.winner} by ${fin.result?.reason} · ${fin.valuations}`);
}

// ---------- 7. concede ----------
console.log("\nConcede:");
{
  const c = (await jpost("/match", { a: "closedai", b: "googlitch", mode: "human" })).body;
  const r = await jpost(`/match/${c.matchId}/concede`, { token: c.tokens.A });
  ok(r.body.status === "game_over" && r.body.result.reason === "concede", "seat A concede → game_over by concede");
  ok(r.body.result.winner === "B", "the other seat wins on concede");
}

server.close();
if (failures) { console.log(`\n${failures} ASSERTION(S) FAILED`); process.exit(1); }
console.log("\nAll human-mode (PvP) scenarios passed.");
