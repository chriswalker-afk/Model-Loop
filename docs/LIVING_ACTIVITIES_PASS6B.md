# Pass 6B — activities with visible consequences

The Vintage town now has a small activity loop, not a random extra
litter roll. Every family action is still chosen at most once per
circuit opportunity. An activity **replaces** that ordinary action (40%
selection chance when an appropriate activity exists); it never grants
an additional action, coin reward or Blueprint.

## Eight resident-specific activities

| Family | Activity | What appears | When it finishes |
| --- | --- | --- | --- |
| Finches | Roadside exploration | Map and marked route | Clearer route |
| Bells | Sketching the scenery | Easel and drawing | Beauty-improving sketch |
| Millers | Local delivery | Parcels and crates | Packaging generally removed |
| Millers | Hurried working lunch | Lunchbox and cup | Wrappers may remain |
| Marshes | Sunday picnic | Blanket, basket and dishes | Usually a tidied verge, sometimes scraps |
| Marshes | Neighbourhood gathering | Friends and picnic props | Tidied verge or food scraps |
| Hales | Heritage visit | Old plaque and cleaning brush | A restored roadside detail |
| Wards | Safety round | Survey marker and sightline | Temporary guidance marker |

The existing twelve household actions, model preferences and personal
remarks remain. A *natural* Miller packaging incident is now a visibly
hurried delivery first, rather than rubbish appearing from nowhere.
Development-only forced actions remain instantaneous for compatibility
tests.

## Real phases and parking

1. An opportunity selects an activity if the car is on the **left** running
   lane, not overtaking or stopped.
2. A suitable free verge square adjacent to the actual road tile is
   chosen; occupied models, existing effects, homes, scenery and other
   activities block it. Picnics and sketches prefer benches/trees.
3. The car pulls over for **setting-up → underway → packing-up**. Its
   lap distance pauses and it is excluded from the traffic solver.
4. At completion, litter and cleanup resolve before the car re-enters
   the road. Rejoining requires the existing safe driveway reservation.

No purchased model can be placed on an active activity square. There are
at most three simultaneous activities, one per family, with a 42-second
personal cooldown. Each lasts 8–13 simulated seconds. Pausing or opening
the workshop freezes their clocks.

## Outcomes with observable causes

Only a delivery, working lunch, picnic or gathering can generate litter.
Each has a seeded likelihood. When scraps appear they pass through the
existing bin system: a nearby properly cared-for bin may catch them; a
full bin can overflow; otherwise the litter appears at the original
activity site and requires existing paid cleanup or eventual expiry.
Clean picnics and gatherings leave a tidied verge.

Activities can temporarily change Beauty, Noise, irritation and, around
deliveries or gatherings, passing speed. Clean artwork from Bell sketches
is a newly bounded short-lived effect (Beauty +1), not a permanent free
upgrade. Actions do not mint income or Progress.

Every activity has small chalk miniature props and a three-phase label.
Click its tile to inspect it, or open the family's optional household
notebook. No new permanent screen HUD is required.

## Reproducibility and next passes

The activity engine uses an independent seeded generator and capped
history. Developer-only debugging can trigger an activity at an actual
road tile. Regression tests cover stages, caps, real picnic litter, bin
capture, paid cleanup, pause/reset, deterministic replays and rendered
inspection. Long seeded game simulations use the same parked-car and
safe-re-entry rules as the real game.

**Pass 6C:** Rare, location-grounded accidents, damaged/broken model
conditions, paid repairs, Hales restoring genuinely damaged models and
Wards managing real hazards. Preserve passing-car safety and avoid
farming rewards by deliberate collisions/repairs.

**Pass 6D:** Inter-family response chains, expanded economy and safety
stress tests, refined notices and cross-device visual polish.
