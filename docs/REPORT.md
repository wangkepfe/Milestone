# AI Card Battle — Product Report & Roadmap

*Prepared 2026-06-24. A research-and-design study for a browser card game in which humans write a strategy prompt and **LLM agents play the match** — now backed by a working prototype ([`prototype/`](../prototype/README.md)) that exercises the architecture end-to-end (see §6b).*

**Companion docs:** [GAME-DESIGN.md](GAME-DESIGN.md) (theme & rules) · [CARDS.md](CARDS.md) (40 cards) · [ARCHITECTURE.md](ARCHITECTURE.md) (web + agent + backend tech).

---

## Executive summary

**The concept:** a greatly simplified Hearthstone parody — four AI tech giants (**ClosedAI**, **Anthrabbit**, **Googlitch**, **ShallowSeek**) battle with decks of **Models** (minions), **Ops** (spells), **Compute** (mana), and **Valuation** (life). The twist: **humans don't play.** Each human picks a deck and writes a one-time **strategy prompt**; at runtime an **LLM agent reads the prompt and plays the whole match autonomously** while humans spectate.

**Three findings drive everything:**

1. **The game and the agent interface are buildable and well-shaped.** The deliberate design choices — near-perfect information (open hands), low randomness, a tight 10-keyword set, and an **action-by-ID** interface where the agent only ever picks from a server-enumerated list of legal moves — make this an unusually clean target for LLM play. Illegal moves become *impossible*, not merely rejected.

2. **You cannot power agents with a Claude Code / Codex *subscription* in a shipped product.** This was the central question. The honest answer: a subscription is OAuth-bound to a *user's machine*, and centralizing subscription tokens on a server to run a third-party app is an **explicit Terms-of-Service violation** for both Anthropic and OpenAI — with **documented account suspensions in 2026**. The *engineering* (headless `claude -p` / `codex exec` + the game exposed as MCP tools) works fine; the *subscription auth* is the blocker. The only defensible way to use a personal subscription is **Bring Your Own Agent (BYOA)**: the player runs a small local runner on their *own* machine, holding their *own* token, which never touches your server.

3. **The make-or-break risk is not infrastructure — it's "is it fun to watch?"** The entire loop is "write a prompt, then spectate two bots." That has to be entertaining on its own. The recommended path validates this with a half-week headless prototype *before* building any web layer.

**Recommended path (PIVOT from the maximal design):** ship the game engine + the action-by-ID agent interface + **exactly one backend — the Claude API with `claude-haiku-4-5` (~5–10¢/match)**. Treat BYOA/subscriptions as an honest, clearly-labeled, opt-in power-user mode *built later* (Claude only; Codex is a no-go for a shipped product). Lead the product with the agents' **reasoning log** as the entertainment.

> **Update — validated by the prototype:** a working build now realizes this spine end-to-end (engine → bots → balance harness → live API → script sandbox → spectator UI). It confirms the architecture, shows the game is **balanceable** (four-faction spread tightened from [22–88%] to **~[45–57%]** over a 2400-game benchmark, with a healthy non-transitive matchup triangle), measures the **CPU-cap knob**, and proves both BYOA entries (live + script) including the liveness fallback. The product direction has since evolved toward an **open, unregulated ranked arena** — see [BYOA.md](BYOA.md) — which the report's cautious-MVP framing (fixed-model ranked, BYOA deferred) predates. Details in [§6b](#6b-prototype-validation--the-design-exercised).

---

## 1. What the product is

| | |
|---|---|
| **Genre** | Turn-based collectible-card battler (simplified Hearthstone). |
| **Players** | Two humans, asynchronous — but they **coach, not play**. |
| **The human's job** | Pre-match: pick a deck, write a **strategy prompt**, choose a backend. Then **spectate**. |
| **Who plays the cards** | An **LLM agent** per seat, reading that seat's strategy prompt + the live game state. |
| **The hook** | Watching two AI "CEOs" scheme — the **agent reasoning log** is the show. Plus the parody theme (Hype, Vaporware, Guardrails, Sunsetting your own products, Open Weights). |

The theme maps cleanly onto mechanics (full table in [GAME-DESIGN.md](GAME-DESIGN.md)): **Valuation = HP (22)**, **Compute/GPUs = mana (cap 8)**, **Models = minions**, **Benchmark = attack**, **Op = spell**, **Founder Move = hero power**, **Roadmap = deck (20 cards = 10 uniques ×2)**, **Burnout/Model Collapse = fatigue**.

---

## 2. Game design (summary)

Full detail in [GAME-DESIGN.md](GAME-DESIGN.md); all 40 cards in [CARDS.md](CARDS.md).

- **Smaller than Hearthstone on every axis** (22 Valuation / 8 Compute / 6 board slots / 20-card singleton-×2 decks) for short, legible matches.
- **No instants, secrets, or response windows** — the defender never acts on your turn. State is fully deterministic between turns and trivial to serialize for an LLM. This is the most important simplification.
- **Four signature twists, all chosen to suit agent play:** **Telemetry** (open hands → near-perfect information), **Open Source** (a shared neutral Model zone), **Scaling Laws** (a public ramp counter that powers up Ops predictably), **Model Collapse** (an un-healable mill clock that bounds match length).
- **Four distinct archetypes:** ClosedAI aggro/Hype · Anthrabbit control/Safety · Googlitch ramp/big-compute · ShallowSeek swarm/efficiency-combo.

**Balance status (honest):** the framework is sound but power level is uneven — **ClosedAI is over-tuned**, **Anthrabbit risks unkillable inevitability**, and a structural quirk (no defender response + open hands) over-rewards **Guardrail-ignoring face burst**, so three of four decks can win by ignoring the board. Three cards have unfinished/ambiguous text. All are tuning fixes with concrete numbers in [CARDS.md §Balance](CARDS.md#balance--required-fixes) — not design flaws.

---

## 3. How the agents play it (summary)

Full spec in [ARCHITECTURE.md §5](ARCHITECTURE.md#5-llm-agent-interface).

- **Action-by-ID** is the keystone: each decision, the server sends a list of legal actions with stable `actionId`s; the agent picks one (or, in one-shot mode, an ordered list). This makes illegal moves impossible and shrinks prompt-injection to "a legal-but-bad move for your own side."
- **One self-contained JSON state per decision**, full card text included, server-precomputed legality. Because the game is perfect-information, **context stays bounded for any match length** — no transcript replay needed.
- **One-shot turns** (one model call returns an ordered action list) are the recommended default — ~4× faster/cheaper than refreshing after every action, which matters enormously for spectator pacing.
- **A single `AgentAdapter` seam** — `takeTurn(state, legalActions, memory) → decision` — makes the backend swappable: API, Claude Code, Codex, local model, or a heuristic bot all behind one interface.

---

## 4. The subscription question — the honest core finding

This was the headline ask, so it gets a frank, sourced treatment. (Verbatim research in [Appendix A](#appendix-a--research-findings-verbatim).)

> **⟶ Product decision:** the team has since chosen an **open, unregulated, ranked BYOA arena** (any model + prompt + bot competes; best loadout wins) — see **[BYOA.md](BYOA.md)**. The sourced findings below still stand (server-held subscription tokens remain the bright line we don't cross); what changes is the framing — subscriptions are embraced via a **public game API + the player's own agent**, with script-authoring as the cleanest, ToS-honest path.

### What works
The *architecture* is fully supported and is exactly how you'd build an LLM player agent:
- **Claude Code headless** (`claude -p --output-format json`), the **Claude Agent SDK** (`query()`), and **Codex** (`codex exec --json`) can all be driven programmatically.
- The game can **expose itself as an MCP server** (`get_state`, `list_legal_actions`, `play_card`, `end_turn`) that the agent calls as tools — a first-class, supported pattern on both.
- `claude setup-token` produces a real, inference-scoped, 1-year `CLAUDE_CODE_OAUTH_TOKEN`; Codex supports "Sign in with ChatGPT."

### What doesn't — and this is decisive
- **Using a subscription to power a third-party app is a Terms-of-Service violation, not a gray area.** Anthropic's own clarification (Feb 2026): *"Using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other product, tool, or service — including the Agent SDK — is not permitted and constitutes a violation of the Consumer Terms of Service."* The Agent SDK docs say the same. **Anthropic suspended accounts** for exactly this in 2026. OpenAI explicitly steers automation to API keys, provides **no Plus/Pro token export**, and its Usage Policies prohibit programmatic extraction / powering third-party services / account sharing — putting Codex-subscription automation squarely in violation.
- **You structurally cannot centralize subscription auth on a server** — interactive OAuth binds to a machine/account. That's *the* reason BYOA exists.
- **Subscription rate limits** (rolling 5-hour + weekly caps, sized for one human) would throttle a multi-player game within hours.

### The only honest route: BYOA (Bring Your Own Agent)
Invert the topology — the subscription-authenticated agent runs **on the player's own machine** and connects *out* to the server ([diagram & one-turn sequence in ARCHITECTURE.md §6.3](ARCHITECTURE.md#63-claude-code-byoa--the-local-runner)). The token never leaves the player; they're running Anthropic's/OpenAI's own product for their *own* use; there's no multiplexing. This is defensible — but it's **opt-in, slow (CLI cold-start), fragile, serves a tiny audience, and the player carries the account-ban risk.** Ship it later, clearly labeled, **Claude only** (Codex stays RED). **Never** server-hold a subscription token.

### Verdict per backend

| Backend | Verdict |
|---|---|
| **Claude API (key, server-side)** | 🟢 **GREEN** — licensed, fast, ~5–10¢/match on Haiku. **The production default.** |
| **Claude Code BYOA (local runner)** | 🟡 **YELLOW** — defensible only as opt-in local BYOA; slow, rate-limited, account risk on the player. Post-launch experiment. |
| **Codex BYOA** | 🔴 **RED** for a shipped product — multiple ToS clauses triggered, no token export. Dev/experimental only. |
| **Heuristic bot** | 🟢 fallback floor so a match never stalls. |

---

## 5. Viability assessment — the skeptic's verdict: **PIVOT**

An adversarial review rated each risk; condensed register:

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **ToS / account-ban** for subscription automation | **HIGH** | Don't ship subscription backends in MVP. API path has no ToS issue. |
| 2 | Subscription can't be server-side; BYOA demands developer-grade setup of a player | HIGH | BYOA = post-launch power-user opt-in only; don't let it shape the core. |
| 3 | **Latency** — multi-step turns × CLI cold-start = 3–8 min/match of dead air | HIGH | One-shot turns + API/Haiku + generous deadlines + thinking UI. |
| 4 | API fallback cost | LOW | Numbers check out (~5–10¢/match Haiku). **Fix the Haiku 4096-token cache gotcha** (your prefix silently won't cache). |
| 5 | Illegal-move rate / re-ask loop | MEDIUM | Enumerated `actionId` only (cut the raw-tool path); a "no-progress" guard. Local 8B models will exhaust retries and auto-pass — don't promise local parity. |
| 6 | Context growth over a long match | LOW | Already solved (perfect-info state). **Drop the LLM summarizer** — use deterministic server facts. |
| 7 | **Fairness** with different-strength models (Opus vs Haiku vs local 8B) | **HIGH** | **Ranked: fix the model for both seats** (strategy prompt is the only variable). Tier-as-difficulty is PvE/casual only. |
| 8 | Prompt-injection | MEDIUM | Legality wall neutralizes the scary cases. **Sanitize `rationale`** (stored-XSS to spectators) and cap per-turn tool calls (anti-grief). |
| 9 | **Is it fun to watch?** | **HIGH / under-examined** | Lead with the reasoning/"trash-talk" channel; fast pacing; **prototype the watching experience on a heuristic bot first.** |

**Bottom line: GO** on the engine + action-by-ID interface (one-shot turns) + **one backend (API/Haiku)**. **NO-GO** on both subscription backends for MVP. **PIVOT** the framing — the thing that needs validating is *whether watching prompt-authored agents play is fun*, not the agent infra.

### Two concrete bugs to fix regardless of scope
- **Haiku's 4096-token minimum cacheable prefix** silently defeats the planned ~2.5 K rules+strategy caching → pad the prefix or re-estimate cost ~2–3× higher.
- **Model free-text (`rationale`) rendered to spectators must be sanitized** — stored-XSS/abuse vector.

---

## 6. Is it actually fun? (the real product question)

The whole loop is *write a prompt → watch two bots resolve a perfect-information board with both hands visible.* Honest concerns: spectating is passive; the Telemetry (open-hands) twist that's great for **agent reasoning** removes **hidden-information drama** for viewers; and slow backends make multi-minute stalls unwatchable.

The one genuinely strong spectator feature is the **"why did it do that?" reasoning log** — turning each agent's rationale (and inter-agent trash talk) into the entertainment. That, plus fast pacing (one-shot turns + Haiku + tight deadlines) and the parody flavor, is the actual product. **Validate it cheaply:** build the headless runner and watch a few **heuristic-bot** matches before spending a dollar on LLM infra. If a fast deterministic match isn't fun to watch, LLMs won't save it.

> **Design tension to decide:** the Telemetry open-hands twist is ideal for agent reasoning but flattens spectator suspense. Consider a **hidden-hands spectator variant** for the watching experience even if agents reason over full information.

---

## 6b. Prototype validation — the design, exercised

After the analysis above, a **working prototype** ([`prototype/`](../prototype/README.md)) was built to pressure-test the riskiest claims *before* committing to the web build. It's a dependency-free Node implementation of the whole spine: deterministic 4-faction engine → heuristic + beam-search bots → a round-robin balance harness → the live REST API → the script sandbox → a browser spectator UI. What it settled:

- **Phase 0's decision gate — passed.** Matches run clean and decisive (thousands of games, ~0 crashes/draws), average **~8 turns/side** (matching the design estimate), with a readable, watchable turn-by-turn view. Bot decisions take **sub-ms to a few ms** — engine latency is a non-issue; the only latency is the LLM call itself.
- **"Anthrabbit is 88% dominant" was mostly a *piloting artifact*.** A greedy bot under-pilots combo/tempo; with a beam-search bot the ClosedAI–Anthrabbit matchup moved 25/75 → 56/44. Lesson now baked in: **always state the bot tier when quoting balance.**
- **The game is balanceable.** Harness-driven balance passes tightened the four-faction win-rate spread from **[22–88%] → ~[45–57%]** (2400-game benchmark) — a healthy non-transitive triangle, with only Anthrabbit-vs-Googlitch (71/29) still lopsided. One finding generalizes: the structural "control hard-counters value" problem was fixed only by **reach on the finisher**, not incremental removal.
- **The CPU-cap knob ([BYOA §4](BYOA.md)) is real and saturates.** Bot strength jumps greedy → beam-8 then plateaus (beam-8 ≈ beam-16), all under ~40 ms/game — so the bot-vs-prompt balance is most sensitive at the *low* end of the cap.
- **Both BYOA entries work end-to-end.** The **live** loop (two agents over HTTP: `/wait` long-poll → `/state` → plan → `/action`, with a deadline→fallback) and the **script** entry (a sandboxed `choose_turn` under a CPU cap, hard-killed in a `worker_thread`) are both tested — including the **session-liveness fallback** (a silent or looping agent is transparently covered).
- **The "is it fun to watch?" surface now exists.** A spectator page renders the match with face-up hands, a stepable timeline, and a **per-turn rationale** ("Pressing hard — 6 to their Valuation") — the reasoning channel §6 flagged as the real draw. *Whether it's actually fun stays a human judgment*, but the artifact is real and cheap to A/B.

Caveats: the prototype is JS (the report recommends TS for the build), bots are heuristic (not LLMs), and a few twists are simplified (`[sim]` in the cards). It validates the **architecture and the open design questions** — not the final card text or LLM-play quality.

---

## 7. Product roadmap

Phased, each phase gates the next. Engineering build order & effort sizing in [ARCHITECTURE.md §8](ARCHITECTURE.md#8-mvp-scope--what-to-cut).

### Phase 0 — Validate the premise — ✓ **DONE in the prototype** ([`prototype/`](../prototype/README.md))
- Pure **rules engine** (seed + action log) + a headless bot-vs-bot runner + balance harness — built (in JS; TS for the real build).
- **Decision gate cleared:** matches are clean, fast (sub-ms bot decisions, ~8 turns/side), and watchable; balance is achievable. The remaining unknown is *LLM*-play quality + true "fun," which needs the real adapter (Phase 1).

### Phase 1 — Playable MVP (~3–4 weeks total)
- One LLM adapter (API/Haiku, one-shot turns, `submit_turn` forced tool, deterministic memory facts).
- Fastify + `ws` server; in-memory match registry; **"create match (both seats) → share link"** (skip matchmaking).
- React client: read-only board + **reasoning panel** + pre-match form (deck + prompt + tier).
- SQLite persistence (matches, action log, transcripts); replay = re-run the engine.
- Apply the **must-fix balance changes** ([CARDS.md §Balance](CARDS.md#balance--required-fixes)) and rewrite the ambiguous cards.
- Deploy one container + volume.

> **Already prototyped** (in JS, under [`prototype/`](../prototype/README.md)): the engine, headless runner, balance harness, the live API + spectator UI, and the script sandbox. Phase 1 here is mainly the **TS rewrite, the real Claude API adapter, persistence, and deploy** — plus deciding live-vs-script per the open arena direction in [BYOA.md](BYOA.md).

### Phase 2 — Make it a game people return to
- Matchmaking/lobby + accounts; ladder with a **fixed-model ranked mode** (fairness).
- Sonnet "Strong" tier; PvE difficulty tiers (Standard/Strong/Boss) framed as opponent difficulty, *not* fair contests.
- Spectator polish: replays UI, the reasoning/trash-talk channel as a feature, optional hidden-hands spectator variant.
- Deck collection / a few more factions or cards; balance pass #2 (watch the Guardrail-ignoring-burst meta and the Anthrabbit-vs-Googlitch grind).

### Phase 3 — Power-user & scale (optional, demand-driven)
- **Claude Code BYOA** as an opt-in, clearly-labeled, Claude-only mode (local runner + game-MCP-server). Account risk on the player; never default.
- Opus/Fable "Boss" tier; cost-attribution UI and hard per-match budgets.
- Horizontal scale only if needed: matches sticky to an instance, SQLite→Postgres, Redis pub/sub for spectator fan-out.
- **Not planned:** Codex/ChatGPT subscription in a shipped build (RED on ToS); server-held subscription tokens (bright-line violation); server-held BYOK (credential-storage liability).

---

## 8. Risks & open questions

- **Fun-to-watch is unproven.** Mitigated by the Phase-0 gate — but it's the single biggest unknown.
- **Fairness vs model choice.** "Boss tier" admits model = strength, which undercuts the strategy-prompt-as-skill premise. Resolved by fixing the model in ranked; document it.
- **Meta compression.** Guardrail-ignoring face burst (TAM, Inference Cascade) beats board combat, compressing archetype identity. Needs the balance caps + ongoing tuning.
- **Determinism is partial.** Replays replay *actions*, not inference; Opus/Fable reject `temperature` and aren't reproducible. Don't over-claim.
- **Subscription policy is a moving target.** A paused 2026-06-15 Anthropic change would have metered non-interactive subscription usage separately; Google is sunsetting the Gemini CLI individual tier (Jun 2026) → Antigravity. Any subscription-CLI dependency is unstable ground — another reason the API path is the safe default.
- **Open rules edge-cases to nail down:** the Glitch coin's exact seeding/order; Open Source zone capacity vs the 6-board cap; one unified heal-overflow→Safety-Margin rule. (All listed in [CARDS.md](CARDS.md).)

---

## Appendix A — research findings (verbatim sources)

Three research agents searched the live web (2026-06-24). Key citations:

**Claude Code / Agent SDK / subscription**
- Headless mode (`-p`, `--output-format json/stream-json`, `--allowedTools`, `--append-system-prompt`): `code.claude.com/docs/en/headless`
- Authentication (`claude setup-token`, `CLAUDE_CODE_OAUTH_TOKEN`, precedence): `code.claude.com/docs/en/authentication`
- Agent SDK overview (`query()`, MCP, **"Anthropic does not allow third party developers to offer claude.ai login… including agents built on the Claude Agent SDK"**): `code.claude.com/docs/en/agent-sdk/overview`
- ToS clarification + 2026 account suspensions: The Register, 2026-02-20 — `theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/`
- Subscription + Agent SDK usage (the 2026-06-15 separate-credit change is **paused**): `support.claude.com/en/articles/15036540`
- Max plan limits (5-hour + weekly): `support.claude.com/en/articles/11049741`

**Codex / ChatGPT subscription**
- Non-interactive `codex exec`, `--json`, `--output-schema`: `developers.openai.com/codex/noninteractive`, `/codex/cli/reference`
- Auth ("recommend API key for programmatic… CI/CD"; ChatGPT login "designed for interactive use"; enterprise-only access tokens): `developers.openai.com/codex/auth`
- MCP (client + server): `developers.openai.com/codex/mcp`
- Pricing / 5-hour + weekly caps, Apr-2026 reprice: `developers.openai.com/codex/pricing`
- Usage Policies (programmatic extraction / power third-party services / account sharing prohibited — page 403s to automated fetch; corroborated by secondary sources, flagged UNVERIFIED against live page): `openai.com/policies/usage-policies`
- *Aside:* Gemini CLI individual tier sunset **2026-06-18** → Antigravity (vendor instability).

**LLMs playing turn-based games (prior art & patterns)**
- *Claude/Gemini Plays Pokémon* — the lesson is **long-horizon coherence, not raw intelligence**; success needs a *harness* (perception dump + self-managed memory + constrained tools), not raw calls. TIME: `time.com/7345903/...`; ZenML LLMOps DB write-up of Anthropic's harness.
- **CICERO** (Diplomacy, *Science* 2022): **separate language from strategy** — LLM negotiates, a dedicated planner picks moves. Top-10% human-level.
- **GameBench** / **Board Game Arena** / **Code World Models** (arXiv): direct move-prompting is fragile (illegal/shallow); **enumerate legal actions + constrain decoding to that enum**; have the LLM emit a verifiable rules engine and run search over it for strong play. Humans still beat raw models.
- **Pitfalls:** hallucinated state poisoning memory (Google Pokémon "phantom item"); context rot past ~100K tokens (repeats past actions); never let model-asserted state override the engine.
- **Netcode:** authoritative server + WebSocket + delta-synced rooms (Colyseus-style); reconnection grace + per-viewer hidden-info filtering (which doubles as the spectator mechanism). For an "AI plays for you" mode the agent is just another client whose moves the server validates identically.

> **These prior-art lessons are already baked into the design:** action-by-ID = enumerate-and-constrain; engine-is-truth = never trust model-asserted state; perfect-info self-contained state = no context rot; `AgentAdapter` = the harness boundary; CICERO's split = strategy prompt (intent) vs deterministic engine (rules).

---

*Game rules: [GAME-DESIGN.md](GAME-DESIGN.md) · Cards: [CARDS.md](CARDS.md) · Tech: [ARCHITECTURE.md](ARCHITECTURE.md)*
