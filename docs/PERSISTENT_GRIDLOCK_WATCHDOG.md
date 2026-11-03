# Persistent traffic jams — second recovery repair

## Symptom
The original shared-driveway startup bug is fixed, but the game can still
show a persistent cluster of cars at the north edge of the Vintage road. The
traffic headway solver itself correctly refuses to drive through a stationary
car: the remaining issue is detecting and clearing a **persistent** blockage.

## Why the first marshal often never arrived
Pass 28 introduced a 10-simulated-second gridlock detector. Unfortunately,
every time **any household entered the road from a driveway**, or **any
bounded family stop** began, the detector reset the entire stationary-time
history. With a small six-family loop, both events are common. A traffic jam
could last indefinitely while the marshal's timer repeatedly started at zero.

A second case was a stranded passing-lane vehicle at a display or litter
obstruction. If its queue was short (or cars in the left lane were moving),
the original detector could decline to act even when that single vehicle had
been stationary longer than the threshold.

## Corrective behaviour

- Count persistent stalls **per active driving vehicle**. Temporary legitimate
  driveway reservations and household pauses *freeze* the watchdog rather than
  clearing everything it has observed.
- Actual motion above 2 world pixels per simulated second clears that
  vehicle's accumulated stalled duration. This is NOT a new speed limit, nor
  a reduction in legal car speeds. A car barely crawling across a square over
  tens of seconds still counts as effectively blocked.
- At least ten **unpaused, unreserved simulated seconds** of true standstill
  trigger a single deterministic recovery in a blocked convoy or an isolated
  obstructed passing-lane car.
- Prioritise actual invalid overlaps, then the stalled passing-lane blocker,
  then the lead immobilised driver rather than innocent followers.
- Existing traffic-marshal behaviour remains unchanged: return **one** car to
  its driveway through the existing cycle, without crediting a lap, income,
  progress, reputation or irritation benefit. It must merge safely to return.
- The scene's developer-only `trafficSnapshot()` now reports both nominal
  and **actual** solver speed, stalled seconds and a recovery count, so
  future screenshots can be diagnosed against actual vehicle behaviour.

## What is deliberately unchanged

No new collisions, unsafe lane crossings, instantaneous passing, slowdown
penalties or permanent extra HUD. Real congestion and brief family stops
remain part of the game. The recovery only deals with vehicles that have
effectively ceased progressing.

Regression tests cover alternating short driveway reservations, active family
stops, recovering an isolated passing-lane car, actual motion resetting the
watchdog, and diagnostics from a real running Phaser scene.

## Hand-off to Pass 8E

The decorative scenery feature remains in its own 8E development branch.
Landscaping must not alter road geometry, car behaviour or the watchdog.
Once this PR is merged, update the 8E branch from main before completing the
scenery and final visual/balance checks.
