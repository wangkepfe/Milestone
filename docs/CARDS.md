# AI Card Battle — Card Reference (40 cards)

Four decks, **10 unique cards each, 2 copies → 20-card Roadmap per deck**. Rules & keywords: [GAME-DESIGN.md](GAME-DESIGN.md).

Notation: `Cost` = Compute. `Atk/HP` = Performance/Reliability (`—` for Ops/Hardware with no body). Keywords are defined in [GAME-DESIGN.md §3](GAME-DESIGN.md#3-keywords-the-tight-10-keyword-set).

> A few cards were edited for clarity from the raw design pass (the balance review flagged unfinished placeholder text). Edits are marked **[fixed]** and the original issue is listed in [§Balance](#balance--required-fixes).

---

## 🟢 ClosedAI — Aggro / Hype Tempo

**Founder Move — "Hype Ping"** (2 Compute): Deal 1 damage to any target (Model or enemy CEO). If it kills a Model or hits the enemy CEO, give a friendly Model **Hype 1** (+1 Attack). *(Renamed from "Ship It" to avoid colliding with the keyword.)*

| Cost | Card | Type | Atk/HP | Keywords | Rarity | Text |
|---|---|---|---|---|---|---|
| 1 | **Demo-Day Intern** | Model | 2/1 | Ship It | Common | On Deploy: give this +Hype 1 if you control another Model. |
| 1 | **Vaporware Teaser** | Op (Announce) | — | Hype | Common | Give a friendly Model **Hype 2**. If you've spent 6+ total Compute this game (Scaling Laws), **Hype 3** instead. |
| 2 | **Hype-4 Omni** | Model | 3/2 | On Deploy | Common | On Deploy: deal 1 to the enemy CEO, then give this **Hype 1**. *(see balance)* |
| 2 | **Closed Beta Brigade** | Model | 2/2 | Ship It, Stealth Mode | Rare | When it deals combat damage to the enemy CEO, deal 1 more to the enemy CEO. |
| 3 | **Move Fast, Break Prod** | Op | — | — | Rare | Deal 3 damage split as you choose among any targets. For each point dealt to an enemy CEO, give a friendly Model **Hype 1**. |
| 3 | **Series-F Frenzy** | Model | 3/3 | On Deploy | Rare | On Deploy: give ALL other friendly Models **Hype 1**. |
| 4 | **Surprise Keynote** | Model | 4/3 | Launch Day | Epic | — ("One more thing: your Valuation.") |
| 3 | **Pivot to Hardware** | Hardware (Launch) | 3 Atk / 2 charges | — | Epic | Equip your CEO with a 3-Attack Launch (2 charges). On Deploy: give a friendly Model **Hype 1**. |
| 5 | **Founder Mode Sam** | Legendary Model | 4/4 | On Deploy, Launch Day | Legendary | On Deploy: X = your Announce casts this game. Give every friendly Model **Hype X** and deal X to the enemy CEO. *(see balance: cap X at 3)* |
| 6 | **Total Addressable Market** | Op | — | — | Legendary | Deal damage to the enemy CEO equal to the total Attack of all your Models. Cannot be prevented/healed. *(see balance: cap at 8 / cost 7)* |

**New keyword:** *Hype N* = permanent +N/+0 (Attack only), stacks. *Announce* tags any Op that grants Hype (matters for Founder Mode Sam).

**Engine:** go wide-and-low (all-Attack bodies) → stack Hype → convert a small board into a big hit. **Win cons:** *Founder Mode Sam* (scales with Announce count) and *Total Addressable Market* (board-Attack burst that ignores Guardrail). **Weakness:** no draw, no heal, all low Health → one big wall or a heal swing undoes a turn of Hype.

**Sample line:** T2 Hype-4 Omni (ping → CEO 21, self-Hype to 4/2). T3 Series-F Frenzy buffs the team. T4 Vaporware Teaser or Surprise Keynote to face. T5 Founder Mode Sam. Closer: when they wall up, **TAM** for board-Attack straight to the CEO, ignoring the Guardrail.

---

## 🟣 Anthrabbit — Control / Safety

**Founder Move — "Realign"** (2 Compute): Restore 2 Valuation. If already at 22, gain **2 Safety Margin** instead.

| Cost | Card | Type | Atk/HP | Keywords | Rarity | Text |
|---|---|---|---|---|---|---|
| 1 | **Paperclip Auditor** | Model | 1/3 | Guardrail | Common | A clean wall to blunt turns 1–2. |
| 2 | **Red-Team Rabbit** | Model | 2/2 | On Deploy | Common | On Deploy: gain **2 Safety Margin**. |
| 2 | **Constitutional Clause** | Op | — | — | Common | Deal 3 to a Model. If its Attack ≥ 4, also gain **3 Safety Margin**. |
| 3 | **Alignment Researcher** | Model | 2/4 | Guardrail, On Deploy | Rare | On Deploy: restore 3 Valuation (overflow → Safety Margin). |
| 3 | **Sandbox Containment** | Op | — | — | Rare | An enemy Model can't attack/use abilities until your next turn; its Guardrail is suppressed. Draw a card. |
| 4 | **Failover Cluster** | Model | 3/4 | Guardrail, Failover | Rare | A resilient mid-game wall. |
| 4 | **Rapid Rollback** | Op | — | — | Rare | Restore 6 Valuation (overflow → Safety Margin). If you control a Guardrail Model, gain 2 Safety Margin. |
| 5 | **Interpretability Lattice** | Hardware | — | — | Epic | Ongoing. Start of your turn: restore 2 Valuation (overflow → SM) and your first Op costs 1 less. *(see balance: give it a body/charges)* |
| 6 | **The Long-Horizon Plan** | Op | — | Scaling Laws | Epic | Deal `2 + 1 per 10 total Compute spent` to ALL enemy Models, and gain that much Safety Margin. |
| 8 | **Claudius the Considerate** | Legendary Model | 6/8 | Guardrail, Monetize, On Deploy | Legendary | On Deploy: restore Valuation equal to your current Safety Margin (don't spend it). While in play, Realign costs 1 less. *(see balance: cap heal at 8)* |

**New resource:** *Safety Margin* = armor (absorbs CEO damage before Valuation, persists, currently no cap). Heal-overflow above 22 converts into it.

**Engine:** Guardrail density + heal + armor; *Constitutional Clause* punishes big reckless Models; *Sandbox Containment* neutralizes a threat and refills. **Win con:** out-survive, then *Claudius* converts banked armor into a huge heal-back and recurring Monetize swings. **Weakness:** genuinely slow, almost no burst — a fast deck can race a stumbling Anthrabbit.

**Sample line:** T1 Paperclip Auditor wall. T2 Red-Team Rabbit (+2 SM). T3 Alignment Researcher (wall + heal). T4 Failover Cluster + Constitutional Clause their threat. T5 Interpretability Lattice (per-turn heal + Op discount). T6–7 The Long-Horizon Plan sweep. T8 Claudius → big heal-back + fortress.

---

## 🔵 Googlitch — Ramp / Big-Compute Value

**Founder Move — "Index & Scry"** (2 Compute): Look at the top 2 of your Roadmap; draw one, bottom the other.

| Cost | Card | Type | Atk/HP | Keywords | Rarity | Text |
|---|---|---|---|---|---|---|
| 1 | **Pod Provisioner** | Model | 0/3 | Guardrail | Common | On Sunset: gain +1 max Compute next turn. |
| 1 | **Spin Up a TPU Pod** | Op | — | — | Common | Gain +1 max Compute this game (up to cap 8) and refill 1 Compute now. |
| 2 | **Index Crawler** | Model | 1/4 | Guardrail, On Deploy | Common | On Deploy: Index & Scry (top 2, draw one, bottom one). |
| 3 | **Search & Index** | Op | — | — | Common | Draw 2. If you have 6+ max Compute, draw 3 instead. |
| 3 | **Glitch in the Stack** | Op | — | Scaling Laws | Rare | Deal `2 + 1 per 12 total Compute spent` to a Model. |
| 4 | **Bardo the Hallucinator** | Model | 3/5 | Overclock, Glitch | Rare | Glitch: on a Glitch flip, deal 1 to a random friendly Model. |
| 4 | **TPU Megapod** | Hardware (Launch) | — / 3 charges | — | Epic | On equip: +2 max Compute (cap 8). Start of your turn: Index & Scry. (Decommissions after 3 turns.) |
| 5 | **Sunset Protocol** | Op | — | — | Epic | Deal 3 to ALL Models (yours too). Draw a card for each **enemy** Model destroyed. |
| 5 | **Gemma Twins, the Open Release** | Model | 4/4 | On Deploy | Epic | On Deploy: summon a 4/4 copy (no keywords) into the shared **Open Source** zone. |
| 8 | **Gemini Ascendant, Frontier Titan** | Legendary Model | 8/8 | Guardrail, On Deploy, Glitch | Legendary | On Deploy: deal 3 to all enemy Models, then refill Compute to full. Glitch: lose 1 Attack permanently on a Glitch flip. *(see balance)* |

**New keyword:** *Glitch* = start of your turn, read the **public Glitch coin** (same seeded RNG as the opening flip); on a Glitch, suffer the listed downside. Cards with Glitch are over-statted on the upside to pay for it.

**Engine:** ramp Compute ahead of curve (Spin Up, TPU Megapod, Pod Provisioner) → cast Gemini Ascendant early; draw chains keep gas flowing; *Glitch in the Stack* scales because you spend the most Compute; *Sunset Protocol* stabilizes vs aggro and refuels. **Weakness:** the window before ramp + sweepers come online — a fast deck that ignores your low-Attack walls and races you.

**Sample line:** T1 Spin Up / Pod Provisioner. T2 Index Crawler. T3 Search & Index or Glitch in the Stack. T4 TPU Megapod (→ near cap). T5 Sunset Protocol. T6 Gemini Ascendant (wipe + refill → immediately redeploy).

---

## 🟠 ShallowSeek — Swarm / Efficiency Combo

**Founder Move — "Spin Up"** (2 Compute): Gain +1 temporary Compute this turn.

| Cost | Card | Type | Atk/HP | Keywords | Rarity | Text |
|---|---|---|---|---|---|---|
| 1 | **Distil-Bot V3** **[fixed]** | Model | 2/1 | Ship It | Common | On Deploy: the next Model you play this turn costs 1 less (min 0). |
| 1 | **Token Faucet** | Op | — | — | Common | Summon two 1/1 Tokens with Ship It. If you've already played a card this turn, summon a third. |
| 1 | **Quantize** | Op | — | — | Rare | Reduce the cost of all cards in your hand by 1 this turn (min 0). |
| 2 | **Open-Weights Intern** | Model | 2/2 | On Deploy | Common | On Deploy: if this is your 3rd+ card played this turn, draw a card. |
| 2 | **Fork the Repo** | Op | — | — | Rare | Summon an exact copy of a friendly Model with cost ≤ 2 (current stats/keywords, no On Deploy). |
| 3 | **Mixture-of-Interns** | Model | 2/4 | Guardrail, On Deploy | Rare | On Deploy: gain +1/+1 per other friendly Model (max +3/+3). |
| 3 | **Sparse Activation** **[fixed]** | Op | — | — | Rare | Give all friendly Models +1 Attack this turn and **Ship It** (does not let already-attacked Models attack again). |
| 4 | **Whale-Class Cluster** | Hardware (Launch) | 2 Atk / 3 charges | — | Epic | Whenever you play a Model, this Launch gains +1 charge (max 5). |
| 5 | **Inference Cascade** | Op | — | Scaling Laws | Epic | Deal to the enemy CEO = (your Model count) + (1 per 12 total Compute spent). *(see balance: cap at 8)* |
| 6 | **The Whale, Open-Sourced** | Legendary Model | 4/5 | On Deploy, On Sunset | Legendary | On Deploy: reduce your hand's costs by 1 this turn and summon a 1/1 Ship-It Token per card in hand (board space permitting; **cap 3** recommended). On Sunset: place a 4/5 copy (no On Deploy) into the shared Open Source zone. |

**No new keyword** — runs on the core 10 + twists. "Cards played this turn" is a public integer (consistent with open information).

**Engine:** *Quantize* / *The Whale* apply a hand-wide −1 cost, chaining cheap cards to hit "Nth card this turn" thresholds and refunding Compute into more plays. Going wide feeds three payoffs at once: *Mixture-of-Interns* (scales off Models), *Inference Cascade* (damage = Model count), *Fork the Repo* (copy a buffed cheap Model). **Weakness:** all low Health → a single board wipe undoes the swarm; it must race to assemble lethal first.

**Sample line:** T1 Token Faucet (2 Tokens). T3 Quantize → Distil-Bot (free) → Open-Weights Intern (free, draws). T5 Inference Cascade off a wide board. T7–8 The Whale flood → Fork → Cascade for lethal.

---

## Balance & required fixes

From the dedicated balance review. **Tiers:** ClosedAI **S (over-tuned)**, Anthrabbit **A (inevitability)**, Googlitch **B+**, ShallowSeek **B**. The structural issue: no defender response window + open hands means the meta over-rewards **Guardrail-ignoring face burst** (TAM, Inference Cascade) — three of four decks ultimately win by *ignoring the board*, which compresses archetype distinctness. Watch this.

### Overpowered — nerf
| Card | Problem | Fix |
|---|---|---|
| **Total Addressable Market** (ClosedAI) | Unconditional, unpreventable, Guardrail-ignoring board-Attack burst (routinely 12–17 from hand). Invalidates the control archetype. | Cap damage at **8** and/or raise cost to **7**; replace the meaningless "cannot be Monetized" clause with "cannot be prevented" if that's the intent. |
| **Hype-4 Omni** (ClosedAI) | 2-cost effective 4/2 **+ 1 face**. The curve's over-rate engine. | Remove **either** the self-Hype **or** the ping — not both. |
| **Founder Mode Sam** (ClosedAI) | Launch Day + team Hype X + X face, where X=3–4 is trivial. | Cap **X at 3**, or drop the immediate face damage. |
| **Claudius the Considerate** (Anthrabbit) | Converts uncapped Safety Margin into a 9–15 heal + discounts Realign → near-unkillable. | Cap the On-Deploy heal at **8**; consider 5/7 body so it can be answered. |
| **Interpretability Lattice** (Anthrabbit) | No body, no counterplay, permanent value+armor engine. | Give it a destructible body or a **charge count** (like the other Hardware). |
| **Gemini Ascendant** (Googlitch) | 8/8 that wipes the board **and** refills Compute = single-card blowout. | Drop the Compute refill (or make it "refill 3"), or reduce the wipe to 2. |

### Underpowered — buff
- **Closed Beta Brigade** (ClosedAI): bump to **3/2**. **Demo-Day Intern**: make the self-Hype unconditional (always 3/1) for a real turn-1 body, or add a second reliable 1-drop.
- **Constitutional Clause** (Anthrabbit): drop the "Attack ≥ 4" condition — it's a weak answer to the go-wide decks Anthrabbit most needs to beat. Or add a small AoE elsewhere.
- **Pod Provisioner** (Googlitch): let it ramp on Deploy *or* Sunset, or make it 0/4.
- **Open-Weights Intern** (ShallowSeek): conditional draw is inconsistent early; acceptable but monitor.

### Ambiguous / unimplementable — must rewrite
- **Distil-Bot V3** (ShallowSeek): raw text contained a literal placeholder (`"Add a 0/0... no."`). **Fixed above** to: *"On Deploy: the next Model you play this turn costs 1 less (min 0)."*
- **Sparse Activation** (ShallowSeek): raw text contained a self-correcting fragment. **Fixed above** to: *"Give all friendly Models +1 Attack this turn and Ship It; this does not let already-attacked Models attack again."*
- **Anthrabbit "if full, gain armor instead"** (Realign, Alignment Researcher, Rapid Rollback): adopt **one unified core rule** — *"Healing above 22 Valuation always converts the excess to Safety Margin"* — and apply it everywhere.
- **Glitch coin** (Googlitch): specify exactly which seed index each Glitch Model reads and the resolution order; consider making Glitch deterministic ("every 2nd turn") to honor the low-randomness promise.
- **Open Source zone vs the 6-board cap**: define the zone's capacity independent of the per-side limit, and that a failed summon is simply skipped.
- **Total Addressable Market "cannot be Monetized away"**: no such enemy trigger exists — restate as "cannot be prevented/healed."

### Matchup notes
- **ClosedAI vs Anthrabbit** is the defining, high-variance axis: if ClosedAI draws TAM/Sam, it bypasses the whole control plan; if it doesn't, Anthrabbit's uncapped armor is unkillable. Smooth this with the caps above.
- **Anthrabbit vs Googlitch** is the grindiest — risks a non-game decided by Burnout/Model Collapse. Watch match length.
- **ShallowSeek** is the deck most able to punch through Anthrabbit (Inference Cascade hits face), but folds to a single Sunset Protocol / Long-Horizon Plan if it over-commits.

---

*Rules: [GAME-DESIGN.md](GAME-DESIGN.md) · How agents play: [ARCHITECTURE.md](ARCHITECTURE.md) · Full report & roadmap: [REPORT.md](REPORT.md)*
