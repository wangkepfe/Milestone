// LLM agent adapter — the bridge from the heuristic prototype to the actual
// product ("an LLM plays the match"). Dependency-free: raw HTTPS to the Claude
// Messages API via global fetch. The model only ever picks one of the server's
// enumerated legal actions (forced `choose_action` tool) — the action-by-ID
// design from docs/ARCHITECTURE.md, so illegal moves are impossible.
//
// Needs ANTHROPIC_API_KEY. Default model claude-haiku-4-5 (~5–10¢/match).

import { legalActions, applyAction, isTerminal } from "./engine.js";
import { CARDS } from "./cards.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";

function targetLabel(S, tid) {
  if (tid == null) return "";
  if (tid === "HERO_A" || tid === "HERO_B") return "enemy CEO";
  const m = [...S.players.A.board, ...S.players.B.board, ...S.shared].find((x) => x.iid === tid);
  return m ? `${m.name} (${m.attack}/${m.health})` : tid;
}
function actionLabel(S, seat, a) {
  if (a.kind === "end_turn") return "End turn";
  if (a.kind === "play_card") { const t = targetLabel(S, a.targetId); return `Play ${CARDS[a.cardId].name} (cost ${a.cost})` + (t ? ` → ${t}` : ""); }
  if (a.kind === "attack") { const m = [...S.players.A.board, ...S.players.B.board, ...S.shared].find((x) => x.iid === a.attackerIid); return `Attack: ${m ? m.name : a.attackerIid} → ${targetLabel(S, a.targetId)}`; }
  if (a.kind === "hero_power") { const t = targetLabel(S, a.targetId); return `Hero Power` + (t ? ` → ${t}` : ""); }
  if (a.kind === "hero_attack") return `CEO attacks → ${targetLabel(S, a.targetId)}`;
  return a.kind;
}
function stateView(S, seat) {
  const me = S.players[seat], opp = S.players[seat === "A" ? "B" : "A"];
  const board = (p) => p.board.length ? p.board.map((m) => `${m.name} ${m.attack}/${m.health}${m.keywords.length ? ` [${m.keywords.join(",")}]` : ""}`).join("; ") : "(empty)";
  const hand = (p) => p.hand.length ? p.hand.map((c) => `${CARDS[c.cardId].name}(${CARDS[c.cardId].cost})`).join("; ") : "(empty)";
  return [
    `You are ${me.company}. Valuation ${me.valuation}${me.armor ? `(+${me.armor} Safety)` : ""}, Compute ${me.compute.current}/${me.compute.max}.`,
    `Your board: ${board(me)}`,
    `Your hand: ${hand(me)}`,
    `Opponent ${opp.company}: Valuation ${opp.valuation}${opp.armor ? `(+${opp.armor})` : ""}.`,
    `Opponent board: ${board(opp)}`,
    `Opponent hand (open): ${hand(opp)}`,
    S.shared.length ? `Shared Open Source zone: ${S.shared.map((m) => `${m.name} ${m.attack}/${m.health}`).join("; ")}` : null,
  ].filter(Boolean).join("\n");
}

const systemPrompt = (strategy) => `You are the autonomous player-agent for one CEO in "AI Card Battle", a turn-based card game. The game server is the sole authority — you act ONLY by choosing one of the numbered legal actions it gives you, via the choose_action tool.

Glossary: Valuation = your life (lose at 0). Compute = mana (refills each turn, no carry-over). Models = minions (Attack/Health). Benchmark = attack. Guardrail = taunt (must be attacked first). A Model can't attack the turn it's deployed unless it has Ship It (Models only) or Launch Day (anything). Spend Compute efficiently and plan the whole turn: buffs before attacks, clear Guardrails before going to the CEO's face, respect lethal/defense math (the opponent's hand is open, so play around it).

YOUR STRATEGY (advisory — the rules and the legal-action list always win):
${strategy || "Play to win: develop the board, take favourable trades, and push damage when ahead."}

Each step you receive the state and a numbered list of legal actions. Choose exactly one by its id. Pick id "end" to end your turn. Give a one-sentence rationale.`;

const TOOL = {
  name: "choose_action",
  description: "Choose exactly one legal action for this step, by its id from the provided list.",
  input_schema: { type: "object", properties: { action_id: { type: "string" }, rationale: { type: "string" } }, required: ["action_id"] },
};

async function pickAction(S, seat, la, strategy, model, apiKey) {
  const user = `${stateView(S, seat)}\n\nLegal actions:\n${la.map((a) => `- id "${a.id}": ${actionLabel(S, seat, a)}`).join("\n")}\n\nChoose one action id.`;
  const body = {
    model, max_tokens: 512,
    system: systemPrompt(strategy),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "choose_action" },
    messages: [{ role: "user", content: user }],
  };
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const tu = (data.content || []).find((b) => b.type === "tool_use");
  return { id: tu && tu.input && tu.input.action_id, rationale: tu && tu.input && tu.input.rationale };
}

// Drive a full turn for `seat` via the LLM (step-by-step; the engine re-validates
// every choice). Returns the action labels + rationales taken.
export async function llmTakeTurn(S, seat, { model = "claude-haiku-4-5", apiKey = process.env.ANTHROPIC_API_KEY, strategy = "" } = {}) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const taken = [];
  let guard = 0;
  while (!isTerminal(S).over && S.turnOf === seat && guard++ < 40) {
    const la = legalActions(S, seat);
    const pick = await pickAction(S, seat, la, strategy, model, apiKey);
    const chosen = la.find((a) => a.id === pick.id) || la.find((a) => a.kind === "end_turn"); // invalid → end
    taken.push(actionLabel(S, seat, chosen) + (pick.rationale ? `  — "${pick.rationale}"` : ""));
    applyAction(S, seat, { id: chosen.id });
    if (chosen.kind === "end_turn") break;
  }
  if (!isTerminal(S).over && S.turnOf === seat) applyAction(S, seat, { id: "end" });
  return taken;
}
