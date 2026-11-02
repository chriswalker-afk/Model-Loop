# Pass 6A — personalities behind the wheel

This pass makes each family's already-authored tastes influence **actual car
behaviour**, not just their speech and model reactions. All six still drive
the same left-hand circuit with shared collision rules; differences are
ordinary habits rather than diagnoses, moral labels, or impossible superpowers.

## Driving profiles

These numbers are **game-world pixels per simulated second**, not period
vehicle speeds in mph. Longitudinal collision avoidance always enforces a
minimum 38-pixel gap, independently of anyone's preference.

| Household | Cruising speed | Corner factor | Following headway | Pass speed advantage | Passing clearance (front/rear) | Motivation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Finches | 106 | 0.94 | 0.48s | 7 | 82 / 76 | Exploring, independent, enjoys driving briskly |
| Bells | 82 | 0.74 | 0.78s | 22 | 117 / 108 | Seeing the town, taking an unhurried journey |
| Millers | 101 | 0.86 | 0.53s | 8 | 88 / 80 | Getting supplies and deliveries through |
| Marshes | 89 | 0.82 | 0.68s | 16 | 105 / 98 | Familiar faces and communal spaces |
| Hales | 86 | 0.77 | 0.74s | 20 | 113 / 105 | A steady route, familiar places worth keeping |
| Wards | 80 | 0.68 | 0.89s | 27 | 138 / 125 | Visibility, ample room and predictable safety |

Full values, including passing lookahead, live in
[`src/game/driving.ts`](../src/game/driving.ts). These are initial game
balance values, not empirical human driving models. The same profile drives
the Phaser scene, the lane-change planner, the car-following solver and the
long seeded balance simulations.

- **Every car** obeys speed signs, roadside obstructions, head-on lane
  reservations, minimum following distance and safe driveway departures.
- **Before a bend**, each family slows by its own corner factor. This changes
  real trip time, not only a displayed animation.
- A driver may overtake only if they have sufficient speed advantage, the
  passing stretch is suitable, and their own front/rear margins are clear.
  Any failed attempt leaves them following or queueing. Collision protection
  is common to everyone.
- When cars finish a lap they still return home for the usual pause; only a
  completed circuit earns coins. Scene size and shop placement are unchanged.

## Why each positive and troublesome action fits

| Household | Helpful | Troublesome | Shared motivation |
| --- | --- | --- | --- |
| Finches | Find a clear line through a bend, briefly easing nearby journeys | Take a bend too sharply, leaving tyre scuffs | Exploration, confidence and sometimes overconfidence |
| Bells | Plant flowers | Stop to admire the scene | Notice and enjoy little beautiful details |
| Millers | Mend a worn road | Forget packaging after a hurried delivery | Practical work, a little too much haste |
| Marshes | Tidy shared spaces | Linger talking with neighbours | Sociable care for community |
| Hales | Restore a traditional roadside detail | Put out a display that slows passing cars | Preserve things worth remembering |
| Wards | Guide others through an awkward spot; may shorten a real stop | Hesitate before an unclear corner | Care about risk and safe passage |

In particular, the **Finches no longer give way as their magical helpful
act or shorten another family's stop**. They mark a locally more comfortable
route instead; real queue intervention belongs to the Wards. Both Finches
and Wards now draw their natural action opportunity from **actual bends**,
using seeded offsets relative to their own driveway.

Each of the twelve actions also has its own resident-voiced after-remark,
shown in the existing optional household notebook. The notebook gains one
short **Behind the wheel** description, without adding another permanent HUD.

## Litter before and after

An unrelated scenic stop, hasty bend or cautious hesitation no longer rolls
a random wrapper. For now the Millers' delivery packaging remains the
existing natural litter source; bins, bin servicing, manual cleanup,
environmental repairs and deterministic debug triggers are unchanged.
**Pass 6B** adds visible activities, including picnics and working lunches,
so rubbish can be produced by an observable event rather than thin air.
This interim reduction in litter frequency makes bin utility an explicit
playtesting question.

## Boundaries and regression coverage

This pass does **not** add crashes, model damage, repair of purchased
miniatures, picnics or extra actions per household. Those would require
new state, visuals, interruption handling and balanced costs; introducing
them before the driving personalities were consistent would create
unmotivated side effects.

Checks: strict TypeScript, production build, full Playwright suite,
left-hand/overtaking safety, deterministic bend opportunities, household
action consistency, optional notebook readability and long seeded runs
using the **same driving profiles** as the live traffic simulation.

## Next passes

1. **6B — Activities and consequences:** small staged picnics, deliveries,
   scenic pauses and gatherings; litter originates from those activities,
   with tidy-up or bin disposal; visibility and cooldown/cap limits.
2. **6C — Accidents and restoration:** rare, spatially plausible incidents
   tied to speed, bends and nearby models; condition states and repair costs;
   Hales can meaningfully restore damaged models, Wards manage real hazards.
3. **6D — Interactions and balance:** household response chains, contextual
   communication, multi-seed economy/fairness tuning, mobile/readability
   checks, and safeguards against incident/repair farming.
