# Pass 7A — Source-based asset and interface audit

**Audit basis:** main branch after PR #18; source structure examined 2 November 2026. The original concept image was supplied in the conversation. This is a *source-backed visual assessment*, not a claim to have captured or pixel-compared a current production browser screenshot. Recheck visual appearance in 7B–7E before signing off.

## Executive diagnosis

The issue is not a missing background texture. The game has **two different levels of visual fidelity and too many uncoordinated styles**:

- The shop miniatures have their own SVG art, but corresponding models on the world board are simpler Phaser primitives.
- Every household car uses the same compact, rounded rectangle body; its tint changes but it lacks unmistakable 1908 coachwork.
- Each house is a 28 × 25 rectangle with a triangle roof; a clock tower, foliage, fountain and notices use similarly elementary polygons.
- Box depth is mostly an angled CSS button plus a **4px side strip**, not coherent cardboard geometry.
- The stylesheet is approximately **2,556 lines** and contains layered revisions of the same shop and inspector selectors. Fixing one border or size without consolidation risks rediscovering old conflicting overrides.
- Text and icon systems mix period serif headings, utility sans labels, Unicode geometric marks and varying semantic colour treatments. The visual language does not yet look like a single engraved catalogue.

This is a **quality hierarchy problem, not primarily a feasibility problem**. Retain the gameplay engine and renovate its presentation in deliberate components.

## Grounded production inventory

| Area | Current implementation | Gap against concept | Priority | Owner pass | “Finished” when |
| --- | --- | --- | --- | --- | --- |
| Main era identity + top gauges | **index.html** topbar/era-mark/meters, **src/main.ts** meter() + incomeMeter(), **src/style.css** .topbar/.meters/.era-mark | Separate relatively plain blocks instead of a coherent framed period instrument board | P0 | 7B | Era badge, 4 engraved meters and coin/year readings share one frame language, preserve state clarity |
| Selected Tile and feedback | **index.html** #tile-panel, **src/main.ts** inspector render methods, **src/style.css** .tile-panel | Readable but ordinary bordered modern panel | P1 | 7B | Ornament is secondary to clear Beauty/Noise/Crime numbers, contrast and dismiss buttons |
| UI icons and labels | **src/main.ts** symbol strings (◉, ✿, ◖, ◇), **index.html**, CSS utility button rules | Inconsistent icon-family look and period feel; heavy reliance on text glyphs | P1 | 7B/7E | Coordinated etched line icons, plus visible text labels and keyboard focus |
| Model kit packaging | **src/main.ts** renderShop(), **src/style.css** .model-box/.box-lip/.display-window and pseudo-elements | A slanted flat card, narrow fake depth and window rather than a convincing folded retail carton | **P0** | 7C | Header/tab, top fold, substantial side plane, printed front, inset transparent cavity, physical plinth, readable price and effects |
| Individual kit drawings | **src/ui/modelArt.ts** miniatureSvg() | More detailed than placed models; common plinth but mixed filled areas and simplified materials | P0 | 7C | All six illustration designs share fine-line material grammar, same kit/board silhouette and consistent proportion |
| Model placements + damage | **src/game/TownScene.ts** drawModel(), drawDynamic() | Independent simple Phaser primitives that do not match shop variants; cracks are overlays | **P0** | 7C/7D | Model identity same on shelf, placement ghost, installed, damaged and broken states |
| Vintage cars | **src/game/TownScene.ts** createCar(), approximately lines 299–357 | Squashed, rounded rectangles with generic dot headlights; no spoked wheel/readable radiator/cab roof | **P0** | 7D | Early-1900s car recognizable at gameplay size, 2–3 variations, left lane and overtaking preserved |
| Household houses | **src/game/TownScene.ts** drawHouse(), approximately lines 358–385 | One common triangle-roof box reused six times; does not express six families/1908 | **P0** | 7D | Six readable period façades with consistent masonry/window/roof cues; moods still legible |
| Civic landmarks | **src/game/TownScene.ts** drawScenery(), approximately lines 245–287 | Rectangular town hall/triangle clock, few ellipse fountain details, plain park notice | P1 | 7D | Civic ornament, clock tower, park furniture and garden details with layered lines |
| Trees / living scenery | **src/game/TownScene.ts** drawTree(), approximately lines 288–298 | Three overlapping circles and a line rather than sketched foliage/branches | P1 | 7D | Distinct hand-etched tree shapes with twig structure and clustered foliage |
| Road, grid and corner language | **src/game/TownScene.ts** drawBoard(), drawRoad(), approximately lines 184–244 | Wide solid stroke outlines, uniform dashed road, simple frame; functional but looks technical/prototype | P1 | 7D | Fine double-edge road outline, subtle stippled wear, faint construction grid; driving hit areas unchanged |
| Activity/accident/response artwork | **src/game/TownScene.ts** drawActivity(), drawEnvironment(), drawDynamic(), impact/response animations | Small icons and transient props have varying stroke weight; some are visibly symbolic rather than miniature objects | P2 | 7E | Contextual assets use same line widths/materials without clutter |
| Workshop/end-of-era | **src/style.css** .modal/.dialog/.story-frame, **src/main.ts** workshop UI | Separate generic dark overlay style and a crude rectangular story car | P2 | 7E | Antique workshop/casebook treatment, same period typography and car asset |
| Typography and decorative structure | **src/style.css** :root and many later overrides | Georgia and system sans mix appropriately in places but multiple independent size/contrast systems drift | P1 | 7B/7E | One heading/body/annotation scale; ornaments never shrink functional text |
| Rendering source structure | **src/game/TownScene.ts**, **src/ui/modelArt.ts**, **src/style.css** | Multiple manually composed geometric styles and duplicate model drawings | **P0 engineering** | 7B–7D | Canonical palette + reusable per-object illustration source; coherent CSS modules rather than accumulating patch overrides |

**P0:** Must be corrected for the game to meet the original identity.  
**P1:** Essential next-pass craft and coherence.  
**P2:** Final visual finish after the hero assets are solved.

## Specific quality debt to stop repeating

### 1. “Looks like a button” vs “looks like packaging”

The current .model-box uses a perspective rotation and shadow plus CSS ::after for a roughly 4px side strip. The hanger tab is a small rectangle and window is a rounded inset area. These elements indicate **the idea** of a box, but not credible front/right/top cardboard geometry. The entire object should be constructed as a mini product rendering with a real front plane and two faces, a die-cut opening and crisp fine printed lines.

**7C requirement:** Prototype one complete Gas Lamppost carton as a reusable system and view it without content. If it is not unambiguously a 3D toy carton, *do not* apply the template to the other five.

### 2. Two drawings of each miniature

The shop renders **src/ui/modelArt.ts** miniatureSvg(); the game renders another object in **src/game/TownScene.ts** drawModel(). Even when both depict a tree, lamp or bench, they are different drawings. This structurally guarantees inconsistency whenever one is polished but the other is not.

**7C/7D requirement:** One source of object geometry or a controlled pair of deliberately related renderings, with identical silhouettes/details. A shared SVG/vector source may need a pre-rendering layer for Phaser, while remaining inspectable and accessible in the shop.

### 3. Generic car and house silhouettes

In createCar(), the car body is a set of rounded rectangles, one square window and small circles. The roofs, fenders, chassis, spoked wheels and coachwork expected from the 1908 concept are missing. In drawHouse(), all houses are similarly shaped roof triangles atop rectangles, varying mainly by colour/state rather than period architecture.

**7D requirement:** Deliver recognizably Edwardian silhouettes *before* decorative detail, and test at real playing scale. The player's eye should identify a vintage vehicle/house with no title.

### 4. Layered CSS from many improvement passes

The original shop rules appear early in **src/style.css** and are redefined later in the same file (including compact desktop, mobile, workbench and polish sections). Do not keep appending 7B/7C visual overrides at the end of this already large stylesheet.

**7B requirement:** Map and consolidate the touched selectors into a small coherent theme layer, preserve existing responsive behaviour, and remove superseded styles after tests pass. Avoid a risky total CSS rewrite.

### 5. Historical specificity without sabotaging gameplay

The original concept includes visually attractive but chronologically modern ideas such as CCTV. The *game* currently has a Police Box model, not a purchasable CCTV ID. Keep that **police** ID and its Crime reduction unchanged. Draw it as a period watchman's post/call station for 1908. Similarly, use a period speed warning board while retaining the **limit** mechanic. Anachronistic CCTV can become a later-era item or deliberate fantasy option, not silently appear in the Vintage shop.

### 6. Preserve the game, not the placeholders

Source art can be replaced without changing **BOARD**, **ROAD_CELLS**, roadPoseAt(), all lane reservation logic, the purchase economy, model IDs, activity positions or damage conditions. Respect fixed physical tile footprints even if an illustration appears taller than one tile.

## Asset production architecture (proposed — not yet coded)

Small, gradual, renderer-agnostic structure:

- **src/art/vintage/palette.ts** — typed palette and line-width constants matching vintage-tokens.json, shared by UI/Phaser.
- **src/art/vintage/ornaments.ts** — restrained frame corners, rules, filigree and gauge ticks; reusable in HTML/SVG.
- **src/art/vintage/kitIllustrations.ts** — canonical vectors for all six purchased kits; shop and board have a consistent image source.
- **src/art/vintage/motorcars.ts** — two or three 1908 coachwork variants with household details.
- **src/art/vintage/buildings.ts** — six façades and clock-tower architecture.
- **src/art/vintage/scenery.ts** — tree, fountain, gazebo, lamppost and benches.
- **src/ui/KitCarton.ts** (or equivalent) — a single accessible semantic control for carton and all selection states.
- **src/styles/vintage-tokens.css / vintage-ui.css / vintage-shop.css** — consolidate touched presentation selectors instead of creating new end-of-file patches.

These **are targets**, not existing files. SVG is suitable for source geometry, carton fronts and 2D period components; Phaser may use cached textures or vector rendering for game-world sprites. CSS should handle box geometry, layout, buttons, affordances and responsive framing. Avoid embedding large repeated DOM SVG strings every frame or replacing the Phaser engine.

## Visual QA scene matrix for 7B–7E

Capture at least these cases with screenshots, compare against the reference and include in every visual PR:

| Viewport | Situation to examine | Visual failure to reject |
| --- | --- | --- |
| 1440 × 900 desktop | Four-meter HUD, full road, five/six boxed models, inspector closed | Town feels like plain vector demo; kits look like cards |
| 1366 × 768 laptop | Normal play, inspector open over a road corner | HUD crushes town, tiny illegible text, inspector hides actions |
| 1024 × 768 tablet | Shop scroll, one selected kit, drag/placement | Kit side panels collapse, shop cuts off object/price |
| 390 × 844 phone portrait | Shop horizontal scroll, selected kit, tile inspection | Box flattened, text under 11px, touch targets overlap, scenery illegible |
| 844 × 390 phone landscape | Map pan and active car/accident | World cropped without pan, details unreadable |
| Reduced motion & keyboard | Selected box, focused inspector, pause | Invisible focus, inappropriate motion, inaccessible status |

Also inspect states: unopened/hovered/selected/unaffordable/dragging kits; placed model full/economy/bare care and intact/damaged/broken condition; empty/occupied tile; Wards' incident warning; Marshes' picnic; shop open after 6D event; workshop.

Screenshots should be compared by **compositional quality**, not only pixel differences. Stable screenshot regression assertions can catch severe clipping but cannot certify period authenticity by themselves.

## Acceptance gate

Pass 7A defines the source-of-truth and asset backlog; it does **not** claim artwork has already been replaced. The 7B–7E passes are only finished once each P0 gap is visibly addressed, with a screenshot that makes the improvement judgeable at **real gameplay scale**, not a zoomed detail crop.

Next: [implementation-roadmap.md](./implementation-roadmap.md).
