# Pass 7B — the engraved instrument board and selected-square inspector

**Status:** Implementation in the dedicated Pass 7B PR. Review actual CI screenshot artifacts and merge after checks.  
**Design authority:** [Pass 7A Vintage Art Direction](./PASS_7A_ART_DIRECTION.md) and [visual tokens](./vintage-tokens.json).

This is the first *implemented* visual overhaul pass. It does not change the road canvas, model carton design, price/economy or any of the 6A–6D systems.

## Implemented

### The 1908 instrument board

- A near-black engraved outer header with a **double-line frame**, very faint paper-grid rhythm and gently raised contrast.
- A framed workshop title with a **small etched early motorcar mark**, not a modern UI emblem.
- The **Vintage era plaque**, with fine corner flourishes, serif title, period label and understated line ornament.
- Four gauges grouped in a common **engraved instrument housing**, with consistent outline drawings of a cog, family group, shield and coin stacks.
- Segment/tick engraving in meter rails, with the current **Progress, Community, Safety and signed sixty-second net Income** semantics unchanged. The meter values remain driven by the live game store.
- Money, utility buttons and focus treatment now share a quiet brass/ivory border language; reduced-motion users are not shown moving gauge-fill transitions.

### The Selected Tile inspector

- Fine ivory frame, a quiet inner printed rule, small architectural corner engravings and improved heading hierarchy. It is **still hidden unless explicitly opened** by a square selection.
- Beauty, Noise, Crime and Road safety now use matched, thin outline icons **plus their text names**, so no result relies on colour alone.
- The placement preview reuses the **same icon source** as the ordinary inspector.
- The model-care, litter, activity, accident and neighbourhood details remain in the original collapsible/scrollable inspector; it is *not* replaced by a decorative mockup.
- The close button remains a semantic button with keyboard activation, a visible focus outline and a sufficiently large touch target.

### Technical approach

- \`src/ui/vintageIcons.ts\` — one self-contained SVG icon/ornament family, typed names and accessible decorative hiding.
- \`src/styles/vintage-ui.css\` — one distinct **opt-in** Vintage presentation layer (header and inspector only), with local media rules. It intentionally does *not* restyle the shop or road before those passes.
- \`index.html\` — existing semantic structure retained, with era, header and inspector Vintage classes and one detailed motorcar badge.
- \`src/main.ts\` — reuses the same SVG icons in live HUD, placement previews and tile values. The original store-backed values, weather/traffic safety, repairs and income logic are untouched.

The old \`src/style.css\` still owns the working grid geometry, space-efficient short-laptop sidebar, phone horizontal panning, shop, household cards and modal layout. The new theme is isolated, not appended as another unrelated set of patches to that long file. Later 7E can remove obsolete legacy skin rules after all 7B–7D artwork is installed.

## QA and actual-size review

\`tests/vintage-ui.spec.ts\` checks icon consistency, live gauge values, focus/close behaviour, inspector forecast icons, reduced-motion and responsive layout.

A dedicated GitHub Actions step uploads **\`vintage-visual-review\`** containing full, unscaled screenshots and selected inspector crops at:

| View | Screen | What to look for |
| --- | --- | --- |
| Desktop | 1440 × 900 | Plaque hierarchy, uninterrupted board, open selected inspector |
| Compact laptop | 1366 × 768 | Header legibility without cutting into the canvas or side shop |
| Portrait phone | 390 × 844 | 2×2 segmented gauges, tappable controls, inspector below board |
| Landscape phone | 844 × 390 | Clear title and meaningful instruments without horizontal clipping |

Review the screenshot archive on the PR's successful **Check and publish** run; CI proves no overflow and interaction regressions but **a human visual review is still the craft gate**. Compare the screenshots against [vintage-styleboard.svg](./vintage-styleboard.svg) and the originally supplied concept image.

The older Playwright checks still protect drag-and-drop, scene gameplay, pause, timers, road geometry, left-hand overtaking, real accident repairs and household event responses. The design does not change the meaning of any number.

## Explicitly deferred to 7C onward

- **7C (next):** Turn the six miniature cards into believable physical cartons with visible front/top/side planes, recessed transparent windows and matching model illustrations. First prototype the Gas Lamppost hero box, review screenshots, and then extend to the other five.
- **7D:** Replace simple vehicle, six house, town hall and scenery shapes with recognizably Edwardian fine etchings.
- **7E:** Harmonize all illustration states and remaining workbench/overlay chrome, clean obsolete CSS and complete the release-quality visual regression and accessibility audit.

**Do not call Pass 7B a fix for the model boxes or cars.** Their separate drawing systems are deliberately the next main quality priorities.
