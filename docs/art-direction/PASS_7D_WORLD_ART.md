# Pass 7D — Edwardian town and motorcar art

**Status:** Implemented in PR #22; compare actual gameplay screenshots before merging.  
**Design contract:** [Pass 7A art direction](./PASS_7A_ART_DIRECTION.md),
[visual styleboard](./vintage-styleboard.svg), and the
[7B–7E roadmap](./implementation-roadmap.md).

## Goal and design decisions

The original 1908 concept was illustrated with recognisable early motorcars,
fine ivory chalk-line engravings, distinct homes, mature garden trees, a civic
clock tower and a careful layered road. Those were still cheap-looking
placeholders after 7B (UI) and 7C (the six boxed products).

Pass 7D replaces the **actual Phaser objects** with bespoke period SVG assets.
The SVG sources are composed from paths, not generated from text, fetched image
URLs, CSS emoji or large generic circles. Brass is a quiet material detail,
never a universal glow. Each drawing has a dark-stock fill, fine ivory edges,
smaller secondary hatch marks and a consistent upper-left light direction.

## Four vehicle silhouettes for six residents

| Resident | Body type | Visible identity |
| --- | --- | --- |
| Finches | Open runabout | Two compact seats, luggage rack and low windscreen |
| Bells | Touring motorcar | Two passenger rows, folding canopy and framed screen |
| Millers | Tradesman's delivery | High timber-sided body, roof rack and enclosed cab |
| Marshes | Touring motorcar | Same period body family with distinct household coach tint |
| Hales | Tradesman's delivery | Same body family, practical luggage/coachwork |
| Wards | Landaulette | Tall formal closed passenger body, glass divisions and roof |

**All six:** exposed spoked wheels, front coach radiator, brass lamps, upper
and lower running boards, panel framing and vintage contours. The drawn
length/width remains **45×26 scene units** so the traffic appearance does not
misrepresent the physical gap constraints. Every vehicle remains inside the
unchanged Phaser container and uses the same position, rotation, lane offset,
parking, brake-light visibility, return-home and accident reactions as before.

Resident tint is secondary. Form must identify each body even in grayscale.

## Six intentionally different Edwardian homes

- **Finches:** Twin steep gables, chimney, bay/brick detailing, front fence.
- **Bells:** Long shallow half-timber gable, generous porch and sash windows.
- **Millers:** Slate mansard-style roof, dormer, formal arched windows, stone
  villa façade.
- **Marshes:** Garden cottage with verandah, central dormer and small chimney.
- **Hales:** Artisan workshop with large arched carriage opening, timber
  framing and slate roof.
- **Wards:** Symmetrical townhouse, two window treatments, front porch,
  upper brick courses and a formal pitched roof.

Every home is a separate 140×148 SVG texture, scaled consistently to
**59×70** on the board. **Selected resident**, occupied/vacant, and
irritation status markers are retained as *live* Phaser graphics above the
house image rather than pretending they are part of the architecture.
Vacant homes fade and display the existing cross; selected homes keep a
clear nested outline. No home cell or location has changed.

## The town rather than an unrelated scenery pack

- **Clock hall:** central clock face with twelve hour marks and hands,
  slate roof, tall clock-tower shaft, arched windows, formal entrance,
  small iron fencing and engraved civic name.
- **Fountain:** multi-tier stone bowls, raised pedestal, arcs of water and
  an elliptical basin instead of simple concentric outlines.
- **Bandstand:** tented early-1900s gazebo on a shadowed plinth, ribbed
  canopy and iron railings, replacing the existing tree in scenery plot 0.
- **Park sign:** pitched-board notice with engraved hand-lettered
  "TOWN PARK", two sturdy posts and delicate corner fittings.
- **Trees:** three irregular oak silhouettes with visible branches and
  50+ fine foliage marks each, replacing the circular blob trees.
- **Road:** a fine nested double-curb / paving edge, interrupted central
  marks and subtle shoulder scoring, still based on the exact same road
  polygon that controls car movement and placement eligibility.

**No added build obstructions:** the new bandstand occupies a *pre-existing
reserved scenery square*. The other nine trees and all civic landmarks
use exactly their existing positions. No change to \`SCENERY_CELLS\`,
\`ROAD_CELLS\`, tiles, board dimensions, speed or the passing planner.

## Implementation

- \`src/ui/vintageWorldArt.ts\`: all six car originals, six house originals,
  seven civic/tree SVG definitions, one restrained shared palette and
  lossless UTF-8/Base64 Phaser data-URI generator.
- \`TownScene.preload()\`: single cache entry per unique scene image,
  rasterised at twice its source dimensions before play begins; scene
  restart skips already-cached textures.
- \`TownScene.drawScenery()\`: static images, not redrawing dozens of
  Phaser shapes every frame.
- \`TownScene.createCar()\`: cached image in the **existing** traffic
  container. The old capsule/rounded rectangle car drawing is removed.
- \`TownScene.drawHouse()\`: only live condition/selection markers,
  architecture lives in cached house images.
- \`TownScene.drawRoad()\`: upgraded layer/etching, with no path change.
- Development-only \`__modelLoopDebug.worldArt()\` reports loaded textures,
  actual six car positions/lane/rotation, house alpha and 13 fixed-scene
  objects; not shipped in the production bundle.

## Visual and regression acceptance

Run \`npm run check\` and \`npm run test:smoke\`; new
\`tests/edwardian-world.spec.ts\` verifies valid SVG XML, scene texture
identity, six unique car/house assets, town positions, state-driven house
markers, vehicle position/lane parity with the untouched traffic snapshot,
and screenshots at:

| View | Viewport | Must show |
| --- | --- | --- |
| Large desktop | 1440×900 | recognisable town landmarks and period car detail |
| Short laptop | 1266×548 | readable cars/homes while retaining the shop |
| Portrait phone | 390×844 | playable pannable board, visible detailed skyline |
| Short landscape | 844×390 | the town remains primary, shop reachable below |
| Extra pan image | 390×844, centre | hall/fountain and buildings across the phone scroll |

GitHub Actions uploads \`vintage-visual-review\` to the successful check run.
Inspect real-size screenshots, not only an enlarged SVG thumbnail: fine
details must stay legible but not become cartoon-thick at scale. The original
1908 illustration is the aesthetic comparison. After screenshot approval,
PR #22 can merge.

## What is *not* in 7D

No traffic rules, household scripts, model prices/effects, placement,
accidents, upgrades, scavenging, or saved-data semantics change. Pass **7E**
will cover condition and activity badges, story-frame art, remaining generic
UI symbols, CSS cleanup, 200% zoom, focus/touch accessibility and global
consistency across all states. This is the last planned art-polish pass.
