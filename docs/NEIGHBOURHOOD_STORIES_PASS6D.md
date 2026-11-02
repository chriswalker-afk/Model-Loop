# Pass 6D — neighbourhood stories and balance

Pass 6D connects previously isolated events into small, genuinely local
chains. The six households still have distinctive motivations, and the
town's existing shop, safety rules, paid repairs, model care, one ordinary
action opportunity per lap and loop income remain the foundation.

## A story must have a physical beginning

A chain originates from an event that **actually happened**:

| Cause | Who may notice it later | Material result |
| --- | --- | --- |
| A car clips a real miniature | Wards driving past the actual corner | The road is checked; an *active* incident can clear sooner |
| The same damaged miniature | Hales driving past it | One condition level restored, at most once per incident request |
| A picnic, gathering, lunch or delivery leaves real scraps | Marshes driving past the litter | Actual wrapper removed, without magically filling a bin |
| Bells finish an actual sketch | Marshes driving past the art | A positive note and small gratitude; sketch remains visible |

The origin, optional follow-up and any resulting thanks share the same
story ID. The interface can therefore tell what happened in order, not
just list disconnected accidents, helpful acts and litter patches.

These are small *responsive moments*, not a second automatic roulette
of official household actions: they do **not** create lap income,
Progress, Blueprint rewards, extra behaviour opportunities or
additional purchased models.

## Spatial and temporal safeguards

- A possible responder **must be driving on the left running lane** and
  actually cross a real road tile within one grid cell of the location.
  Passing-lane cars, lane changes, parked cars, stopped cars, paused
  games and workshop overlays do not qualify.
- Every request waits at least two **simulated seconds** after its cause.
  Only then does a seeded, non-guaranteed, family-specific chance apply.
- A family can make only **one spontaneous response per 64 simulated
  seconds**, with a cap of nine pending requests and eighteen history
  notes. Old invitations expire; an unrelated site is never chosen.
- A paid player repair or cleanup cancels the unnecessary invitation.
  Broken models cannot generate phantom benefits. A Hales visit can
  repair only the *specific* damaged miniature, not a random object.
- Existing ordinary Hales, Wards and Marshes helpful actions can resolve
  the same request, with no extra response roll or reward. One incident
  cannot be repaired twice through a duplicate request.
- A neighbour acting on a genuine need produces only a small reduction
  in the source household's irritation (0.38) and an attributable
  remark. The player must still maintain the street.
- After a roadside impact the involved driver cruises cautiously for
  26 simulated seconds: the Finches use 82% of their ordinary speed
  while others use 90%. Hard safety gaps, signs and overtaking still
  govern all movement.

## Balancing levers

| Follow-up | Chance per eligible road-tile crossing | Expires after |
| --- | ---: | ---: |
| Ward safety visit | 46% | 54 seconds |
| Hale repair | 19% | 150 seconds |
| Marsh cleanup | 28% | 130 seconds |
| Marsh appreciation | 32% | 110 seconds |

These probabilities are *not* guaranteed occurrences. They require the
actor to reach the site in the available time and obey the individual
cooldown. Lower repair probability protects the player's paid-repair
choice; protection and slower driving still lower accident risk.
All seeds are reproducible and the engine has its own random stream.

### Test and monitoring plan

- Use multi-seed comparisons of fast, exposed corners against slower,
  protected corners. Risk should be meaningfully lower with thoughtful
  placement, not always zero.
- Use the full long seeded *traffic + economy* simulations to confirm
  money conservation, no free repairs, bounded incidents/requests and
  no indefinite queues. Run the same post-accident caution speed factor
  in the headless solver and the real Phaser scene.
- Verify collision → Ward → Hales, picnic → real litter → Marsh cleanup,
  sketch → neighbour appreciation, and cancellation after player repair.
- Check focus preservation on expanding clicked-tile notes, screen-reader
  announcements and narrow mobile/laptop displays.
- Keep the concise summary in the optional workshop figures; shared
  moments appear only on an opened household or clicked square.
- Responses render a tiny chalk pulse, respecting reduced-motion
  preferences, not an intrusive overlay.

## Next project milestone after 6D

**Pass 7 — playable-generation audit and era progression planning:**
play full Vintage runs on desktop and phone, review difficulty and
accident frequency from actual play sessions, check restart/legacy
behaviour and entry points, then plan the next generation. This is
also the right time to select initial post-war models, branching
workshop choices and the heritage shelf, without mixing an entirely
new era into the 6D balance pass.
