// AI Card Battle — script-bot sandbox (BYOA "script entry").
// Runs a player-authored `choose_turn(state, legal, api)` in an isolated vm
// context under a CPU/time cap. The script returns an ordered list of action
// IDs (a one-shot turn). It can search the deterministic engine via:
//     api.simulate(ids) -> { ok, score }     // evalState after applying ids
//     api.legal(ids)     -> [actions]         // legal actions after applying ids
// On error / timeout / invalid output, the caller falls back to the heuristic bot.
//
// NOTE: Node's `vm` is a CPU/time fence, NOT a hard security boundary. Production
// script mode would use worker_threads / isolated-vm. This proves the model.

import vm from "vm";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { cloneState, legalActions, applyAction, isTerminal } from "./engine.js";
import { evalState, takeTurn } from "./bot.js";

const WORKER = fileURLToPath(new URL("./scriptworker.js", import.meta.url));

export function runScript(source, S, seat, { timeoutMs = 100 } = {}) {
  const legal0 = legalActions(S, seat);

  function applySeq(s2, ids) {
    for (const id of ids || []) {
      if (id === "end") break;
      const r = applyAction(s2, seat, { id });
      if (!r.ok) return false;
      if (isTerminal(s2).over) break;
    }
    return true;
  }
  const simulate = (ids) => {
    const s2 = cloneState(S);
    if (!applySeq(s2, ids)) return { ok: false, score: -Infinity };
    return { ok: true, score: evalState(s2, seat) };
  };
  const legalAfter = (ids) => {
    const s2 = cloneState(S);
    if (!applySeq(s2, ids)) return [];
    if (isTerminal(s2).over || s2.turnOf !== seat) return [];
    return legalActions(s2, seat);
  };

  const sandbox = {
    state: cloneState(S),
    legal: JSON.parse(JSON.stringify(legal0)),
    seat, Math, JSON,
    console: { log() {} },
    api: { simulate, legal: legalAfter },
  };
  const ctx = vm.createContext(sandbox);
  const code = `(function(){ ${source}\n; if (typeof choose_turn !== "function") throw new Error("script must define choose_turn"); return choose_turn(state, legal, api); })()`;
  try {
    const t0 = process.hrtime.bigint();
    const out = vm.runInContext(code, ctx, { timeout: timeoutMs });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const ids = Array.isArray(out) ? out.filter((x) => typeof x === "string") : [];
    return { actionIds: ids, ms, error: null };
  } catch (e) {
    return { actionIds: null, ms: null, error: String((e && e.message) || e) };
  }
}

// Apply a script's chosen action IDs to S (one-shot turn), heuristic fallback on failure.
function applyScriptResult(S, seat, r) {
  if (r.error || !r.actionIds) { takeTurn(S, seat); return { ...r, fallback: true }; }
  let applied = 0;
  for (const id of r.actionIds) {
    if (id === "end" || isTerminal(S).over || S.turnOf !== seat) break;
    if (!applyAction(S, seat, { id }).ok) break; // stop on first invalid; end below
    applied++;
  }
  if (!isTerminal(S).over && S.turnOf === seat) applyAction(S, seat, { id: "end" });
  return { ...r, fallback: false, applied };
}

// Play a whole turn from a script (synchronous vm path).
export function takeScriptTurn(S, seat, source, opts = {}) {
  return applyScriptResult(S, seat, runScript(source, S, seat, opts));
}

// ---------- hardened path: run the script in a worker_thread ----------
// Each call spawns a worker with its own engine. On overrun, the worker's vm
// timeout fires; if that's somehow escaped, the main-thread timer hard-kills the
// worker via terminate(). This is the production-correct isolation model.
export function runScriptInWorker(source, S, seat, { timeoutMs = 100 } = {}) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const w = new Worker(WORKER, { workerData: { source, state: cloneState(S), seat, timeoutMs } });
    let done = false;
    const finish = (res) => { if (done) return; done = true; clearTimeout(timer); w.terminate(); resolve(res); };
    const timer = setTimeout(() => finish({ actionIds: null, error: "worker timeout (hard-killed)", ms: timeoutMs }), timeoutMs + 100);
    w.on("message", (m) => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      finish(m.ok ? { actionIds: m.actionIds, ms, error: null } : { actionIds: null, error: m.error, ms });
    });
    w.on("error", (e) => finish({ actionIds: null, error: String((e && e.message) || e), ms: null }));
    w.on("exit", () => finish({ actionIds: null, error: "worker exited", ms: null }));
  });
}

export async function takeScriptTurnWorker(S, seat, source, opts = {}) {
  return applyScriptResult(S, seat, await runScriptInWorker(source, S, seat, opts));
}
