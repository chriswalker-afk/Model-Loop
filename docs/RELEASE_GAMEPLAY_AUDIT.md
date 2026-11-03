# The Generational Cycle — gameplay release audit
**Vintage founding, traffic, neighbours, economy, scenery, UI and new-run lifecycle**

## Scope and approach

This is an implementation and automated-release audit, not a claim to have
personally tested every phone, browser or possible game state. The full
Playwright suite runs in Chromium on GitHub Actions, alongside TypeScript
checking and the production Vite build. The following dedicated tests were
added in `tests/release-gameplay-audit.spec.ts`:

| Area | Audit evidence |
| --- | --- |
| Founding flexibility | 12 generated legal six-house layouts; distinct arrangements; previews; one house relocation; review; real start of Vintage |
| Player-led founding | Six separate family cards, introductions and *actual canvas clicks*; six-house review and launch |
| Driving and deadlock | Actual `TownScene.update()`, `advanceTraffic()`, economy, household activities and road incidents, fast-forwarded across reference-like, clustered and shared-road-entry layouts |
| Households and finances | Completed laps, progress, occupied families, bounds on irritation, finite car positions and queue size |
| Neighbourhood purchases | Pair forecast versus installed effect, ordinary model purchase, cost ledger, pause guard and garden avoidance |
| Chapter renewal | Finish one chapter, start another with different home plots; confirm that old cars and scenery are gone and new vehicles start on the new entrances |
| Responsive shop | Portrait 390×844, landscape 844×390, desktop 1280×720; optional garden drawer, pair selection, board visibility, overflow and screenshot artifacts |

## Confirmed defect — previous-generation cars survived a restart

**Severity: high for repeat play; addressed in this PR.**

`GameStore.newRun()` correctly replaced household, money, engines and
founding state, but `TownScene` only called `activateCars()` when its car
array was empty. After a completed chapter it could still contain six
old car objects, each with the old home `startIndex` and unfinished
`CarCycle`. The new chapter could therefore inherit obsolete sprites,
road positions and traffic state.

**Correction:** When a new run changes the underlying environment engine,
the Phaser scene now destroys every prior car and home badge, resets the
persistent-gridlock watcher and incident visual markers, and clears the
old traffic overlay. No new vehicles spawn during the road-only founding
phase; once Vintage starts, `activateCars()` uses the six new home
positions and the safe staggered-departure rules.

A browser regression test specifically validates the full cycle:
playing → chapter complete → new founding road → new houses → new Vintage.

## Traffic findings and safeguards

- PR #28 fixed two distinct homes starting in an identical road lane
  position by giving unsafe entrances a driveway wait.
- PR #29 fixed the remaining watcher blind spot: short family stops
  and driveway reservations no longer reset cumulative stationary time.
- This audit exercises *real Phaser scene updates*, not just a miniature
  abstract solver, in layouts resembling the previous congestion screenshots.
- Stationary time, actual speed, road-entry phase and recovery counts are
  available through **development-only** diagnostics. The audit fast-forward
  hook is bounded and removed from production builds.
- The watchdog remains a last resort. A blocked vehicle returns to a safe
  driveway; no lap, money or Progress is awarded. Hard separation and
  safe merging are not weakened.

Stress tests are useful evidence, not mathematical proof against every
possible runtime interleaving. Reproduce any remaining jam using the
exact layout, game speed, paused/workshop state and an approximate duration;
the new diagnostics will make it far easier to isolate.

## Observed real-scene traffic measurements

The first complete expanded browser run exercised 156 simulated seconds
per layout through the **actual Phaser town scene** (not a separately
invented traffic solver). The summary below describes these three sampled
conditions, not a guarantee against every random event or layout.

| Founding scenario | Completed circuits | Progress | Homes still occupied | Marshal recoveries |
| --- | ---: | ---: | ---: | ---: |
| Reference-like, seed 118 | 24 | 62.9% | 5 of 6 | 0 |
| Close neighbours, seed 401 | 25 | 64.6% | 5 of 6 | 0 |
| Opposite houses sharing an entrance, seed 882 | 26 | 67.6% | 6 of 6 | 0 |

All three progressed without a persistent standstill in this window. In
two unmodified (no purchased miniatures) scenarios, one family moved away
by 156 simulated seconds. This may be an intentional consequence of
leaving traffic and neighbour tensions unaddressed, but it is worth
playing through as a difficulty/balance decision before release. The
audit does not silently adjust family thresholds to conceal it.

The first audit CI run passed 233 tests and failed one **timing-sensitive
test assertion** that required a live car to remain exactly on the starting
pixel even after the game had advanced a few frames. This was corrected to
check the new driveway-entry *origin* with a small, valid real-time advance,
not a frozen road position. That was a test expectation, not another
vehicle movement bug.

## Economy and neighbourhood review

- Building the family homes itself costs nothing and does not advance
  timers, credits or vehicle laps.
- Contextual relationships stay directional and are applied per circuit,
  capped at ±2.5 irritation.
- Installing a boundary charges once and changes both households' projected
  scores exactly as the real game calculates them. Invalid or paused
  purchases are rejected.
- Standard models cost their listed coins and retain their care/upkeep rules.
  Cosmetic grass, flowers, keepsakes and small trees never reserve land
  or change money, traffic, Noise, Crime, Beauty or irritation.
- Civic structures appear in four earned phases, without reserving
  future plots against real model purchases.

## Accessibility and interface review

Automated checks cover the founder roster/intro buttons, true canvas
placement, review modal, garden drawer on three viewport configurations,
offscreen overflow and reduced-motion scenery (existing Pass 8E tests).
The game uses an explicit tile inspector rather than a permanently open
detail panel.

**Not covered by the automated audit:** physical touch accuracy on actual
iOS/Android devices; VoiceOver/TalkBack spoken order; all non-Chromium
engines; very long background-tab suspension; and performance on old
mobile GPUs. These need a real-device release smoke check before describing
the build as fully cross-device tested.

## Verification and release gate

- PR #30 (Pass 8E) was merged after **225 passing tests**.
- The new audit PR runs the *whole* CI suite again with additional
  multi-layout, true-scene traffic and chapter-restart tests.
- Audit PR release gate: verify the **latest** branch head's TypeScript,
  production build and complete browser suite are green in GitHub Actions
  before merging. Earlier runs do not validate subsequent code changes.

## Next step

After green CI, merge this audit PR, confirm GitHub Pages has deployed,
perform a hard reload and play one complete ordinary generation using
a house layout *different* from the reference arrangement. Watch at least
one shared-driveway entrance and one car overtaking / family-stop event.
Then confirm that starting the next chapter returns to a genuinely empty road.

For a release milestone, prioritise a focused real-device pass and any
found regressions over further feature expansion. New eras and gameplay
expansions can follow as a separate phase.
