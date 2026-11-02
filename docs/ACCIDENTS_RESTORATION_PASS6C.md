# Pass 6C — roadside accidents and restoration

This pass gives the first Vintage generation *recoverable physical damage*
without introducing arbitrary fines or vehicle-on-vehicle crashes. The
intended experience is a short readable incident: an adventurous or hurried
driver clips a miniature on the actual verge, the object visibly breaks or
cracks, neighbours respond, and the player decides whether to repair it.

## How a collision can happen

Every moving car checks impact risk only **when crossing an actual road
tile**, and only while driving in the normal **left-hand running lane**.
A car changing lanes, safely passing on the right, under a stop, parked for
an activity or going too slowly cannot trigger an impact.

A purchased miniature must be **immediately adjacent to that exact road
tile on the driving-side left verge**. A placed item a few squares away,
on the wrong side, or beyond the road cannot be hit. This is a deliberate
roadside-skid model, not a simulation of car-on-car contact.

The seeded chance (up to 1.2% at an eligible crossing) depends on:
- **Actual physical speed** after speed signs, corner preferences,
  real queues and local obstructions; below 48 world units it is zero.
- **Approaching a bend**, with greater chance than on a straight.
- **Visibility/obstruction** near a tree, display, scuff or litter.
- **Safety protections** such as a functioning lamp, maintained sign
  or police box.
- **Driving personality**: the Finches are more adventurous; the Wards
  leave more margin. All drivers still obey universal hard bumper gaps.

This is deliberately rare. The incident engine limits two concurrent
scenes, with 34-s global, 72-s per-driver and 85-s per-model cooldowns.
The probability and timing come from an independent deterministic
random stream, not Math.random() or frame rate.

## Three physical conditions

A miniature's condition is separate from its chosen *care level*:

| Condition | Appearance | Benefits and bills |
| --- | --- | --- |
| Intact | Normal drawing | 100% of maintained effects; usual upkeep |
| Damaged | Noticeable pencil crack and amber marker | 50% of Beauty/Noise/Crime, household comfort and sign effects; normal upkeep |
| Broken | Darkened, toppled debris, red marker | Zero local benefits; speed signs ineffective; broken bins cannot intercept rubbish; regular upkeep paused |

A fresh impact usually damages an intact miniature, with a smaller
probability of breaking it outright. A second impact on an already
damaged miniature breaks it. Accidents also cause modest extra
irritation for the involved resident.

A **16 simulated-second accident scene** slows local traffic and lowers
temporary Safety; road markings and a brief impact pulse show the location.
The disrupted road clears automatically, but actual model damage does
**not** expire on a timer.

## Recovery is meaningful

Click any damaged or broken miniature to see **Condition**, the reduced
effects and an accessible **Repair miniature** button:

- Damaged: around 28% of the original purchase price, minimum 8 coins.
- Broken: around 58% of the purchase price, minimum 14 coins.
- Repairs restore an object directly to intact. The cost is a real
  cashflow outflow, not a new reward, and cannot create coins, circuits,
  Progress or Blueprint bonuses.
- Repairs require sufficient coins and cannot be triggered during pause
  or a workshop overlay.

The **Hales** no longer merely create an abstract "restored" label if an
actual model nearby needs care. Their helpful roadside action and heritage
visit restore one condition step: broken → damaged or damaged → intact.
With nothing damaged, their familiar heritage action still makes sense.

The **Wards** may shorten an active roadside accident when guiding
traffic or finishing a safety round, without instantly repairing the
object. Guidance retains its existing effect on traffic.

## Safety and testing contract

- Stable seeds and deterministic tie-breaking.
- No collisions without a real eligible left-verge purchased miniature.
- Safe overtaking, lane transitions, parked activities, driveway
  reservations and slower/stopped vehicles remain protected.
- No extra ambient litter is added by an accident; Pass 6B still
  attributes scraps only to food and packaging activities.
- No model can provide a broken effect. Broken bins do not catch scraps
  until repaired. Broken speed signs do not control speed.
- Money never increases because of crashes or repairs; the standard
  accounting invariant remains valid for long seeded runs.
- Scenes expire and are cleared on reset/end-of-run; model damage remains
  until repaired or assisted by the Hales within that run.
- Paid repair buttons and incident details are visible **only in the
  clicked inspector**, not as a permanent intrusive HUD.

Test-only Vite developer hooks:
- debug.impact(resident, roadX, roadY, modelX, modelY, 'damage'|'break')
- debug.snapshot().accidents, .activeAccidents and .modelConditions

## Next: Pass 6D — neighbourhood interactions and final balancing

Link actions between households: an incident could be noticed by the
Wards, lead to a Hale restoration visit, and make the Finches more careful
for a short time. Calibrate actual incident frequency, repair affordability,
traffic delays, model value and ending balance over many seeds, then polish
notices, mobile inspection and reduced-motion effects. Avoid using repairs
to farm rewards and never make the game feel punitive through arbitrary
losses.
