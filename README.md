# AI Card Battle

A greatly simplified **Hearthstone parody** where four AI tech giants go to war —
**ClosedAI**, **Anthrabbit**, **Googlitch**, and **ShallowSeek** — and the **most fun twist**:
humans don't play the cards. You write a one-time **strategy prompt**, pick a deck, and an
**LLM agent plays the whole match for you** while you spectate.

> Status: **design study + a complete, runnable prototype.** `docs/` holds the comprehensive
> report and design (from a multi-agent research + design pass); `prototype/` is a dependency-free,
> fully-tested vertical slice — deterministic 4-faction engine, heuristic/beam bots, a balance
> harness, the live REST API, a sandboxed script-bot runner, and a browser spectator UI.

## Read the docs

| Doc | What's in it |
|---|---|
| **[docs/REPORT.md](docs/REPORT.md)** | The comprehensive report: concept, honest viability, the subscription finding, and the **product roadmap**. Start here. |
| [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md) | Theme mapping (Valuation/Compute/Models/…), full rules, keywords, the four signature twists, and the factions. |
| [docs/CARDS.md](docs/CARDS.md) | All **40 cards** (4 decks × 10 uniques ×2), hero powers, and the balance review with concrete fixes. |
| [docs/ART-DIRECTION.md](docs/ART-DIRECTION.md) | The **art bible**: "Corporate Mythic" style, the datacenter‑colosseum world, CEO/Model character language, card‑frame anatomy, and the two‑layer color system (faction hue vs. functional stat color). |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The technical design: rules engine, the **action-by-ID** agent interface, the `AgentAdapter` seam, and the **BYOA** subscription approach. |
| **[docs/BYOA.md](docs/BYOA.md)** | The chosen direction: **one open, unregulated, ranked arena** where any model + prompt + bot competes. Two entries (live prompt / script bot), the clocks, the heuristic fallback bot, ranking, and done-detection. |
| **[prototype/README.md](prototype/README.md)** | **The runnable prototype** — engine, bots, balance harness, live API, script sandbox, spectator UI; all tested (`npm test`). Validated the turn count, the balance (~[45–57%] spread), the CPU-cap knob, and both BYOA entries end-to-end. |

## Try the prototype

No dependencies — Node ≥ 18.

```bash
node prototype/src/runner.js                 # watch a bot-vs-bot match (readable turn log)
node prototype/src/runner.js --rr --search   # 4-faction balance round-robin
node prototype/src/server.js 8787            # then open http://127.0.0.1:8787/ to SPECTATE a match
cd prototype && npm test                     # full suite: engine units + API + script + worker + UI
```

## The 30-second version

- **Theme → mechanics:** Valuation = HP (22), Compute/GPUs = mana (cap 8), Models = minions, Op = spell, Founder Move = hero power, Roadmap = deck (20 = 10×2). Near-perfect information + low randomness = good for LLM play.
- **How agents play:** the server enumerates *legal actions*; the agent only ever picks an `actionId`, so illegal moves are impossible. One backend-agnostic `AgentAdapter` seam covers API, Claude Code, Codex, or a local model.
- **The subscription answer (honest):** you **can't** power a shipped game with a Claude/ChatGPT *subscription* on a server — it's a ToS violation with real 2026 account suspensions. The only defensible route is **Bring Your Own Agent**: the player runs a local runner with their *own* token. **Recommended default: the Claude API with `claude-haiku-4-5` (~5–10¢/match).**
- **Biggest unknown:** *is it fun to watch?* — there's now a working spectator UI (with a per-turn rationale) to judge it on. Everything else is validated by the prototype: the architecture works, the game is balanceable, and both BYOA entries (live prompt + script bot) run end-to-end.
