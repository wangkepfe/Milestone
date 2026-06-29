# AI Card Battle — Game Design

> A greatly simplified Hearthstone parody. Four AI tech giants go to war:
> **ClosedAI** (OpenAI), **Anthrabbit** (Anthropic), **Googlitch** (Google/DeepMind), **ShallowSeek** (DeepSeek).
> Humans don't play the cards — they write a strategy prompt and an LLM agent plays the match. See [ARCHITECTURE.md](ARCHITECTURE.md) for that part. Full card lists are in [CARDS.md](CARDS.md).

---

## 1. Theme mapping (Hearthstone → AI tech war)

Everything is renamed so the mechanic *is* the joke, while staying learnable for anyone who has touched Hearthstone.

| Hearthstone | AI Card Battle | Meaning |
|---|---|---|
| Health (30) | **Valuation (22)** | Your company's market cap, in billions. Hits 0 → you collapse and get acqui-hired. **You lose.** |
| Mana (cap 10) | **Compute / GPUs (cap 8)** | Per-turn resource. Spend GPUs to deploy Models and cast Ops. **Does not carry over.** |
| Minion | **Model** | A deployed AI model sitting in your data center. Persists until destroyed. |
| Attack | **Performance** | How much Valuation/Models it can damage. |
| Health (minion) | **Reliability** | Uptime it can absorb before being decommissioned. |
| Attacking | **Benchmark** | Running a Benchmark: deal Attack to a target, take its Attack back if it's a Model. |
| Spell | **Op** | A one-shot operation (research drop, release, ops play). |
| Weapon | **Launch** | Equippable; gives the CEO a "CEO Benchmark" attack with a charge count. |
| Hero | **CEO** | Your avatar, 22 Valuation. |
| Hero Power | **Founder Move** | Costs 2 Compute, once per turn, company-specific. |
| Deck | **Roadmap** | Your 20-card library. |
| Fatigue | **Burnout / Model Collapse** | Drawing from an empty Roadmap deals escalating self-damage (1, 2, 3, …). |
| The Coin | **Open Weights token** | Compensation for going second. |

Why smaller numbers (22 / 8 / 6 / 20 vs 30 / 10 / 7 / 30)? **Short, legible matches** — both for human spectators and because an LLM agent reasons better over a small, bounded state space.

---

## 2. Core rules

### Win condition
Reduce the opponent's **Valuation** from 22 to 0 or below. Simultaneous double-kill = a draw ("mutual shutdown"). There are deliberately **no alternate mill/combo win conditions** — one legible victory path keeps agent evaluation simple.

### Resources
- **Compute** starts at 1 max on turn 1; permanent max Compute increases **+1 at the start of each of your turns** up to a **cap of 8**. You refill to max each turn. Unspent Compute is **lost** (no rollover, no overload).
- **Valuation**: start 22, max 22. Healing above 22 is wasted unless a card says it converts to armor (Anthrabbit's *Safety Margin*).

### Deck & cards (the Roadmap)
- **Exactly 20 cards = 10 unique cards × 2 copies** (a strict "singleton-×2" format). This bounds deckbuilding complexity hard — great for balance and for agents.
- Opening hand: **3 cards** (4 for the player going second). **One mulligan** (shuffle back any subset, redraw equal, deterministic from a public seed).
- **Draw 1** at the start of each turn.
- Hand cap **8** (excess drawn cards are "deprecated"/discarded).
- **Burnout / Model Collapse**: once your Roadmap is empty, every required draw deals escalating damage (1, 2, 3, …) and (per the *Model Collapse* twist) cannot be healed away. This is the hard clock that guarantees games end.

### Turn structure (fully sequential, fully observable)
1. **Start** — +1 max Compute (cap 8), refill, trigger start-of-turn effects, expire one-turn buffs.
2. **Draw** — draw 1 (or take Burnout).
3. **Main** — play Models/Ops, use Founder Move, in any order.
4. **Combat** — declare Benchmarks **one at a time**; each Model/CEO attacks once (twice with *Parallelize*); each attack resolves fully before the next.
5. **End** — trigger end-of-turn effects, pass.

Main and Combat may be **interleaved** (play → attack → play again). Crucially: **there are no instants, secrets, or response windows.** The defending player never acts on your turn. This is the single most important simplification — state is fully deterministic between turns and trivial to serialize for an LLM.

### Board
- **Max 6 Models per side** (your "data center").
- At most **1 equipped Launch** per side; exactly **1 CEO**.
- **Summoning sickness**: a Model can't attack the turn it's deployed unless it has *Ship It* (attack Models only) or *Launch Day* (attack anything).

### First-player compensation
A coin flip (seeded RNG both agents can read) decides who's first. The player going **second** gets **Open Weights**: one extra opening card **plus** a one-use *Open Weights* token (play for 0 Compute → +1 temporary Compute this turn — the parody of The Coin). This is the only first-turn randomness.

### Vanilla stat baseline (for balancing cards)
`total stats ≈ 2 × Compute cost + 1` for cost 1–6 (split near-evenly, slightly favoring Health on defensive cards); flatten to `2 × cost` for 7–8.

| Cost | Vanilla statline (Atk/Health) | Total |
|---|---|---|
| 1 | 1/2 or 2/1 | 3 |
| 2 | 2/3 or 3/2 | 5 |
| 3 | 3/4 or 4/3 | 7 |
| 4 | 4/5 or 5/4 | 9 |
| 5 | 5/6 or 6/5 | 11 |
| 6 | 6/7 or 7/6 | 13 |
| 7 | 7/7 | 14 |
| 8 | 8/8 | 16 |

Each strong keyword "costs" ~1–2 total stat points (or +1 Compute). Ops are priced so direct damage ≈ `cost + 1` to the enemy CEO, or "destroy a Model with Health ≤ ~2× cost."

---

## 3. Keywords (the tight 10-keyword set)

Re-themed from Hearthstone but mechanically familiar.

| Keyword | Re-theme of | Effect |
|---|---|---|
| **Guardrail** | Taunt | Enemy Benchmarks must target a Guardrail Model before anything else. |
| **Ship It** | Rush | Can attack enemy **Models** the turn it deploys (not the CEO). |
| **Launch Day** | Charge | Can attack **anything**, including the enemy CEO, the turn it deploys. (Rare premium.) |
| **Failover** | Divine Shield | The first time it would take damage, prevent it all; then Failover is consumed. (Doesn't block destroy/transform.) |
| **On Deploy** | Battlecry | One-time effect when played from hand (not when summoned by an effect). |
| **On Sunset** | Deathrattle | One-time effect when the Model is destroyed and leaves the board. |
| **Monetize** | Lifesteal | Damage dealt by this source restores that much Valuation to you. |
| **Overclock** | Spell Damage | While on board, your Ops deal +1 damage (stacks). |
| **Stealth Mode** | Stealth | Can't be targeted by enemy attacks/effects until it deals damage. (Still hit by "all-Model" effects.) |
| **Parallelize** | Windfury | Can run two Benchmarks (attack twice) per turn. |

### Faction-signature keywords (one new per faction, max)
- **Hype N** (ClosedAI): a permanent **+N/+0** Attack buff on a Model; stacks additively; Attack-only (never Health) to keep ClosedAI a glass cannon. Ops that grant Hype are tagged **Announce**.
- **Safety Margin** (Anthrabbit): a tracked **armor** value that absorbs CEO damage before Valuation, persists between turns, no cap. Heal-overflow above 22 converts to Safety Margin. *(Balance note: the review recommends capping this — see §6.)*
- **Glitch** (Googlitch): at the start of your turn, read the public **Glitch coin**; on a Glitch, the Model suffers a downside (self-damage / permanent stat loss). Uses the already-public seeded RNG.
- **ShallowSeek**: no new keyword — runs entirely on the core 10 + twists.

---

## 4. Signature twists (what makes it its own game — and good for LLM agents)

These were chosen specifically so the game is **near-perfect-information, low-randomness, and easy to serialize** — the conditions under which LLM agents play well.

1. **Telemetry (open information).** Both players' **hands are face-up** and your own **deck order is known**. Almost no hidden information → a contest of pure reasoning. Trivial to put in a prompt; no need to model hidden states.
2. **Open Source (shared zone).** Certain effects place a Model into a shared **Open Source zone** owned by *neither* player; on each player's turn, **they** may attack with it. Whoever exploits the public model best wins tempo. (Parody of open-weight releases.)
3. **Scaling Laws (deterministic ramp).** A public, monotonically increasing counter tracks total Compute spent this game. Ops tagged *Scaling Laws* get stronger as it grows — power scales **predictably with a readable integer**, rewarding planning over luck.
4. **Model Collapse (anti-mill clock).** Once you've drawn your whole Roadmap, future draws are "synthetic data" dealing escalating, **un-healable** Burnout. A hard, legible clock that bounds match length.

---

## 5. The four factions

Classic Hearthstone archetypes, re-skinned. Each is one 10-card (×2) deck. Full cards in [CARDS.md](CARDS.md).

| Faction | Parody of | Archetype | Identity | Founder Move (hero power, 2 Compute) |
|---|---|---|---|---|
| **ClosedAI** | OpenAI | **Aggro / Hype tempo** | Cheap, all-Attack Models; stack **Hype**; burn the enemy CEO; close before opponents scale. Glass cannon — no draw, no heal. | Deal 1 to any target; if it kills a Model or hits the CEO, give a friendly Model +1 Attack (Hype 1). |
| **Anthrabbit** | Anthropic | **Control / Safety** | Guardrail walls + heal + **Safety Margin** armor + "Constitutional" punishment; out-survive and grind to an inevitable late game. Slow, almost no burst. | **Realign:** restore 2 Valuation; if already full, gain 2 Safety Margin instead. |
| **Googlitch** | Google/DeepMind | **Ramp / big-compute value** | Ramp Compute (TPU pods), draw via Search/Index, slam frontier Titan/Gemini bodies and board wipes. Downside: **Glitch** self-sabotage. Clunky early. | **Index & Scry:** look at top 2 of your Roadmap, draw one, bottom the other. |
| **ShallowSeek** | DeepSeek | **Swarm / efficiency combo** | Cheap Models, free Token swarms, cost reduction (**Quantize**), play-many-cards payoffs, a wide-board burst finisher. Low Health — folds to board wipes. | **Spin Up:** gain +1 temporary Compute this turn. |

---

## 6. Honest balance status (from the adversarial review)

The 40 cards were reviewed by a dedicated balance critic. Headline: **the framework is sound but the power level is uneven, and a structural quirk pushes the meta toward Guardrail-ignoring face burst.** Because there's no defender response window + open hands (Telemetry), a deck that assembles lethal wins even though the opponent *sees it coming*. That structurally rewards burst (ClosedAI, ShallowSeek combo) and un-raceable walls (Anthrabbit).

**Tier read:** ClosedAI **S (over-tuned)** · Anthrabbit **A (inevitability risk)** · Googlitch **B+** · ShallowSeek **B**.

Must-fix before "shippable" (details + exact numbers in [CARDS.md §Balance](CARDS.md#balance--required-fixes)):

- **ClosedAI — Total Addressable Market**: unconditional, unpreventable, Guardrail-ignoring burst = total board Attack to face. Cap it (e.g. max 8) and/or raise cost to 7. Single most format-warping card.
- **ClosedAI — Hype-4 Omni**: a 2-cost effective 4/2 + 1 face. Remove either the self-Hype or the ping, not both.
- **Anthrabbit — Safety Margin + Claudius**: uncapped armor that Claudius converts to a 9–15 heal → near-unkillable inevitability. Cap Safety Margin (e.g. 10) and cap Claudius's heal.
- **Three cards have unfinished/ambiguous text** (ShallowSeek *Distil-Bot V3* and *Sparse Activation* contain literal placeholder fragments; Anthrabbit's "if full, gain armor instead" needs one unified overflow rule). Corrected wordings are in [CARDS.md](CARDS.md).
- **Googlitch — Gemini Ascendant**: 8/8 that wipes the board *and* refills Compute = single-card blowout. Drop the refill or reduce the wipe.

These are tuning problems, not design problems — the bones are good.

---

*Next: [CARDS.md](CARDS.md) for all 40 cards · [ARCHITECTURE.md](ARCHITECTURE.md) for how agents play it · [REPORT.md](REPORT.md) for the full report, viability, and roadmap.*
