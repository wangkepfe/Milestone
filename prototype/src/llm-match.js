// Play a match where one (or both) seats are driven by a real LLM via the Claude
// API, the other by the heuristic bot. The concrete "an LLM plays the game" demo.
//   ANTHROPIC_API_KEY=sk-... node src/llm-match.js --llm a --strategyA "aggressive: race face, trade only to survive"
//   node src/llm-match.js            # no key → both seats fall back to the bot
//
// Flags: --a/--b deck keys · --llm a|b|ab (which seats are LLM) · --model ID
//        --strategyA / --strategyB strategy prompts

import { initMatch, isTerminal } from "./engine.js";
import { DECKS } from "./cards.js";
import { takeTurn } from "./bot.js";
import { llmTakeTurn } from "./llm-adapter.js";

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); if (i < 0) return d; const v = process.argv[i + 1]; return v && !v.startsWith("--") ? v : true; };
const aKey = arg("a", "closedai"), bKey = arg("b", "anthrabbit");
const llmSeats = String(arg("llm", "a")).toUpperCase();
const model = arg("model", "claude-haiku-4-5");
const apiKey = process.env.ANTHROPIC_API_KEY;
const strat = { A: arg("strategyA", ""), B: arg("strategyB", "") };

const S = initMatch(7, DECKS[aKey] || DECKS.closedai, DECKS[bKey] || DECKS.anthrabbit, { log: false });
console.log(`${(DECKS[aKey] || DECKS.closedai).name} (A) vs ${(DECKS[bKey] || DECKS.anthrabbit).name} (B)`);
if (!apiKey) console.log("(! ANTHROPIC_API_KEY not set — LLM seats fall back to the heuristic bot.)");
else console.log(`(LLM seats: ${llmSeats} · model ${model})`);

let guard = 0;
while (!isTerminal(S).over && guard++ < 200) {
  const seat = S.turnOf;
  const useLLM = apiKey && llmSeats.includes(seat);
  let actions;
  if (useLLM) {
    try { actions = await llmTakeTurn(S, seat, { model, apiKey, strategy: strat[seat] }); }
    catch (e) { console.log(`   [LLM error: ${e.message} — bot fallback]`); actions = takeTurn(S, seat, { beam: 6, depth: 6 }); }
  } else {
    actions = takeTurn(S, seat, { beam: 6, depth: 6 });
  }
  console.log(`\nT${S.turnNumber[seat]} ${seat} ${S.players[seat].company}${useLLM ? " [LLM]" : ""}`);
  for (const a of actions) console.log("   • " + a);
  console.log(`   A ${S.players.A.valuation}(+${S.players.A.armor}) | B ${S.players.B.valuation}(+${S.players.B.armor})`);
}
const t = isTerminal(S);
console.log(`\nRESULT: ${t.winner || "draw"} by ${t.reason} in ${S.ply} plies`);
