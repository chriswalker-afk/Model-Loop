# Pass 8B — The first six arrivals

The playable Vintage run opens in **founding** mode (Pass 8A). All six homes
must be placed before the player can review and begin a working town.

## Player flow

1. Read the short 1908 introduction beside the empty road.
2. Choose any of the six engraved calling cards. On the first selection,
   a focus-managed dialog introduces that household's distinctive keepsake,
   memories, aspirations, anxieties and tentative neighbour preferences.
3. Choose their plot. Eligible roadside cells receive a soft outline.
   Hovering previews the matching house silhouette. Shift+click inspects a
   prospective plot, including distances and qualitative neighbour notes.
4. Place with a click, tap, the inspector's Place button, or arrow keys+Enter.
   A house rises into place and its ceremonial car arrives on the road;
   **it is not a real driving vehicle and never advances any game timer**.
5. Each family may be selected again and moved without cost or penalty.
6. Once all six have settled, choose **Review the founding town** to see
   each home's coordinates, move any house, or explicitly
   **Begin the Vintage Years**. Gameplay remains stopped until confirmation.

The founding dock preserves native button focus across hover updates;
dialog keyboard focus is trapped and restored. Escape dismisses an
introduction or review without paying or starting play. In reduced-motion
mode, home and car appearances are instantaneous.

## Content and implementation contract

- `src/game/founding.ts` is the single source for six individual arrival
  stories and **directional** lists of preferred and difficult neighbours.
  The lists are deliberate: one household may appreciate another without
  reciprocal affection. Each has a corresponding original keepsake SVG
  in `src/ui/foundingArt.ts`.
- `GameStore.foundingIntroId` and `GameStore.foundingReviewOpen` drive the
  same existing accessible modal system. Arrivals are remembered once per run.
- `GameStore.foundingRecentArrival` has a monotonic revision; Phaser listens
  for each placement just once. The short entrance uses a temporary visual
  image, **never** a traffic-solver vehicle. Normal car creation still occurs
  only on `beginVintageYears()`.
- The founding placement forecast currently reports plot validity, nearby
  households within Manhattan distance 4 and their qualitative impressions.
  **No neighbour irritation modifier is implemented in this pass.**
- The reference-town regression fixture remains test-only. Real new runs
  continue to open on the bare road.

## Next steps

**8C — Neighbour relationships:** use the directional affinities in
`founding.ts` to compute bounded proximity/irritation effects per completed
circuit, add numerically truthful founding and in-run forecasts, and connect
relationship comments to real events.

**8D — Neighbourhood improvements:** fences, gates, hedges and contextual
effects of existing objects, with a readable mitigation/benefit model.

**8E — Living surroundings:** deterministic decorative grass, flowers, shrubs
and trees after each arrival, safely layered outside paid placements;
emerging civic landmarks and responsive polish.
