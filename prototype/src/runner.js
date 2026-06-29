// Headless bot-vs-bot runner (roadmap Milestone 1).
//   node src/runner.js                  -> one verbose match (ClosedAI vs Anthrabbit)
//   node src/runner.js --seed 7         -> pick the coin/shuffle seed
//   node src/runner.js --games 200 --quiet  -> win-rate + avg-length benchmark
//   node src/runner.js --a closedai --b anthrabbit

import { initMatch, isTerminal } from "./engine.js";
import { DECKS } from "./cards.js";
import { takeTurn } from "./bot.js";

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const deckA = DECKS[arg("a", "closedai")];
const deckB = DECKS[arg("b", "anthrabbit")];
const quiet = arg("quiet", false) === true;
const games = parseInt(arg("games", "1"), 10);
const search = arg("search", false) === true;
const beam = parseInt(arg("beam", "8"), 10);
const depth = parseInt(arg("depth", "6"), 10);
const BOT = search ? { beam, depth } : undefined; // beam×depth = the CPU-cap knob

function valLine(S) {
  const a = S.players.A, b = S.players.B;
  return `A ${a.valuation}(+${a.armor}) | B ${b.valuation}(+${b.armor})`;
}

function playMatch(seed, verbose) {
  const S = initMatch(seed, deckA, deckB, { log: verbose });
  if (verbose) {
    console.log(`\n=== ${deckA.name}  (A)   vs   ${deckB.name}  (B) ===`);
    console.log(`seed=${seed} · ${S.log[0]}`);
  }
  let guard = 0;
  while (!isTerminal(S).over && guard++ < 200) {
    const seat = S.turnOf;
    const p = S.players[seat];
    const actions = takeTurn(S, seat, BOT);
    if (verbose) {
      console.log(`\nT${S.turnNumber[seat]} ${seat} (${p.company}) · Compute ${p.compute.max}`);
      if (actions.length) for (const a of actions) console.log("   • " + a);
      else console.log("   • (pass)");
      console.log("   " + valLine(S));
    }
  }
  const term = isTerminal(S);
  return { winner: term.winner, reason: term.reason, plies: S.ply, S };
}

if (arg("rr", false) === true) {
  const keys = ["closedai", "anthrabbit", "googlitch", "shallowseek"];
  const g = parseInt(arg("games", "100"), 10);
  const wins = {}; for (const k of keys) wins[k] = 0;
  let totalPlies = 0, n = 0;
  const grid = {};
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const x = keys[i], y = keys[j];
    let xw = 0;
    for (let k = 0; k < g; k++) {
      // alternate seats so first-player advantage is shared
      const xIsA = k % 2 === 0;
      const S = initMatch(2000 + i * 131 + j * 17 + k * 7, DECKS[xIsA ? x : y], DECKS[xIsA ? y : x], { log: false });
      let guard = 0;
      while (!isTerminal(S).over && guard++ < 200) takeTurn(S, S.turnOf, BOT);
      const w = isTerminal(S).winner;
      const winnerKey = w === "A" ? (xIsA ? x : y) : w === "B" ? (xIsA ? y : x) : null;
      if (winnerKey === x) { xw++; wins[x]++; } else if (winnerKey === y) { wins[y]++; }
      totalPlies += S.ply; n++;
    }
    grid[`${x} vs ${y}`] = `${((100 * xw) / g).toFixed(0)}% / ${((100 * (g - xw)) / g).toFixed(0)}%`;
  }
  console.log(`\n=== Round-robin · ${g} games/pairing · ${n} games total ===`);
  for (const [k, v] of Object.entries(grid)) console.log(`  ${k.padEnd(28)} ${v}`);
  console.log(`\nOverall win counts (out of ${(keys.length - 1) * g} each):`);
  for (const k of keys) console.log(`  ${k.padEnd(14)} ${wins[k]}  (${((100 * wins[k]) / ((keys.length - 1) * g)).toFixed(1)}%)`);
  console.log(`avg length: ${(totalPlies / n).toFixed(1)} plies`);
} else if (games <= 1) {
  const seed = parseInt(arg("seed", "42"), 10);
  const r = playMatch(seed, !quiet);
  const who = r.winner ? `${r.winner} (${r.S.players[r.winner].company})` : "DRAW";
  console.log(`\n=== RESULT: ${who} by ${r.reason} in ${r.plies} plies ===`);
} else {
  let aWins = 0, bWins = 0, draws = 0, totalPlies = 0;
  const reasons = {};
  for (let i = 0; i < games; i++) {
    const r = playMatch(1000 + i * 7, false);
    if (r.winner === "A") aWins++; else if (r.winner === "B") bWins++; else draws++;
    totalPlies += r.plies;
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  }
  const pct = (n) => ((100 * n) / games).toFixed(1) + "%";
  console.log(`\n=== ${games} games · ${deckA.name} (A) vs ${deckB.name} (B) ===`);
  console.log(`A wins: ${aWins} (${pct(aWins)})   B wins: ${bWins} (${pct(bWins)})   draws: ${draws} (${pct(draws)})`);
  console.log(`avg length: ${(totalPlies / games).toFixed(1)} plies (~${(totalPlies / games / 2).toFixed(1)} turns/side)`);
  console.log(`end reasons:`, reasons);
}
