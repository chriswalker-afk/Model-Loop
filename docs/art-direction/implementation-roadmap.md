# Visual overhaul delivery plan — Passes 7B to 7E

This is the implementation sequence following the **Pass 7A Art Direction Reset**. The goal is to make the game look like the original 1908 chalkboard miniature-town concept while **keeping the fully working gameplay intact**.

[Art direction](./PASS_7A_ART_DIRECTION.md) · [Source-backed audit](./asset-audit.md) · [Palette/tokens](./vintage-tokens.json) · [Styleboard](./vintage-styleboard.svg)

## Rules for every visual PR

1. Use the exact known gameplay source for prices, stats, events and model names. **Do not copy sample values from concept art** into game logic (the concept lamp cost and current live lamp cost, for example, are not the same).
2. Preserve road geometry, left-hand driving, overtaking, hit testing, purchases, activity locations, collision/repair logic, keyboard/touch interactions and performance.
3. **Do not accept a “temporarily good enough” illustration**. Before approving, show actual rendered screenshots at desktop and mobile size—not only a zoomed drawing.
4. Compare with the styleboard *and* original reference: shapes, fineness of line, restraint of colour, era authenticity, physical box depth.
5. Run npm run check and npx playwright test. At visual gates also add screenshot review for desktop, compact laptop, phone portrait, phone landscape and reduced-motion.
6. Prefer small, explicit assets and shared renderers to repeatedly patching the 2,556-line src/style.css.
7. One source of truth for every object silhouette; if an object appears on the shelf and board it must be recognizably the same model.

## 7B — Engraved HUD and Inspector

**One PR. Initial priority: highest visible quality improvement with lowest mechanical risk.**

### Implementation checklist

- [ ] Introduce shared Vintage palette, type-scale, line weights and ornamental SVG helpers (replace old ad hoc constants gradually).
- [ ] Consolidate the conflicting rules for .topbar, .era-mark, .meters, .meter, .meter-rail, .utility-button and .tile-panel into a dedicated coherent presentation layer.
- [ ] Make the era title a properly engraved cartouche with precise corners, fine double outlines and a small period motif.
- [ ] Put the four registers into one coherent instrument-board frame; preserve progress/community/safety/income calculations and responsive wrapping.
- [ ] Replace Unicode-only stat symbols with a matching family of thin engraved icons, while keeping text labels.
- [ ] Make Selected Tile feel like a miniature catalogue label: elegant bracketed frame, understated internal separators, crisp numbers, restrained icons.
- [ ] Give the year/coin controls their own coherent typography and border treatment rather than competing with the scene.
- [ ] Preserve screen-reader labels, aria-live notices, keyboard focus and real 44px phone tap targets where controls are used.
- [ ] Capture 1440×900, 1366×768, 390×844 and 844×390 screenshots with the inspector open and closed.

### Hard acceptance gate

The header and inspector unmistakably share a **period engraved drawing language**, with fine structural strokes, no cheap chunky border system or flat modern dashboard cards. The game world remains the focal point; HUD state is immediately readable; the full existing test suite passes.

### Files likely touched

- index.html, src/main.ts (markup/icon rendering only)
- src/style.css or extracted vintage UI CSS modules
- src/art/vintage/palette.ts and ornaments helper (new)

**Not part of 7B:** Rebuilding model cartons, vehicles or buildings.

## 7C — Physical model-kit cartons and canonical miniature art

**One PR. First make a single hero carton unmistakably believable, then generalize.**

### Hero gate — Gas Lamppost

- [ ] Build a real-looking carton with punch-hole hanging tab, scored top fold, visible dimensional right side and inset print frame.
- [ ] Window with die-cut edges, clear reflection, dark internal cavity and a model physically standing on a plinth.
- [ ] High-detail gas lantern: ornate iron, open glass, finial, thin mullions and one restrained warm glow.
- [ ] Printed label, serial, price and all three environmental effects on the box face, with real text sizes at 140–170px widths.
- [ ] Check at 1440×900 and 390×844. The box must look physical **with labels hidden**, and the purchasing information must be clear with labels shown.
- [ ] Only after hero approval, apply the same carton construction to the other five miniatures.

### Generalization

- [ ] Render six unique models without repeating placeholder geometry; share decorative engravings, carton proportions and printed typography.
- [ ] Create one canonical vector description or image asset per model and reuse it in the shelf, placement ghost and installed world rendering.
- [ ] Style selection as a small physical lift, not a neon glow. Preserve selected/dragging/unaffordable and reduced-motion states.
- [ ] At mobile width, keep a legible horizontal shelf; never flatten the side panel or make item prices tiny.
- [ ] Keep real game costs/effects/upkeep and model IDs; no economy changes.

### Hard acceptance gate

**Without any text** a screenshot must still show six actual boxed miniature products. The viewer can see front, top and right faces, window cut-out and miniatures *inside*. The shop models and placed models have matching silhouettes.

### Files likely touched

- src/main.ts renderShop(), src/ui/modelArt.ts
- src/style.css or extracted vintage shop CSS
- src/game/TownScene.ts placed-model rendering / ghost
- new shared model artwork and carton rendering helpers

**Not part of 7C:** Redesigning traffic or replacing all six household houses.

## 7D — Edwardian motorcars, homes and town scenery

**One PR or two independently reviewable PRs (vehicles first, architecture second).**

### 7D.1 — Cars

- [ ] Shared pre-1910 car drawing grammar (upright cab, brass lamps, visible radiator, exposed spoked wheels, coachwork, fenders).
- [ ] At least two or three silhouette variants mapped consistently to six residents without relying on saturated tint.
- [ ] Validate size, rotation and road placement during left-lane following, overtaking, corner slowing, off-road picnics, driveway return, stop/braking and accidents.
- [ ] The driver hitboxes, speed, passing planner and traffic reservation geometry remain the same.

### 7D.2 — Buildings and scenery

- [ ] Six distinct house façades with 1908 cues (brick, sash/bay windows, pitched roofs, chimneys, porches or iron fences).
- [ ] A real clock-tower civic landmark, not a box with triangle roof.
- [ ] Etched trees with branching and small foliage clusters, plus a coherent gazebo/fountain/park vocabulary.
- [ ] Road edging with fine double-line structure and faint grid, not large uniform bands.
- [ ] Preserve cell occupancy and placement affordances; asset art must never imply an occupied square is free (or vice versa).
- [ ] Audit all lighting, perspective, shadow direction and stroke weights against the styleboard.

### Hard acceptance gate

With labels removed, the cars and houses still read **clearly as Edwardian-era models**. No capsule cars, plain roof triangles or round-ball trees remain. Road, scenery, boxes and UI feel designed by the same artist. No new traffic/test regressions.

### Files likely touched

- src/game/TownScene.ts car, house, scenery, road and board functions
- shared vintage vector source or cached Phaser textures
- minimal palette references from 7B; no gameplay model changes

## 7E — Coherence, state coverage and release polish

**Final visual polish pass, not a substitute for finishing 7B–7D assets.**

- [ ] Replace remaining generic icons/placeholder decals, workshop story-frame car and temporary activity symbols with consistent fine-line derivatives.
- [ ] Harmonize damage states (intact/damaged/broken), installation, upkeep, bins, small props, model preview and vehicle reactions.
- [ ] Consolidate obsolete CSS overrides and remove dead presentation rules after responsive regression testing.
- [ ] Inspect phone portrait/landscape, short laptop, desktop, 200% text zoom, reduced motion, focus and screen-reader announcements.
- [ ] Test real scroll/pan/tap/drag/mouse/keyboard flows (including paused and unaffordable state); no ornamental element intercepts gameplay events.
- [ ] Avoid excessive high-resolution draw calls, SVG regeneration per frame, large page loads and nonessential glow/blur filters.
- [ ] Add stable screenshot comparisons for key scenes and preserve semantic/interaction automated tests.
- [ ] Audit all available models and states against the acceptance checklist in 7A.

### Hard acceptance gate

No P0/P1 asset in [asset-audit.md](./asset-audit.md) remains a placeholder. Review at actual game size in full screenshots. All automated tests pass, representative mobile/keyboard flows remain usable and there is no visible mismatch between kit, board and UI.

## Delivery order and approval model

7B → **review screenshots** → 7C hero carton → **review screenshots** → 7C remaining kits → 7D vehicles and world → **review screenshots** → 7E integration/polish.

Request a separate PR for each pass. Do not merge multiple major art systems simultaneously; the visual intent is the approval gate, and source code correctness is the regression gate.

## What to do immediately after Pass 7A

**Merge the 7A design-contract PR, then implement Pass 7B (HUD, era plaque, gauges and tile inspector).** The later vehicle and kit redesigns should follow the now-committed style system rather than each improvising their own aesthetic.
