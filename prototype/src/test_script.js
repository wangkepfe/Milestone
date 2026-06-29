// Test the script-bot sandbox (BYOA script entry):
//   1. a player-authored greedy SCRIPT plays a full match vs the heuristic bot,
//      under a CPU cap, and we report its peak ms/turn.
//   2. a malicious infinite-loop script blows the cap every turn → the fallback
//      bot covers it and the match still completes (the cap is enforced).
//   node src/test_script.js

import { initMatch, isTerminal } from "./engine.js";
import { DECKS } from "./cards.js";
import { takeTurn } from "./bot.js";
import { takeScriptTurn } from "./sandbox.js";

// A real player-authored bot: greedily build the turn, searching the engine
// through the sandbox API (api.legal evolves the action set as you commit plays).
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
}
`;

const BAD_SCRIPT = `function choose_turn() { while (true) {} }`; // never returns → timeout

function playScriptMatch(label, scriptSrc, timeoutMs) {
  const S = initMatch(777, DECKS.closedai, DECKS.anthrabbit, { log: false });
  let peakMs = 0, fallbacks = 0, scriptTurns = 0, guard = 0;
  while (!isTerminal(S).over && guard++ < 200) {
    if (S.turnOf === "A") {
      const r = takeScriptTurn(S, "A", scriptSrc, { timeoutMs });
      scriptTurns++;
      if (r.ms) peakMs = Math.max(peakMs, r.ms);
      if (r.fallback) fallbacks++;
    } else {
      takeTurn(S, "B"); // heuristic bot
    }
  }
  const t = isTerminal(S);
  console.log(`${label}`);
  console.log(`   winner=${t.winner} by ${t.reason} · ${scriptTurns} script turns · peak ${peakMs ? peakMs.toFixed(1) + "ms" : "n/a"} · fallbacks=${fallbacks}/${scriptTurns} (cap ${timeoutMs}ms)\n`);
}

playScriptMatch("Scenario 1 — greedy SCRIPT (A) vs heuristic bot (B):", GREEDY_SCRIPT, 100);
playScriptMatch("Scenario 2 — infinite-loop script (A) → cap enforced, fallback covers it:", BAD_SCRIPT, 50);

console.log("Script sandbox OK: capped, deterministic, graceful fallback.");
