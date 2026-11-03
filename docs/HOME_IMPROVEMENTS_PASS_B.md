# Household Improvements — Pass B: Selecting, Buying and Caring for Homes

Pass A replaced free-floating pairwise fences with **one boundary slot** and
**one garden slot** belonging to each household. Pass B makes these real game
choices accessible from the selected house, while preserving the vintage
miniature shop and traffic gameplay.

## Player experience

Click any house on the town board (including its drawn roof), or select its
family's ticket below the board. The household inspector opens directly;
the competing tile inspector is dismissed. A new, prominent **Home & grounds**
disclosure appears just below the household mood. It starts expanded with
two compact subsections:

- **Boundary** — none / Low Picket Fence / Stone Boundary Wall /
  Tall Garden Hedge / Shared Garden Gate.
- **Garden** — none / Front Garden / Flower Border / Kitchen Garden /
  Seating Corner.

Each subsection shows the installed style (or that the slot is empty).
Expanding one displays four cards with their **full purchase prices,
recurring care cost and plain-English purpose**. Choosing a card is only
a free preview, never a purchase.

The detailed forecast uses the **same GameStore.previewHomeImprovement**
calculation as the purchase guard and live driving model. It includes
the owning household's capped irritation per circuit, any neighbours
whose comfort changes, the household's new care total and any local
beauty/noise/crime effects. Negative irritation deltas are explicitly
described as beneficial; the `±2.5`-per-circuit cap remains visible.

A dedicated **Add to home** or **Replace** button confirms the full-price
purchase. An installed feature has a separate **Remove** action, explicitly
without refund. Two categories can be held independently. These controls
never consume or block road grid squares.

## Economy and safety

All prices and rules remain in the Pass A authoritative catalogue.
Purchases call `store.installHomeImprovement`; removals call
`store.removeHomeImprovement`. No prices, guards or neighbour effects
are recalculated independently in UI click handlers.

The inspector shows **total home care per 20 simulated seconds**.
Care is charged through the existing income flow; it pauses with the game
and stops for vacant houses. Purchase buttons are disabled and explain
the reason when a family has left, money is insufficient, the game is
paused or the workshop is open. Historical purchases are never refunded.

## Accessibility and responsive UI

- The new disclosure uses native HTML `details`/`summary` so it works
  with pointer, keyboard and assistive technology without JavaScript timers.
- Option buttons are `aria-pressed`; the options live inside an accessible
  named group; the preview reason has `role=status`.
- The permanent disclosure/slot DOM nodes are not destroyed when cars
  advance. Forecast content is only replaced when materially changed;
  open subsections, panel scroll and keyboard focus survive changes.
- Mobile panels stay compact and scroll within their existing height.
  The normal model collection remains visible; no new permanent HUD.
- Reduced-motion preferences do not have preview or purchase animations.

## Scope / handoff

**Pass B does not yet draw installed fences and gardens.** This is
intentional, avoiding another disconnected overlay. The installed slot and
home inspector are already functional and show their real gameplay
consequences.

**Next: Pass C — visually integrate improvements into the house itself.**
Compose boundary edges and garden grounds around the same home origin used
by the existing miniature house illustration, while preserving grid
occupancy, foliage, local scenery, road clearance and reduced-motion
settings. The image must read as one continuous property, not a placed
object between houses.

Then continue to Pass D (deeper conditional effects and family
personalities) and Pass E (visual/balance polish).
