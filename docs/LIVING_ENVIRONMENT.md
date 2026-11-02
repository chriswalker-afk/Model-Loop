# Driver Behaviour System — Pass 1: The Living Environment

## What this pass adds

Passengers and drivers can now leave small, persistent changes behind in the
model town. The effects are game-state objects, not just one-frame visual
animations, and they influence future journeys. Every event records who
caused it and where it occurred.

The first vertical slice has three actions:

| Household | Event | Visual | Actual effect |
| --- | --- | --- | --- |
| Finches | Sharp turn | Tyre marks on road | −12 road Safety while the mark is present; slight additional irritation/noise locally |
| Bells | Care for a corner | Flowers on verge | +2 Beauty and slightly calmer journeys nearby |
| Millers | Discard packaging | Small paper litter on verge | −1 Beauty and slightly more irritation nearby |

This was the initial **Pass 1** vertical slice. The full set of twelve
actions is now implemented in Pass 4 (see below).

## Behaviour engine

- Seeded linear-congruential random number generator. Re-running an event
  scenario with the same seed and actions produces the same sequence.
- Pass 1 originally used an environmental chance of 35%. Pass 4 now uses
  a shared 44%-baseline behavioural opportunity across environment and traffic.
- Per-driver cooldown: 45 simulated seconds after a *successful* event.
- No more than 16 environmental patches globally; no more than 6 litter
  patches, 6 flower patches or 3 skid patches; a maximum of 2 per verge cell.
- Events cannot overwrite road scenery, houses or purchased miniature
  models. Skids appear on a road cell; decorations and rubbish are beside it.
- Effects expire naturally after 55 (skid), 75 (flowers) or 100 (litter)
  **simulated seconds**, with no unlimited build-up. Later passes will
  introduce cleanup and repair before natural expiry.
- The short recent-events history includes action, source household and
  affected cell. It is not used as a currency or a source of Blueprint rewards.
- Environmental time freezes whenever gameplay is paused, the Workshop is
  open, or the chapter is complete.

## Visibility and understanding

- The game draws faint, miniature-style packaging scraps, flowers and
  tyre scuffs in their actual affected locations, above the road and below
  moving cars. A new effect briefly pulses when it first appears.
- The existing footer notice attributes a change to the appropriate family.
- Hover a nearby tile to see the effect name, resident responsible, and
  remaining time; local Beauty/Noise and road safety update live.
- Each household notebook includes that family's most recent observed
  action, with the same subtle, everyday wording as existing dialogue.
- No extra always-on screen panel was added (important for compact screens).

## Road Safety and residents

Safety is no longer the inverse of average irritation. The initial town
starts at 90% Safety. Maintained lampposts, police boxes and speed signs
make modest contributions (capped at +10 total), while each active
tyre-scuff hazard removes 12 points. Care settings scale the positive
benefit. Litter itself does not increase Crime or reduce Safety.

Nearby environmental conditions change irritation as drivers pass them:
litter and tyre scuffs tend to irritate, while flowers slightly soothe.
The same environmental state drives both the road drawings and the values
in the inspector.

## Developer-only tools

When running the **Vite development server** (not the published production
build), use the browser console:

    __modelLoopDebug.seed(12345)
    __modelLoopDebug.trigger('litter', 2, 4, 3)
    __modelLoopDebug.trigger('flowers', 1, 9, 3)
    __modelLoopDebug.trigger('skid', 0, 12, 3)
    __modelLoopDebug.snapshot()

The coordinates for trigger are a **road tile**, not the roadside cell
which is selected deterministically by the event engine. The user-facing
site has no event-spawning controls.

## Pass 2 — Rubbish & Collection (implemented)

The 1908 boxed shop adds a cast-iron rubbish bin. Each placed bin has six
units of fill and catches litter from road cells within a three-square
Manhattan radius; the same radius is highlighted in the placement preview.
The first available, well-positioned bin catches an eligible discarded
item and fills by one; the litter never appears on a roadside cell.

Care determines catch reliability and collection timing: full 100% / 60s,
economy 70% / 120s, bare 25% / manual only. Routine care bills remain
3, 2 or 0 coins per 20 seconds; actual collection is billed separately,
using 4 + 2 per item and an extra eight coins at full capacity/overflow.
All collection expenses feed the existing rolling sixty-second net Income,
not the running savings total. Fully serviced bins return to zero fill.
Automatic collection still services a bin if the town is temporarily
in debt, avoiding permanent overflow. Manual collection requires adequate
coins.

When full, a bin stops catching. The next eligible litter event can make it
overflow, leaving visible packaging and a red warning. An overflowing bin
also reduces local Beauty and raises Crime; these penalties disappear when
the bin is emptied. Previously discarded litter remains on the roadside
until it naturally expires or the player manually clears it for six coins.
No collection action can erase event history or charge twice for an empty
bin.

The resident model remains behavioural rather than moral: all families
occasionally generate ordinary rubbish, while the Millers remain more
prone to delivery-packaging incidents. A bin is a town-management tool,
not a personality type.

## Pass 3 — Real Traffic Behaviour (implemented)

The town now has one shared circular-traffic simulation rather than six
independent vehicle animations. `advanceTraffic` in traffic.ts uses
physical forward distance, a 38-pixel minimum gap, braking based on
available headway and iterative constraints that propagate sudden stops
to every car behind. It handles the wrap from the final road tile back to
the first, and queues dissolve as the leader begins to move again.

The existing home-return lifecycle is retained without any extra payouts.
A resident's car leaves the road after completing the paid circuit,
travels home, stays a while, and attempts to rejoin only when an empty
58-pixel gap is available in both directions. Departure reserves the
entry point during its visible journey from driveway to road, preventing
another car from driving through it.

Initial traffic incidents: **Bells** occasionally stop to admire the town
(4.2 seconds); **Wards** hesitate (3 seconds). Each resident has a seeded
event offset per circuit, an opportunity/chance depending on their mood
and nearby speed-sign reassurance, and a 65-second personal cooldown.
Only one stop can be active on the loop, separated by at least 15
simulated seconds; they can always clear. Full household action pairs
remain for Pass 4.

Following-car queueing adds a small amount of irritation proportional to
*real lost time*, not arbitrary lap penalties. Longer physical circuits
mean lower *lap earnings per minute* and a lower rolling net Income.
Queued cars temporarily increase nearby Noise and decrease real road
Safety. Car tail-lamps illuminate while braking; an active stop shows a
small roadside label and waiting cars have subtle rings. The existing
footer shows a compact traffic indicator only while affected.

The dev-only console exposes `__modelLoopDebug.trafficStop(1, 4.2)`
and `__modelLoopDebug.trafficSnapshot()` for deterministic
browser verification. Regression tests check collisions/wrap, queue
formation and recovery, driveway merge safety, 1-paid-lap rules,
simulated-time pause and compact-screen feedback.

## Pass 4 — All six households have two-sided agency (implemented)

Every household now has **one helpful and one troublesome action**. The
driver gets **one** seeded opportunity on each circuit, replacing the old
independent environmental and traffic rolls. There is a 44% baseline chance
of an action when an opportunity is reached (the exact result is random but
reproducible using the same seed); successful acts trigger a 45-second
simulated-time cooldown.

| Household | Helpful | Troublesome |
| --- | --- | --- |
| Finches | Make space to let others pass; can shorten a jam | Take a corner too quickly and leave noisy tyre scuffs |
| Bells | Plant little flowers and improve nearby Beauty | Stop to admire a view and hold up traffic |
| Millers | Mend a worn stretch and clear tyre damage | Discard packaging, caught by an available rubbish bin |
| Marshes | Tidy a corner and collect litter | Stop to chat, forming a real queue |
| Hales | Restore an old roadside detail and improve Beauty | Put out a display that slows cars within two tiles |
| Wards | Guide cars through a difficult section and help clear queues | Hesitate in the road, causing others to brake |

Incidental rubbish can still accompany another family's troublesome
action (about 22% of those successful incidents). This is a **side effect
of the same event**, not a second independent behaviour opportunity. It
keeps collection useful without making the Millers the sole source of litter.

The positive and negative action share the same understandable personal
motivation without naming a psychological cause. The town changes visibly:
greenish etched courtesy arrows and guidance markers, mended road patches,
swept verges, little restored plaques and roadside displays. These share
the existing capped environment layer; results eventually fade. Cleanup
removes one *real* damaging effect. Helpful traffic acts can shorten a
temporary stop, not magically credit lap income.

**Mood sensitivity** operates after an event is possible. The probability
of a helpful act among incidents is 70% for irritation below 45, 50% from
45 to 71, and 30% from 72 upward, before local modifications. Even a
settled household can inconvenience the neighbours; an irritated one can
still lend a hand. The probability remains bounded (14–86%), while
the overall event opportunity remains capped (19–64%).

**Placement is a two-sided decision:**

- Speed signs discourage the Finches' hurried turns and the Wards' pauses.
- Lampposts and police boxes help the Wards feel ready to guide traffic.
- Trees encourage the Bells' flowers and the Hales' restorations.
- Benches encourage the Marshes to tidy, *and* to stop for a chat; the Bells
  similarly admire views more often.
- Police boxes reduce littering and roadside hold-ups without erasing
  ordinary household preferences.
- Bins catch real rubbish from new events and encourage tidying, but can
  still fill, overflow and need costly servicing.

The influence depends on upkeep: **full / economy / minimal** use the
same care preference scaling (100% / 60% / 20%) as household model reactions.
The system calculates a forecast directly from its actual probability
model; a collapsed "How this miniature changes driver habits" control
appears during placement previews without adding another permanent HUD.

A resident's notebook shows both possible habits and the most recent
attributed action, including traffic stops. Debugging the Vite development
build supports all twelve actions, e.g.:

    __modelLoopDebug.behaviourAction(2, 'mend', 4, 3)
    __modelLoopDebug.behaviourAction(3, 'tidy', 4, 3)
    __modelLoopDebug.behaviourAction(3, 'chat', 4, 3)
    __modelLoopDebug.behaviourAction(4, 'display', 4, 3)
    __modelLoopDebug.behaviourAction(5, 'guide', 4, 3)
    __modelLoopDebug.snapshot()

All dev-only controls remain unavailable in the published bundle.

## Pass 5 — Balancing, feedback and narrative polish (implemented)

The final pass consolidates Vintage tuning, verifies long-running seeded
sessions, reduces repeated environmental and traffic incidents, and gives
important feedback priority over routine lap payments without altering
the actual coin transactions.

Incidents now have brief contextual labels; bin interception or overflow
is readable by text as well as colour. Nonessential tweens respect
reduced-motion settings, and screen-reader announcements are separated
from constantly repainted meters and tiles.

Workshop fragments now arise at the real 25%, 50% and 75% milestones,
respond to visible model-building and resident experiences, and can be
re-read in a collapsed diary. A separate collapsed ledger allows players
to inspect total earnings, spending, bins and delays. No extra Blueprints
are awarded for causing or repairing damage.

See [Pass 5 balancing and accessibility audit](DRIVER_BEHAVIOUR_BALANCE.md)
for parameters, deterministic stress-test scenarios and remaining
playtesting questions.

## After the five driver-behaviour passes

The next project-wide work can focus on the actual post-war generation
and era transition, larger permanent heritage shelves, and release
quality checks with classroom-sized and mobile screens. These are
outside the current living-environment pass.

## Regression priorities

- Stable results from the same random seed.
- One opportunity per household per lap and cooldown compliance.
- Spawn limits and placement collision rules.
- Expiry, pause/freeze, reset and no event leaks between runs.
- Safety not changing when only resident irritation changes.
- Models, income, Progress, resident closures and miniature purchasing
  remain governed by the existing code.
- Phone/compact landscape layout still works without new permanent panels.
