# Pass 8D — Good fences make good neighbours

The Vintage town now has an optional **Neighbourhood Miniatures** drawer inside
the existing model-kit collection. It introduces four one-time purchases which
**snap between two close homes**, never consume an ordinary buildable square,
and never take cars off the road.

## Player experience

1. Finish founding the six families. Open **Fences, gates & gardens** beneath
   the usual model kits, or use the shortcut inside any family's details.
2. Choose a pair of occupied households with a shared area of land. The pair
   must be 2–4 Manhattan squares apart and have no road or third home directly
   between their house centres. The miniature appears exactly at the midpoint.
3. Choose a miniature. Both families' current, new and changed irritation per
   completed circuit are shown **before** any coins are spent. This is the
   exact same capped model the running simulation uses.
4. Purchase or replace the object. Replacement is charged at full listed cost;
   removal is permitted but does not refund money. All costs are counted as
   miniature purchases, not recurring cashflow. Resuming a paused town is
   required before installation or removal.

The miniature catalogue is an optional drawer within the existing shop rather
than a new meter or permanent panel. Native buttons, pressed states, focus
restoration and visible confirmation are retained, with a compact scrollable
layout for short or phone screens.

## Costs and relationship effects

Costs are a single up-front purchase. Where neighbours have a positive
relationship, the current negative irritation change is a *comfort benefit*.
Where they dislike one another, the positive irritation change is *tension*.

| Miniature | Cost | Tension remaining | Friendliness remaining |
| --- | ---: | ---: | ---: |
| Picket Fence | 24 | 50% | 80% |
| Stone Boundary | 38 | 30% | 60% |
| Shared Garden Gate | 32 | 105% | 140% |
| Garden Hedge | 29 | 65% | 90% |

A hedge installed near an **actual road bend** adds +0.35 irritation/circuit
to the Wards, if their house is one of the two gardens. This is a *concern*
about sightlines, not a made-up crash event or an unexplained reduction of the
Safety meter. A gate is therefore usually good for friends, but need not help
conflicted families.

There is **one boundary object per unordered pair**. These modifications
remain *directional*, and every household's complete neighbour effect remains
capped at ±2.50 irritation/circuit, after all relevant contributions.

## Existing shop miniatures now have contextual roles

The exact same pure relationship calculator uses the existing functioning
and reasonably cared-for miniatures:

- **Park Bench:** within two squares of the midpoint, brings an additional
  −0.30 irritation/circuit to positive interactions involving the Bells or
  Marshes (a place to meet).
- **Oak Tree:** near Bells–Millers, softens the Bells' delivery tension by 20%.
- **Speed Sign:** near Ward–Finch gardens, reduces the Wards' concern about
  the Finches by 30%. The Finches still have their ordinary per-road-tile
  preference about speed signs, so helping the Wards need not help them.

A broken or bare-care model does not provide these extra contextual benefits.
A standard model's existing road-tile effects, upkeep, maintenance, weather
events and driving interactions are unchanged. The ordinary model purchase
inspector now additionally shows *only the incremental neighbour component*,
so it does not confuse existing per-tile effects with new per-circuit effects.

## Engineering contract

- `src/game/boundaries.ts` contains the immutable miniature catalog, safe
  midpoint/road-crossing validation and pure contextual modifiers.
- `src/game/founding.ts` remains the shared directional per-circuit comfort
  calculator for founding and live play (with optional boundary/model inputs).
- `GameStore.boundaryImprovements` is run-local and cleared by `newRun()`.
  Paused/out-of-phase/insufficient-funds/double-purchase requests cannot charge.
  Modifiers and installation previews are calculated using the **same source**.
- `TownScene` draws small etched miniature objects at pair midpoints on a
  dedicated non-interactive layer; placement does not affect tile occupancy.
- A departed household no longer contributes a social effect, even when the
  placed boundary remains as a quiet piece of scenery. No invented social
  bonuses, extra income or object collisions are generated.

## Next: Pass 8E

The next pass is **Living Environment & Final Polish**: deterministic
decorative grass, flowers, shrubs, family-specific garden props and small trees
appearing when homes settle; progressive civic landmarks; animation that feels
assembled from handcrafted miniatures; collision/placement-safe layering,
reduced-motion fallbacks, mobile polish and end-to-end balance checks.

Keep every free decorative element separate from paid kits and their Beauty,
Noise, Crime, traffic, finances and irritation effects. Validate space around
the new boundary pieces as part of 8E's layout/art audit.
