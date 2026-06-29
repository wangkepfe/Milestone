// AI Card Battle — live match REST API (Phase-0 skeleton, no dependencies).
// Implements the BYOA contract: POST /match · GET /match/:id/wait (long-poll) ·
// GET /match/:id/state · POST /match/:id/action. The engine is authoritative;
// every action is re-validated. A per-turn deadline triggers the fallback bot
// (session-liveness). Open-information game → the full state is sent each time.

import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { initMatch, legalActions, applyAction, isTerminal, cloneState } from "./engine.js";
import { DECKS, CARDS, HERO_POWERS } from "./cards.js";
import { takeTurn } from "./bot.js";
import { buildReplay } from "./replay.js";

const SPECTATE = fileURLToPath(new URL("../public/spectate.html", import.meta.url));
const PLAY = fileURLToPath(new URL("../public/play.html", import.meta.url));
const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };

// Serve a static file from public/ (art assets, gallery, etc.). Path-traversal safe.
function tryStatic(req, res, pathname) {
  if (req.method !== "GET") return false;
  const file = path.join(PUBLIC, path.normalize(decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) return false;
  let st; try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
  return true;
}
const matches = new Map();
let seq = 1;

function vals(m) {
  const a = m.S.players.A, b = m.S.players.B;
  return `A ${a.valuation}(+${a.armor}) | B ${b.valuation}(+${b.armor})`;
}

function newMatch(aKey, bKey, deadlineMs, human) {
  const id = "m" + (seq++);
  // Human matches MUST use an unguessable seed: the deck shuffle is fully determined
  // by (seed, public faction lists), so a derivable seed (1234+seq, recoverable from the
  // matchId) would let either player reconstruct both decks. Bot matches keep the stable
  // seed (open-information anyway, and reproducible replays).
  const seed = human ? crypto.randomInt(1, 0x7fffffff) : (1234 + seq);
  const S = initMatch(seed, DECKS[aKey] || DECKS.closedai, DECKS[bKey] || DECKS.anthrabbit, { log: false });
  const m = {
    id, S, deadlineMs: deadlineMs || 30000, tt: 1, turnToken: "t1",
    tokenSeat: { ["A-" + id]: "A", ["B-" + id]: "B" },
    seatToken: { A: "A-" + id, B: "B-" + id },
    waiters: [], timer: null,
    // human matches: two people on two devices, hidden hands, no deadline bot,
    // and the turn does NOT auto-end after a single action (incremental play).
    human: !!human, joined: { A: false, B: false },
    aKey: aKey || "closedai", bKey: bKey || "anthrabbit",
  };
  matches.set(id, m);
  armTimer(m); // no-op for human matches (guarded inside)
  return m;
}

function armTimer(m) {
  if (m.timer) { clearTimeout(m.timer); m.timer = null; }
  if (m.human) return; // a slow human is never timed out / robbed by the fallback bot
  if (isTerminal(m.S).over) return;
  m.timer = setTimeout(() => {
    // deadline hit: fallback bot plays the active seat's whole turn
    const seat = m.S.turnOf;
    takeTurn(m.S, seat); // greedy fallback
    m.S.log.push(`  [deadline] fallback bot played ${seat}'s turn`);
    afterTurn(m);
  }, m.deadlineMs);
}

function afterTurn(m) {
  m.tt += 1;
  m.turnToken = "t" + m.tt;
  armTimer(m);
  flush(m);
}

// The state object embedded in every per-seat payload. Bot matches see the full
// open-information state (the BYOA "Telemetry" twist). HUMAN matches get a redacted
// clone: the opponent's hand+deck become counts only, and BOTH decks lose their
// (ordered) contents so neither player can read their own future draws. This is the
// ONLY place hidden info is stripped — every path (state/wait/409/400) routes here.
function viewState(m, seat) {
  if (!m.human) return m.S;
  const opp = seat === "A" ? "B" : "A";
  const V = cloneState(m.S);
  // Strip RNG/engine bookkeeping: seed & rngState fully determine the deterministic
  // shuffle (mulberry32) over the PUBLIC faction decklists, so leaking either lets a
  // seat reconstruct both players' hidden hands and every future draw. The client
  // never reads these. (iidSeq stripped as defense-in-depth.)
  delete V.seed; delete V.rngState; delete V.iidSeq;
  const o = V.players[opp], me = V.players[seat];
  o.handCount = o.hand.length; delete o.hand;       // opponent hand identities: hidden
  o.deckCount = o.deck.length; delete o.deck;        // opponent deck: hidden
  me.deckCount = me.deck.length; delete me.deck;      // your own deck order: hidden too
  me.handCount = me.hand.length;                      // (your hand stays visible)
  // deckList is the full static composition (every card id, incl. hand duplicates);
  // strip it for both — the client only needs `company` for faction/hero power.
  delete o.deckList; delete me.deckList;
  V.log = [];                                         // raw log can leak drawn cards; client builds its own recap
  return V;
}

function stateFor(m, seat) {
  const term = isTerminal(m.S);
  const base = m.human ? { joined: m.joined, bothJoined: m.joined.A && m.joined.B, aKey: m.aKey, bKey: m.bKey, seat } : {};
  if (term.over) return { status: "game_over", result: { winner: m.S.winner, reason: m.S.reason }, valuations: vals(m), state: viewState(m, seat), turn: m.S.turnNumber, ...base };
  const yours = m.S.turnOf === seat;
  return {
    status: yours ? "your_turn" : "waiting_opponent",
    turnToken: yours ? m.turnToken : null,
    legalActions: yours ? legalActions(m.S, seat) : [],
    valuations: vals(m),
    turn: m.S.turnNumber,
    state: viewState(m, seat),
    ...base,
  };
}

function flush(m) {
  const still = [];
  for (const w of m.waiters) {
    const r = stateFor(m, w.seat);
    if (r.status !== "waiting_opponent") { clearTimeout(w.timer); send(w.res, 200, r); }
    else still.push(w);
  }
  m.waiters = still;
}

// ---------- http plumbing ----------
function send(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(b) }); res.end(b); }
function readBody(req) { return new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); }); }

async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean); // ["match", id, action]
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/spectate")) {
      const html = fs.readFileSync(SPECTATE);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (req.method === "GET" && (url.pathname === "/play" || url.pathname === "/pvp")) {
      const html = fs.readFileSync(PLAY);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    // Public card catalog — needed by the play client to render hand cards (the
    // engine state only carries cardIds for your hand) and Founder Move info.
    if (req.method === "GET" && url.pathname === "/cards") {
      const cards = {};
      for (const [id, d] of Object.entries(CARDS)) cards[id] = {
        id, name: d.name, cost: d.cost, type: d.type, keywords: d.keywords || [],
        text: d.text || "", attack: d.attack ?? null, health: d.health ?? null,
        rarity: d.rarity || "", requiresTarget: !!d.requiresTarget,
      };
      const heroPowers = {};
      for (const [co, hp] of Object.entries(HERO_POWERS)) heroPowers[co] = { name: hp.name, cost: hp.cost, requiresTarget: !!hp.requiresTarget };
      return send(res, 200, { cards, heroPowers });
    }
    if (req.method === "GET" && url.pathname === "/demo") {
      return send(res, 200, buildReplay(url.searchParams.get("a"), url.searchParams.get("b"), { beam: 6 }));
    }
    if (req.method === "POST" && parts.length === 1 && parts[0] === "match") {
      const body = await readBody(req);
      const m = newMatch(body.a, body.b, body.deadlineMs, body.mode === "human");
      return send(res, 200, { matchId: m.id, tokens: m.seatToken, deadlineMs: m.deadlineMs, human: m.human });
    }
    if (parts[0] === "match" && parts.length === 3) {
      const m = matches.get(parts[1]);
      if (!m) return send(res, 404, { error: "no such match" });
      const sub = parts[2];

      if (req.method === "GET" && sub === "state") {
        const seat = m.tokenSeat[url.searchParams.get("token")];
        if (!seat) return send(res, 401, { error: "bad token" });
        m.joined[seat] = true;
        return send(res, 200, stateFor(m, seat));
      }

      // Concede — human matches only. Ends the match in the opponent's favor and
      // wakes their long-poll. (The engine has no concede action; this is a match-level forfeit.)
      if (req.method === "POST" && sub === "concede") {
        const body = await readBody(req);
        const seat = m.tokenSeat[body.token];
        if (!seat) return send(res, 401, { error: "bad token" });
        if (!isTerminal(m.S).over) {
          m.S.over = true; m.S.winner = seat === "A" ? "B" : "A"; m.S.reason = "concede";
          afterTurn(m);
        }
        return send(res, 200, stateFor(m, seat));
      }

      if (req.method === "GET" && sub === "wait") {
        const seat = m.tokenSeat[url.searchParams.get("token")];
        if (!seat) return send(res, 401, { error: "bad token" });
        m.joined[seat] = true;
        const r = stateFor(m, seat);
        if (r.status !== "waiting_opponent") return send(res, 200, r);
        const w = { res, seat, timer: null };
        w.timer = setTimeout(() => { m.waiters = m.waiters.filter((x) => x !== w); send(res, 200, stateFor(m, seat)); }, 20000);
        m.waiters.push(w);
        return;
      }

      if (req.method === "POST" && sub === "action") {
        const body = await readBody(req);
        const seat = m.tokenSeat[body.token];
        if (!seat) return send(res, 401, { error: "bad token" });
        if (m.S.turnOf !== seat) return send(res, 409, { error: "not your turn", ...stateFor(m, seat) });
        if (body.turnToken !== m.turnToken) return send(res, 409, { error: "stale turnToken", ...stateFor(m, seat) });

        if (m.human) {
          // Incremental play: apply the posted action(s) — usually exactly one per click.
          // Do NOT auto-end the turn; the turn only advances when the human sends "end".
          const seatBefore = m.S.turnOf;
          for (const id of body.actionIds || []) {
            const rr = applyAction(m.S, seat, { id });
            // A rejected action never mutates state / advances the turn, so it's safe to
            // return without calling afterTurn (the turn definitely hasn't advanced — any
            // prior turn-advancing id in the batch would have broken the loop already).
            if (!rr.ok) return send(res, 400, { error: rr.reason, ...stateFor(m, seat) });
            // Stop as soon as the turn advances (explicit "end" / lethal) so trailing ids
            // in a malformed batch aren't mis-applied to the next seat.
            if (isTerminal(m.S).over || m.S.turnOf !== seatBefore) break;
          }
          // Bump turnToken + wake the opponent's long-poll ONLY when the turn really
          // advanced. For mid-turn actions turnOf is unchanged → keep turnToken stable.
          if (isTerminal(m.S).over || m.S.turnOf !== seatBefore) afterTurn(m);
          return send(res, 200, stateFor(m, seat));
        }

        // Bot / BYOA mode: one-shot whole-turn batch, server appends the implicit end.
        for (const id of body.actionIds || []) {
          if (id === "end") break;
          const rr = applyAction(m.S, seat, { id });
          if (!rr.ok) return send(res, 400, { error: rr.reason, legalActions: legalActions(m.S, seat) });
          if (isTerminal(m.S).over) break;
        }
        if (!isTerminal(m.S).over && m.S.turnOf === seat) applyAction(m.S, seat, { id: "end" });
        afterTurn(m);
        return send(res, 200, stateFor(m, seat));
      }
    }
    if (tryStatic(req, res, url.pathname)) return;
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: String(e && e.message || e) });
  }
}

export function createServer() { return http.createServer(handler); }

// run directly: node src/server.js [port]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = parseInt(process.argv[2] || "8787", 10);
  createServer().listen(port, () => console.log(`AI Card Battle API on http://127.0.0.1:${port}`));
}
