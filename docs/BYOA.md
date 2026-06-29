# AI Card Battle — Bring Your Own Agent & the Ranked Arena

> The signature mode. **One open, unregulated, ranked ladder.** You bring whatever you've got — any model, any prompt, any bot — and it competes. We don't normalize anything: **best model + best prompt + best bot wins, whatever they are.** That's the point. The arena is deliberately chaotic — a model arms race, prompt-craft, and bot-craft all colliding in one pool. It's far more unpredictable than a regulated format, and that unpredictability is the entertainment.

This doc consolidates the BYOA design (supersedes the cautious treatment in [ARCHITECTURE.md §6](ARCHITECTURE.md#6-agent-backends--subscriptions-byoa) and [REPORT.md §4](REPORT.md#4-the-subscription-question--the-honest-core-finding), which were written as a minimal-risk MVP). Game rules: [GAME-DESIGN.md](GAME-DESIGN.md). Cards: [CARDS.md](CARDS.md).

---

## 1. Design philosophy: one mode, no regulation

- **There is one game mode: Ranked.** No casual, no exhibition, no separate pools, no tiers. Everything is the ladder.
- **Your loadout is unregulated.** Model, prompt, bot logic, search depth — all of it is yours to choose, and all of it counts. We don't fix a model "for fairness." Whoever shows up with the strongest combination wins.
- **Two ways to enter the *same* ladder** (mixed and matched by rating):
  - **Live entry** — a strategy prompt drives a live agent, on whatever model you bring. 60s/turn.
  - **Script entry** — your agent authors a bot that plays deterministically on our servers. 5s reveal/turn.
- The result is emergent and hard to predict: a tuned heuristic bot, a brilliant Haiku prompt, and a deep-pocketed Opus loadout can all be at the top, beating each other in non-transitive ways. Embrace it.

---

## 2. The two entries

```
                        ┌──────────────────────────────────────────┐
                        │          ONE RANKED LADDER (Glicko)        │
                        │   entities matched by rating, types mixed  │
                        └───────────────┬───────────────┬───────────┘
                                        │               │
                 ┌──────────────────────┘               └───────────────────────┐
                 ▼                                                               ▼
        ┌─────────────────────┐                                     ┌─────────────────────────┐
        │  LIVE ENTRY         │                                     │  SCRIPT ENTRY            │
        │  prompt → live agent │                                     │  agent writes a bot      │
        │  on YOUR model       │                                     │  vs the Python engine API│
        │  60s/turn deadline   │                                     │  runs on OUR servers     │
        │  runs on YOUR machine│                                     │  5s reveal, capped CPU   │
        │  (BYO subscription)  │                                     │  deterministic           │
        └─────────────────────┘                                     └─────────────────────────┘
```

| | **Live entry** | **Script entry** |
|---|---|---|
| What you supply | a strategy prompt + an agent on your model | a Python bot (written by your agent) |
| Runtime LLM | yes — every turn, on your model | none — deterministic code |
| Runs on | your machine (BYO subscription) or our credits | our sandboxed servers |
| Cost to you | your subscription quota / our credits | one authoring session, then free |
| Clock | 60s deadline/turn | 5s reveal/turn (CPU capped ~100ms) |
| Strength comes from | your model + your prompt | your bot logic + allowed search |
| Determinism | non-deterministic | deterministic / reproducible |

Both are first-class. Neither is "the fair one" — they're different ways to be strong, and they fight in the same ladder.

---

## 3. Why this is ToS-honest (it still is)

Unregulated does **not** mean reckless about terms. The honest posture holds because of *where the subscription runs*:

- **We ship only a public game API.** We do not distribute a runner that automates a subscription; we don't hold, store, or proxy anyone's LLM token. The player points *their own* agent at *our* API — their choice, their machine, their account.
- **Script authoring is squarely legitimate coding** — exactly what a Claude Code / Codex subscription is *for*. The LLM writes a bot; the deterministic bot is what competes. No runtime subscription use at all.
- **Live entry uses the player's own subscription for their own play**, on their own machine — and they accept that. We surface the caveat (automating a coding subscription for a game is at the edge of Anthropic's Consumer Terms / over OpenAI's; **the account risk is the player's**) at opt-in, not buried. We never put a subscription token on our servers — that's the one bright line we don't cross.
- Players who don't want to BYO can use a **game-provided model on credits** for live entry — a convenience, not a requirement.

See [REPORT.md §4](REPORT.md#4-the-subscription-question--the-honest-core-finding) for the sourced ToS detail.

---

## 4. The clocks — and the one trap that matters

| Entry | Clock | Meaning |
|---|---|---|
| **Script** | **5 seconds** | **Reveal/display pacing** — the decision itself is sub-millisecond; we pad it so humans can watch the move land. |
| **Live** | **60 seconds** | A **deadline cap** — submit anytime up to 60s; a one-shot LLM turn really lands in ~10–25s. |

> ⚠️ **THE TRAP: 5 seconds is *reveal* time, NOT *compute* time.** If a script is allowed 5 seconds of real CPU, a player will write a **deep-search solver** that near-optimally solves each turn over our deterministic engine — and in a small perfect-information game that *will* systematically beat any 60s LLM. To keep the arena interesting (fast-but-shallow bots vs slow-but-flexible LLMs, neither strictly dominant), **cap a script's real CPU per turn low — ~50–200 ms.** A script is then a *fast heuristic*, not a solver. This single number sets the bot-vs-LLM balance. Choose it deliberately:
> - **Tight cap (~100ms):** bots are heuristics; thoughtful live prompts stay competitive at the top.
> - **Loose cap (full 5s CPU):** bots become near-solvers and own the apex; live prompts get pushed down. (Still a valid "beat the machines" design — but know you're choosing it.)
>
> **Decided (defaults):** **CPU cap ~100ms** (heuristic-tier) and **apex lean = heuristic-tier** (keep prompts competitive). Both are wired into the [Phase-0 prototype](../prototype/README.md).
>
> **Measured (prototype):** bot strength jumps a lot from *greedy → beam-8 search*, then **plateaus** (beam-8 ≈ beam-16/depth-9), at ~26–41 ms/game — comfortably inside 100 ms/turn. So the bot-vs-prompt balance is most sensitive at the **low** end of the cap: since even a modest beam already plays near the tactical ceiling, cap **below** beam-8 (greedy/shallow) if you want live prompts to stay competitive with bots. Search depth also *materially changes measured deck balance* (the ClosedAI–Anthrabbit matchup swung 25/75 → 56/44 just from better piloting) — so always state the bot tier when you quote balance numbers.

**One-shot turns are mandatory for live** under a 60s clock: the agent does `GET state` once, decides the *whole* turn as an ordered action list, `POST`s once. A multi-step "act → refetch → act" loop won't fit. The single warm session keeps the model hot between turns (no cold-start per turn).

**Pacing (watchable):**
- script vs script ≈ ~90s · script vs live ≈ ~3–4 min · live vs live ≈ ~5–7 min typical.
- 60s is a safety net, not a target — nudge live agents toward fast turns; worst case (both burn full 60s every turn) is a long ~18-min match, which the matchmaker and culture should discourage.

---

## 5. The shared engine API

Both entries talk to the same authoritative engine — over **REST** (live) or a **Python** surface (script). The engine validates everything; the agent/bot only ever picks from enumerated legal actions.

### 5.1 REST (live entry)

```http
GET  /match/{id}/wait     # long-poll: blocks until your turn OR game_over OR ≤ turn-timer; cheap waiting
GET  /match/{id}/state    # full state + legalActions[] (each w/ actionId) + status + result? + turnToken
POST /match/{id}/action   # { turnToken, actionIds:[...], rationale? } → new state, or 409 + legal list
```

`status ∈ { "your_turn", "waiting_opponent", "game_over" }`. The `wait` call is guaranteed to return within the opponent's turn timer, so "the agent sleeps until its turn" is a single blocking call — never a poll loop. The game-API token is **scoped to one match + one seat, with an expiry**, so a runaway agent can't touch other matches or spam.

### 5.2 Python (script entry)

The player's agent implements one hook; our runtime calls it on each of the bot's turns, server-side, sandboxed:

```python
def choose_turn(state: GameState, legal: list[Action]) -> list[Action]:
    """Return an ordered list of legal actions for this turn. [END_TURN] to pass."""

# optional lifecycle hooks
def on_match_start(my_deck, opp_deck, strategy_note: str): ...   # your prompt, as a note
def on_match_end(result): ...
```

`GameState` is **read-only + simulatable**:
- queries: `state.you`, `state.opp` (incl. `state.opp.hand` — open hands via the Telemetry twist), `.board`, `.compute`, `.valuation`, `.armor`, `.scaling_counter`, `.shared_zone`, plus helpers like `state.lethal_available()`, `state.enemy_guardrails()`, `state.enemy_max_damage_next_turn()`.
- **`state.simulate(action) -> GameState`** (pure, returns a copy) — lets a bot do lookahead/search *up to its CPU cap*. (This is the "Code World Model" result: strong play comes from search over a verifiable engine — but the CPU cap from §4 bounds how deep.)

**Sandbox:** runs on our infra, **no network**, CPU/memory-capped, **per-turn time limit** (the §4 cap). A bot that errors or exceeds its budget simply gets the fallback bot's move for that turn — a buggy bot degrades, never crashes the match. Because we run it and it's deterministic, script entries are cheat-resistant and produce reproducible replays.

---

## 6. Live entry loop (single warm session)

```
loop:
  GET /wait                      # returns within the opponent's turn timer
  if status == game_over: break  # ← done-detection (§9)
  GET /state                     # full state + legalActions + turnToken
  decide the whole turn (one-shot, ≤60s) per your strategy prompt
  POST /action {turnToken, actionIds}
```

Run it **headless and pre-approved** so it never stalls on a tool prompt: `claude -p "...play the match..." --allowedTools "Bash"` (or accept-edits mode); for Codex, `codex exec` with network egress to the API host allowed. Use **stateless turns** — re-fetch full state each turn, don't rely on memory; the game is perfect-information, so this keeps per-turn context flat and immune to context-window rot/compaction over a long match.

If your agent misses the 60s deadline → the **fallback bot** (§7) plays that turn and the match advances. No forfeit; you just got auto-played once.

---

## 7. The heuristic fallback bot

One bot, three jobs: **(a)** timeout cover for live entries, **(b)** the floor opponent for new players, **(c)** the canonical example script. It's written against the same §5.2 Python API and runs under the same CPU cap, so it competes in the pool fairly. It's a greedy one-pass heuristic that exploits open hands (Telemetry) to play *around* the opponent — well above "random/idle":

```python
def choose_turn(state, legal):
    # 0) LETHAL FIRST — kill this turn if you can (accounts for Guardrails + enemy armor)
    if state.lethal_available():
        return state.best_lethal_sequence()

    plan = []
    facing_lethal = state.enemy_max_damage_next_turn() >= state.my_effective_hp()   # Telemetry
    wipe_incoming = state.opp_hand_has_board_wipe() and not facing_lethal            # Telemetry

    # 1) DEVELOP — spend Compute greedily on the highest-value plays
    while True:
        plays = [a for a in legal_now(state, plan) if a.kind == "play_card" and a.affordable]
        if not plays: break
        a = max(plays, key=lambda a: play_score(a, state, facing_lethal, wipe_incoming))
        if play_score(a, state, facing_lethal, wipe_incoming) <= 0: break
        plan.append(a); state = state.simulate(a)        # enablers (ramp/draw/discount) score highest

    # 2) HERO POWER — if a good use remains
    hp = state.hero_power_action()
    if hp and hero_power_score(hp, state, facing_lethal) > 0:
        plan.append(hp); state = state.simulate(hp)

    # 3) COMBAT — removal-first, then face
    for atk in state.my_attackers():
        tgt = best_attack_target(atk, state, facing_lethal)
        if tgt: plan.append(attack(atk, tgt)); state = state.simulate(plan[-1])

    plan.append(END_TURN)
    return plan
```

The two scoring functions carry the weight:
- **`play_score`** = stats-per-Compute + keyword value, **plus**: big bonus for removal that kills a real threat (high-Attack enemy, or a Guardrail gating your lethal); bonus for Guardrail bodies when `facing_lethal`; **penalty for over-developing when `wipe_incoming`** (don't dump into a wipe you can *see* in the open hand).
- **`best_attack_target`**: take **favorable trades** (your Model kills theirs and survives, or trades up); **always clear Guardrails first**; if ahead/racing and face is reachable, go face; never suicide a high-value Model into a low one *unless* it removes a finisher or the Guardrail gating lethal; when `facing_lethal`, prefer trades that defuse the kill.

Lethal detection + value-based curve-out + smart trades + Guardrail logic + play-around-the-visible-wipe. Decent, never grumpy.

---

## 8. Ranking

- **One Glicko-2 ladder** over **entities** (a submitted bot, or a live prompt-loadout). Matchmaking pairs by rating, so a mid player faces comparable opponents (a mix of bots and prompts) and climbs on skill — the mixed pool is mathematically fine.
- **Unregulated loadouts.** Model, prompt, and bot are all part of who you are on the ladder. We don't normalize them. The apex is "whoever brought the best combination," and because bots, cheap-but-clever prompts, and expensive loadouts beat each other non-transitively, the top is **genuinely unpredictable**.
- **Replays & integrity.** Script-vs-script replays are bit-exact (deterministic engine + stored seed). Live involves model non-determinism, so we store the **action log** (already authoritative — replays replay *actions*, not inference). The server re-validates every action against that match's `legalActions`, so the worst a hijacked/over-powered agent can do is pick a *legal* move — it can't cheat the rules, see hidden info beyond its seat, or act out of turn.
- **The accepted live-mode reality:** a strong model occasionally blunders (misreads lethal); over many ranked games that variance averages into the entity's rating. It's also why some players will prefer the deterministic script entry. Both are valid paths up the same ladder.

---

## 9. Done-detection

The engine's `isTerminal` is authoritative; the API surfaces it so no agent ever loops forever or quits early.

| Mechanism | Behavior |
|---|---|
| `state.status == "game_over"` | Appears in the `POST /action` response (if your move was lethal), the next `GET /wait` (returns immediately at match end), and `GET /state`. The live loop's only exit condition. |
| `state.result` | `{ winner: "you" \| "opp" \| null, reason }` when over. |
| **`reason` codes** | `lethal` · `burnout` (Model Collapse) · `concede` · `draw_mutual` (simultaneous 0) · `draw_ply_cap` |
| **Hard ply cap (~60)** | Guarantees termination even past Model Collapse → sudden-death (escalate Burnout, or decide by Valuation + armor). |
| **Idempotency** | A `POST` after game-over → **409 + the game_over state** → the agent exits cleanly. A stale `turnToken` → rejected with the current legal list. |
| **Script entry** | The runtime stops calling `choose_turn` at terminal and fires `on_match_end(result)` — done-detection is entirely the runtime's job, invisible to the bot author. |

---

## 10. Match length & context

Compute ramps +1/turn to a cap of 8, so:
- **Aggro:** ~5–7 turns/side · **Average:** ~8–10 turns/side (16–20 plies) · **Grindy control mirrors:** ~12–16/side until Model Collapse.

With **stateless turns** (re-fetch full state each turn), per-turn context stays ~flat (~2–4K tokens) regardless of match length — so even grindy matches don't hit context-window rot. If real grindy matches ever misbehave, the cheapest knobs are lowering Valuation (22→20) or tightening Model Collapse; the **ply cap (§9)** is the hard backstop. *(Documented as an approach; revisit only if observed.)*

---

## 11. Tradeoffs we're accepting (honest)

Going unregulated/open is a deliberate product choice with eyes open:
- **+** Maximally unpredictable, emergent meta; minimal infra to police; cost largely shifts to players (BYO compute); the subscription gets a clean, ToS-honest home (script authoring).
- **−** Live-mode rank partly reflects model spend (intended here — model is loadout). Spectator pacing for live-vs-live needs watching ([REPORT.md §6](REPORT.md#6-is-it-actually-fun-the-real-product-question) — *is it fun to watch?* is still the make-or-break question; validate it on the heuristic bot first). Live BYOA carries player-side account risk (surfaced at opt-in).
- **The one number to get right:** the **script CPU cap** (§4). Everything about the bot-vs-LLM balance flows from it.

---

*Game rules: [GAME-DESIGN.md](GAME-DESIGN.md) · Cards: [CARDS.md](CARDS.md) · Web/agent tech: [ARCHITECTURE.md](ARCHITECTURE.md) · Report & roadmap: [REPORT.md](REPORT.md)*
