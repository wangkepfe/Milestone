// Generate a full bot-vs-bot match as a replay: a list of per-turn snapshots the
// spectator UI steps through. Open-information game → hands are included.

import { initMatch, isTerminal } from "./engine.js";
import { DECKS, CARDS } from "./cards.js";
import { takeTurn } from "./bot.js";

let seedSeq = 9001;

function side(p) {
  return {
    valuation: p.valuation, armor: p.armor, maxCompute: p.compute.max,
    handCount: p.hand.length, deckCount: p.deck.length,
    board: p.board.map((m) => ({ id: m.cardId, name: m.name, atk: m.attack, hp: m.health, kw: m.keywords })),
    hand: p.hand.map((c) => CARDS[c.cardId].name),
  };
}

function snap(S, seat, opp) {
  return {
    oppHp: S.players[opp].valuation + S.players[opp].armor,
    myHp: S.players[seat].valuation + S.players[seat].armor,
    myBoard: S.players[seat].board.length,
    oppBoard: S.players[opp].board.length,
  };
}

// A lightweight "why" for the spectator log, derived from the turn's net effect.
function makeRationale(b, a, actions, won) {
  const faceDmg = b.oppHp - a.oppHp;
  const lifeGain = a.myHp - b.myHp;
  const boardGrow = a.myBoard - b.myBoard;
  const oppRemoved = b.oppBoard - a.oppBoard;
  if (won) return "Closing out the game — lethal!";
  if (faceDmg >= 6) return `Pressing hard — ${faceDmg} to their Valuation.`;
  if (lifeGain >= 4) return `Stabilizing — shoring up ${lifeGain} life/armor.`;
  if (oppRemoved >= 2) return `Clearing house — removed ${oppRemoved} of their Models.`;
  if (boardGrow >= 2) return "Developing — building a wider board.";
  if (faceDmg >= 2) return `Chipping in for ${faceDmg}.`;
  if (oppRemoved >= 1) return "Trading off a threat.";
  if (actions.length === 1 && actions[0] === "(pass)") return "Holding — nothing worth committing.";
  return "Maneuvering for position.";
}

export function buildReplay(aKey, bKey, opts = {}) {
  const a = DECKS[aKey] || DECKS.closedai;
  const b = DECKS[bKey] || DECKS.anthrabbit;
  const seed = opts.seed ?? seedSeq++;
  const S = initMatch(seed, a, b, { log: false });
  const bot = { beam: opts.beam ?? 6, depth: opts.depth ?? 6 };
  const turns = [];
  let guard = 0;
  while (!isTerminal(S).over && guard++ < 200) {
    const seat = S.turnOf;
    const opp = seat === "A" ? "B" : "A";
    const p = S.players[seat];
    const turnNumber = S.turnNumber[seat];
    const before = snap(S, seat, opp);
    const actions = takeTurn(S, seat, bot); // returns readable action strings
    const after = snap(S, seat, opp);
    const term = isTerminal(S);
    turns.push({
      turnNumber, seat, company: p.company,
      actions: actions.length ? actions : ["(pass)"],
      rationale: makeRationale(before, after, actions.length ? actions : ["(pass)"], term.over && term.winner === seat),
      shared: S.shared.map((m) => ({ id: m.cardId, name: m.name, atk: m.attack, hp: m.health })),
      A: side(S.players.A), B: side(S.players.B),
    });
  }
  const t = isTerminal(S);
  return { seed, a: a.name, b: b.name, aKey: aKey || "closedai", bKey: bKey || "anthrabbit", turns, result: { winner: t.winner, reason: t.reason } };
}
