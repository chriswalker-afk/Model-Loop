# Household voices and workshop echoes

## Writing principle

The residents should read as people, not as symbols. Each has an understandable
reason to appreciate or dislike a change, and those reasons can disagree. The
parallel with the family at the workbench belongs in the subtext. Never add
player-facing explanations assigning a household to a parental value, fear or
virtue. Avoid moral labels such as "good parent" or "bad parent".

The small scenes between generations can quietly rhyme with the decisions the
player makes in town. Neither dialogue nor tooltips should explain the rhyme.
They should remain recognisable conversations about a model car, a loose wheel,
an old box, a ruler, where to put the houses, and what ought to be built next.

A caring impulse can have a cost if it becomes too restrictive. An appealing
freedom can create uncertainty. Persistence can become pressure; keeping a
tradition can make change feel difficult. None of these is simply correct or
incorrect. The game should let the player discover trade-offs by observing who
responds well to each miniature.

## Household mechanics

- Household names are ordinary period-appropriate surnames with very light
  associations, not names of personality types. The six places on the board
  remain in the same locations from the first playable Vintage build.
- Every household keeps an independent irritation meter, a recent remark,
  an individual response to each model type, and a record of miniatures
  already encountered on the current circuit.
- Resident responses are deterministic and data-driven in
  src/game/households.ts. The model's normal comfort effect and that
  resident's bias combine per nearby road square.
- The forecast in the building panel uses the same underlying function as
  actual journeys, multiplied by the number of road squares in range and
  the resident's temperament. A negative change is reassuring; positive
  is irritating. Forecasts are estimates per lap, not immediate gains.
- A compact roster shows all six households, even those that have left.
  Clicking a family opens their recent remark, irritation and preferences.
- On the road, a short reaction appears when a car first passes an
  improvement on a circuit; bubbles are time-limited to prevent overload.
- Progress milestones reveal brief workbench dialogue influenced by which
  household is struggling. The player is never told about this relationship.
- Empty houses remain consequential, and some residents particularly
  notice the loss of neighbours. Three closures still end the run.

## Next pass

Once the gameplay feels balanced, make the later-era family conversations
respond to a pattern of choices rather than a single model purchase.
Explore a family heirloom/blueprint that the son may carry forward in a new way.
Keep narrative suggestions gentle, surprising and non-judgemental.

## Current limits

- All cars still use the same road loop and the Vintage models only.
- Responses are model-specific preferences and not yet a general
  personality system that can reason about every future item.
- Future work should add reactions to traffic, privacy, congestion,
  community gatherings and resident-specific roads without removing
  the clarity of the present model previews.
