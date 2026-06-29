// Engine unit tests — lock down the core rules so future edits can't silently
// break them. Each test crafts a minimal board and asserts one mechanic.
//   node src/test_engine.js   (exit 1 on any failure)

import { initMatch, legalActions, applyAction, isTerminal } from "./engine.js";
import { DECKS } from "./cards.js";

let pass = 0, fail = 0, idc = 1;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.log("  FAIL: " + name); } };

// Clean slate: A to move, empty boards, full Compute, 22 Valuation.
function S0() {
  const S = initMatch(1, DECKS.closedai, DECKS.anthrabbit, { log: false });
  S.turnOf = "A"; S.over = false; S.winner = null; S.shared = [];
  for (const s of ["A", "B"]) {
    const p = S.players[s];
    p.board = []; p.hand = []; p.armor = 0; p.valuation = 22; p.maxValuation = 22;
    p.compute = { current: 8, max: 8, temp: 0 }; p.launch = null; p.hero.usedThisTurn = false;
  }
  return S;
}
function M(owner, atk, hp, kw = []) {
  return { iid: "u" + (idc++), cardId: "paperclip_auditor", owner, name: "M", attack: atk, health: hp, maxHealth: hp,
    keywords: kw, failover: kw.includes("Failover"), stealth: kw.includes("Stealth Mode"),
    summoningSick: false, attacksUsed: 0, contained: false, tempAtk: 0 };
}
function play(S, seat, cardId) {
  S.players[seat].hand = [{ iid: "h" + (idc++), cardId, owner: seat }];
  const a = legalActions(S, seat).find((x) => x.kind === "play_card" && x.cardId === cardId);
  if (a) applyAction(S, seat, a);
  return !!a;
}
function attack(S, seat, attackerIid, targetId) {
  const a = legalActions(S, seat).find((x) => x.kind === "attack" && x.attackerIid === attackerIid && x.targetId === targetId);
  if (a) applyAction(S, seat, a);
  return !!a;
}

// 1. Combat: even trade kills both.
{ const S = S0(); const a = M("A", 3, 2), b = M("B", 2, 3); S.players.A.board = [a]; S.players.B.board = [b];
  attack(S, "A", a.iid, b.iid);
  check("combat — even trade kills both", S.players.A.board.length === 0 && S.players.B.board.length === 0); }

// 2. Guardrail forces targeting.
{ const S = S0(); const a = M("A", 2, 2), g = M("B", 1, 3, ["Guardrail"]), o = M("B", 2, 2);
  S.players.A.board = [a]; S.players.B.board = [g, o];
  const tids = legalActions(S, "A").filter((x) => x.kind === "attack").map((x) => x.targetId);
  check("guardrail — only the guardrail is targetable", tids.length === 1 && tids[0] === g.iid); }

// 3. Failover prevents the first damage, then is consumed.
{ const S = S0(); const a = M("A", 3, 3), f = M("B", 1, 5, ["Failover"]);
  S.players.A.board = [a]; S.players.B.board = [f];
  attack(S, "A", a.iid, f.iid);
  const fb = S.players.B.board.find((m) => m.iid === f.iid);
  check("failover — no damage, shield consumed", fb && fb.health === 5 && fb.failover === false);
  check("failover — attacker still takes retaliation", S.players.A.board[0].health === 2); }

// 4. Stealth: untargetable until it attacks.
{ const S = S0(); const a = M("A", 2, 2), s = M("B", 1, 1, ["Stealth Mode"]);
  S.players.A.board = [a]; S.players.B.board = [s];
  const tids = legalActions(S, "A").filter((x) => x.kind === "attack").map((x) => x.targetId);
  check("stealth — not targetable; face is", !tids.includes(s.iid) && tids.includes("HERO_B")); }

// 5. Monetize heals the controller.
{ const S = S0(); S.players.A.valuation = 15; const a = M("A", 3, 3, ["Monetize"]); S.players.A.board = [a];
  attack(S, "A", a.iid, "HERO_B");
  check("monetize — 3 to face heals 3", S.players.A.valuation === 18 && S.players.B.valuation === 19); }

// 6. Overclock adds +1 spell damage.
{ const S = S0();
  S.players.A.board = [{ iid: "ob", cardId: "bardo_hallucinator", owner: "A", name: "Bardo", attack: 3, health: 5, maxHealth: 5,
    keywords: ["Overclock"], failover: false, stealth: false, summoningSick: false, attacksUsed: 0, contained: false, tempAtk: 0 }];
  const tgt = M("B", 1, 6); S.players.B.board = [tgt];
  S.players.A.hand = [{ iid: "hg", cardId: "glitch_in_stack", owner: "A" }];
  const a = legalActions(S, "A").find((x) => x.kind === "play_card" && x.cardId === "glitch_in_stack" && x.targetId === tgt.iid);
  applyAction(S, "A", a);
  const t = S.players.B.board.find((m) => m.iid === tgt.iid);
  check("overclock — glitch deals base+1 (=3)", t && t.health === 3); }

// 7. On Deploy (Hype-4 Omni): self-hype + 1 to face.
{ const S = S0(); play(S, "A", "hype4_omni");
  const m = S.players.A.board[0];
  check("on deploy — Hype-4 Omni → 4 atk + 1 face", m && m.attack === 4 && S.players.B.valuation === 21); }

// 8. Heal overflow converts to Safety Margin.
{ const S = S0(); S.players.A.valuation = 20; play(S, "A", "rapid_rollback");
  check("overflow — heal 6 at 20 → 22 val + 4 armor", S.players.A.valuation === 22 && S.players.A.armor === 4); }

// 9. Whale-Class charge rider.
{ const S = S0(); S.players.A.launch = { attack: 2, charges: 3, chargeOnModelPlay: true, maxCharges: 5 };
  play(S, "A", "distil_bot_v3");
  check("whale rider — +1 charge on Model play", S.players.A.launch && S.players.A.launch.charges === 4); }

// 10. Win condition.
{ const S = S0(); S.players.B.valuation = 2; const a = M("A", 3, 2); S.players.A.board = [a];
  attack(S, "A", a.iid, "HERO_B");
  const t = isTerminal(S);
  check("win — CEO to <=0 ends the game", t.over && t.winner === "A"); }

// 11. Board cap.
{ const S = S0(); S.players.A.board = [M("A",1,1),M("A",1,1),M("A",1,1),M("A",1,1),M("A",1,1),M("A",1,1)];
  S.players.A.hand = [{ iid: "hc", cardId: "demo_day_intern", owner: "A" }];
  const playable = legalActions(S, "A").some((x) => x.kind === "play_card" && x.cardId === "demo_day_intern");
  check("board cap — cannot play a 7th Model", !playable); }

console.log(`\nEngine unit tests: ${pass} passed, ${fail} failed.`);
if (fail) process.exit(1);
