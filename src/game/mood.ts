/**
 * Residents react to their experience of the town. These are small, bounded
 * *probability* modifiers, never guaranteed virtue, blame or hidden rewards.
 *
 * All three models are pure and use the same 0..100 irritation scale. The
 * caller retains its existing independent seeded RNG and opportunity/cooldown
 * rules, so mood cannot create extra event opportunities per circuit.
 */
const clamp=(value:number,low:number,high:number)=>
  Math.max(low,Math.min(high,Number.isFinite(value)?value:50));
export const MOOD_CALM_IRRITATION=15;
export const MOOD_TENSE_IRRITATION=85;

/** Probability that a spontaneous household event is of the helpful kind. */
export function moodHelpfulChance(irritation:number):number {
  // Continuous across the former hard cutoffs at 45 and 72. A content family
  // still sometimes errs; an exhausted family can still help a neighbour.
  const mood=clamp(irritation,0,100);
  return .78-.0056*mood;  // 78% at 0, 22% at 100, before local model effects.
}

/** Chance to act on a REAL outstanding neighbourhood request, when passing.
 * These events already have independent cooldowns and no extra income.
 * At 50 irritation the existing baseline is exactly preserved.
 */
export function moodNeighbourHelpChance(baseChance:number,irritation:number):number {
  const base=clamp(baseChance,0,1);
  const mood=clamp(irritation,0,100);
  return clamp(base*(1.4-.008*mood),.035,.78);
}

/** Probability of leaving scraps on completing a real food/parcel activity.
 * Non-littering activities remain strictly clean regardless of mood.
 * Mood is sampled when the activity begins, not re-rolled at every frame.
 */
export function moodLitterChance(baseChance:number,irritation:number):number {
  const base=clamp(baseChance,0,1);
  if(base===0)return 0;
  const mood=clamp(irritation,0,100);
  return clamp(base*(.65+.0085*mood),0,.75);
}
