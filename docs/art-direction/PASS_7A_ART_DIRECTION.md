# Pass 7A — Vintage visual direction and quality contract

**Status:** Art-direction specification, not an in-game reskin.  
**Reference:** The original 1908 chalkboard miniature-town concept image supplied for the project on 2 November 2026.  
**Authoritative rule:** Subsequent 7B–7E changes should be reviewed against this contract and the companion [styleboard](./vintage-styleboard.svg), not just against the current implementation.

## 1. North star

**A fine-etched Edwardian model town on a near-black draughtsman's board, presented through the packaging and typography of a beautiful antique miniature catalogue.**

Imagine an exquisite 1908 toy-shop display or hand-engraved architectural drawing: precise ivory pencil lines, tightly controlled cross-hatching, visible construction grids, narrow decorative flourishes, and only *tiny* touches of colour where the game needs meaning. It is **not** a soft, smudgy children's chalkboard, a modern dashboard with a sepia filter, pixel art, or a flat vector icon set.

The original concept establishes five non-negotiable promises:

1. The **cars, houses, street furniture and civic landmarks read as explicitly vintage**, even without text.
2. The town's visual language is **mostly fine white/ivory drawing on black**, with layered strokes and deliberately restrained colour.
3. The shop sells **actual miniature kits in physical cartons**. They must have believable depth, a window, printed face and an object resting inside, not merely a card with a side strip.
4. The HUD feels like **antique engraved nameplates, gauges and catalogue labels**, while keeping gameplay information legible at a glance.
5. **Every asset has the same craft standard**. A lovingly drawn shop lamp next to a placeholder rectangle house fails even if each is functional.

This is an art-direction reboot, not a request to rebuild the road simulation or UI interactions. Retain the 24 × 12 board, 1908 Vintage chapter, six households, six purchasable models, shop drag/tap behaviour, driving lanes, accessibility and all 6A–6D game systems.

## 2. The illustration language

### Line before fill

| Level | Reference width at 1152 × 620 scene resolution | Opacity / purpose |
| --- | --- | --- |
| Architectural silhouette | 1.4–1.8 world px | 82–95%; distinguish car/house/building outlines |
| Structural articulation | 0.85–1.2 world px | 65–90%; panels, fenders, masonry, windows, spokes |
| Engraved detail | 0.5–0.85 world px | 35–68%; brick joints, upholstery, woodgrain, ironwork, hatching |
| Construction/grid marks | 0.5–0.8 world px | 9–20%; never compete with actual road or labels |
| Functional selected/focus line | 1.5–2.5 *display* px | High contrast, visibly distinct even without colour |

These are **reference values, not rigid SVG stroke widths**; at smaller render scales, tune/resample for legibility and avoid subpixel disappearance. Prefer overlapping *thin strokes* with offsets and localized hatching over heavy filled shapes. No large opaque green/brown surfaces unless they are the near-black shadow side of an object.

Linework should be mostly crisp. To suggest an aged print use **subtle local interruptions, sparse dry-pencil secondary strokes and engraved hatch lines**. Do not cover the game with broad grain, blur, noise, thick jagged borders or indiscriminate glow.

### Depth without cartoon shading

- One light source: **upper left** for cardboard edges, window reflections, building sides, miniature plinths and the world.
- Primary shapes: ivory outline and dark charcoal interior.
- Secondary planes: slightly warmer/darker chalk or sparse diagonal strokes.
- Contact shadow: understated, under the object or packaging footprint.
- Colour: a few accent highlights, never coloured fills on every model, tree or roof.
- Light emission is reserved for a **gas lamp** or gameplay selection; it must be small and warm, not a generic neon glow.

### Palette

Palette and usage limits are defined in [vintage-tokens.json](./vintage-tokens.json). The palette targets the *reference concept*, not exact sampled pixel values.

| Role | Proposed value | Intended usage |
| --- | --- | --- |
| Blackboard | #101211 | Overall background |
| Raised paper/charcoal | #1B201E | Road / physical recess / carton shadow |
| Primary engraved ivory | #E9E2D5 | Structural outlines, headings |
| Secondary chalk | #B8B2A5 | Material detail |
| Ghost chalk | #777C72 | Grid, unselected secondary detail |
| Warm brass | #D9B66B | Gas lamps, income/currency, very small gold hardware |
| Progress green | #9FC99C | Progress bar only |
| Community blue | #A9CAE0 | Community indicator only |
| Safety salmon | #DE9990 | Safety/risk/damage indicator |
| Income gold | #E0BF75 | Income meter, coin counters |

**90/8/2 budget:** Approximately 90% of a scene should remain dark/ivory, up to 8% secondary charcoal/greys, and around 2% semantic colour. This is a visual target, not a computational contrast rule. Colour must supplement shape/text—not be the only indicator of a model's condition, score or selection.

**Do not introduce arbitrary per-household accent colours into the town.** Household identities are conveyed by silhouette, small badge/lining, remarks and model behaviour. Their existing semantic IDs and game data remain unchanged.

## 3. Vintage means specific objects

### Motor cars, around 1908

- Silhouette: **early motor carriage / Edwardian runabout** with tall passenger compartment, distinct upright windscreen, coachwork, narrow hood, exposed mudguards and two obvious spoked wheels in side view.
- Parts: radiator, lamps, side steps, wheel hubs, fenders, panel seams and rear luggage when readable.
- From the play camera, preserve the original road direction, **left lane** and right-side overtaking; artwork must not mask lane occupancy.
- Build one shared early-motorcar drawing grammar, then apply 2–3 subtle body/roof/luggage variants to six households. Do not produce six unrelated designs.
- **Disallowed:** generic round-ended pill cars, modern hatchbacks, bus-like rectangles, chunky tyres, headlights represented only by glowing dots.

### Houses and landmarks

- Six household homes need **readable different façades**: townhouse with bay window, narrow cottage, gabled villa, shopkeeper's terrace, brick civic townhouse, and modest timber-gabled home are suitable design directions.
- Each should have at least two period cues: pitched/slate or tiled roof, brick or stone coursing, sash windows with muntins, chimney pots, porch, lintels, bay window, wrought-iron fence or projecting shop sign.
- Civic landmark: a legible Edwardian town hall with clock/bell tower, cornices, arched windows and steps. Other landmarks use Victorian/Edwardian ironwork, benches, garden railings and a gazebo-like pavilion.
- Trees should have illustrated branching structure and foliage drawn as fine clustered marks, not a few stacked outline circles.
- Buildings have controlled *silhouettes* first. Dense hatching must not compete with cars or placement tiles.

### Playable miniature models

The current Vintage kit IDs stay stable: **lamp, tree, bench, limit, police, bin**. Their shop and board illustrations must tell the same story, share the same silhouette and use comparable materials/line hierarchy.

- Lamp: cast-iron fluted post, finial, mullioned glass lantern and small amber flame.
- Tree: branching oak with individually indicated foliage clusters and a stone/wood plinth.
- Bench: slatted park seat with ornate cast-iron legs.
- Speed sign: period-inspired roadside notice or narrow enamel board; preserve the gameplay speed meaning, but avoid making a modern motorway sign the only design cue.
- Police box: period constable's call point / small watch post, visibly not modern electronic CCTV.
- Rubbish bin: cast-iron street basket with decorative grille and hinged lid.

**Historical tension to resolve deliberately:** The original concept drawing includes a CCTV camera and contemporary-looking circular 20 sign despite the 1908 date. Use the concept as the *visual-quality* authority, not unquestionable historical evidence. Keep gameplay meaning and the current item IDs. For Vintage, prefer a constable's observation/call box and period speed notice; reserve overt electronic CCTV for a later era. Do not silently change item effects.

## 4. Physical miniature boxes: the shop's main attraction

A kit must read **as a cardboard object in perspective**, not a flat software button.

Required construction, visible even when unselected:

1. Die-cut **hanger tab** or folded header, with an actual punched slot.
2. **Front face**, plus a distinct **right side panel** and a narrow **top/fold plane** with coherent perspective (not just a 4px pseudo-element).
3. A visibly **recessed transparent window** with die-cut edges, dark cavity, a subtle glass reflection and the model resting on a plinth.
4. **Printed era/collection designation**, evocative product name and tiny serial number, in a consistent hierarchy.
5. **Coin-price panel** and Beauty / Noise / Crime effects physically integrated into the front printing. Never overlay prices on the object.
6. Fine **paper folds, edge seams, ink wear or hatch texture** to distinguish packaging from an ordinary UI card.
7. Selected state: box lifts modestly from its shelf without losing physical geometry. Unaffordable state: muted ink, but price and label remain legible.

At desktop, show the window and side panel with recognizable depth. At phone widths, **scroll the boxes**; do not flatten or shrink them until the printed detail is illegible. An accessible button may use layered SVG/CSS for its 3D face, but must remain one semantic button and retain drag/tap, disabled, focus and selected-state behaviour.

Shop kit source art must match the placed town art. Avoid separate inconsistent drawings of the same lamp, tree or bench.

## 5. Interface and hierarchy

- **Top HUD:** one coherent engraved-nameplate system. A prominent era cartouche, four clearly labelled progress/community/safety/income registers, a restrained year plaque and controls subordinate to the town.
- **Typography:** high-contrast engraved serif for era/title and kit names; compact, highly legible sober serif or sans for statistics, numeric counters and short instructions. Do not give 8px decorative letterspaced text the burden of explaining a purchase.
- **Tile inspector:** ornate edge *around* a plain readable interior. Beauty / Noise / Crime must be distinguishable by icon AND text. Reactions and causal stories remain tucked behind optional disclosures.
- **Icons:** one hand-drawn family of line icons, no mix of inconsistent Unicode characters, emoji, generic outline symbols and thick UI icons.
- **Buttons:** quietly tactile, with clear interactive affordances; focus outlines stay visible and may be more utilitarian than ornamental.
- **HUD content and placement:** preserve existing responsive interactions, live updating values, coin meanings and disclosure controls; decoration is not allowed to obscure state.

### Readability and interaction floor

- Main interactive controls aim for **44 × 44 CSS px touch area** on phones, or an equally usable separated target when the package itself is larger.
- Functional text normally **at least 11–12 CSS px** at the relevant viewport; small engraved microtext can be decorative only, with a readable accessible alternative.
- Functional text contrast target **WCAG AA 4.5:1**; do not achieve monochrome at the expense of clarity.
- Colour-blind readability: positive/negative signs and explicit labels remain; no reliance on only red/green.
- Keyboard focus, screen-reader labels, reduced-motion, hover vs tap and pause must survive all visual changes.

## 6. The road and miniature world

Preserve the irregular grid route and driving physics. The road should look like a hand-drawn road laid on black drafting card: **two narrow chalk outlines with an ink-dark body**, faint edge scuffs, restrained centre dashes, and readable left/right lanes. Keep the tiled construction grid present but faint.

The tile selection glow must remain unmistakable against detailed architecture. Visual object footprints must **not** lie about blocked/available squares; large decorative buildings may extend beyond a logical cell only when hit testing and collision/placement remain easy to understand.

Place decoration behind gameplay overlays, preserve braking/turning visual cues and keep temporary repair/activity props legible without turning the board into a busy sticker collage.

## 7. Production approach (not part of 7A implementation)

- **7B — Engraved HUD and inspector.** Consolidate touched CSS rather than add another round of overrides; introduce shared visual tokens for CSS and Phaser. Redraw the top plaque, meters, icons, selected tile. Validate laptop, short landscape and phone layouts.
- **7C — Physical kit boxes.** Build a reusable carton component with geometric front/side/top; redesign one hero box (gas lamp) as the acceptance gate before applying to all six. Reuse one model art source for both shop and board.
- **7D — World art.** Replace capsule cars, primitive houses and landmark/tree placeholders with consistent fine-etch vintage assets. Preserve the traffic solver, board coordinates and draw order. Add legible per-household variation.
- **7E — Quality and consistency.** Consolidate visual CSS overrides, audit all states (placed/damaged/broken/hover/drag/selected/activity/paused), responsive hierarchy, contrast, performance and visual screenshot regression checks.

Detailed file-by-file audit: [asset-audit.md](./asset-audit.md).  
Step-by-step gates: [implementation-roadmap.md](./implementation-roadmap.md).

## 8. Release gate: “would this belong on the reference board?”

Before a new asset is accepted:

- **Period silhouette:** Does it read as early 1900s from its *shape*, without the year label?
- **Craft:** Is it etched in layered fine strokes rather than outlined blocks?
- **Material:** Can I tell iron from wood, glass, cardboard and masonry?
- **Composition:** Is contrast reserved for things the player must notice?
- **Physicality:** If a kit, would it look like a carton sitting on a shelf even if all text were hidden?
- **Consistency:** Is the exact same object recognizable in the shop, placement ghost and town?
- **Function:** Can players still read, select, drag, place, inspect, repair, navigate by keyboard and interpret all status indicators?

If any answer is “no”, it is **not finished**, even if the CSS compiles and tests pass. The benchmark is craft and identity, not merely absence of errors.
