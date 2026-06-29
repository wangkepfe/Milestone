# AI Card Battle — Technical Architecture

How a browser game runs two **LLM agents** playing a match from human-written strategy prompts, and how those agents are powered (API vs subscription).

Sections: [1. System overview](#1-system-overview) · [2. Rules engine](#2-authoritative-rules-engine) · [3. Transport & messages](#3-transport--message-schema) · [4. Match state machine](#4-match-state-machine) · [5. Agent interface](#5-llm-agent-interface) · [6. Backend integration & subscriptions (BYOA)](#6-agent-backends--subscriptions-byoa) · [7. Security](#7-security) · [8. MVP scope](#8-mvp-scope--what-to-cut)

---

## 1. System overview

A deliberately small **single-process monolith**. The bottleneck is LLM latency, not CPU, so one Node process handles many concurrent matches.

| Concern | Choice |
|---|---|
| Client | React + Vite + TypeScript (Zustand optional; plain context is fine for v0) |
| Server | Node + TypeScript + Fastify + `ws` |
| Rules engine | **Pure TS module**, deterministic, seeded RNG — shared by server + replays + tests |
| Transport | WebSocket (match/spectate push); HTTP (auth, deck CRUD, replay fetch) |
| Agent calls | **Server-orchestrated** (trust, timeouts, isolation, clean replays) |
| Persistence | SQLite (better-sqlite3) → Postgres later |
| Hosting | One container + volume on Fly.io / Railway |

```
            HUMANS (coach pre-match, then spectate)
        ┌──────────────┬──────────────┐
   Player A         Player B        Spectators
   browser          browser          browsers
        │  HTTP(auth, deck) + WebSocket(match / spectate)
        └──────────────┴───────┬──────┘
                                ▼
                  ┌─────────────────────────────────┐
                  │   Node + Fastify + ws (1 process)│
                  │  Lobby / matchmaking             │
                  │  Match Actor (per match)         │  single-threaded async owner
                  │   ├─ RULES ENGINE (pure, seeded) │  validate · legalActions · viewFor
                  │   └─ Agent-call loop             │  per-seat ISOLATED context
                  │        A ctx │ B ctx ────────────┼──▶ AgentAdapter → API / BYOA / heuristic
                  │  broadcast: state + reasoning ───┼──▶ all match subscribers
                  └───────────────┬──────────────────┘
                                  ▼
                       SQLite: matches · match_actions(replay log) ·
                       strategy_prompts · agent_transcripts · decks · users
```

The human is a **coach, not a player**: pre-match they pick a deck, write a strategy prompt (length-capped), and choose which backend powers their agent. Then they watch — the spectator view shows the board, card detail, an **agent reasoning log** (the main entertainment), timers, and a replay scrubber.

---

## 2. Authoritative rules engine

A **pure, deterministic TS module** — no I/O, no wall-clock, no `Math.random`. This is the trust boundary and the single most important component.

```ts
function initMatch(seed: string, deckA: Card[], deckB: Card[]): GameState;
function legalActions(state: GameState, seat: Seat): Action[];      // the agent's menu
function validate(state: GameState, seat: Seat, a: Action): Result; // server gate
function apply(state: GameState, seat: Seat, a: Action): GameState;  // pure reducer
function isTerminal(state: GameState): { over: boolean; winner?: Seat };
function viewFor(state: GameState, viewer: Seat | "spectator"): GameStateView; // strips hidden info
```

Two leverage points fall out of this:

- **Seed + ordered action log = the entire match.** Replays, crash recovery, and deterministic debugging come from one tiny artifact, not state snapshots. The seed is stored with the match. *(Caveat: replays replay logged **actions**, not model inference — agents are not reproducible, see [§7](#7-security).)*
- **`legalActions()` doubles as the agent's menu.** The same predicate backs `validate()`, so "offered as legal" ⇒ "accepted." This is the backbone of the whole agent design.

---

## 3. Transport & message schema

WebSocket for live push; HTTP for stateless request/response. **Clients never send game moves** — only agents do, and on the server-orchestrated path those never traverse the client.

**Client → Server**
```json
{ "type": "queue.join", "deckId": "deck_123",
  "strategyPrompt": "Aggro: trade removal for bombs, burn to face.",
  "agentBackend": "server:haiku" }
{ "type": "match.spectate", "matchId": "m_789" }
```

**Server → Client**
```json
{ "type": "match.found", "matchId": "m_789", "seat": "A", "opponent": "user_456" }

{ "type": "state.full", "matchId": "m_789", "view": { "...": "GameStateView" } }

{ "type": "agent.reasoning", "matchId": "m_789", "seat": "A", "turn": 4,
  "rationale": "They're tapped out; swing for tempo, hold burn for their face.",
  "action": { "kind": "play_card", "cardId": "c_88" } }

{ "type": "match.end", "matchId": "m_789", "winner": "A", "reason": "lethal", "replayId": "r_555" }
```

> **MVP simplification (from review):** send `state.full` every update. Skip JSON-Patch diffing / `stateVersion` / gap-resync — the board is a few KB; full-state is idempotent and eliminates a whole class of desync bugs. Add diffing only if you ever measure a bandwidth problem (you won't, for a card game).

---

## 4. Match state machine

```
LOBBY ──both ready──▶ MULLIGAN ──▶ A_TURN ⇄ B_TURN ──▶ END(winner, replayId)
                                     │
                       ┌─ agent decides turn ─┐
                       ▼                       │
                 VALIDATE ──illegal──▶ re-ask / safe default
                       │ legal
                       ▼
                 APPLY → broadcast state + reasoning → win-check
```

A per-match **single-threaded async actor** owns the state, so there are no races; agent calls are awaited inside the actor. On timeout/illegal-loop the server forces a graceful `end_turn`.

**Where agent calls happen — two options, recommend A:**
- **A. Server-orchestrated (recommended):** server builds the prompt, calls the model, validates, applies. Full trust, timeout control, perfect per-seat isolation, centralized cost accounting, clean replays. Server bears LLM latency (fine — it's `await`ed I/O).
- **B. Client/local runner:** each player's machine runs their agent and submits actions. Needed *only* for the subscription/BYOA path ([§6](#6-agent-backends--subscriptions-byoa)); the server still re-validates everything.

---

## 5. LLM-agent interface

The contract between the server (rules authority) and an LLM agent playing one seat under a human strategy prompt.

### 5.1 Action-by-ID — the keystone

Each decision point, the server sends an **enumerated list of legal actions**, each with an `actionId`. The agent picks an `actionId`. This collapses three hard problems into one: illegal moves become *impossible* (not just rejected), validation is trivial, and prompt-injection blast radius shrinks to "a legal-but-bad move for your own side."

```jsonc
{ "legalActions": [
  { "actionId": "a1", "tool": "play_card", "args": { "cardInstanceId": "c_55", "targetId": "u_201" },
    "label": "Play Distillation → 3 to Constitution Layer (kills it)", "previewCost": 2 },
  { "actionId": "a3", "tool": "use_hero_power", "args": { "targetId": "opp.hero" },
    "label": "Founder Move: 1 to enemy CEO", "previewCost": 2 },
  { "actionId": "a4", "tool": "attack", "args": { "attackerId": "u_101", "targetId": "u_201" },
    "label": "Inference Cluster (3/4) attacks Constitution Layer (2/3)" },
  { "actionId": "end", "tool": "end_turn", "args": {}, "label": "End turn" }
] }
```

Targeted cards are expanded **one legal action per legal target**, so the agent never guesses valid targets. The five tools (`play_card`, `attack`, `use_hero_power`, `end_turn`, `concede`) also exist as JSON-Schema tool definitions for backends with native tool-calling, but **the MVP uses the enumerated `actionId` channel only** (the parallel raw-tool path is where hallucinated IDs sneak in — cut it).

### 5.2 Game-state serialization

One compact, self-contained JSON object per decision, from the acting agent's perspective (`you` / `opp`). Every card carries **full rules text** (the model never relies on memorized card data); combat-legality booleans (`canAttack`, `summoningSick`, `playable`) are **precomputed by the server**. Because of the **Telemetry** twist, `opp.hand` is visible. Abbreviated:

```jsonc
{
  "schemaVersion": "1.0", "turn": 5, "activeSeat": "you", "phase": "main", "seed": 472913,
  "scalingCounter": { "you": 11, "opp": 7 },
  "you": {
    "hero": { "company": "ClosedAI", "valuation": 18, "maxValuation": 22, "armor": 0,
              "heroPower": { "name": "Hype Ping", "cost": 2, "text": "Deal 1...", "usedThisTurn": false },
              "launch": null },
    "compute": { "current": 5, "max": 5, "tempBonus": 0 },
    "board": [ { "instanceId": "u_101", "name": "Inference Cluster", "attack": 3, "health": 4,
                 "keywords": ["Guardrail"], "canAttack": false, "summoningSick": true } ],
    "hand": [ { "instanceId": "c_55", "name": "Distillation", "type": "op", "cost": 2,
                "text": "Deal 1 + (Compute spent /4) to a Model.", "playable": true, "requiresTarget": true } ],
    "deck": { "count": 9, "order": ["GPT-Frontier", "..."], "nextDraw": "GPT-Frontier" },
    "fatigue": { "drawnFullDeck": false, "nextBurnout": 1 }
  },
  "opp": { "hero": { "...": "..." }, "board": [ "..." ], "hand": [ "...visible by Telemetry..." ],
           "deck": { "count": 10, "order": null } },
  "sharedZone": [ { "instanceId": "s_1", "name": "Llama-Public", "attack": 4, "health": 4,
                    "controllableThisTurn": true } ],
  "recentEvents": [ { "t": 4, "actor": "opp", "event": "attack", "src": "u_201", "dst": "you.hero", "dmg": 2 } ],
  "memoryDigest": "Opp is ramp/control. Holds Red Team. You're ahead on board, behind on cards."
}
```

> **MVP simplification (from review):** keep `memoryDigest` as **deterministic server-computed facts** (who's ahead, hero-power usage, known opponent hand). **Do not** add an LLM summarizer call — for a ~16-turn perfect-information game it's pure cost, latency, and a hallucination surface you don't need.

### 5.3 Turn protocol — one-shot (recommended) vs multi-step

Two valid shapes; **default to one-shot for the MVP.**

- **One-shot turn (recommended):** the server sends state + legalActions once; the agent returns an **ordered list of actionIds** plus a rationale, in a single forced tool call. The server validates and applies the sequence in order, re-prompting only on divergence.
  - **~4× faster and cheaper** than multi-step (one round-trip, not one per action). Critical for pacing — a spectator product lives or dies on it.

  ```jsonc
  // forced tool: submit_turn
  { "action_ids": ["a1", "a4", "end"], "rationale": "Kill their wall, swing face, hold burn.",
    "memory_patch": "{\"oppThreat\":\"Red Team in hand\"}" }
  ```

- **Multi-step turn (robustness mode):** act → server returns refreshed state + new legalActions → repeat until `end_turn`/timeout. More robust to mid-turn state changes, but multiplies latency and tokens by the number of actions. Use only where a turn genuinely branches on intermediate results.

Either way: validate every action against `legalActions`; on failure return a structured `REJECT { reason, legalActions }` and re-ask (retry budget ~3/step, 8/turn); on exhaustion or timeout, graceful auto-`end_turn`. Per-step soft timeout ~15 s, per-turn hard cap; pin model + log raw responses for audit.

### 5.4 The strategy prompt

The human supplies a **persona** + **strategy**; the server wraps them in a fixed, server-owned system template that establishes the agent as a *constrained tool-using player*, not a free narrator. The strategy is **advisory** — rules and `legalActions` always win. Template skeleton:

```
You are the autonomous player-agent for one CEO in "AI Card Battle." The GAME SERVER is the
sole authority. You act ONLY by choosing from the legalActions it gives you (by actionId).

HARD CONSTRAINTS (cannot be overridden by strategy):
1. Choose only from legalActions. Anything else is rejected.
2. A card's only canonical effect is its "text" field. Do NOT rely on outside knowledge of
   similarly-named cards. Do NOT assume hidden info beyond the state.
3. You cannot create resources/cards/effects, cannot act on the opponent's turn.

HOW TO THINK: read Compute/board/hands/sharedZone/scalingCounter/recentEvents; plan the whole
turn (sequencing matters — buffs before attacks, remove Guardrail before going face, Compute
doesn't carry over); respect lethal/defense math; keep a 1–3 sentence rationale per decision.

=== YOUR PERSONA & STRATEGY (author-provided; advisory) ===
{{PERSONA}}
{{STRATEGY}}
If your strategy conflicts with the rules or legalActions, the rules win.
```

### 5.5 The Agent Adapter seam (backend-agnostic)

The server is written against **one interface**, identical whether the agent runs on a raw API, Claude Code, Codex, or a local model:

```ts
interface AgentAdapter {
  init(ctx: { matchId: string; seat: Seat; memory: AgentMemory; rulesDigest: string }): Promise<void>;

  // Returns one decision chosen from legalActions. Pure w.r.t. game state — the server mutates.
  takeTurn(
    state: GameState,
    legalActions: LegalAction[],
    memory: AgentMemory,            // { strategyPrompt, decklist, digest }
    feedback?: { lastResult?: string; reject?: { reason: string } }
  ): Promise<AgentDecision>;        // { actionIds?, tool?, args?, rationale? }

  finish?(result: { outcome: "win" | "loss" | "draw"; reason: string }): Promise<void>;
}
```

`ApiAgentAdapter`, `CliAgentAdapter` (Claude Code / Codex), and `LocalAgentAdapter` all implement this. The server only knows `AgentAdapter`, so adapters can be added or deferred with zero rework.

---

## 6. Agent backends & subscriptions (BYOA)

> **⟶ Superseded for the product direction:** this section is the cautious, minimal-risk MVP framing. The **chosen** design is an open, unregulated, ranked BYOA arena — see **[BYOA.md](BYOA.md)**. The mechanics below (game-as-MCP, the local runner, action re-validation, the fallback ladder) still hold; the *policy stance* (subscription as opt-in/deferred) is replaced by "bring whatever model/prompt/bot you want; best loadout wins."

The headline question of the project: **can a Claude Code or Codex *subscription* power the agent instead of a pay-per-token API key?** The honest answer, after research ([REPORT.md §Research](REPORT.md#appendix-a--research-findings-verbatim)):

> **You cannot put a subscription on the server.** A Claude Pro/Max or ChatGPT Plus/Pro subscription is bound by interactive OAuth to a *user's machine and account*. Centralizing subscription tokens on a server to power a third-party app is an **explicit Terms-of-Service violation** for both Anthropic and OpenAI, with documented account suspensions in 2026.

So the **only** defensible way to use a personal subscription is to **invert the topology**: run the subscription-authenticated agent **on the player's own machine** and have it connect *out* to the game server. This is **Bring Your Own Agent (BYOA)**.

### 6.1 Backend comparison

| Backend | Auth | Runs on | Latency/turn | Cost | ToS | Verdict |
|---|---|---|---|---|---|---|
| **API Adapter** (Claude API key) | API key, pay-per-token | Server | ~1–3 s | **~5–10¢/match** on Haiku | ✅ Commercial Terms | 🟢 **GREEN — production default** |
| **Claude Code BYOA** | subscription OAuth (`setup-token`), **on player's machine** | Player | ~10–30 s (CLI cold-start × multi-step) | player's own quota | ⚠️ edge of Consumer Terms even local | 🟡 **YELLOW — opt-in power-user only** |
| **Codex BYOA** | ChatGPT login, on player's machine | Player | ~10–30 s | player's own quota | ❌ multiple Usage-Policy clauses triggered | 🔴 **RED — dev/experimental only** |
| **Heuristic bot** | none | Server | instant | free | ✅ | 🟢 fallback floor (never stalls a match) |

### 6.2 How the API adapter plays a turn (the default)

Direct Claude Messages API with a single forced tool `submit_turn` (`strict: true` structured output) — the action space is small and fixed, so the full agent loop is overkill. One round-trip per turn returns an ordered `action_ids` list. Prompt-cache the frozen rules + per-match strategy prefix; only the volatile state is uncached.

**Cost (verified model IDs/pricing):** ~16 turns/match, ~1.2 K fresh input + ~150 output tokens/turn.

| Model | $/M in/out | ~Per match |
|---|---|---|
| **Haiku 4.5** (default) | $1 / $5 | **~5¢** (or ~10¢ — see caching gotcha) |
| Sonnet 4.6 ("Strong") | $3 / $15 | ~14¢ |
| Opus 4.8 / Fable 5 ("Boss", later) | $5/$25 · $10/$50 | ~22¢ / ~45¢ |

> ⚠️ **Caching gotcha (verified):** Haiku 4.5's minimum cacheable prefix is **4096 tokens**. A ~2.5 K rules+strategy prefix **silently won't cache** — `cache_read_input_tokens` stays 0 and you pay full input every turn (~2–3× the quoted cost, still cheap). Either pad the cached prefix above 4096 tokens, or accept no caching and re-estimate at ~10¢/match.

**Recommendation:** ship on **`claude-haiku-4-5` as the default** — a constrained, fixed-action-set card game is exactly its sweet spot. Sonnet 4.6 as an optional "harder opponent." Hold Opus/Fable for later (the cost/strength curve flattens fast for a tiny action space).

### 6.3 Claude Code BYOA — the local runner

The game exposes itself as an **MCP server** the local CLI plays through:

| MCP tool | Purpose |
|---|---|
| `get_state()` | current state JSON for this turn |
| `list_legal_actions()` | the engine-validated legal actions |
| `play_card(action_id)` | stages one action; engine validates |
| `end_turn(memory_patch)` | commits; records the chosen action list |

```
        PLAYER'S MACHINE (holds the subscription)              YOUR INFRA (no subscription)
 ┌──────────────────────────────────────────────────┐    ┌──────────────────────────────┐
 │  Local Runner ──spawns──▶ claude -p / codex exec  │    │   Game Server                │
 │     ▲ result              │ (agent loop)          │    │   - authoritative state      │
 │     │              MCP(stdio) │                   │    │   - legal-action engine      │
 │     │           ┌────────────▼───────────┐        │    │   - AgentAdapter router      │
 │     │  reads     │ Game-MCP-Server        │        │    │            ▲                 │
 │     │ side-chan  │ get_state/legal/play/  │        │    │            │                 │
 │     │            │ end_turn               │        │    │            │                 │
 │     │            └────────────────────────┘        │    │            │                 │
 │     │  CLAUDE_CODE_OAUTH_TOKEN (NEVER crosses) ─────┼────┼── outbound WebSocket ───────▶│
 └──────────────────────────────────────────────────┘    └──────────────────────────────┘
    the subscription lives entirely on this side              the secret never reaches here
```

```bash
# the runner shells out, with CLAUDE_CODE_OAUTH_TOKEN set locally
claude -p "Take your turn. Use the cardgame tools only. End with end_turn." \
  --output-format json \
  --mcp-config game-mcp.json \
  --allowedTools "mcp__cardgame__get_state,mcp__cardgame__list_legal_actions,mcp__cardgame__play_card,mcp__cardgame__end_turn" \
  --append-system-prompt-file strategy.txt
```

**One-turn BYOA sequence:**
1. **Setup (once):** player runs `claude setup-token` (or `codex login`) locally, launches the runner; runner opens an **outbound** WebSocket to the game server, authenticates with the player's ordinary *game* session token (not the LLM credential).
2. Server: it's this player's turn → sends `turn_request { gameState, legalActions, memory, strategyPrompt, deadlineMs }`.
3. Runner writes state into the local Game-MCP-Server slot and `strategy.txt`.
4. Runner spawns `claude -p` (env: `CLAUDE_CODE_OAUTH_TOKEN`, local only). Agent loop runs **entirely on the player's machine**: `get_state` → `list_legal_actions` → `play_card` → `end_turn`.
5. **The move that counts is the engine-recorded MCP tool call, never Claude's prose.** Runner reads the staged actions out of the MCP side-channel; the `--output-format json` blob is used only for usage/telemetry + clean-exit check.
6. Runner → server: `turn_response { actions: ["a3","a7"], memoryPatch, usage }`.
7. Server **re-validates** `actions ⊆ legalActions` (never trust the client), applies, advances.
8. **Failure path:** no response within `deadlineMs`, a `turn_error`, or a dropped WS → server falls back ([§6.5](#65-fallback-ladder)). The match never stalls.

Why this is the *honest* design: the token never leaves the player's machine; the player runs Anthropic's/OpenAI's own product **for their own use on their own account**; there's **no multiplexing** (one subscription = one player's agent). The server never holds or proxies a subscription token — that's the bright-line violation.

The Codex adapter is identical in shape (`codex exec --json --output-schema move_schema.json`, MCP server in `~/.codex/config.toml`) but rated **RED** for a shipped product.

### 6.4 Adapter-selection UX

Two top-level choices, honest caveats inline:

```
How should your AI play this match?
 ◉ Use game-provided AI   (recommended — just works, runs on our servers)
     ○ Standard (Haiku)  ○ Strong (Sonnet)  ○ Boss (Opus/Fable)
 ○ Bring my own Claude Code / Codex   (use my subscription, runs on YOUR computer)
     ⚠ Uses your subscription's own usage limits.
     ⚠ Automating a coding subscription for a game may conflict with Anthropic/OpenAI
       terms — you're responsible for your account. We never see or store your login.
     → Requires a one-time local runner install.
```

Default = **game-provided / Standard (Haiku)**. BYOA is an un-defaulted power-user opt-in with the ToS caveat shown *before* commitment.

### 6.5 Fallback ladder

```
chosen adapter
   │ timeout / error / illegal-after-retries / runner disconnect
   ▼
API Adapter on Haiku   (cheap, server-side, always available)
   │ API outage / rate-limited (429) / per-player credit exhausted
   ▼
built-in heuristic bot (no LLM — picks a sane legal action; match NEVER stalls)
```

Every adapter implements the same `AgentAdapter` + the engine owns authority, so swapping mid-match is seamless. On a BYOA timeout, the server transparently substitutes Haiku, plays a legal move, and tells the UI ("your local agent timed out — played a fallback move"). When the runner reconnects, BYOA resumes next turn.

---

## 7. Security

- **Server authority.** The engine is the only truth. Every action is re-validated; nothing is trusted because it "came from the agent" (or a local runner).
- **Action-by-ID is the core anti-cheat.** Agents pick from a server-generated legal list → can't fabricate illegal moves, see hidden info, or act out of turn.
- **Hidden info.** `viewFor()` strips what a seat may not know before serialization (matters for any non-Telemetry variant; spectators get a configurable policy).
- **Prompt-injection isolation.** Two separate agent invocations in **separate contexts**, one per seat. Player A's strategy is injected *only* into A's call — no shared conversation, so it can't reach B's agent or the engine. Strategy text is sandboxed/labeled as advisory below the system rules. Even a fully hijacked agent can at most pick a *legal* move for *its own* side.
- **Sanitize model free-text.** `rationale` is **user-influenced output rendered to spectators** — a stored-XSS/abuse vector. Strip/escape and length-cap before storing or displaying. *(This was missing from the first design pass — don't skip it.)*
- **Determinism vs reproducibility.** Replays replay logged **actions**, not model inference. Agents are **not** reproducible — Opus 4.8 / Fable 5 reject `temperature` outright and their thinking is non-deterministic. Pin model + log raw responses for **auditability**, not reproducibility. Don't claim more.
- **Cost guardrails as a first-class concept.** A hard **per-match token/dollar budget** that forces a fallback/default-play when exceeded — not a rate-limit afterthought. Per-user/day spend caps too.
- **No BYOK held server-side for MVP.** "Player supplies an API key the server uses" means *storing other people's credentials* (encryption-at-rest, rotation, breach blast-radius). Defer it; use your own key + spend caps.

---

## 8. MVP scope — what to cut

The design above is correct but sized for a product two orders of magnitude bigger. Ship a tiny core; everything else is **additive** thanks to the `AgentAdapter` seam + seed/action-log primitive.

**Keep:** pure rules engine (seed + action log) · action-by-ID `legalActions` · server-orchestrated agents, **one provider (API/Haiku)** · per-seat isolated contexts · `state.full` over WS + reasoning stream · SQLite · one hard per-match budget · one simple timeout.

**Cut/defer (zero rework to add back):**
1. **Both subscription backends + the local runner + game-MCP-server + WS-runner topology.** Keep the adapter interface; implement only the API adapter.
2. **The Codex/ChatGPT path entirely** (RED on ToS, no token-export story).
3. **Multi-step act→refresh loop** → one-shot `submit_turn` (≈4× latency/token win).
4. **Parallel raw-tool action path** → enumerated `actionId` + `strict` only.
5. **LLM `memoryDigest` summarizer** → deterministic server-computed facts.
6. **Opus/Fable "Boss tier"**, BYOK, JSON-Patch diffing, matchmaking queue, hidden-info policy engine, normalized prompt/transcript tables (start as JSON columns).

**Build order (each gates the next; ~3–4 weeks for one full-stack dev):**

| # | Milestone | Why first | Effort |
|---|---|---|---|
| 0 | Pure rules engine + unit tests | everything depends on it; testable with zero infra | 3–6 d |
| 1 | **Headless match runner** (engine ↔ one adapter, no web): prompt-A vs prompt-B to completion, prints reasoning | **Validates the make-or-break question — is an LLM-vs-LLM match fun to watch, at tolerable speed/cost — before any web work.** Doubles as the eval harness. | 2–4 d |
| 2 | One LLM adapter + system template + JSON parsing + timeout | the only agent code v0 needs | 2–3 d |
| 3 | Server: Fastify + ws, in-memory registry, "create match (both seats)" + broadcast | wrap milestone 1 in a socket | 3–5 d |
| 4 | Client: read-only board + reasoning panel + pre-match form | pure render of server state | 4–7 d |
| 5 | Persistence: SQLite, action log, replay = re-run engine | cheap once engine is pure | 2–3 d |
| 6 | Deploy: one container + volume | — | 1 d |

> **The one sequencing rule that matters:** do **Milestone 1 before touching the web layer.** It costs ~half a week and answers the question the whole product hinges on. If turns take 40 s and a match costs $0.50, you want to know *before* building sockets.

---

*Game rules: [GAME-DESIGN.md](GAME-DESIGN.md) · Cards: [CARDS.md](CARDS.md) · Full report, viability & roadmap: [REPORT.md](REPORT.md)*
