# Pass 8E — Living Environment and Final Polish

## The town is assembled, not pre-filled

Every new game still begins with **only the road**. As each founding home
settles, a distinctive miniature possession and up to three small decorative
garden pieces appear on safe nearby ground. The six personal keepsakes are:

| Household | Household-specific miniature |
| --- | --- |
| Finches | Travel trunk and folded road map |
| Bells | Painting and sketch easel |
| Millers | Stacked wooden delivery crates |
| Marshes | Picnic hamper |
| Hales | Watering can and garden tools |
| Wards | Inspection lantern |

Every home also gets a stable choice of grass, wildflowers and a shrub or
sapling. All 11 small SVG illustrations are original, transparent, finely
etched in the game's chalk/brass/sage palette.

## Purely decorative means no gameplay effects

`src/game/livingScenery.ts` generates the small family garden details as a
pure deterministic plan from the household ID, home coordinate and current
obstructions. Decorations:

- cost zero coins; have no upkeep, money effect or statistics;
- are never entered into `MODELS`, `placements`, `scenerySites`,
  `environment.effects` or `activities`;
- never reserve a tile, block cars or change the placement-validation rules;
- stay clear of the road, another house, purchased model, civic landmark,
  incident or shared boundary anchor;
- gracefully re-plan if a model or activity appears where grass used to be,
  without altering the model or incident; and
- use the same plan each time, without random gameplay consumption.

Individual planting illustrations appear in short, staggered miniature
assembly tweens after the corresponding family's arrival. Reduced-motion
mode skips those tweens entirely.

## The town grows at four milestones

Civic landmarks and established trees no longer all appear abruptly when the
Vintage Years begin. In ordinary runs, visible civic sites emerge at:

| Progress | Visible additions |
| --- | --- |
| 8% | First oak trees |
| 24% | Additional trees, bandstand and notice board |
| 48% | Further planted trees and the garden fountain |
| 72% | Final trees and the clock hall |

Only physically available sites can emerge. Homes, purchased kits and active
incidents take precedence. Crucially, **future landmark plots are not reserved
before their reveal**: a model purchased first keeps that place, and the civic
piece gracefully skips it. There is no reimbursement, rerouting, extra
purchase, unannounced paid cost or score change.

The historical reference-town fixture remains fully decorated from the start
so existing traffic, layout, household and balance regression tests remain
comparable across versions.

## Engineering and visual QA

- `src/ui/gardenArt.ts`: original SVG miniature portraits and household props.
- `src/game/livingScenery.ts`: pure planning and milestone gating.
- `src/game/state.ts`: read-only `gardenDetails` view and four civic phases.
- `src/game/TownScene.ts`: sprite caching, gentle arrivals, incremental civic
  reveal and read-only scene diagnostics, all below house/model layers.
- `tests/living-scenery.spec.ts`: deterministic positioning, zero resource
  changes, no occupied tiles, 11 unique art assets, milestone timing,
  actual browser visualization, reduced motion, phone and landscape overflow.

Decorations never participate in the traffic solver. **Merge and validate the
separate persistent-gridlock repair before enabling this visual pass on main.**

## Next

After PRs are verified and merged, run a real-device release audit:
a full founding sequence, 30+ completed circuits with mixed house placement,
garden changes as models are purchased, optional boundary shop, accessibility,
and final mobile layout/scrolling. Only then consider a separate release pass
rather than adding gameplay complexity to this founding milestone.
