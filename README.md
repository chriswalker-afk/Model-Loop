# The Generational Cycle

*A little town. A lasting legacy.*

A miniature town-building roguelite about generations of fathers and sons making models together. Cars belonging to six households circle an irregular, grid-aligned road, generating coins and getting irritated by their surroundings. When too many houses close, the run ends, but permanent Blueprints persist.

## Tech stack

This game is initialized using the official [Phaser + Vite + TypeScript template](https://github.com/phaserjs/template-vite-ts), retaining the Phaser 4 dependency, starter TypeScript settings, production/development Vite configurations and MIT license.

- Phaser: grid, road, animated miniature vehicles and chalkboard scenery.
- TypeScript: traffic, residents, irritation, model purchasing and progression.
- HTML/CSS: status meters, packaged model shop and workshop overlays.
- Local storage: permanent Blueprints and workshop upgrades.
- GitHub Actions + Pages: build checks and hosting.

## Run locally

Node.js 22 recommended.

~~~bash
npm ci
npm run dev
~~~

Run validation and preview:

~~~bash
npm run check
npm run preview
~~~

## First playable slice

1. Vintage, 1908: a complex road loop on a 24 x 12 square grid.
2. Six old-fashioned cars tied to six named households.
3. Traffic earns coins and Progress, but irritation accumulates during journeys.
4. Six boxed models with illustrated transparent windows, costs and environmental effects.
5. Buy a model by selecting its box and placing it on an empty square next to the road.
6. Inspect square Beauty, Noise and Crime values on hover or selection.
7. Three home closures end the run; filling Progress completes the Vintage chapter.
8. Both outcomes award permanent Blueprints. Starting-coin and patience upgrades are purchasable between runs.

This is a prototype vertical slice rather than a complete multi-era release. Later eras, branching family stories, legacy model shelves, richer traffic, model synergies and final artwork are future passes.

## How to use the miniature shop

The model shelf is docked below the town and stays visible while you play.

1. Choose a boxed miniature. Its model rises inside the window to show it is selected.
2. Hover an empty square beside the road. The ghost model, affected-area overlay,
   Beauty / Noise / Crime before-and-after values, and estimated irritation impact appear.
3. Click to buy and place. The selected box returns to the shelf and the money is charged.
4. Alternatively, **drag a box onto a square** with a mouse, or tap a box and then
   the board on touch devices.
5. Press **Escape** or **Return to box** to cancel. After selecting a model,
   **arrow keys** choose squares and **Enter** places the miniature.
6. Existing houses, trees, landmarks, roads and purchased miniatures cannot overlap.

The irritation estimate is an approximation **per completed circuit**, before
individual household temperament. Every household drives the same road loop.

## Adaptive screen layout

The Generational Cycle adjusts to screen width **and** available height, including
portrait/landscape rotation and browser-window resizing.

- **Large desktop:** town, household strip and model kits form a single-screen
  composition, with floating inspection panels inside the board.
- **Compact laptop / tablet / short landscape:** the HUD reflows, the board
  retains its natural aspect ratio, and the main content can scroll vertically.
  The kit dock and household strip remain available at the foot of the screen.
- **Phone:** the town remains at a practical viewing size and can be **swiped
  left/right** rather than compressing every square into an unreadable grid.
  The model shop scrolls sideways; tap a miniature and then tap a square to
  place it. Swiping no longer causes accidental purchases.
- **Care panel and resident notes:** these move below the board on smaller
  screens instead of obscuring the street.

The Phaser canvas uses FIT scaling and an observed viewport size so clicks,
tap positions and placement previews continue to match visible squares after
the browser is resized or the device rotated. No manual zoom or settings
change is required.

## The six household habits (Driver Behaviour Pass 4)

The Finches, Bells, Millers, Marshes, Hales and Wards now each have a
*helpful* and a *troublesome* roadside action. Mood and maintained model
placement influence the chance of each, but neither outcome is guaranteed.

Residents can now give way, plant flowers, mend tyre damage, tidy litter,
restore old roadside details and guide traffic. They might also skid,
admire something long enough to delay cars, discard packaging, stop for
a chat, set up a display that slows passing cars, or hesitate before
continuing. These actions affect the actual environment, car speeds,
household irritation and Safety. They are visible on the board as
small chalk-and-miniature traces, not merely changes to a meter.

Open a household to see its two ordinary habits and latest action.
During model placement, the optional **How this miniature changes driver
habits** preview explains which families are likely to be helped or
inconvenienced. Care level reduces these influences, giving each purchased
model another meaningful long-term trade-off.

See [Living Environment](docs/LIVING_ENVIRONMENT.md) for the full
twelve-action table, odds, mitigations and reproducible test hooks.

## Living traffic & real queues (Driver Behaviour Pass 3)

All cars now share the same physical road. A passing vehicle must keep a
safe gap from the vehicle ahead, including when a car stops unexpectedly
or approaches from around the loop's wrap-around point. Slowing at a
maintained Speed Sign can generate a genuine tailback rather than only
changing a displayed value. Cars brake and subsequently accelerate as the
queue clears; red tail-lamps and small chalk rings make waiting visible.

The Bells sometimes stop for a little look at the town, and the Wards
sometimes hesitate over a tricky bit of road. These events are seeded,
bounded to a few seconds, and restricted by cooldowns and one event
opportunity per circuit. While one road stop is active no second stop can
start. The other families' helpful and troublesome driving acts are
scheduled for Pass 4.

A queue reduces lap frequency, which directly reduces earned coins per
minute, and waiting adds modest irritation. Nearby traffic makes local
Noise and road Safety worse while it lasts. There is no arbitrary "traffic
tax": the only earnings are still from completed circuits, followed by
the existing journey home and a short visit. Drivers departing their
homes wait until there is a safe gap before reserving the driveway exit.

A brief traffic label appears on the road and in the existing footer
only when an incident or queue is happening. Household notes display time
actually spent delayed. The game still fits phones and compact laptops.

For repeatable local development tests, open the Vite dev server and
call the following in the browser console:

    __modelLoopDebug.trafficStop(1, 4.2)
    __modelLoopDebug.trafficSnapshot()
    __modelLoopDebug.snapshot()

These developer controls are stripped from the production build.

## Rubbish bins and collection (Driver Behaviour Pass 2)

The Vintage model-kit shelf now contains a **sixth boxed miniature: the
Cast-Iron Rubbish Bin**. It costs 30 coins, covers road squares within a
Manhattan radius of three, and holds six pieces of rubbish. Collected pieces
do **not** appear as litter beside the road, but the visible level gauge
fills as the residents use the bin.

At full care the bin reliably catches litter, charges 3 coins every 20
game seconds, and receives automatic collection every 60 game seconds.
Economy care reduces upkeep to 2 coins every 20 game seconds, catches
about 70% of rubbish, and collects every 120 game seconds.
Minimal care has zero routine upkeep, about 25% reliability and no
automatic collection.

**Collection costs extra:** emptying costs 4 + 2 times the number of items,
plus a surcharge of 8 coins for a completely full or overflowing bin.
A bin that fills up stops catching rubbish and visibly overflows; nearby
Beauty falls and Crime increases until it is serviced. Manual collection
requires enough coins. Automatic collection happens even during a
temporary debt and appears as a negative flow in Income. Select the bin
to change its care level, see the fill gauge and choose **Empty now**.

Rubbish that was already left on the road is not retroactively collected
when a bin is placed. Inspect a rubbish-affected square and choose
**Clear litter** (6 coins). Overlapping bins can share demand, so a
second bin continues collecting when the first one is full.

Read [the living-environment design](docs/LIVING_ENVIRONMENT.md) for
testing details and remaining development passes.

## The living environment (Driver Behaviour Pass 1)

Residents now occasionally change the roadside while completing their
circuits. The Bells leave little flowers, the Millers sometimes leave
packaging, and the Finches can leave tyre scuffs after a sharp turn.
These details appear on the board, influence nearby residents and local
conditions, and fade naturally. Select an affected square to see who caused
the change and how long it will remain. **Safety** now reflects actual road
hazards and maintained protections, not how irritated households feel.

These events are deterministic when run with the same seed, limited to one
opportunity per circuit, and capped to prevent visual clutter. See
[Living Environment: rules, testing and next passes](docs/LIVING_ENVIRONMENT.md)
for the full system and development-only event triggers.

## Compact landscape windows

A short but fairly wide browser window (for example **1266 × 548**) is
treated differently from either a full-size desktop or a phone. The town
occupies the main area, the model-kit collection becomes a **scrollable
vertical shelf on the right**, and the household list sits beneath the town.
Kits are arranged as legible horizontal display boxes with large miniature
windows rather than tiny cards compressed into a short bottom dock.

The empty tile inspector is hidden in this layout; it appears automatically
when a square is inspected or a model needs maintenance. Cars, prices,
progress and resident preferences are unchanged. This layout is selected
automatically for browser viewports at least 900px wide and 500–850px tall.

On wider/taller screens the original horizontal boxed-model shelf remains;
on phones the road can still be panned horizontally. A resize or rotation
reflows the UI without restarting the run.

## Money, maintenance and traffic

**Coins** (the balance in the top-right corner) are available savings. **Income**
is different: a *signed net flow over the most recent 60 game seconds*.
It shows actual lap earnings minus recurring maintenance, never the price
of building models. The Income bar fills to the right for a surplus, or
to the left for a deficit. Income can rise or fall even when coin savings
are high; spending coins to buy a model does not count as a recurring loss.
Cars earn coins **only when a complete circuit ends**. A small gold-coin
pop-up appears; the resident then returns to their house, pauses briefly,
and heads back onto the road.

Every miniature defaults to **Well cared for** and is billed separately
every **20 simulated seconds after placement**, while the run is active.
Select a placed model to open the maintenance panel and choose:

- **Well cared for**: regular full bill and full benefits.
- **Economy care**: about half the cost, but worse beauty, noise, crime
  and weaker household benefits.
- **Minimal care**: no recurring bill, but neglect and significantly
  reduced benefits. Some residents may become more irritated.

Different features have different base maintenance costs. Unpaid debts
can temporarily make the coin balance negative; later completed laps
can recover the deficit. You cannot buy new models until you have enough
coins. The only current run-loss condition remains closing three homes.

Speed limit signs now **physically slow passing cars within the same
two-grid-square Manhattan effect radius** as their normal local effects.
At full care, a speed sign slows traffic to 58% of its normal speed.
At economy care this is 76%, and a minimally maintained sign only
reduces speed to 95%. Traffic transitions smoothly into and out of the
affected area. Slower trips can reduce lap earnings and Progress per
minute, which creates a real trade-off against residents who value
quieter, safer streets.

## Publish on GitHub Pages

This repository includes a workflow that runs npm ci and npm run check for pull requests. On a push to main, it additionally builds and deploys to Pages.

After merging, visit **Settings > Pages** and set the source to **GitHub Actions**. The intended URL is:

https://chriswalker-afk.github.io/Model-Loop/

The production Vite config keeps the template's relative asset base so deployment under /Model-Loop/ works.

## Project structure

~~~text
src/
  main.ts                 Bootstraps Phaser and DOM UI
  style.css               Chalkboard UI and boxed model catalogue
  game/
    config.ts             Board geometry, road, models and homes
    state.ts              Simulation state and persistent upgrades
    TownScene.ts          Phaser rendering, traffic and selection
vite/
  config.dev.mjs          Official starter dev config
  config.prod.mjs         Official starter production config
.github/workflows/
  ci-pages.yml            Typecheck, build and publish
docs/
  NEXT_PASSES.md          Roadmap
~~~

## License

MIT. Built using the [official Phaser starter](https://github.com/phaserjs/template-vite-ts). The current on-board artwork is procedural line art rather than a single flattened concept illustration.
