# Traffic gridlock recovery — pre-Pass 8E

## What went wrong

The six household homes are now placed freely by the player. Two valid,
well-spaced houses can nevertheless **share a single roadside entry square**:
for example, plots (7,1) and (7,3) both connect to (7,2).

Previously the town created **all six cars as already driving** at the moment
Vintage began, each at its own first adjacent road square. Two cars at the
same start index occupied the same position in the same lane.

The road solver correctly forbids overlapping cars from moving through one
another. For two cars at exactly the same position, the gap ahead is zero in
both directions: both remain stopped indefinitely, and queueing cars behind
them can appear to lock the entire loop. The founding grid and traffic
simulation therefore need a safe handover.

## Main correction: safe driveway departures

- `planInitialRoadEntries` gives the road only to households with at least
  `TRAFFIC_MERGE_GAP` (58 world pixels) from every other initially admitted
  car, including across the loop seam.
- Any household whose road entry would overlap now **starts at home**, ready
  to depart as soon as the existing live `canReserveRoad` rule finds a safe
  gap. The animation follows the existing at-home → departing → driving
  sequence; cars remain left-hand drivers.
- This does not restrict where the player may place the houses, change
  founding preferences, occupy extra land or charge a coin.

## Backstop: a traffic marshal

A separate, deterministic `TrafficGridlockWatch` checks the actual movement
results. It does not run while paused, while an ordinary bounded family stop
is active, or when a normal driveway reservation is using the road. It acts
only after **10 simulated seconds** of genuine stationary congestion, when
two or more cars occupy the same lane position or a convoy is immobile with
no active pause.

When that happens the miniature traffic marshal guides **one** blocking car
back to its driveway. The car loses its incomplete circuit; it receives no
coins, progress, lap count or relief to its irritation, and it must re-enter
through the same safe driveway reservation rule. The existing notice system
gives a short in-world explanation. Ordinary queues and overtaking remain
subject to the same collision distance and speed limits.

This is a rare recovery fallback, not a new lucrative event or a way for cars
to teleport past one another.

## Verification

New tests cover identical and neighbouring road entry cells, launch
reservation fairness, rejoining in the actual Phaser town, circular
overlapping cars, non-recovery during legitimate stops/driveway reservations,
and a persistent passing-lane obstruction. All existing traffic,
left-hand-passing, collision, model-shop and town-balance tests should remain
green before merge.

## Remaining work

After this patch is merged, begin **Pass 8E — Living Environment & Final
Polish**: decorative grass, flower patches, family possessions and small trees
appearing after each founding placement; gradual civic landmarks;
reduced-motion support; model placement/collision safety; and a final
responsive/balance audit. Keep decoration entirely separate from the
economy and driving simulation.
