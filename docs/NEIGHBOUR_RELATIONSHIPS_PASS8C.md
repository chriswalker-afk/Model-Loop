# Pass 8C — Living alongside each other

Neighbour relationships now have a real, small effect on irritation, without
adding another HUD meter. The same deterministic function powers:

- founding plot previews (including knock-on changes to settled families)
- the six-house founding review
- the selected family's existing household details
- the actual `finishLap` irritation change in the running simulation

## Direction and distance

The six canonical preferences are the lists in `src/game/founding.ts`
(`closeTo` and `uneasyNear`). They are *directional*: the Millers
appreciate the Wards' routines, but the Wards do not automatically receive
an equal bonus from the Millers.

Distances use **Manhattan distance between house plots**. Houses beyond
four squares have no direct neighbour effect.

| Distance | Preferred neighbour | Difficult neighbour |
| --- | ---: | ---: |
| 2 squares | −1.50 irritation/circuit | +1.80 irritation/circuit |
| 3 squares | −1.00 | +1.20 |
| 4 squares | −0.50 | +0.60 |
| Outside influence | 0 | 0 |

Valid home placement already prevents closer houses. A pair without a defined
preference is neutral (0), even when physically close.

The final **net per-family total is capped at ±2.50 per completed circuit**,
after combining every directional contact. Negative irritation is helpful,
positive irritation is troublesome. There is no recurring coin income or cost
attached to relationships, and no effect on Beauty, Noise, Crime or Safety.

## State and timing

- Family positions are always taken from the current run's `homeSites`.
  The historical home coordinates in `config.ts` are only a reference
  layout fixture for tests.
- Unplaced families are not predicted as settled neighbours. During Vintage,
  families who have moved away no longer contribute relationship bonuses or
  penalties, although their empty houses remain on the street.
- `GameStore.neighbourhoodFor(id)` exposes the current summary.
  `GameStore.previewFoundingHome()` uses the same pure calculator, compares
  old and new *capped totals*, and reports the resulting changes to every
  already-settled family. An invalid candidate has no numerical forecast.
- Effects are applied **once per completed circuit** in `finishLap`.
  They are not applied per tile, per frame, during founding, while paused
  or by ceremonial arrival animations. A household reaching 100 irritation
  on that circuit can depart, receiving no lap income.
- The first completed circuit may produce a short neighbour observation
  grounded in its actual living arrangement. There are no fabricated
  independent social-benefit events.
- Existing household mood warnings and economic/traffic systems remain
  operative. A neighbour bonus cannot cancel a collision, reverse a stop
  or override the other ways irritation changes.

## Future integration: Pass 8D

The next pass adds actual **neighbourhood improvements**:
fences / stone boundaries, shared garden gates, hedges and meaningful
contextual effects of existing models. Build this by extending the shared
`neighbourhoodSummary` calculation to account for the placed mitigation
objects, rather than adjusting irritation separately in `finishLap`.

Ideas to preserve: boundaries attenuate negative and *some* positive contact,
gates strengthen good contact, hedges soften noise but may reduce road
sightlines. Effects must be previewed accurately and remain directional
where appropriate. Fences/gates should snap to boundaries, not consume
ordinary roadside slots.

After 8D, **8E** supplies cost-free deterministic grass, small gardens,
trees, restored civic landmarks and final responsive polish.
