# The Generational Cycle — Next passes

## Driver Behaviour system status (November 2026)

Passes 1–4 are now implemented, including the Living Environment, rubbish
bins/collection, real traffic queues and all twelve positive/troublesome
household actions. The next dedicated pass is **Pass 5: Balancing, feedback
and narrative polish**. This includes long-run incident pacing, income and
irritation tuning, visual/audio accessibility, event interaction stress
tests and quiet workbench scenes; see LIVING_ENVIRONMENT.md.

The original broader design roadmap below is retained for future-era work.

## Pass 0: Engine foundation (this PR)
- Official Phaser 4, Vite and TypeScript starter and GitHub Pages workflow.
- Responsive chalkboard game surface and transparent-window miniature boxes.
- Irregular grid road, moving vintage cars, named households and loop income.
- Tile inspection, purchasing, placement, irritation, loss, Progress and permanent upgrades.

## Pass 1: Gameplay feedback and presentation
- Improve road corners, vehicle animations and authored line-art miniatures.
- Show car-level irritation feedback, complaints and danger warnings.
- Preview environmental changes before placing a model.
- Improve clarity when a resident leaves and a house closes.
- Refine touch interaction, mobile camera movement and accessibility.
- Tune progression rates, costs and the difficulty curve.

## Pass 2: Generations and multiple eras
- Illustrated workshop conversations between a father and son.
- Branching decisions that influence the following era's model catalogue.
- Post-war content and era-specific models.
- Progress completion leads directly to the next generation/era.
- Heritage shelf unlocks so earlier-era items can appear later.

## Pass 3: Roguelite depth
- Larger permanent Blueprint upgrade tree.
- Expand the first six household personalities beyond model preferences to react to traffic, housing loss and new-era choices.
- Keep the subtle family workshop narrative connected to play without spelling out the parallels; see HOUSEHOLD_VOICES.md.
- Traffic congestion and deeper road/economy systems.
- Model combinations, limited supply, events and run variation.
- Resume/save active runs separate from permanent workshop progress.

## Pass 4: Production polish
- Replace placeholder procedural models with curated monochrome artwork.
- Miniature unboxing and placement animations.
- Workshop ambience and accessible audio controls.
- Full family history, branching scenes and endings.
- Automated playtesting, performance and release readiness.

## Development principles
- Keep simulation rules in pure TypeScript wherever practical.
- Keep model balance and road geometry in data, not hard-coded in drawing routines.
- Make risk and effect previews clear before the player commits coins.
- Keep the warm workshop narrative distinct from the dark miniature town.
