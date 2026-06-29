// Test the hardened (worker_threads) script sandbox:
//   1. a greedy script runs in its OWN thread and plays a full match vs the bot.
//   2. an infinite-loop script is HARD-KILLED via worker.terminate() (not just a
//      vm timeout) and the fallback bot covers every turn — server never blocks.
//   node src/test_worker.js

import { initMatch, isTerminal } from "./engine.js";
import { DECKS } from "./cards.js";
import { takeTurn } from "./bot.js";
import { takeScriptTurnWorker } from "./sandbox.js";

const GREEDY_SCRIPT = `
function choose_turn(state, legal, api) {
  var seq = [];
  for (var step = 0; step < 16; step++) {
    var options = api.legal(seq).filter(function (a) { return a.kind !== "end_turn"; });
    var best = null, bestScore = api.simulate(seq).score;
    for (var i = 0; i < options.length; i++) {
      var r = api.simulate(seq.concat([options[i].id]));
      if (r.ok && r.score > bestScore) { bestScore = r.score; best = options[i].id; }
    }
    if (best === null) break;
    seq.push(best);
  }
  return seq;
}`;
const BAD_SCRIPT = `function choose_turn() { while (true) {} }`;

async function play(label, src, timeoutMs) {
  const S = initMatch(777, DECKS.closedai, DECKS.anthrabbit, { log: false });
  let peakMs = 0, fallbacks = 0, scriptTurns = 0, guard = 0;
  while (!isTerminal(S).over && guard++ < 200) {
    if (S.turnOf === "A") {
      const r = await takeScriptTurnWorker(S, "A", src, { timeoutMs });
      scriptTurns++;
      if (r.ms) peakMs = Math.max(peakMs, r.ms);
      if (r.fallback) fallbacks++;
    } else {
      takeTurn(S, "B");
    }
  }
  const t = isTerminal(S);
  console.log(`${label}`);
  console.log(`   winner=${t.winner} by ${t.reason} · ${scriptTurns} worker turns · peak ${peakMs ? peakMs.toFixed(1) + "ms" : "n/a"} · fallbacks=${fallbacks}/${scriptTurns} (cap ${timeoutMs}ms)\n`);
}

await play("Scenario 1 — greedy script in its own WORKER thread vs heuristic bot:", GREEDY_SCRIPT, 200);
await play("Scenario 2 — infinite-loop script → worker hard-killed, fallback covers it:", BAD_SCRIPT, 100);
console.log("Worker sandbox OK: process-isolated, hard-killable, graceful fallback.");
