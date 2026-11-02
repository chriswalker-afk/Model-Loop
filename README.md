# Model Loop

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
4. Five boxed models with illustrated transparent windows, costs and environmental effects.
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
