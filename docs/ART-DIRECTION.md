# AI Card Battle — Art Direction

> The visual bible. One satirical world, four AI‑giant factions, a spectator‑first board.
> Rules & theme: [GAME-DESIGN.md](GAME-DESIGN.md) · Cards: [CARDS.md](CARDS.md) · Why we're building it: [REPORT.md](REPORT.md).

---

## 0. North Star — "Corporate Mythic"

Render the AI arms race as an **epic datacenter colosseum**, built entirely from *mundane corporate materials*: server racks, keynote stages, NDAs, glass towers, badge lanyards, GPUs, slide decks. The gap between the **heroic framing** and the **cubicle materials** is the joke. The tone is dry, knowing, industry‑insider satire — a raised eyebrow, never a clown nose, never cruel.

Three rules override everything below:

1. **Readability first.** This is a game you *watch*, and the fiction is that an LLM reads the board. Silhouette and color must carry meaning before any detail does. High contrast, no noise.
2. **The mechanic is the joke.** Art reinforces satire that's already in the rules (Hype, Guardrail, Glitch, Burnout) — don't bolt on unrelated gags.
3. **Parody‑safe.** Archetypes, not likenesses. No real logos, trademarks, faces, or product names. The faction *names* are the parody; the art stays one abstraction further out.

**The 15‑second version:** dark "datacenter dark" base · bold flat‑dimensional editorial illustration · four locked faction hues (🟢🟣🔵🟠) on frames, faction‑independent colors on stats · caricatured founders & themed model‑creatures · a terminal/telemetry typographic layer that ties the satire together.

---

## 1. Style

**Bold flat‑dimensional editorial illustration.** Think modern card‑game splash art crossed with satirical corporate caricature — confident shapes, limited internal detail, dramatic rim light, a faint paper/print grain. Read at thumbnail size; reward a closer look.

| Do | Don't |
|---|---|
| Strong silhouettes; one clear focal shape per asset | Busy, equally‑weighted detail |
| Flat color fields + 2–3 step shading + one rim light | Soft photoreal gradients; airbrush realism |
| Slight caricature/exaggeration for comedy | Photorealism, anime, pixel art, AI‑slop default look |
| Subtle grain + clean vector edges | Heavy outlines on everything (only key shapes get the line) |
| Cinematic depth of field — board sharp, world soft | Flat, fully‑in‑focus clutter that competes with cards |

**Materials & light:** matte surfaces over gloss (except ClosedAI's keynote sheen); cool server‑room ambient + a single warm key light; volumetric "datacenter haze" for depth. **Finish:** every asset survives being shrunk to a 92px board token — design silhouette‑first, then detail.

---

## 2. Color system

The color system has **two independent layers** — keep them separate and this never gets muddy:

- **Faction hue** = *ownership / identity.* Lives on the card **frame**, the board‑side tint, and the ownership glow. Locked to the four chips already used across the docs and UI.
- **Functional color** = *resource / stat type.* Lives in **stat pips with icons**, faction‑independent, chosen to sit in the gaps of the faction wheel.

> **The one rule that prevents chaos:** never let a faction hue and a functional color carry meaning in the *same* UI element. Icons carry the meaning; color reinforces it. (Yes, ClosedAI green and Reliability green are close — but Reliability is always a small shielded HP pip, never a frame. That's the whole point of the split.)

### 2a. Base — "Datacenter Dark" (refines the existing prototype tokens)

| Token | Hex | Use |
|---|---|---|
| `--void` | `#0B0E14` | App background, deepest |
| `--surface` | `#141A23` | Panels, card text boxes |
| `--edge` | `#2A323D` | Borders, dividers |
| `--ink` | `#E6EDF3` | Primary text |
| `--dim` | `#8B97A6` | Secondary / telemetry text |

### 2b. Functional stat colors (faction‑independent, always with an icon)

| Stat (theme) | Color | Hex | Icon |
|---|---|---|---|
| **Performance** (Attack) | coral‑red | `#FF5C5C` | ⚔ / up‑bar |
| **Reliability** (Model HP) | leaf‑green | `#5BD68A` | 🛡 uptime |
| **Valuation** (CEO life / market cap) | gold | `#F4C04C` | $ / up‑chart |
| **Compute / GPUs** (mana) | electric cyan | `#3DD6F0` | ⚡ chip |
| **Safety Margin** (armor) | ice‑slate | `#9FB3C8` | layered shield |

### 2c. Faction hues (frame / identity / board side)

| Faction | Core | Shadow | Accent | Personality of the palette |
|---|---|---|---|---|
| 🟢 **ClosedAI** | emerald `#19C37D` | obsidian `#0D1A14` | mint glow `#7FF5C0` | Glossy, secretive, keynote‑slick. Black‑box gloss + blinding launch light. |
| 🟣 **Anthrabbit** | amethyst `#A07CFF` | ink‑indigo `#1A1430` | warm parchment `#F0E6D2` | Calm, earnest, papery. Matte vellum + soft "safety" padding. |
| 🔵 **Googlitch** | azure `#4D8DF0` | deep navy `#0C1426` | glitch split: cyan `#22E0E0` + magenta `#FF4DD2` | Vast, clean grids that *fracture*. RGB‑split only on the Glitch keyword. |
| 🟠 **ShallowSeek** | amber `#FF8A3D` | abyssal teal `#0A2A2E` | deep‑sea teal `#0E5E63` | Scrappy, swarmy, open. Cheap‑and‑fast neon + a whale in the deep. |

Tint each player's half of the board ~8–12% toward its faction core; everything else stays Datacenter Dark so cards pop.

---

## 3. World & backgrounds

**The Datacenter Colosseum.** Matches play on a stage *inside* a server hall — part keynote stage, part cooling‑lit data center, viewed in Hearthstone's gentle top‑down three‑quarter. The board is the arena floor; the two CEOs preside from opposing podiums.

- **Depth:** three planes — sharp board (front), soft server racks + volumetric haze (mid), out‑of‑focus glass‑tower skyline / status LEDs (back). Heavy depth of field so art never fights the cards.
- **Lighting:** cool ambient with a single warm key; subtle blinking‑LED bokeh; a "now broadcasting" telemetry glow around the rim (this is a spectator product — lean into the e‑sports‑broadcast feel).
- **Faction tint:** the home half shifts toward the owner's hue (§2c). Neutral center.
- **The Open Source zone** (shared board) reads as **public/no‑man's‑land**: dashed neutral edge, a faint "open" padlock‑broken motif, lit cooler than either side.
- **Mood by archetype:** keep backgrounds *quiet*. The drama is on the board. A great background is one you don't consciously notice while watching.

---

## 4. Characters

### CEOs (heroes)
Caricatured **founder archetypes** — silicon‑valley *types*, never real people. Exaggerated proportions, one signature prop, expression‑driven comedy. Each is a satirical posture, not a portrait:

- **ClosedAI** — the hype showman: hoodie‑to‑blazer pivot, headset mic, gestures at an invisible "one more thing."
- **Anthrabbit** — the earnest safety researcher: rabbit motif, clipboard "constitution," calm to a fault, a halo of caution tape.
- **Googlitch** — the overextended giant: too many tabs, a search bar for a mouth, occasionally rendered with a glitch‑smear (the hallucination tell).
- **ShallowSeek** — the scrappy open‑source upstart: hoodie + flip‑flops, a pet whale, ships fast and cheap.

### Models (minions)
Anthropomorphized **AI/robot/creature units**, themed to the faction so ownership reads from silhouette alone, before color:

- **ClosedAI** — sleek glass‑and‑chrome hype‑bots, sharp ascending shapes, glowing benchmark numbers, all edge and no armor (glass cannon).
- **Anthrabbit** — earnest rabbits, layered guardrail walls, padded foam units, halos/shields; rounded, symmetrical, defensive.
- **Googlitch** — colossal server‑pod titans and search‑crawler critters, clean material‑design forms that visibly *glitch/datamosh* when their downside triggers.
- **ShallowSeek** — schools of tiny identical token‑fish, paper/origami clones, one big whale; many small repeated shapes = "swarm."

**Design law:** silhouette → faction read → stat read → flavor, in that order. If you can't tell whose model it is in 1‑bit black on white at board size, redesign it.

---

## 5. Cards

Two scales, one language:

- **Board token** (~92px, what spectators watch): faction‑tinted chip, big stat pips (⚔ coral / 🛡 leaf), one keyword glyph, tiny portrait. Stat‑first, instantly scannable.
- **Card splash** (hand / reveal / detail): full frame with art window.

**Frame anatomy (splash):**
- **Compute gem** — top‑left, electric‑cyan ⚡, the cost.
- **Name banner** — display type, faction‑tinted.
- **Art window** — the §4 illustration; faction frame.
- **Type + rarity** — `Model / Op / Hardware / Legendary`; rarity gem (Common steel · Rare azure · Epic violet · Legendary gold) — note these are frame *trim*, distinct from faction hue.
- **Keyword ribbon** — monospace tags (see §6 type): `GUARDRAIL · SHIP IT · GLITCH …`.
- **Text box** — Datacenter‑Dark surface, ink body type.
- **Stat corners** — Performance ⚔ bottom‑left (coral), Reliability 🛡 bottom‑right (leaf). Ops/Hardware show `—`.

Keep the frame **thin and quiet** so the art and stats lead. Faction identity comes from the frame's hue + corner motif, not from heavy ornament.

### Typography
| Role | Face (recommendation) | Why |
|---|---|---|
| Display / card names | a chunky geometric grotesque — *Clash Display / Archivo / Space Grotesk* | Branded, satirical, "tech‑keynote" confidence |
| Body / UI / card text | *Inter* | Neutral, legible at small sizes |
| Stats / numbers | heavy tabular numerals (Inter Tight / a rounded numeric) | Big, unambiguous game numbers |
| **Telemetry / keywords / agent rationale** | **monospace — *JetBrains Mono / IBM Plex Mono*** | The satirical glue: keyword tags, the LLM's per‑turn reasoning, and on‑screen telemetry all read as "console output." Ties straight into the existing dev‑console UI. |

The monospace layer is doing real thematic work — it's where the "AI watching AI play" fiction lives. Use it deliberately, not decoratively.

---

## 6. Tone, motion & guardrails

**Voice:** dry, literate, insider. Funny because it's *accurate*, not because it's wacky. Punch up at the industry, never down at individuals. PG; satire over snark.

**Motion (spectator‑paced):** this is broadcast, so motion sets rhythm, not spectacle.
- Card plays: a quick **keynote‑reveal** spotlight snap.
- **Hype:** ascending number pops + a hype‑arrow ping. **Guardrail:** a wall slams in. **Glitch:** a brief RGB‑split datamosh stutter (Googlitch only). **Burnout/Model Collapse:** screen‑edge static creeping in as the clock bites.
- A persistent **telemetry ticker** (monospace, §5) streams the agent's rationale — the spectator hook. Keep transitions short and legible; never let an animation outlast a spectator's patience or hide the board state.

**Guardrails (hard rules):**
- No real company logos, wordmarks, product names, or recognizable real‑person likenesses — ever. Archetypes only.
- One illustration style across all factions; differentiate by **palette + motif + shape language**, not by switching rendering styles.
- Color obeys §2's two‑layer split. When in doubt, an icon disambiguates — add the icon, don't add a new color.
- Backgrounds stay quiet; the board always wins the contrast fight.
- Every asset is validated at **board‑token size** before it's considered done.

---

*Pairs with: [GAME-DESIGN.md](GAME-DESIGN.md) (theme & rules) · [CARDS.md](CARDS.md) (the 40 cards these assets illustrate) · the spectator UI in [`prototype/public/spectate.html`](../prototype/public/spectate.html), whose dark dev‑console palette this guideline formalizes and extends.*
