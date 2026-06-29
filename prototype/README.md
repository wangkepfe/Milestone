# AI Card Battle — Phase-0 Prototype

The roadmap's **Milestone 1**: a deterministic rules engine + a heuristic bot + a headless bot-vs-bot runner — built *before* any web layer to answer the questions the whole product hinges on (is it watchable? how long are matches? is the balance real?). No dependencies; Node ≥ 18.

## Run it

```bash
node prototype/src/runner.js                       # one verbose match (ClosedAI vs Anthrabbit)
node prototype/src/runner.js --seed 7              # pick the coin/shuffle seed
node prototype/src/runner.js --a googlitch --b shallowseek   # pick factions
node prototype/src/runner.js --games 300 --quiet   # win-rate + avg-length benchmark (one pairing)
node prototype/src/runner.js --rr --games 150      # round-robin across all 4 factions
SM_CAP=10 node prototype/src/runner.js --rr --games 150   # apply the Safety-Margin balance fix
```

(From the `prototype/` dir: `npm start` / `npm run bench` / **`npm test`** runs the full suite — engine unit tests + API + script + worker + UI.)

## What's implemented

- **Engine** (`src/engine.js`): deterministic, JSON-cloneable state; integer-seeded RNG (mulberry32); Compute ramp/refill; combat (Benchmark) with retaliation; **legal-action generation** (the action-by-ID backbone); `applyAction` with server-style validation; deaths → On Sunset → win checks; Burnout/Model Collapse; a hard ply cap; `cloneState` for the bot's lookahead.
- **Keywords**: Guardrail, Ship It, Launch Day, Failover, On Deploy, On Sunset, Monetize, Overclock\*, Stealth Mode, Parallelize\*, plus **Hype** (ClosedAI) and **Safety Margin** armor (Anthrabbit). *(\*present in the engine, not exercised by the two implemented decks.)*
- **Cards** (`src/cards.js`): **all four factions**, 10 uniques ×2 each — **ClosedAI** (aggro/Hype), **Anthrabbit** (control/Safety), **Googlitch** (ramp/value, shared Open Source zone + Glitch coin), **ShallowSeek** (swarm/combo, tokens + cost-reduction) — with the [CARDS.md](../docs/CARDS.md) balance fixes applied (Closed Beta Brigade → 3/2, TAM capped at 8, Founder Mode Sam X capped at 3, Claudius heal capped at 8, unified heal-overflow → armor). A few fiddly twists are simplified, marked `[sim]` in the card text (Index & Scry → draw; TPU Megapod's per-turn scry). **Overclock** (Ops deal +1 per Overclock Model) and **Whale-Class Cluster's charge rider** (+1 charge per Model played) are now fully implemented — the latter exposed that the bot's `evalState` ignored equipped **Launches** entirely (so weapon cards were never played); valuing them is now fixed, which made the balance numbers more trustworthy.
- **Bot** (`src/bot.js`): greedy one-ply search over a state-evaluation function. Develops, takes favourable trades, pushes lethal, heals when behind, never wastes a no-gain action. A few JSON clones per candidate → **well under the ~100 ms script CPU cap**.
- **Runner** (`src/runner.js`): verbose single match, N-game benchmark, or 4-faction round-robin; greedy or beam-search bots.
- **Live REST API** (`src/server.js`): the BYOA live-mode contract over plain Node `http`, no deps — `POST /match`, `GET /match/:id/wait` (long-poll), `GET /match/:id/state`, `POST /match/:id/action`. Engine is authoritative (every action re-validated); a per-turn **deadline → fallback bot** provides session-liveness. `src/test_api.js` is an end-to-end test (see below).
- **Script sandbox** (`src/sandbox.js`): the BYOA **script entry** — a player-authored `choose_turn(state, legal, api)` runs in an isolated `vm` context under a CPU/time cap, with `api.simulate(ids)` / `api.legal(ids)` so scripts can search the deterministic engine. Errors/timeouts fall back to the heuristic bot. `src/test_script.js` proves it (see below).
- **Spectator UI** (`src/server.js` serves `public/spectate.html` + `GET /demo`): a self-contained browser page that renders a full bot-vs-bot match — both factions' boards and face-up hands, a stepable/auto-play turn timeline, a match log, and a winner banner. The make-or-break "is it fun to watch?" surface, made real (see below).

**Not yet implemented:** `isolated-vm` for fully untrusted scripts (the worker path hard-caps CPU + isolates the thread, but adds no memory isolation); a live (non-replay) spectator stream of an in-progress API match; the `[sim]` twists at full fidelity.

## Decisions actioned (the two open knobs from [BYOA.md §4](../docs/BYOA.md#4--the-clocks--and-the-one-trap-that-matters))

| Knob | Decision | Rationale |
|---|---|---|
| **Script CPU cap** | **~100 ms/turn** (default) | Keeps scripts at *fast-heuristic* tier, not solvers — so live-prompt players stay competitive. The reference bot runs far under it. |
| **Apex lean** | **Heuristic-tier** | We want the top of the ladder reachable by good prompts, not owned by brute-force search bots. |

## Findings (what running it taught us)

1. **It works and it's watchable.** Thousands of games across all matchups: **0 crashes, 0 infinite loops, ~0 ply-cap draws — essentially every match a decisive lethal.** The turn log reads cleanly (`--seed 42`).
2. **Turn count validated.** Average **~16 plies (~8 turns/side)** — right in the ~8–10/side the design predicted. Stateless-turn context budgeting holds.
3. **Balance — a clear, prioritized problem.** Full 4-faction round-robin (900 games):

   | Faction | Overall win rate | Notes |
   |---|---|---|
   | **Anthrabbit** | **88.2%** | beats ClosedAI 75%, Googlitch 91%, ShallowSeek 99% — grossly over-tuned |
   | ClosedAI | 53.8% | beats the ramp/swarm decks, loses to Anthrabbit |
   | Googlitch | 30.0% | the Gemini "refill to full" enables chaining two 8-drops — a real blowout, but not enough |
   | ShallowSeek | 28.0% | swarm gets walled + healed out (1% vs Anthrabbit) |

   **The single recommended fix is not enough** (again): capping Safety Margin at 10 moved Anthrabbit only 88.2% → 85.6%. The cause is compound — control's heal density (Realign + Alignment Researcher + Rapid Rollback + Lattice + Claudius) resets it to 22 repeatedly behind Guardrail walls.
4. **Measured balance is bot-skill-dependent — and now we've measured the dependence.** The greedy one-ply bot under-pilots combo/tempo, which inflated Anthrabbit's dominance. Adding a beam-search turn planner (`--search`) changes the meta sharply:

   | Faction | Greedy (1-ply) | Search (beam 8 / depth 6) |
   |---|---|---|
   | ClosedAI | 53.8% | **67.0%** |
   | Anthrabbit | 88.2% | **78.3%** |
   | Googlitch | 30.0% | 22.0% |
   | ShallowSeek | 28.0% | 32.7% |

   The defining **ClosedAI-vs-Anthrabbit matchup flips from 25/75 to 56/44** — properly piloted aggro beats control. So "Anthrabbit 88%" was largely a *piloting artifact*; under good play the aggro–control axis is fine (~56/44). The robust, real problem is **Googlitch (~19–22%) and ShallowSeek (~33–39%) are under-tuned** — Googlitch's ramp payoff is too slow and a single-turn beam can't exploit its multi-turn plan.

5. **The CPU-cap knob saturates ([BYOA.md §4](../docs/BYOA.md#4--the-clocks--and-the-one-trap-that-matters)).** Going deeper — beam 16 / depth 9 — barely moves the numbers (ClosedAI ~66%, Anthrabbit ~77%). Search quality jumps a lot from *greedy → beam-8*, then plateaus. Practical implication: the bot-vs-prompt balance is most sensitive at the **low** end — if you don't want bots to trivially out-pilot live prompts, cap *below* beam-8 (greedy/shallow), because beam-8 already plays near the tactical ceiling. Cost: ~26–41 ms/game even at beam 16 — comfortably inside a 100 ms/turn cap.

This is the whole point of Milestone 1: with one harness we separated a **piloting artifact** (Anthrabbit's apparent dominance) from a **real balance bug** (Googlitch/ShallowSeek under-tuned), and put an empirical number on the **CPU-cap knob** — all before a line of web code.

## Balance pass v1 (harness-driven)

Using the **search bot** (beam 8) as the trustworthy evaluator, starting from finding 4's numbers, I buffed the two under-tuned decks, then nudged the dominant one, re-measuring each step:

- **Googlitch** (was 22%): Pod Provisioner → 0/4; Spin Up a TPU Pod also draws; Sunset Protocol 5→4cc.
- **ShallowSeek** (was 33%): Inference Cascade 5→4cc & cap 8→10; Sparse Activation +1→+2; Open-Weights Intern → 2/3; Mixture-of-Interns → 3/5; The Whale 6→5cc.
- **Anthrabbit** (was 78%): Interpretability Lattice 3→2 turns; The Long-Horizon Plan 6→7cc.

| Faction | Search, original cards | Search, after pass v1 |
|---|---|---|
| ClosedAI | 67.0% | **49.3%** |
| Anthrabbit | 78.3% | **67.3%** |
| Googlitch | 22.0% | **36.4%** |
| ShallowSeek | 32.7% | **46.9%** |

**Win-rate spread collapsed from ~56 points to ~31**, and the ClosedAI/Anthrabbit/ShallowSeek triangle is now healthy (ClosedAI vs each ≈ 46–59%). Two honest notes:
- The two Anthrabbit nerfs had **small measured effects** (Lattice 3→2 moved its overall rate <1 pt) — the harness shows which "fixes" actually matter.
- **The remaining problem is structural, not numeric.** Anthrabbit still beats Googlitch **~87%** because **Googlitch has no reach** — it can only win on board, and against walls + heal it cannot close the game. The fix is a *design* change (give Googlitch some inevitability / burn vs control), not a stat tweak. Flagged for a future pass.

> The marked-up card changes live inline in `src/cards.js` (search for `[buff:` / `[nerf:`). These are prototype-balance experiments; the canonical card list in [docs/CARDS.md](../docs/CARDS.md) is the design source of truth.

### Balance pass v2 — the structural fix, confirmed

v1 predicted Googlitch's control matchup needed a *design* change (reach), not a stat tweak. Confirmed by experiment: a small reach **Op** (Glitch in the Stack → can hit the CEO) did **nothing** (Googlitch 36→37%, still 15% vs Anthrabbit), but putting real reach on the **finisher** (Gemini Ascendant's On Deploy also burns the CEO for 4) cracked it:

| Faction | After v1 | After v2 (Gemini reach) |
|---|---|---|
| ClosedAI | 49.3% | 48.0% |
| Anthrabbit | 67.3% | **62.2%** |
| Googlitch | 36.4% | **45.6%** |
| ShallowSeek | 46.9% | 44.2% |

Googlitch vs Anthrabbit went **15% → 29%**, and the overall spread tightened from ~31 to **~18 points** (three decks now 44–48%, Anthrabbit 62%). The harness validated the hypothesis exactly: incremental removal/reach didn't move the needle; reach on the *payoff* did. Anthrabbit at 62% is still top (it earlier proved robust to two direct nerfs) but no longer dominant.

Later fidelity passes — implementing the inert **Overclock** keyword and **Whale-Class's charge rider**, plus teaching the bot to value equipped **Launches** (it had been ignoring every weapon card) — kept the meta tight. Anthrabbit's residual lead is its even-or-better matchup into everyone; closing it further is a deliberate design call, not an obvious stat fix.

**Settled numbers (2400-game round-robin, beam-8 bot):**

| Faction | Overall | Notable matchup |
|---|---|---|
| Anthrabbit | **57.3%** | beats Googlitch 71/29 (the one lopsided matchup left) |
| ClosedAI | **50.5%** | beats Anthrabbit 58/42, loses to Googlitch/ShallowSeek |
| Googlitch | **46.9%** | even-ish vs everyone except Anthrabbit |
| ShallowSeek | **45.3%** | beats ClosedAI 54/47 |

A **~12-point spread** with a healthy **non-transitive triangle** (ClosedAI ▸ Anthrabbit ▸ Googlitch/ShallowSeek ▸ ClosedAI). Every matchup sits within 58/42 except **Anthrabbit vs Googlitch (71/29)** — the single remaining structural item. Everything else is shippable-prototype balance. (Earlier README figures of ~60–62% for Anthrabbit were small-sample variance; this 2400-game run is the authoritative read.)

## Live REST API (BYOA live mode)

```bash
node prototype/src/test_api.js     # end-to-end test: agents play a match over HTTP
node prototype/src/server.js 8787  # or run a standalone server on a port
```

`src/server.js` exposes the [BYOA.md](../docs/BYOA.md) live contract over dependency-free Node `http`:

| Endpoint | Purpose |
|---|---|
| `POST /match` | create a match (`{a, b, deadlineMs}`) → `{matchId, tokens:{A,B}}` |
| `GET  /match/:id/wait?token=` | **long-poll** — blocks until it's your turn / game over / ~20s |
| `GET  /match/:id/state?token=` | full state + `legalActions` (when it's your turn) + `turnToken` + status |
| `POST /match/:id/action` | `{token, turnToken, actionIds[]}` — one-shot turn; re-validated server-side |

The agent loop is exactly the BYOA shape: **`/wait` → `/state` → plan locally → `/action`**. `test_api.js` proves two things end-to-end:

1. **Two independent agents** play a full match over HTTP to a clean lethal (each plans with beam search from the state JSON and submits action IDs).
2. **Session-liveness:** with one seat *silent* and a 600 ms deadline, the server's **fallback bot covers every missed turn** and the match still completes — a dropped agent never stalls the game.

Authority stays server-side: the engine re-validates every `actionId`, the per-turn `turnToken` rejects stale/duplicate posts, and tokens are scoped per match+seat.

## Script entry (sandbox)

```bash
node prototype/src/test_script.js
```

The other BYOA entry: a player's agent *writes a bot* instead of playing live. The bot is a `choose_turn(state, legal, api)` function returning an ordered list of action IDs; `src/sandbox.js` runs it in a `vm` context under a CPU/time cap, exposing two search helpers over the deterministic engine:

```js
api.simulate(ids) // -> { ok, score }  : evalState after applying those action ids
api.legal(ids)    // -> [actions]      : legal actions after applying them (set evolves as you commit)
```

`test_script.js` proves the two properties that make Script Mode the clean, fair, ToS-honest ranked entry:

1. **It plays, fast and deterministic** — a greedy script (searching via the API) plays a full match at **~1.4 ms/turn**, far under the 100 ms cap.
2. **The cap is enforced** — an infinite-loop script blows its 50 ms budget every turn; the runtime kills it and the **fallback bot covers every turn**, so a bad/slow script degrades instead of stalling.

> `vm` alone is a CPU/time fence, not a hard boundary — so there's also a **hardened path** (`takeScriptTurnWorker` in `src/sandbox.js`, tested by `src/test_worker.js`): each script runs in its **own `worker_thread`** with its own engine, and is **hard-killed via `terminate()`** on overrun (the main thread never blocks). Cost: ~25 ms/turn (worker startup) vs ~1.4 ms for the in-process `vm`. Verified: a greedy script plays a full match; an infinite-loop script is terminated and the fallback covers every turn. `isolated-vm` would add memory isolation for fully untrusted code.

## Spectator UI

```bash
node prototype/src/server.js 8787   # then open http://127.0.0.1:8787/
node prototype/src/test_ui.js       # headless smoke-test (serves page + valid replay)
```

A self-contained page (`public/spectate.html`, no build/deps) for the **"is it fun to watch?"** question — the product's biggest risk. Pick two factions, hit **New match**, and the server generates a full bot-vs-bot replay (`GET /demo`) that the page steps through: both CEOs (Valuation / Safety Margin / Compute), each side's **data center** and **face-up hand** (open-information Telemetry), the shared Open Source zone, a **Prev / Next / Auto / slider** timeline, a clickable **match log**, a per-turn **rationale**, and a **winner banner**. Verified end-to-end (page renders a 15-turn match, slider drives playback, banner fires the result).

The per-turn **rationale** ("Pressing hard — 6 to their Valuation", "Stabilizing — shoring up 5 life/armor", "Trading off a threat", "Closing out the game — lethal!") turns each turn into a one-line story — the spectator feature the [viability review](../docs/REPORT.md#5-viability-assessment--the-skeptics-verdict-pivot) called the real draw. It's derived heuristically here from each turn's net effect; with LLM agents it would be the model's own reasoning.

## Human vs Human (PvP)

```bash
node prototype/src/server.js 8787   # then open http://127.0.0.1:8787/play
node prototype/src/test_pvp.js      # human-mode server tests (redaction, incremental play, handoff, concede)
```

A second, interactive front-end (`public/play.html`, no build/deps) where **two humans play the live match themselves** on **two separate devices** — the inverse of the spectator twist (here you play, instead of watching an agent). On `/play` one player picks both factions, creates the match, and sends the auto-generated **seat-2 link** to their opponent; the game starts once both have joined.

It is a thin, **server-authoritative view** over the same engine: the page never re-derives a rule — every legal play, attack target, Founder Move, and weapon swing is read straight from the per-seat `legalActions` the server emits, mapped to a **click-to-select → pick-a-target → confirm** flow (one engine action id committed per gesture). So Guardrails, summoning sickness, Stealth untargetability, Parallelize's second attack, and effective Compute cost are all honoured for free — the UI only lights what the engine already allows.

Human mode required three additions to `server.js` (all gated behind `mode:"human"`, leaving the BYOA bot flow untouched):

- **Hidden hands.** A per-seat redaction (`viewState`) is the *only* place secret info is stripped: the opponent's hand and deck become counts (rendered as card-backs), both decks lose their ordered contents, and the redactor runs on **every** path (`/state`, `/wait`, and the 409/400 error payloads) so nothing leaks — verified in `test_pvp.js` by scanning the wire for opponent card ids.
- **Incremental play, no auto-end.** Actions are POSTed one per click and the turn **stays open** (the `turnToken` is stable across the whole turn); it only advances when the player explicitly sends `end`. (Bot mode keeps its one-shot whole-turn batch.)
- **No deadline bot.** The fallback-bot timer is a no-op for human matches, so a thinking human is never timed out and robbed of their turn. A `POST /match/:id/concede` provides a clean forfeit.

The waiting player long-polls `/wait` and, when their turn returns, gets **redacted recap toasts** built by diffing the board snapshots ("Opponent deployed Paperclip Auditor", "You took 4 damage") — never a live stream of hidden moves. 409/400 responses trigger a silent resync rather than an error dialog, and `sessionStorage` keeps a seat across reloads.

## Plug in a real LLM (an agent actually plays)

The prototype proves the engine + interface with **heuristic bots**; the actual product has an **LLM** play. `src/llm-adapter.js` is the bridge — a dependency-free Claude API adapter (raw HTTPS, no SDK) that drives a seat through the same engine:

```bash
ANTHROPIC_API_KEY=sk-... node prototype/src/llm-match.js \
  --llm a --model claude-haiku-4-5 \
  --strategyA "Aggressive: race the enemy CEO; only trade to survive a board wipe."
# no key → both seats fall back to the heuristic bot (which verifies the wiring)
```

Each step, the model receives the state (including the opponent's **open hand**) + the **enumerated legal actions**, and picks one via a forced `choose_action` tool — so **illegal moves are impossible** (the action-by-ID design from [ARCHITECTURE.md](../docs/ARCHITECTURE.md)). The turn log prints the model's per-action rationale. This is the same loop the live REST API runs server-side; default `claude-haiku-4-5` (~5–10¢/match per [REPORT.md](../docs/REPORT.md)).

## Next extensions

- **Live spectator stream** — extend the UI to watch a *live* API match (poll `/state`) with the agents' reasoning/rationale shown per turn, not just a generated replay.
- **Production sandbox hardening** — move script execution to `worker_threads` / isolated-vm (the current `vm` caps CPU but isn't a security boundary).
- **Structural balance:** give Googlitch reach/inevitability vs control — the one problem stat-tuning can't fix (see Balance pass v1).
- Full-fidelity `[sim]` twists (true scry, Overclock spell-damage, hardware charge riders).

## File map

```
prototype/
  package.json
  public/spectate.html  # self-contained spectator page (boards, hands, timeline, log, banner)
  public/play.html      # interactive human-vs-human PvP client (hidden hands, click-to-select, long-poll)
  src/engine.js         # rules engine: state, RNG, combat, legalActions, applyAction, deaths/win
  src/test_engine.js    # engine unit tests (12): combat/Guardrail/Failover/Stealth/Monetize/Overclock/win/board/heal
  src/cards.js          # all 4 factions: card data + hero powers + decklists (+ [buff]/[nerf] marks)
  src/bot.js            # heuristic bot: greedy one-ply OR beam-search planner; planTurnIds() for agents
  src/llm-adapter.js    # Claude API agent: forced choose_action tool over legal actions (raw HTTPS, no SDK)
  src/llm-match.js      # play a match with a seat driven by a real LLM (graceful bot fallback w/o a key)
  src/runner.js         # bot-vs-bot CLI: verbose match | N-game benchmark | --rr round-robin | --search
  src/replay.js         # buildReplay(): a full match as per-turn snapshots for the spectator UI
  src/server.js         # live REST API + spectator page + GET /demo replay; deadline fallback
  src/test_api.js       # end-to-end API test: two HTTP agents + a silent-seat fallback scenario
  src/test_pvp.js       # human-mode (PvP) tests: redaction/no-leak, incremental play, turn handoff, concede
  src/sandbox.js        # script entry: vm-sandboxed choose_turn() (+ worker_threads hardened path) + api.simulate/legal
  src/scriptworker.js   # worker entry: runs a script in its own thread with its own engine (hard-killable)
  src/test_script.js    # script-sandbox test (vm path): greedy script vs bot + infinite-loop-script cap/fallback
  src/test_worker.js    # hardened-sandbox test (worker path): own-thread script + hard-kill on infinite loop
  src/test_ui.js        # spectator-server smoke-test (serves page + valid replay)
```
