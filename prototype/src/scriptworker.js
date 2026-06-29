// Worker entry for the hardened script sandbox. Runs a player's choose_turn in
// its OWN thread with its OWN engine instance — so the main server is never
// blocked, and a runaway script is hard-killed via worker.terminate() (which a
// main-thread vm timeout cannot guarantee). Defense in depth: still wrapped in a
// vm with its own timeout.

import { parentPort, workerData } from "worker_threads";
import vm from "vm";
import { cloneState, legalActions, applyAction, isTerminal } from "./engine.js";
import { evalState } from "./bot.js";

const { source, state, seat, timeoutMs } = workerData;

function applySeq(s2, ids) {
  for (const id of ids || []) {
    if (id === "end") break;
    if (!applyAction(s2, seat, { id }).ok) return false;
    if (isTerminal(s2).over) break;
  }
  return true;
}
const simulate = (ids) => {
  const s2 = cloneState(state);
  if (!applySeq(s2, ids)) return { ok: false, score: -Infinity };
  return { ok: true, score: evalState(s2, seat) };
};
const legalAfter = (ids) => {
  const s2 = cloneState(state);
  if (!applySeq(s2, ids)) return [];
  if (isTerminal(s2).over || s2.turnOf !== seat) return [];
  return legalActions(s2, seat);
};

try {
  const sandbox = { state: cloneState(state), legal: legalActions(state, seat), seat, Math, JSON, console: { log() {} }, api: { simulate, legal: legalAfter } };
  const ctx = vm.createContext(sandbox);
  const out = vm.runInContext(
    `(function(){ ${source}\n; if (typeof choose_turn !== "function") throw new Error("script must define choose_turn"); return choose_turn(state, legal, api); })()`,
    ctx, { timeout: timeoutMs }
  );
  const ids = Array.isArray(out) ? out.filter((x) => typeof x === "string") : [];
  parentPort.postMessage({ ok: true, actionIds: ids });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
}
