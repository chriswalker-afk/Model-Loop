# Household Improvements — Pass C: Integrated 1908 property artwork

Pass A established per-house boundary/garden ownership, their upkeep and
directional household effects. Pass B added the purchase and removal controls
to each household inspector. This pass finally **builds the improvement into
the visible property**, without returning to detached fence tokens.

## Rendering design

The new `src/ui/homeGroundsArt.ts` draws bespoke engraved architectural
features in the exact **140 × 148 SVG viewBox** used by the six original
houses. The player sees the same 59 × 70 world-pixel home footprint, original
position, hand-chalk line quality and muted ink/sage/brass palette.

Two coordinated, transparent illustration layers are integrated at the
house's existing origin:

- The **garden layer** is drawn around the ground plane and footing.
  A front garden has planted beds and a stepping-stone path; flower borders
  have stems and small flowers; a kitchen garden has two planted raised beds
  with rows; the patio/seating corner has flagstones and a bistro table.
- The **boundary layer** traces the front and receding left/right property
  edges with a gap for the front path. Picket fencing has detailed posts and
  rails, stone walls have capstones and masonry, hedges are clipped greenery,
  and a shared garden gate has an actual opening and little hinged gate.
  Its opening faces the closest compatible household on the left/right
  within the existing four-square neighbourhood radius, or the front
  path when there isn't one. This orientation is cosmetic, using existing
  preferences; it **does not** create pairwise ownership or extra social
  effects.

Both layers blend into the original building artwork at the same baseline
instead of being positioned as unrelated models between homes. A vacant
house keeps its installed features in a faded state, just like the house,
but has no care charges or social/environmental benefit while vacant.

## Performance and lifecycle

- Only **60 finite art variants** are cached: six families × eight
  improvements, with two additional gate orientations for each family.
- They are decoded **once** by Phaser during the scene preload, following
  the same approach as the existing house and model art.
- A single preallocated garden sprite and boundary sprite per home are
  kept across all state notifications, reused when a purchase changes the
  chosen artwork, and hidden when the slot is empty.
- A subtle 420ms fade connects the newly added feature with the
  foundation; reduced-motion users see it instantly.
- A newly founded empty road never has decorative paid grounds; a new
  run clears the two slots and hides their drawings.
- Artwork is bounded by the same 59 × 70 rectangle as its house,
  shares the same world origin and has no physics body, separate tile,
  traffic interaction or hitbox. The existing home-click target and
  household improvements UI are unchanged.

## Verification

`tests/home-improvements-art.spec.ts` validates the complete 60-art
catalogue as well-formed SVG with bounded viewBoxes and substantial
hand-engraved detail, proper friendly-neighbour gate facing, no visible
property upgrades before purchase, actual installed art and alignment,
replacement/remove behaviour, vacant-family fading and care rules, no
new model or road occupancy, reduced motion, and desktop/phone
screenshots under `test-results/visual-review/`.

Full smoke/regression tests still cover the founding prologue,
model placement, road geometry, traffic, house-selected UI and upkeep.

## Next steps

**Pass D — deeper household-specific effects.** Tune small, optional
interactions between completed properties and the existing mood/behaviour
system: gardens encouraging positive actions, private boundaries softening
conflict, gate visits for compatible neighbours, hedge sightline effects.
Keep event frequency and safety/accounting limits unchanged.

**Pass E — visual quality and balance.** Review actual screenshots at
desktop, compact and mobile scale, inspect dense/edge-of-road founding
layouts, balance property upkeep against per-lap earnings, test replacement
and abandoned houses over longer simulations, and refine the small
details so all styles remain distinct at the game's normal zoom.
