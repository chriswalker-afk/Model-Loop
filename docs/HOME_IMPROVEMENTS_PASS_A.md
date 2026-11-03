# Household Improvements — Pass A: System Redesign

## What changed

The detached **“Fences, gates & gardens” pair shop** has been retired. A home
improvement now belongs to **one specific household**, not to a pair of homes
and not to a freely placed roadside tile.

The separate shop drawer, between-home miniature renderer, paired-selection
actions, obsolete boundary asset and pair purchase API are removed. The
ordinary boxed model shop and original founding/household inspector remain
available. **Pass A is the underlying system, not the new purchasing UI.**
Players will be able to buy these from the selected home in Pass B.

Each of the six homes supports:
- up to **one boundary style**: none / Low Picket Fence / Stone Boundary Wall /
  Tall Garden Hedge / Shared Garden Gate;
- up to **one garden style**: none / Front Garden / Flower Border /
  Kitchen Garden / Seating Corner.

No two-house selection, no reliance on a particular pair having uninterrupted
ground, no extra permanent HUD meter.

## Property catalogue and cost of care

All figures are tunable single-source definitions in
`src/game/homeImprovements.ts`. Care bills recur every **20 simulated
seconds** (the existing workshop servicing interval).

| Category | Improvement | Buy | Care / 20 seconds | Core purpose |
|---|---|---:|---:|---|
| Boundary | Low Picket Fence | 24 | 1 | 45% reduction of received neighbour tension; slight loss of warmth |
| Boundary | Stone Boundary Wall | 38 | 2 | Strong privacy (65% tension reduction); more separation from friends |
| Boundary | Tall Garden Hedge | 29 | 2 | Buffers noise and arguments, adds greenery; sightline concern near bends for Wards |
| Boundary | Shared Garden Gate | 32 | 1 | Amplifies pleasant neighbour relations; limited help with friction |
| Garden | Front Garden | 28 | 2 | Local beauty +2, less noise, irritation −0.22/circuit |
| Garden | Flower Border | 20 | 1 | Local beauty +3, irritation −0.12/circuit |
| Garden | Kitchen Garden | 32 | 2 | Modest local beauty, irritation −0.18/circuit |
| Garden | Seating Corner | 34 | 2 | Better friendly neighbour interactions, irritation −0.18/circuit, slight extra noise |

The feature's environmental bonuses are **local to the home and immediately
adjacent squares** in the existing tile inspection. They do **not**
create new models, occupy a grid square, block roads, modify the driving
collision solver or award artificial income. A hedge's Ward sightline
concern is an irritation effect rather than a fabricated accident.

Neighbour effects retain the directional 8C system:
- A family's own boundary fully modifies the irritation it experiences
  from each nearby neighbour.
- A neighbour's boundary also partially changes the relation (30% of its
  factor delta). Thus boundaries belong to individual owners but are not
  invisible walls with no effect on others.
- Installed gardens contribute a small **personal** per-circuit comfort
  amount once, not once per nearby household. Seating corners can also
  amplify warm interactions.
- The existing context-dependent roadside bench, tree and speed-sign
  interactions still apply.
- Total relationship-plus-garden irritation stays capped at ±2.5/circuit,
  and the exact same pure calculator drives previews and real circuits.

## Economy and fairness

- Purchases require a present, occupied household, an installed roadside
  home, sufficient coins and an unpaused, active generation.
- Replacing a style costs the full new price, replaces only its category
  and starts the new item’s care timer at purchase time +20 seconds.
- Removing either category costs nothing, refunds nothing and prevents
  future bills. Vacant homes can have an old improvement removed.
- If the family moves away, the installed item remains in data but stops
  generating a town service bill and no longer helps neighbours or produces
  a local environmental bonus. Removing it is still allowed.
- Scheduled care is charged through `tickEconomy` using the same ledger as
  ordinary workshop models. Service expenses update `cashflow`,
  `ledger.carePaid`, net income and the displayed 60-second income history.
  No new currency or upkeep meter is introduced.
- Pausing, entering the inter-generation workshop and founding block new
  charges and purchases. Starting a new generation clears all purchased
  property improvements, just as it clears road models.

## New engine contract for Pass B

`GameStore` now exposes:

- `homeImprovements` — installed properties for the current run;
- `getHomeImprovement(residentId, slot)` — one home's boundary or garden;
- `homeUpkeepFor(residentId)` — current per-care-cycle bill;
- `previewHomeImprovement(residentId, kind)` — eligibility, cost, old/new
  owner upkeep, local environmental changes and *capped* directional
  forecasts for affected families (no mutation);
- `installHomeImprovement(residentId, kind)` — validated purchase or
  full-price category replacement;
- `removeHomeImprovement(residentId, slot)` — removes a feature without
  refunding the original purchase.

`HOME_IMPROVEMENT_CATALOG` is the single authoritative catalogue. Keep
selection/purchase against these public methods rather than reconstructing
eligibility, prices or forecasts in the UI. The engine is deterministic
and ready for household controls; no player-facing purchase UI has been
added in Pass A.

## Next implementation steps

**Pass B — Household UI:** Selecting a house opens an *Add to this home*
panel with separate boundary and garden slots, prices, upkeep totals,
installed-feature actions, and compact, readable forecast deltas. Native
accessible buttons and clear remove/replace choices. No pairwise selection.

**Pass C — Integrated property artwork:** Draw paid boundaries as property
edges belonging to the house, and gardens as continuous grounds connected
to the house and its 8E foliage. No separate hovering miniature between
homes. Respect the grid, movement, scenery, accessibility/reduced-motion,
road boundaries and model placement.

**Pass D — Expanded effects:** Add (only after the visual/UI model is stable)
any deeper event, safety and household-specific behaviour modifiers through
the same underlying ownership structure.

**Pass E — Balance and visual polish:** Test upkeep affordability, neighbour
caps, household departures, realistic traffic and varied layouts; perform
phone and reduced-motion QA.

The 8D documentation remains as historical rationale only, not the current
feature specification.
