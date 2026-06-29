// Heuristic bot: greedy one-ply search over a state-evaluation function.
// Fast (a few JSON clones per candidate) — comfortably under the ~100ms script cap.
// This is the reference "decent" bot: develops, takes favourable trades, pushes
// lethal, heals when behind, won't waste resources (a no-gain action scores 0).

import { legalActions, applyAction, isTerminal, cloneState, enemyOf } from "./engine.js";
import { CARDS } from "./cards.js";

function sumBoard(board) { return board.reduce((s, m) => s + m.attack * 1.0 + m.health * 0.8, 0); }
function launchVal(l) { return l ? l.charges * l.attack * 0.6 : 0; } // future face reach from a weapon

export function evalState(S, seat) {
  const me = S.players[seat];
  const opp = S.players[enemyOf(seat)];
  let score = 0;
  score += (me.valuation + me.armor) * 1.0;
  score -= (opp.valuation + opp.armor) * 1.2;          // value damage to them a bit more (push tempo)
  score += sumBoard(me.board) * 1.5;
  score -= sumBoard(opp.board) * 1.5;
  score += launchVal(me.launch) - launchVal(opp.launch); // value equipped Launches (else weapons are ignored)
  score += me.hand.length * 0.3;
  score -= opp.hand.length * 0.3;
  if (opp.valuation <= 0) score += 1000;               // lethal
  if (me.valuation <= 0) score -= 1000;
  return score;
}

function allModels(S) { return [...S.players.A.board, ...S.players.B.board, ...(S.shared || [])]; }
function targetName(S, tid) {
  if (tid == null) return null;
  if (tid === "HERO_A" || tid === "HERO_B") return "CEO";
  const m = allModels(S).find((x) => x.iid === tid);
  return m ? m.name : tid;
}

function describe(S, a) {
  if (a.kind === "play_card") { const t = targetName(S, a.targetId); return `play ${CARDS[a.cardId].name}` + (t ? ` → ${t}` : ""); }
  if (a.kind === "attack") { const atk = allModels(S).find((m) => m.iid === a.attackerIid); return `${atk ? atk.name : a.attackerIid} ⚔ ${targetName(S, a.targetId)}`; }
  if (a.kind === "hero_power") { const t = targetName(S, a.targetId); return `Hero Power` + (t ? ` → ${t}` : ""); }
  if (a.kind === "hero_attack") return `CEO ⚔ ${targetName(S, a.targetId)}`;
  return a.kind;
}

// Drive one full turn on the real state S. Returns a list of action strings.
//   opts.beam  → beam-search turn planner (lookahead; pilots combos/tempo).
//   default    → greedy one-ply (cheap heuristic).
// The beam width × depth IS the "script CPU cap" knob from BYOA.md §4: bigger
// search = stronger, more solver-like play; small = fast heuristic.
export function takeTurn(S, seat, opts) {
  if (opts && opts.beam) return takeTurnSearch(S, seat, opts);
  const taken = [];
  let guard = 0;
  while (!isTerminal(S).over && S.turnOf === seat && guard++ < 60) {
    const la = legalActions(S, seat).filter((a) => a.kind !== "end_turn");
    const base = evalState(S, seat);
    let best = null, bestGain = 0.001; // must strictly beat doing nothing
    for (const a of la) {
      const S2 = cloneState(S);
      const r = applyAction(S2, seat, a);
      if (!r.ok) continue;
      const gain = evalState(S2, seat) - base;
      if (gain > bestGain) { bestGain = gain; best = a; }
    }
    if (!best) break;
    taken.push(describe(S, best));
    applyAction(S, seat, best);
  }
  if (!isTerminal(S).over && S.turnOf === seat) applyAction(S, seat, { id: "end" });
  return taken;
}

// Beam search over action sequences within a single turn (opponent static).
function planTurn(S, seat, beam, depth) {
  let frontier = [{ s: S, seq: [] }];
  let best = { seq: [], score: evalState(S, seat) }; // ending immediately
  for (let step = 0; step < depth; step++) {
    const next = [];
    for (const node of frontier) {
      const la = legalActions(node.s, seat).filter((a) => a.kind !== "end_turn");
      for (const a of la) {
        const s2 = cloneState(node.s);
        if (!applyAction(s2, seat, a).ok) continue;
        const score = evalState(s2, seat);
        const child = { s: s2, seq: [...node.seq, a], score };
        next.push(child);
        if (score > best.score) best = { seq: child.seq, score };
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.score - a.score);
    frontier = next.slice(0, beam);
  }
  return best.seq;
}

// Plan a whole turn and return the ordered list of action IDs — WITHOUT mutating
// S. This is what an over-the-wire agent calls: it receives the state JSON, plans
// locally, and POSTs the action IDs. (One-shot turn; the server appends end_turn.)
export function planTurnIds(S, seat, opts = { beam: 6, depth: 6 }) {
  return planTurn(S, seat, opts.beam ?? 6, opts.depth ?? 6).map((a) => a.id);
}

function takeTurnSearch(S, seat, { beam = 8, depth = 6 }) {
  const seq = planTurn(S, seat, beam, depth);
  const taken = [];
  for (const a of seq) {
    if (isTerminal(S).over || S.turnOf !== seat) break;
    if (!legalActions(S, seat).some((x) => x.id === a.id)) continue; // re-validate
    taken.push(describe(S, a));
    applyAction(S, seat, a);
  }
  if (!isTerminal(S).over && S.turnOf === seat) applyAction(S, seat, { id: "end" });
  return taken;
}
