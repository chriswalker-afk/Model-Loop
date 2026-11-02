# Pass 7C — Physical model cartons and shared miniature art

## Purpose

Fix the largest remaining disconnect between the original 1908 concept and the
playable game: the shop presented flat, thinly slanted cards with a token four-pixel
side strip, while the town itself drew unrelated, simplified representations of
the same objects.

This pass is **implemented product art**, not a speculative art-direction note.
The source of every kit illustration is now the same self-contained engraved SVG
in both the cardboard carton and the game world.

## Packaging: real miniature product construction

Every purchased model is a **single native HTML button** with actual product
construction layers. All decorative layers have no pointer hit area:

| Structural part | Implementation | Visible craft requirement |
| --- | --- | --- |
| Printed front face | \`kit-front-face\` and \`kit-front-print\` | Distinct face, inside register line, charcoal stock and inset print |
| Scored top panel | \`kit-top-face\` | Angled top face, proper thickness and visible fold |
| Right-side panel | \`kit-side-face\` | 11px distinct side with drawn edge and cross-hatching |
| Hanging tab | \`kit-hanger\` and punched \`box-hole\` | Continuation of physical board, not a floating UI badge |
| Die-cut viewing window | \`display-window\`, \`kit-window-cavity\`, \`kit-window-rim\` | Deep recess, bevel/frame and darker back |
| Transparent viewing sheet | \`window-glint\` | Only a faint reflection; interior miniature remains visible |
| Raised physical plinth | **shared SVG geometry** | The object sits on a printed multi-faced base |
| Price/effect column | \`kit-ledger\`, \`kit-band\`, \`box-effects\` | Printed price, Beauty/Noise/Crime and real upkeep values |
| Label and identification | \`box-series\`, \`box-title\`, \`box-description\` | Catalogue serial, meaningful model title and concise caption |

The visual construction is deliberately contained in
\`src/styles/kit-cartons.css\`, linked **after** \`vintage-ui.css\`. Pass 7E
can remove the now-obsolete shop rules from \`src/style.css\` once all
artwork is approved. This is not another unrelated block appended to the
legacy global stylesheet.

## One canonical model library

\`src/ui/modelArt.ts\` now owns precisely **six** SVGs, each drawn on a
130×104 reference plate with the same foreshortened model plinth, ivory
engraving, subdued shading and top-left light:

1. **Gas Lamppost** — gas lantern, iron fluting and base, delicate glazing,
   mullions, roof cap, finial and a controlled brass glow.
2. **Oak Tree** — branching trunk with irregular canopy clusters and many
   leaf marks; not three solid balls.
3. **Park Bench** — individual wooden slats, cast-iron curved supports and
   small grain hatchwork.
4. **Speed Sign** — plausible pre-war roadside *MOTOR CARS / 20 MILES/HOUR*
   warning board. Gameplay speed-sign ID and speed limiting are unchanged.
5. **Police Box** — rendered as a 1908 constable observation/call post rather
   than a later blue telephone police box. Gameplay name, ID and crime effects
   remain unchanged.
6. **Cast-Iron Rubbish Bin** — fluted iron sides, pronounced rim, lid, handles,
   enamel-like badge and corner feet.

The renderer exposes \`miniatureSvg(id)\` for the shop and
\`miniatureDataUri(id)\` / \`miniatureTextureKey(id)\` for Phaser. In the scene
\`preload()\` caches each SVG texture at double source resolution. Purchased
items and placement ghosts draw those same textures via reusable Phaser Image
objects. A state-driven map reuses each purchased sprite rather than
regenerating a texture on simulation updates. Existing accident cracks,
condition overlays, maintenance/wear dots and bin-fill gauges stay on their
live gameplay layer.

**Do not introduce a second, simplified \`drawModel()\` in future passes.**
Changing any model's silhouette must change the single canonical SVG.

## Mobile and short-laptop behaviour

- Desktop/phone: horizontal miniature shelf, standing physical cartons with
  narrow stats columns and recessed window; selected kit lifts a few pixels,
  without green neon or oversized transforms.
- Compact laptop: side-shelf cartons turn sideways, with their viewing window
  on the left and price/printed effects on the right; **front/top/right**
  cardboard geometry remains visible.
- Narrow touch: one accessible button per product, horizontal scrolling and
  readable cost. All purchase and drag/drop event handlers are unchanged.
- Short landscape: the 7B town-first and scroll-to-shop flow stays intact.
- Reduced motion: neither the carton nor model drawings animate unnecessarily.

## Quality verification

\`tests/kit-cartons.spec.ts\` checks:
- Six distinct models and their structural front/top/right faces, hanger,
  window recess, printed effect icons, prices, upkeep and accessibility.
- Canonical SVG string identity with Phaser's cached model IDs; at least one
  purchased miniature and preview ghost use the same texture as the shop.
- Carton geometry and non-overflow in desktop, compact, mobile and landscape
  viewports, plus real-size screenshot artifacts.
- Keyboard selection, reduced-motion and original unchanged purchase cost.

Existing Playwright tests continue checking physical road placement,
short-landscape access, full drag and drop, touch, maintenance, accidents,
resident dynamics and game economy.

The PR's GitHub Actions \`vintage-visual-review\` artifact contains the Pass
7C screenshots. **The actual-size screenshots must be visually reviewed**
against the original concept before the PR is considered artistically
finished. Tests prove usability, not that the carton looks like a physical
collectible.

## Next pass

**Pass 7D — Edwardian cars, homes and town scenery.**

Once these premium miniature kits are present, the remaining mismatch in the
art hierarchy is the simplified world: identical small rounded cars,
triangle-roof houses, plain civic structures and ball-tree scenery.

7D should reuse the proven fine-line/physical miniature grammar for:
- At least 2–3 early-1900s carriage/runabout motorcar silhouettes, with spoked
  wheels and realistic coachwork, mapped to residents while preserving all
  left-lane, overtaking and crash dynamics.
- Six distinct period house façades and a clock-tower/town-hall landmark.
- Trees, gazebo, park, fountain, road outlines and period street furniture.

Then **7E** finishes consistency among activity, accident and repair states,
removes superseded presentation CSS, and checks final performance,
accessibility and responsive screenshots.
