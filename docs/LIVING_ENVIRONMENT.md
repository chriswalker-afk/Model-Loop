# Driver Behaviour System — Pass 1: The Living Environment

## What this pass adds

Passengers and drivers can now leave small, persistent changes behind in the
model town. The effects are game-state objects, not just one-frame visual
animations, and they influence future journeys. Every event records who
caused it and where it occurred.

The first vertical slice has three actions:

| Household | Event | Visual | Actual effect |
| --- | --- | --- | --- |
| Finches | Sharp turn | Tyre marks on road | −12 road Safety while the mark is present; slight additional irritation/noise locally |
| Bells | Care for a corner | Flowers on verge | +2 Beauty and slightly calmer journeys nearby |
| Millers | Discard packaging | Small paper litter on verge | −1 Beauty and slightly more irritation nearby |

This is deliberately **not** the finished twelve-behaviour personality
catalogue. Marshes, Hales and Wards retain their existing town preferences;
their new helpful and troublesome actions follow in Pass 4.

## Behaviour engine

- Seeded linear-congruential random number generator. Re-running an event
  scenario with the same seed and actions produces the same sequence.
- Each household has a single event opportunity at a random but deterministic
  point in each circuit. The default event chance is 35%, modulated by mood
  and whether the behaviour is helpful or troublesome.
- Per-driver cooldown: 45 simulated seconds after a *successful* event.
- No more than 16 environmental patches globally; no more than 6 litter
  patches, 6 flower patches or 3 skid patches; a maximum of 2 per verge cell.
- Events cannot overwrite road scenery, houses or purchased miniature
  models. Skids appear on a road cell; decorations and rubbish are beside it.
- Effects expire naturally after 55 (skid), 75 (flowers) or 100 (litter)
  **simulated seconds**, with no unlimited build-up. Later passes will
  introduce cleanup and repair before natural expiry.
- The short recent-events history includes action, source household and
  affected cell. It is not used as a currency or a source of Blueprint rewards.
- Environmental time freezes whenever gameplay is paused, the Workshop is
  open, or the chapter is complete.

## Visibility and understanding

- The game draws faint, miniature-style packaging scraps, flowers and
  tyre scuffs in their actual affected locations, above the road and below
  moving cars. A new effect briefly pulses when it first appears.
- The existing footer notice attributes a change to the appropriate family.
- Hover a nearby tile to see the effect name, resident responsible, and
  remaining time; local Beauty/Noise and road safety update live.
- Each household notebook includes that family's most recent observed
  action, with the same subtle, everyday wording as existing dialogue.
- No extra always-on screen panel was added (important for compact screens).

## Road Safety and residents

Safety is no longer the inverse of average irritation. The initial town
starts at 90% Safety. Maintained lampposts, police boxes and speed signs
make modest contributions (capped at +10 total), while each active
tyre-scuff hazard removes 12 points. Care settings scale the positive
benefit. Litter itself does not increase Crime or reduce Safety.

Nearby environmental conditions change irritation as drivers pass them:
litter and tyre scuffs tend to irritate, while flowers slightly soothe.
The same environmental state drives both the road drawings and the values
in the inspector.

## Developer-only tools

When running the **Vite development server** (not the published production
build), use the browser console:

    __modelLoopDebug.seed(12345)
    __modelLoopDebug.trigger('litter', 2, 4, 3)
    __modelLoopDebug.trigger('flowers', 1, 9, 3)
    __modelLoopDebug.trigger('skid', 0, 12, 3)
    __modelLoopDebug.snapshot()

The coordinates for trigger are a **road tile**, not the roadside cell
which is selected deterministically by the event engine. The user-facing
site has no event-spawning controls.

## What comes next

**Pass 2 — Rubbish & Collection:** A boxed cast-iron bin miniature, clearly
shown catchment area, fill capacity, overflow, configurable collection
frequency and full-bin service penalty. Bins intercept eligible litter
rather than deleting it at no cost, and existing litter requires separate
cleaning. All three care modes and the net Income flow must remain coherent.

**Pass 3 — Real Traffic Behaviour:** Actual car following, stop propagation,
queue recovery, effects of speed signs and congestion on lap income.
A tyre scuff is currently a road-safety hazard only; it doesn't physically
stop a car.

**Pass 4 — Household Behaviour Profiles:** The complete set of one positive
and one troublesome action per family, weighted by mood and model context.
Preserve subtle family-workshop parallels without psychological labels.

**Pass 5 — Balancing & Narrative Polish:** Event-rate tuning, feedback and
animations, accessibility, audio restraint, tests against exploits,
and understated scenes across generations.

## Regression priorities

- Stable results from the same random seed.
- One opportunity per household per lap and cooldown compliance.
- Spawn limits and placement collision rules.
- Expiry, pause/freeze, reset and no event leaks between runs.
- Safety not changing when only resident irritation changes.
- Models, income, Progress, resident closures and miniature purchasing
  remain governed by the existing code.
- Phone/compact landscape layout still works without new permanent panels.
