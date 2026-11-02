# Driver Behaviour Pass 5 — balance and quality audit

This is the closing quality pass for the Vintage (1908) living-environment
system in **The Generational Cycle**. It leaves the public repository URL,
saved Blueprint key, lap-payment rules, model prices, bin servicing and
permanent upgrades unchanged.

## Balance targets

| System | Pass 5 baseline | Why |
| --- | --- | --- |
| Ambient irritation per road tile | 0.25 (was 0.27) | Slower accumulation leaves a little more room for deliberate model choices without removing the threat of closures |
| East / west difficult bends | +0.18 / +0.14 irritation per tile | Keep local danger distinct from uniform background pressure |
| Behaviour opportunity | 38% (was 44%) | Reduce clusters of unrelated environmental animations and overfull roadside strips |
| Cooldown after an act | 52 simulated seconds (was 45) | Discourage repeated acts by one family across consecutive short circuits |
| Incidental wrapper after a troublesome act | 18% (was 22%) in Pass 5; **retired in Pass 6A** | The following personality pass now requires packaging to have an actual source; picnics are due in 6B |
| Ordinary temporary car stop | 2.8–4 simulated seconds | A real jam can develop but should not dominate an entire circuit |
| Road-stop cooldown | 68s per driver, 18s globally | Avoid back-to-back stoppages with no recovery opportunity |
| Irritation per second lost in a queue | 0.36 × temperament, or 0.20 near guidance | Reward helpful interventions without giving queue time a direct monetary penalty |
| Routine notice hold | 0.7s | A lap payout remains visible when no important incident is active |
| Significant notice hold | 4.5s | Keep meaningful events readable during consecutive lap payments |

These initial values live in `src/game/balance.ts`.
They are starting points for further player observation, not claims of
scientifically optimal balance. Traffic distances, shop costs, collection
equations, and the distinction between rolling *Income* and cumulative
coins have deliberately not been changed.

## Extended-session verification

The new `tests/long-run-balance.spec.ts` drives the
**production state, road-following solver, home return and merging code**
for multiple deterministic seeds and three model strategies:

- **Bare town:** no purchased models, to establish an unsheltered baseline.
- **Cared-for town:** a tree, bench, speed sign and rubbish bin at full care.
- **Minimal-care town:** the same placements with upkeep reduced to zero
  and corresponding comfort/protection trade-offs.

The harness prints `VINTAGE_BALANCE_TRIALS` to the
GitHub Actions log. It tests for reproducible outcomes, sensible progress,
bounded irritation, coin accounting that reconciles to the last coin,
no double lap payments, bounded roadside effects and bin capacity, no
indefinitely stopped unblocked cars, and bounded household act frequency.
The dedicated traffic tests also examine circular wrap-around headways
and recovery after hard braking.

This is a **headless deterministic systems simulation**, not a substitute
for watching the actual Phaser game on a laptop and phone. Browser smoke
tests separately cover the rendered UI and user interactions.

## Initial multiseed calibration (11, 29, 67)

A headless full-town simulation of approximately 2–4 simulated minutes
per run produced the following first set of results:

| Strategy | Three seed outcomes | Progress at loss | Time to result |
| --- | --- | --- | --- |
| Bare town | 3 losses | 68–73% | 157–160s |
| Cared-for | 3 wins, five homes remaining | 100% (completed) | 203–212s |
| Minimal care | 3 losses | 53–59% | 129–133s |

The cared-for runs earned 503–511 total lap coins and paid 170 in
maintenance/collection over the full run, plus 125 on initial models.
Net coins, occupancy, event history and traffic metrics remained bounded;
none of the runs developed a permanent road stoppage. These are illustrative
seeded scenarios, **not** a guarantee that every thoughtful build wins or
that every no-build strategy loses.

The four models in the baseline town include one bin, but **these three
short sampled runs did not happen to generate a wrapper within its small
interception radius**. That is a useful playtesting limitation, not
proof that bin collection is sufficiently frequent. A separate heavy-litter
stress test now exercises the full, economy and minimal-care schedules over
four simulated minutes; the Pass 2 capacity/overflow tests remain in place.
Natural litter frequency and the value of bins at different sites should
be observed with a larger seed sample and actual play sessions.

## Readable feedback, not more clutter

- The existing footer gives significant incidents priority over ordinary
  lap rewards for a few simulated seconds. Coins are still paid and
  displayed regardless of which notice is visible.
- Only important incidents enter a dedicated screen-reader live region.
  Rapidly repainted tile/coin text does not constantly announce itself.
- A successful family act produces one short, identifiable mini-label at
  its location. A maximum of three such labels are visible at once.
- Bin interception shows `+1 IN BIN`, while overflowing
  shows `BIN FULL`. These use **words as well as
  colour**, and the fill gauge/inspector continue to show the condition.
- Reduce-motion media preferences suppress nonessential motion of labels,
  coins, thoughts, placement pulses and traffic incident ripples. The
  cars still drive, because their movement is the core gameplay.
- No sounds autoplay or play without control. The game remains quiet.

## Workbench scenes

A note is written once at each genuine 25%, 50% and 75% Progress
milestone. It is chosen from things already witnessed or built:
rubbish collection, long queues, neighbourly actions, placed models,
budget pressure, closed homes or simply the cars making their rounds.

The writing stays about ordinary physical work — the brush, little
wheel, ruler, paper scrap and cardboard box. It never assigns a family
a psychological role or tells the player which approach is morally
correct. The chapter's closing line is also grounded in the current run.

Notes live in a **collapsed Workshop diary**, alongside an optional
auditable lifetime run ledger. These additions do not extend the
permanent HUD or earn extra Blueprints, so players cannot profit by
deliberately damaging and repairing the same area.

## Ongoing playtesting questions

1. Can beginners learn the effect of an intervention before a house closes,
   and still feel some risk if they ignore the neighbourhood?
2. Are the different approaches to maintenance financially viable without
   making minimal care the automatic best choice?
3. Does the litter/bin interaction occur often enough to notice but not so
   often that rubbish dominates all other behaviour?
4. Are queue markers and incident labels readable in both 1266×548 laptop
   mode and phone portrait mode?
5. Are the quiet workbench lines varied without becoming an unwanted
   explanation of the family relationships?

The developer-only `__modelLoopDebug.snapshot()` exposes
the current cumulative `summary` and workshop
moments so these questions can be investigated without adding debug UI
to the release build.
