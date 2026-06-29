// AI Card Battle — deterministic rules engine (Phase-0 prototype, v2: 4 factions).
// Pure data state (JSON-cloneable). All randomness derives from an integer seed.
// Card behaviour lives in cards.js; the engine passes each handler an `api` of
// effect primitives that also resolve deaths / On Sunset / win checks.

import { CARDS, HERO_POWERS } from "./cards.js";

export const MAX_VALUATION = 22;
export const COMPUTE_CAP = 8;
export const BOARD_MAX = 6;
export const HAND_MAX = 8;
export const PLY_CAP = 80; // hard termination backstop
// Balance knob: cap on Anthrabbit's Safety Margin (armor). Infinity = as-designed
// (the over-tuned version). Set env SM_CAP=10 to apply the balance-review fix.
const SM_CAP = (typeof process !== "undefined" && process.env && process.env.SM_CAP) ? Number(process.env.SM_CAP) : Infinity;

// ---------- deterministic RNG (mulberry32 over an integer in state) ----------
function rngFloat(S) {
  S.rngState = (S.rngState + 0x6d2b79f5) | 0;
  let t = S.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rngInt(S, n) { return Math.floor(rngFloat(S) * n); }
function shuffle(S, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = rngInt(S, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

export function cloneState(S) { return JSON.parse(JSON.stringify(S)); }

function makeModel(S, cardId, owner, overrides = {}) {
  const def = CARDS[cardId];
  const keywords = overrides.keywords ? [...overrides.keywords] : [...(def.keywords || [])];
  return {
    iid: "m" + (S.iidSeq++), cardId, owner, name: def.name,
    attack: overrides.attack ?? def.attack ?? 0,
    health: overrides.health ?? def.health ?? 1,
    maxHealth: overrides.health ?? def.health ?? 1,
    keywords,
    failover: keywords.includes("Failover"),
    stealth: keywords.includes("Stealth Mode"),
    summoningSick: true, attacksUsed: 0, contained: false, tempAtk: 0,
  };
}
function cardInstance(S, cardId, owner) { return { iid: "c" + (S.iidSeq++), cardId, owner }; }

// ---------- setup ----------
export function initMatch(seed, deckAIds, deckBIds, opts = {}) {
  const S = {
    seed, rngState: (typeof seed === "number" ? seed : hashStr(seed)) | 0, iidSeq: 1,
    ply: 0, turnOf: "A", turnNumber: { A: 0, B: 0 }, scaling: { A: 0, B: 0 },
    shared: [], over: false, winner: null, reason: null, log: [],
    players: { A: newPlayer("A", deckAIds), B: newPlayer("B", deckBIds) },
  };
  for (const seat of ["A", "B"]) { const p = S.players[seat]; p.deck = deckIdsToInstances(S, p.deckList, seat); shuffle(S, p.deck); }
  S.turnOf = rngFloat(S) < 0.5 ? "A" : "B";
  const second = S.turnOf === "A" ? "B" : "A";
  draw(S, S.turnOf, 3);
  draw(S, second, 4);
  S.players[second].hand.push(cardInstance(S, "open_weights", second));
  if (opts.log !== false) S.log.push(`Coin: ${S.turnOf} goes first.`);
  startTurn(S, S.turnOf, true);
  return S;
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }

function newPlayer(seat, deckList) {
  return {
    seat, company: deckList.company, valuation: MAX_VALUATION, maxValuation: MAX_VALUATION, armor: 0,
    compute: { current: 0, max: 0, temp: 0 },
    hero: { company: deckList.company, usedThisTurn: false, powerDiscount: 0 },
    launch: null, board: [], hand: [], deck: [], deckList,
    fatigue: { burnoutNext: 1 }, announce: 0,
    opDiscountThisTurn: 0, handDiscount: 0, nextModelDiscount: 0, cardsPlayedThisTurn: 0,
    heroAttackedThisTurn: false, ongoingLattice: 0,
  };
}
function deckIdsToInstances(S, deckList, seat) { return deckList.cards.map((id) => cardInstance(S, id, seat)); }

// ---------- core mutators ----------
function draw(S, seat, n) {
  const p = S.players[seat];
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      const dmg = p.fatigue.burnoutNext++;
      damageHero(S, seat, dmg, null, false);
      S.log.push(`${seat} Burnout: -${dmg} Valuation (Model Collapse).`);
    } else {
      const c = p.deck.shift();
      if (p.hand.length < HAND_MAX) p.hand.push(c);
      else S.log.push(`${seat} deprecated ${CARDS[c.cardId].name} (hand full).`);
    }
  }
}
function gainArmor(S, seat, amt) { const p = S.players[seat]; p.armor = Math.min(SM_CAP, p.armor + amt); }
function healHero(S, seat, amt) {
  const p = S.players[seat];
  const before = p.valuation;
  p.valuation = Math.min(p.maxValuation, p.valuation + amt);
  const overflow = amt - (p.valuation - before);
  if (overflow > 0) p.armor = Math.min(SM_CAP, p.armor + overflow);
  return amt;
}
function damageHero(S, seat, amt, sourceSeat, canMonetize) {
  if (amt <= 0) return;
  const p = S.players[seat];
  const absorbed = Math.min(p.armor, amt);
  p.armor -= absorbed;
  p.valuation -= (amt - absorbed);
  if (canMonetize && sourceSeat != null) healHero(S, sourceSeat, amt);
}
function damageModel(S, m, amt, sourceSeat, canMonetize) {
  if (amt <= 0) return;
  if (m.failover) { m.failover = false; return; }
  m.health -= amt;
  if (canMonetize && sourceSeat != null) healHero(S, sourceSeat, amt);
}
function findModel(S, iid) {
  for (const seat of ["A", "B"]) { const m = S.players[seat].board.find((x) => x.iid === iid); if (m) return m; }
  return S.shared.find((x) => x.iid === iid) || null;
}
function enemyOf(seat) { return seat === "A" ? "B" : "A"; }
function resolveTarget(S, targetId) {
  if (targetId === "HERO_A") return { kind: "hero", seat: "A" };
  if (targetId === "HERO_B") return { kind: "hero", seat: "B" };
  const m = findModel(S, targetId);
  if (m) return { kind: "model", seat: m.owner, model: m };
  return null;
}
function dealDamageToTarget(S, targetId, amt, sourceSeat, canMonetize) {
  const t = resolveTarget(S, targetId);
  if (!t) return;
  if (t.kind === "hero") damageHero(S, t.seat, amt, sourceSeat, canMonetize);
  else damageModel(S, t.model, amt, sourceSeat, canMonetize);
}
function summon(S, seat, cardId, overrides) {
  const p = S.players[seat];
  if (p.board.length >= BOARD_MAX) return null;
  const m = makeModel(S, cardId, seat, overrides);
  p.board.push(m);
  return m;
}
function summonShared(S, cardId, overrides) { const m = makeModel(S, cardId, "shared", overrides); S.shared.push(m); return m; }
function giveHype(S, m, n) { m.attack += n; }

function resolveDeaths(S) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const seat of ["A", "B"]) {
      const p = S.players[seat];
      for (const m of [...p.board]) {
        if (m.health <= 0) {
          p.board = p.board.filter((x) => x.iid !== m.iid);
          S.log.push(`  ${m.name} (${seat}) decommissioned.`);
          const def = CARDS[m.cardId];
          if (def.onSunset) { def.onSunset(S, ctxFor(S, m, null)); changed = true; }
        }
      }
    }
    for (const m of [...S.shared]) {
      if (m.health <= 0) { S.shared = S.shared.filter((x) => x.iid !== m.iid); S.log.push(`  ${m.name} (shared) decommissioned.`); }
    }
  }
  checkWin(S);
}
function checkWin(S) {
  if (S.over) return;
  const aDead = S.players.A.valuation <= 0, bDead = S.players.B.valuation <= 0;
  if (aDead && bDead) { S.over = true; S.winner = null; S.reason = "draw_mutual"; }
  else if (bDead) { S.over = true; S.winner = "A"; S.reason = "lethal"; }
  else if (aDead) { S.over = true; S.winner = "B"; S.reason = "lethal"; }
}

// ---------- effect API handed to card handlers ----------
function overclockCount(S, seat) { return S.players[seat].board.filter((m) => m.keywords.includes("Overclock")).length; }

// opBonus = Overclock spell-damage bonus, added to each damage instance. Only
// nonzero for Op cards (set by applyAction); Models/hero powers pass 0.
function makeApi(S, seat, opBonus = 0) {
  const opp = enemyOf(seat);
  return {
    seat, opp,
    dealDamage: (tid, amt, monetize = false) => { dealDamageToTarget(S, tid, amt + opBonus, seat, monetize); resolveDeaths(S); },
    damageAllEnemyModels: (amt) => { for (const m of [...S.players[opp].board]) damageModel(S, m, amt + opBonus, seat, false); resolveDeaths(S); },
    damageAllModels: (amt) => { for (const sd of ["A", "B"]) for (const m of [...S.players[sd].board]) damageModel(S, m, amt + opBonus, seat, false); for (const m of [...S.shared]) damageModel(S, m, amt + opBonus, seat, false); resolveDeaths(S); },
    heal: (amt, who = seat) => healHero(S, who, amt),
    gainArmor: (amt, who = seat) => gainArmor(S, who, amt),
    draw: (n, who = seat) => draw(S, who, n),
    summon: (cardId, ov, who = seat) => summon(S, who, cardId, ov),
    summonShared: (cardId, ov) => summonShared(S, cardId, ov),
    giveHype: (m, n) => giveHype(S, m, n),
    buff: (m, atk, hp) => { m.attack += atk; m.health += hp; m.maxHealth += hp; },
    equipLaunch: (attack, charges, opts = {}, who = seat) => { S.players[who].launch = { attack, charges, ...opts }; },
    addCompute: (amt, who = seat) => { const c = S.players[who].compute; c.max = Math.min(COMPUTE_CAP, c.max + amt); },
    refillCompute: (amt, who = seat) => { const c = S.players[who].compute; c.current = Math.min(c.max, c.current + amt); },
    addTempCompute: (amt, who = seat) => { S.players[who].compute.temp += amt; },
    fullRefill: (who = seat) => { const c = S.players[who].compute; c.current = c.max; },
    myBoard: () => S.players[seat].board,
    enemyBoard: () => S.players[opp].board,
    me: () => S.players[seat],
    enemy: () => S.players[opp],
    scaling: () => S.scaling[seat],
    findModel: (iid) => findModel(S, iid),
    contain: (m) => { m.contained = true; },
    log: (msg) => S.log.push("  " + msg),
  };
}
function ctxFor(S, self, targetId) {
  const seat = self ? self.owner : S.turnOf;
  const real = (seat === "A" || seat === "B") ? seat : S.turnOf;
  return { S, seat: real, self, targetId, api: makeApi(S, real), me: S.players[real], opp: S.players[enemyOf(real)] };
}
function ctxFor2(S, seat, targetId, opBonus = 0) { return { S, seat, self: null, targetId, api: makeApi(S, seat, opBonus), me: S.players[seat], opp: S.players[enemyOf(seat)] }; }

// ---------- turn flow ----------
export function startTurn(S, seat, isFirst = false) {
  const p = S.players[seat];
  S.turnOf = seat;
  S.turnNumber[seat] += 1;
  if (p.compute.max < COMPUTE_CAP) p.compute.max += 1;
  p.compute.current = p.compute.max;
  p.compute.temp = 0;
  p.hero.usedThisTurn = false;
  p.heroAttackedThisTurn = false;
  p.opDiscountThisTurn = 0;
  p.handDiscount = 0;
  p.nextModelDiscount = 0;
  p.cardsPlayedThisTurn = 0;
  for (const m of p.board) { m.summoningSick = false; m.contained = false; m.attacksUsed = 0; }
  for (const m of S.shared) { m.summoningSick = false; m.contained = false; m.attacksUsed = 0; }
  if (p.ongoingLattice > 0) { healHero(S, seat, 2); p.opDiscountThisTurn = 1; p.ongoingLattice -= 1; }
  // Glitch coin: each of your Glitch Models reads the public coin
  for (const m of [...p.board]) {
    const def = CARDS[m.cardId];
    if (m.keywords.includes("Glitch") && def.onGlitch && rngFloat(S) < 0.5) { S.log.push(`  Glitch! ${m.name} misfires.`); def.onGlitch(S, ctxFor(S, m, null)); }
  }
  for (const m of p.board) { const def = CARDS[m.cardId]; if (def.onTurnStart) def.onTurnStart(S, ctxFor(S, m, null)); }
  draw(S, seat, 1);
  resolveDeaths(S);
}

export function endTurn(S, seat) {
  const p = S.players[seat];
  p.compute.temp = 0;
  for (const sd of ["A", "B"]) for (const m of S.players[sd].board) if (m.tempAtk) { m.attack -= m.tempAtk; m.tempAtk = 0; }
  S.ply += 1;
  if (S.ply >= PLY_CAP && !S.over) {
    S.over = true;
    const va = S.players.A.valuation + S.players.A.armor, vb = S.players.B.valuation + S.players.B.armor;
    S.winner = va === vb ? null : (va > vb ? "A" : "B");
    S.reason = "draw_ply_cap";
    return;
  }
  startTurn(S, enemyOf(seat));
}

// ---------- legal action generation ----------
function availableCompute(p) { return p.compute.current + p.compute.temp; }
function guardrails(board) { return board.filter((m) => m.keywords.includes("Guardrail") && !m.contained && !m.stealth); }
function legalAttackTargets(S, seat, attacker, canHitFace) {
  const opp = enemyOf(seat);
  const eb = S.players[opp].board;
  const gr = guardrails(eb);
  const targetable = (m) => !m.stealth;
  if (gr.length > 0) return gr.filter(targetable).map((m) => m.iid);
  const tgts = eb.filter(targetable).map((m) => m.iid);
  if (canHitFace) tgts.push("HERO_" + opp);
  return tgts;
}
function modelCanAttack(m) {
  if (m.contained) return false;
  const max = m.keywords.includes("Parallelize") ? 2 : 1;
  if (m.attacksUsed >= max) return false;
  if (m.attack <= 0) return false;
  if (m.summoningSick) return m.keywords.includes("Ship It") || m.keywords.includes("Launch Day");
  return true;
}

export function legalActions(S, seat) {
  if (S.over || S.turnOf !== seat) return [];
  const p = S.players[seat];
  const opp = enemyOf(seat);
  const actions = [];
  const compute = availableCompute(p);

  for (const c of p.hand) {
    const def = CARDS[c.cardId];
    const cost = effectiveCost(S, seat, c);
    if (cost > compute) continue;
    if ((def.type === "Model" || def.type === "Legendary Model") && p.board.length >= BOARD_MAX) continue;
    if (def.requiresTarget) {
      const tgts = targetsForCard(S, seat, def);
      for (const tid of tgts) actions.push({ id: `play:${c.iid}:${tid}`, kind: "play_card", cardIid: c.iid, cardId: c.cardId, targetId: tid, cost });
    } else {
      actions.push({ id: `play:${c.iid}`, kind: "play_card", cardIid: c.iid, cardId: c.cardId, targetId: null, cost });
    }
  }

  const hp = HERO_POWERS[p.company];
  const hpCost = Math.max(0, hp.cost - p.hero.powerDiscount);
  if (!p.hero.usedThisTurn && hpCost <= compute) {
    if (hp.requiresTarget) { for (const tid of hp.targets(S, seat)) actions.push({ id: `hero:${tid}`, kind: "hero_power", targetId: tid, cost: hpCost }); }
    else actions.push({ id: `hero`, kind: "hero_power", targetId: null, cost: hpCost });
  }

  const attackers = [...p.board, ...S.shared];
  for (const m of attackers) {
    if (!modelCanAttack(m)) continue;
    const faceOk = m.summoningSick ? m.keywords.includes("Launch Day") : true;
    for (const tid of legalAttackTargets(S, seat, m, faceOk)) actions.push({ id: `atk:${m.iid}:${tid}`, kind: "attack", attackerIid: m.iid, targetId: tid });
  }
  if (p.launch && p.launch.charges > 0 && !p.heroAttackedThisTurn) {
    for (const tid of legalAttackTargets(S, seat, { keywords: [], stealth: false }, true)) actions.push({ id: `heroatk:${tid}`, kind: "hero_attack", targetId: tid });
  }

  actions.push({ id: "end", kind: "end_turn" });
  return actions;
}

function effectiveCost(S, seat, c) {
  const def = CARDS[c.cardId];
  const p = S.players[seat];
  let cost = def.cost;
  if (def.type === "Op" && p.opDiscountThisTurn) cost -= p.opDiscountThisTurn;
  if (p.handDiscount) cost -= p.handDiscount;
  if ((def.type === "Model" || def.type === "Legendary Model") && p.nextModelDiscount) cost -= p.nextModelDiscount;
  return Math.max(0, cost);
}
function targetsForCard(S, seat, def) {
  const opp = enemyOf(seat);
  const all = [...S.players.A.board, ...S.players.B.board, ...S.shared].filter((m) => !m.stealth || m.owner === seat);
  switch (def.targetKind) {
    case "friendlyModel": return S.players[seat].board.map((m) => m.iid);
    case "friendlyModelCheap": return S.players[seat].board.filter((m) => CARDS[m.cardId].cost <= 2).map((m) => m.iid);
    case "enemyModel": return S.players[opp].board.filter((m) => !m.stealth).map((m) => m.iid);
    case "any": return [...all.map((m) => m.iid), "HERO_A", "HERO_B"];
    case "enemyChar": return [...S.players[opp].board.filter((m) => !m.stealth).map((m) => m.iid), "HERO_" + opp];
    default: return all.map((m) => m.iid); // anyModel
  }
}

// ---------- apply ----------
export function applyAction(S, seat, action) {
  if (S.over) return { ok: false, reason: "game over" };
  if (S.turnOf !== seat) return { ok: false, reason: "not your turn" };
  const legal = legalActions(S, seat);
  const match = legal.find((a) => a.id === action.id);
  if (!match) return { ok: false, reason: "illegal action " + action.id };
  const p = S.players[seat];

  if (match.kind === "end_turn") { endTurn(S, seat); return { ok: true, endedTurn: true }; }

  if (match.kind === "play_card") {
    const idx = p.hand.findIndex((c) => c.iid === match.cardIid);
    const c = p.hand[idx];
    const def = CARDS[c.cardId];
    spendCompute(S, seat, match.cost);
    p.hand.splice(idx, 1);
    if (def.type === "Op" && def.announce) p.announce += 1;
    if (def.type === "Model" || def.type === "Legendary Model") {
      const m = summon(S, seat, c.cardId);
      p.nextModelDiscount = 0; // consumed by this Model
      if (def.onDeploy && m) def.onDeploy(S, ctxFor(S, m, match.targetId));
      if (m && p.launch && p.launch.chargeOnModelPlay) p.launch.charges = Math.min(p.launch.maxCharges || 5, p.launch.charges + 1);
    } else if (def.type === "Hardware") {
      if (def.onDeploy) def.onDeploy(S, ctxFor2(S, seat, match.targetId));
    } else { // Op / token
      const opBonus = def.type === "Op" ? overclockCount(S, seat) : 0; // Overclock spell damage
      if (def.op) def.op(S, ctxFor2(S, seat, match.targetId, opBonus));
      if (def.type === "Op") p.opDiscountThisTurn = 0;
    }
    p.cardsPlayedThisTurn += 1;
    resolveDeaths(S);
    return { ok: true, summary: `${seat} played ${def.name}` };
  }

  if (match.kind === "hero_power") {
    const hp = HERO_POWERS[p.company];
    spendCompute(S, seat, match.cost);
    p.hero.usedThisTurn = true;
    hp.use(S, ctxFor2(S, seat, match.targetId));
    resolveDeaths(S);
    return { ok: true, summary: `${seat} used ${hp.name}` };
  }

  if (match.kind === "attack") {
    const attacker = findModel(S, match.attackerIid);
    doBenchmark(S, seat, attacker, match.targetId);
    resolveDeaths(S);
    return { ok: true, summary: `${attacker?.name} attacked` };
  }
  if (match.kind === "hero_attack") { doHeroBenchmark(S, seat, match.targetId); resolveDeaths(S); return { ok: true }; }
  return { ok: false, reason: "unknown action" };
}

function spendCompute(S, seat, amt) {
  const c = S.players[seat].compute;
  S.scaling[seat] += amt;
  const useTemp = Math.min(c.temp, amt);
  c.temp -= useTemp;
  c.current -= (amt - useTemp);
  if (c.current < 0) c.current = 0;
}
function doBenchmark(S, seat, attacker, targetId) {
  if (!attacker) return;
  const t = resolveTarget(S, targetId);
  const monet = attacker.keywords.includes("Monetize");
  if (t.kind === "hero") damageHero(S, t.seat, attacker.attack, seat, monet);
  else { damageModel(S, t.model, attacker.attack, seat, monet); damageModel(S, attacker, t.model.attack, t.seat, false); }
  attacker.attacksUsed += 1;
  attacker.summoningSick = false;
  if (attacker.stealth) attacker.stealth = false;
  if (CARDS[attacker.cardId].onCombatHeroDamage && t.kind === "hero") CARDS[attacker.cardId].onCombatHeroDamage(S, ctxFor(S, attacker, targetId));
}
function doHeroBenchmark(S, seat, targetId) {
  const p = S.players[seat];
  const t = resolveTarget(S, targetId);
  const atk = p.launch.attack;
  if (t.kind === "hero") damageHero(S, t.seat, atk, seat, false);
  else { damageModel(S, t.model, atk, seat, false); damageHero(S, seat, t.model.attack, t.seat, false); }
  p.launch.charges -= 1;
  p.heroAttackedThisTurn = true;
  if (p.launch.charges <= 0) p.launch = null;
}

export function isTerminal(S) { return S.over ? { over: true, winner: S.winner, reason: S.reason } : { over: false }; }
export { enemyOf, availableCompute, guardrails, findModel };
