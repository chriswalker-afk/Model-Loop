# Pass 7E — Final vintage coherence and quality gate

**Implementation:** PR #23 on top of merged Passes 7A–7D.  
**Goal:** Finish the original 1908, finely chalk-etched model-town visual identity without rewriting road mechanics, pricing, behaviour, or the UI's tested layout system.

## What changed in the playable game

### 1. Every small prop has one matching drawing everywhere

A new typed **src/ui/vintageEventArt.ts** contains exactly **22** original fine-line drawings:

| Family | Count | Covered states |
| --- | ---: | --- |
| Roadside traces | 10 | Wrapper/litter, flowers, tyre scuffs, courtesy bend, road patch, tidying/broom, heritage ornament, display, guidance, little sketch |
| Resident activities | 8 | Exploration/map, sketch/easel, delivery crates, working lunch, Marsh picnic basket/checked blanket, gathering, heritage restoration, safety inspection |
| Accident condition seals | 2 | Damaged and broken miniature |
| Care indicators | 2 | Economy care and bare care |

- Each SVG uses a **72 × 62 source grid**, the same antique ivory, secondary chalk and brass palette as the car/house/model library, and period-appropriate objects rather than generic coloured circles.
- The **same function** renders the icon in HTML Selected Tile details and supplies the Phaser **Base64 texture**. There are no independent road/inspector icon variants and no unrelated Unicode symbols for these event types.
- The Phaser scene preloads all 22 textures once at double source resolution. Active trace/activity/incident/care sprites use a stable state-key map, reusing existing images during tick notifications and destroying them when their events expire or models are repaired.
- Activities still have setup/underway/packing phases. The image opacity and three fine ticks show phase without adding a second HUD. A new model or active picnic does not acquire a new, invisible hit area.
- The screenshot-driven design keeps the bought SVG miniatures visible when damaged: **hairline cracks and a small engraved condition seal** now replace the oversized opaque rectangle and thick warning dot. Lower-care models use matching mini tags.
- The bin's actual fill is still visible in a slim engraved capacity gauge; normal capacity and overflow remain distinguishable. No care, bin-fill or accident mechanics changed.

### 2. Workbench and end-of-chapter now match the town

- The previously CSS-rounded “story car” is removed. The conclusion illustrates the **same formal 1908 landaulette SVG** as a resident's actual motorcar, in a finely registered model plate.
- The workshop uses the existing finely etched Gas Lamppost miniature, a simple antiquarian shelf/desk frame and the same four engraved corner ornaments as the HUD and Selected Tile inspector.
- A standalone **src/styles/vintage-finish.css** collects only the final frame and inspector visual adjustments (not another set of unrelated full-page rules in the old stylesheet).
- Real button focus states, translucent antique engraving panels, legible typography, reduced-motion settings and scrollable narrow dialogs are retained.
- Workshop, chapter and model-selection actions still operate on the original state and economy.
- A modal renderer now avoids replacing unchanged HTML on every store notification. Keyboard focus moves to a named heading on entry, is contained while the dialog is open, is retained across changing upgrades where possible, and returns to its invoking control on exit. Escape exits the workshop or returns focus to the principal chapter action; the chapter result itself is not dismissible without a meaningful action.

### 3. Presentation cleanup without gameplay risk

- Removed the unused **story car**, **moon** and faux-road CSS prototype rules from \`src/style.css\`; their last use was superseded by the real vehicle asset.
- All new art/presentation is isolated in dedicated typed files or opt-in styles, rather than stacking new generic \`.model-box\` overrides in the existing long CSS file.
- The original \`src/style.css\` still includes older responsive and sidebar layout rules intentionally. Mass-deleting them without screenshot comparison would risk reintroducing previous 7B/7C fixed-shop or compact-workspace regressions. These are retained until a separate, independently verified layout refactor. **Do not claim that all historical CSS was removed.**

## Scope and regressions deliberately avoided

No modifications to:

- road polygon or allowed placement cells
- left-hand lane preferences, overtaking reservations or collision/risk conditions
- vehicle speeds, resident personalities or activity probabilities
- model costs, effects, upkeep or repair costs
- chapter progression, upgrade benefits, bin capacity or saved state format

A static piece of artwork never schedules an event, alters the score or changes the hitbox.

## Visual review scenarios

The GitHub Actions **vintage-visual-review** artifact contains actual screenshots from the game at:

| Viewport | Required state |
| --- | --- |
| 1440 × 900 | full Vintage town; chapter plate; workshop |
| 1266 × 548 | short-window desktop / compact shelf; modal |
| 390 × 844 | portrait phone with kit dock; scrollable workshop and chapter |
| 844 × 390 | short landscape, town-first layout; modal |
| 720 × 450 | equivalent viewport of 1440 × 900 at 200% desktop zoom |
| On-game activity | Marshall/Marsh picnic, trace and local incident state |
| Damage and repair | actual damaged/broken miniature with readable status marker |
| Keyboard / reduced motion | trapped modal focus, working Escape, static effects, restored focus |

Review screenshots at real gameplay size against the [original art-direction styleboard](./vintage-styleboard.svg). Automated image checks can protect geometry, not artist-level authenticity. The quality question is whether the *small* props now share the line grammar with the new buildings and kit cartons, rather than looking like bright UI badges.

## Test and performance gates

- \`npm run check\`: strict TS and production Vite build.
- \`npm run test:smoke\`: all existing tests, plus \`tests/vintage-finish.spec.ts\`.
- Validate XML parse of every event SVG, round-trip Base64, six car/home textures, separate scene counts, model condition appearance, cleanup when a timed event expires, actual DOM parity of the inspector and road props, reduced-motion setting and all representative viewports.
- Guard against unbounded Phaser object creation: there is at most **one sprite per active event or care/condition marker**, and stale IDs are destroyed. None of the 22 SVGs are regenerated during frame updates.
- Inspect desktop/phone screenshots from the **successful final branch head**, not an earlier failed build.

## After merging 7E — release playtest rather than another cosmetic pass

1. Run a full game from a fresh start until the chapter ends. Verify purchase, driving, overtaking, crashes, repairs, shop scrolling, activity events, income and saved upgrades on real mouse/touch hardware.
2. Compare desktop, compact laptop and mobile screenshots with the original 1908 concept side-by-side. Do not accept coarse stand-ins, clipped labels or false visual hit areas.
3. Record any usability/accessibility/performance regressions as small, prioritised tickets and address them before declaring the Vintage chapter launch-ready.
4. **Only after release playtesting** consider content extensions: next era, additional physical models, more town stories or non-visual gameplay changes.

The proper next task after this PR is **merge PR #23, then carry out a release-readiness playtest and targeted final corrections**.
