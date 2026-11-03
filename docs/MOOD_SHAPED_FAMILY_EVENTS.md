# Mood-shaped family decisions

The Generational Cycle has always tracked resident irritation (0–100). Mood
already biased the **helpful vs troublesome** outcome of an occasional
household road event, but the old model jumped abruptly at 45 and 72
irritation and did not consistently influence follow-up neighbour help or
litter left after a visible activity.

This small pass connects those existing decisions; it **does not add a
separate event spinner, meter, new currency, or additional random turns**.

## Behaviours

- At 0 irritation, a spontaneous household event has a base **78% helpful**
  versus 22% troublesome tone.
- At 50 irritation, the base is **50% / 50%**.
- At 100 irritation, the base is **22% helpful / 78% troublesome**.
- The transition is *continuous*, with no sudden shift simply because a
  family crosses 45 or 72.
- Existing nearby model effects still modify the helpful probability and
  remain capped to preserve unpredictability. The existing base 38% chance
  of having an event at a household's once-per-circuit opportunity is
  unchanged; higher irritation changes the type, not how often the dice roll.
- Every family retains distinctive actions (Finches scout/skid, Bells
  flowers/admiring stop, Millers mend/litter, Marshes tidy/chat, Hales
  restore/display and Wards guide/hesitate).

## Neighbourly follow-ups

When a family passes a genuine opportunity to help or appreciate a
neighbour, the helper's **current irritation** scales the existing
per-kind probability. At neutral 50 irritation, existing base chances
remain unchanged. An especially calm resident offers help more often; an
agitated one sometimes passes by.

This uses the **same pending request** and single seeded RNG draw as before.
All real proximity, current road position, evidence of a damaged model,
cooldowns, history caps and request expiry rules remain unchanged. Ignoring
a need is not a separate invented hostile incident. It simply leaves the
request for a possible later visit. No extra lap income or separate helpful
action is awarded for a neighbour's response.

## Activity aftermath

Only activities which involve food or packaging can produce litter:
delivery, working lunch, picnic and gathering. The existing chance is
multiplied by a small bounded irritation factor **at activity start**.

- 10 irritation: about 73.5% of the base litter chance.
- 50 irritation: about 107.5% of base.
- 90 irritation: about 141.5% of base.
- A zero base chance stays **zero**, even when a family is highly irritated.
- All chances remain below 88%; bin interception and actual recorded scraps
  still use their original mechanisms, with no duplicated event roll.

A family feeling good can still forget a wrapper, and a family on edge
can still clean up.

## Player feedback

The household inspector now includes an optional “How mood shapes their
choices” section with the **baseline helpful share for their current
irritation**, explicitly labelled as *before* nearby model effects.
This supplements existing habits and relationship descriptions, without
adding a permanent HUD bar.

## Verification

Focused Playwright tests cover smooth monotonic odds, seeded helpful versus
troublesome event selection, physical neighbour responses, mood-adjusted
litter on completed activities, no duplicate income/events, and keyboard
inspection. Existing traffic, founding, economy, and layout suites run in
GitHub Actions.

## Balance guidance

The relationship between high irritation and troublesome actions is
intentional, but it can create a positive feedback loop if difficult
households are already suffering traffic delays. The helpful floor,
troublesome ceiling, unchanged event frequency and genuinely available
player mitigations help keep a run recoverable. Review the rate at which
families leave in an unmodified reference town during the next full-game
balance playtest; don't silently increase event frequency to force drama.
