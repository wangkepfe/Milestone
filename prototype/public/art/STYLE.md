# Art Build — Concrete SVG Conventions

> Implements [docs/ART-DIRECTION.md](../../../docs/ART-DIRECTION.md) ("Corporate Mythic").
> Every asset here obeys these conventions so all 40 cards + heroes read as **one** style.
> Medium is **hand-authored SVG** — the bible calls for "clean vector edges, flat color
> fields + 2–3 step shading + one rim light." SVG is the canonical fit and wires into the UI.

## Canvas
- Card art window: `viewBox="0 0 400 300"` (4:3). Heroes: `0 0 360 460` (portrait).
- Background scene: `0 0 1600 900`.
- No external assets, no raster — fully self-contained vectors.

## Layer order (back → front) — the same recipe every time
1. **Base** — faction *shadow* fill (Datacenter Dark tinted to the owner).
2. **Haze** — 2–3 big blurred blobs in faction core/accent, opacity .12–.22 (volumetric datacenter haze).
3. **Mid** — out-of-focus server-rack silhouettes + glass-tower skyline, blurred.
4. **Bokeh** — blinking status-LED dots, small, faction + functional colors.
5. **Subject** — ONE clear focal silhouette. Flat fields → 2–3 darker steps → ONE warm rim light.
6. **Motif/glyph** — the faction motif + keyword tell (Hype arrow, Guardrail wall, Glitch RGB-split, swarm).
7. **Grain** — `feTurbulence` overlay, opacity ~.05.
8. **Vignette** — radial darken at edges so the subject pops.

## Light
- Single warm **key** from upper-left: `#FFF6E0`. Cool server ambient fill everywhere else.
- Rim light traces the key-facing silhouette edge (1–2px bright stroke or thin highlight shape).

## Palettes (locked — from §2 of the bible)
**Base:** void `#0B0E14` · surface `#141A23` · edge `#2A323D` · ink `#E6EDF3` · dim `#8B97A6`
**Functional stat (always with an icon):** Performance `#FF5C5C` · Reliability `#5BD68A` · Valuation `#F4C04C` · Compute `#3DD6F0` · Safety `#9FB3C8`
**Factions (core / shadow / accent):**
- 🟢 ClosedAI — `#19C37D` / `#0D1A14` / mint `#7FF5C0` — glossy, keynote-slick, glass cannons.
- 🟣 Anthrabbit — `#A07CFF` / `#1A1430` / parchment `#F0E6D2` — matte, padded, rounded, defensive.
- 🔵 Googlitch — `#4D8DF0` / `#0C1426` / glitch cyan `#22E0E0` + magenta `#FF4DD2` — clean grids that fracture.
- 🟠 ShallowSeek — `#FF8A3D` / `#0A2A2E` / deep teal `#0E5E63` — scrappy neon, swarms, a whale in the deep.

## Shape language by faction (silhouette must read ownership at 1-bit)
- ClosedAI: sharp ascending triangles/chevrons, glass+chrome, benchmark bars, blinding launch light.
- Anthrabbit: rounded, symmetrical, layered guardrail walls, halos/shields, rabbit ears, caution tape.
- Googlitch: colossal modular server-pods, clean material-design forms, RGB-split datamosh on Glitch.
- ShallowSeek: many small repeated token-fish/origami clones; one big whale; "swarm" density.

## Reusable `<defs>` baked into every file
- `grain` filter (turbulence + desaturate), `soft` blur filter (haze), `key` rim gradient.
- IDs are namespaced per file (`g-<id>`) so multiple inlined SVGs never collide.

## Done = validated at board-token size
Every card art must still read whose-it-is and what-it-is when shrunk to ~92px. Silhouette first.
