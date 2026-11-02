import { EFFECT_RADIUS, HOMES, manhattanDistance, type Cell, type ModelId } from './config';
import { carePreferenceScale, normalizedCare, type CareLevel } from './economy';
import { SeededRandom, type EnvironmentKind } from './environment';
import { VINTAGE_BALANCE } from './balance';
import { bendOpportunityOffsets } from './driving';

/**
 * Every family has two sides. Display the ordinary actions, never psychological
 * labels. One opportunity per family circuit is handled by GameStore.
 */
export type HouseholdActionId =
  | 'scout' | 'skid'
  | 'flowers' | 'admire'
  | 'mend' | 'litter'
  | 'tidy' | 'chat'
  | 'restore' | 'display'
  | 'guide' | 'hesitate';
export type BehaviourTone = 'helpful' | 'troublesome';
export type BehaviourMechanic = 'roadside' | 'stop';
export interface HouseholdAction {
  id: HouseholdActionId;
  tone: BehaviourTone;
  mechanic: BehaviourMechanic;
  environmentKind?: EnvironmentKind;
  label: string;
  message: string;
}
export interface HouseholdPair {
  residentId: number;
  helpful: HouseholdAction;
  troublesome: HouseholdAction;
}
export interface NearbyMiniature extends Cell {
  id: ModelId;
  care?: CareLevel;
}
export interface ModelBehaviourModifier {
  modelId: ModelId;
  residentId: number;
  /** Positive numbers make the helpful behaviour more likely. */
  helpfulShift: number;
  /** Positive numbers make the troublesome behaviour more likely. */
  troublesomeShift: number;
  reason: string;
}

export const HOUSEHOLD_ACTIONS: readonly HouseholdPair[] = [
  {
    residentId: 0,
    helpful: {
      id: 'scout', environmentKind: 'courtesy', tone: 'helpful', mechanic: 'roadside',
      label: 'Finds a clear line through',
      message: 'The Finches found a smooth line through the bend. Others took the easier route.'
    },
    troublesome: {
      id: 'skid', environmentKind: 'skid', tone: 'troublesome', mechanic: 'roadside',
      label: 'Takes a bend too sharply',
      message: 'The Finches pushed through the corner too quickly. Fresh tyre marks remain.'
    }
  },
  {
    residentId: 1,
    helpful: {
      id: 'flowers', environmentKind: 'flowers', tone: 'helpful', mechanic: 'roadside',
      label: 'Plants a little colour',
      message: 'The Bells planted a few flowers by the road.'
    },
    troublesome: {
      id: 'admire', tone: 'troublesome', mechanic: 'stop',
      label: 'Stops to admire the view',
      message: 'The Bells stopped for a better look; the road is slowing behind them.'
    }
  },
  {
    residentId: 2,
    helpful: {
      id: 'mend', environmentKind: 'mended', tone: 'helpful', mechanic: 'roadside',
      label: 'Mends a worn patch',
      message: 'The Millers smoothed a rough bit of road.'
    },
    troublesome: {
      id: 'litter', environmentKind: 'litter', tone: 'troublesome', mechanic: 'roadside',
      label: 'Forgets delivery packaging',
      message: 'The Millers hurried away from a delivery and left some packaging behind.'
    }
  },
  {
    residentId: 3,
    helpful: {
      id: 'tidy', environmentKind: 'tidied', tone: 'helpful', mechanic: 'roadside',
      label: 'Tidies the verge',
      message: 'The Marshes left the roadside a little tidier.'
    },
    troublesome: {
      id: 'chat', tone: 'troublesome', mechanic: 'stop',
      label: 'Lingers for a neighbourly chat',
      message: 'The Marshes stopped to catch up with a neighbour. Cars are waiting behind them.'
    }
  },
  {
    residentId: 4,
    helpful: {
      id: 'restore', environmentKind: 'heritage', tone: 'helpful', mechanic: 'roadside',
      label: 'Restores a familiar detail',
      message: 'The Hales carefully restored an old roadside detail.'
    },
    troublesome: {
      id: 'display', environmentKind: 'display', tone: 'troublesome', mechanic: 'roadside',
      label: 'Puts out a roadside display',
      message: 'The Hales have put a little display beside the road. Drivers slow to look.'
    }
  },
  {
    residentId: 5,
    helpful: {
      id: 'guide', environmentKind: 'guidance', tone: 'helpful', mechanic: 'roadside',
      label: 'Helps traffic along',
      message: 'The Wards helped everyone through a difficult corner.'
    },
    troublesome: {
      id: 'hesitate', tone: 'troublesome', mechanic: 'stop',
      label: 'Stops to check the road',
      message: 'The Wards paused to check that the road was clear.'
    }
  }
];

/**
 * Environmental interactions are intentional rather than arbitrary. Modifiers
 * are additive probability shifts at full care, scaled down at reduced care.
 * Overlapping effects are bounded, so no model guarantees a positive/negative
 * action and there's always some unpredictability.
 */
export const MODEL_BEHAVIOUR_MODIFIERS: readonly ModelBehaviourModifier[] = [
  { modelId:'lamp', residentId:2, helpfulShift:.12, troublesomeShift:0,
    reason:'The Millers can spot a worn corner more easily.' },
  { modelId:'lamp', residentId:5, helpfulShift:.16, troublesomeShift:-.23,
    reason:'The Wards feel able to guide traffic without so much hesitation.' },
  { modelId:'tree', residentId:1, helpfulShift:.24, troublesomeShift:.08,
    reason:'The Bells notice more places to tend, and more views to admire.' },
  { modelId:'tree', residentId:4, helpfulShift:.22, troublesomeShift:0,
    reason:'The Hales are keen to preserve familiar green corners.' },
  { modelId:'bench', residentId:1, helpfulShift:.10, troublesomeShift:.19,
    reason:'The Bells plant more flowers, but stop to look more often.' },
  { modelId:'bench', residentId:3, helpfulShift:.14, troublesomeShift:.28,
    reason:'The Marshes tidy shared spaces but also pause to talk.' },
  { modelId:'bench', residentId:4, helpfulShift:.08, troublesomeShift:.10,
    reason:'The Hales care for the place, and may put out small displays.' },
  { modelId:'limit', residentId:0, helpfulShift:.08, troublesomeShift:-.32,
    reason:'A clear sign helps the Finches judge a spirited corner, even if they dislike rules.' },
  { modelId:'limit', residentId:3, helpfulShift:0, troublesomeShift:-.08,
    reason:'The Marshes are less inclined to stop in the road.' },
  { modelId:'limit', residentId:5, helpfulShift:.16, troublesomeShift:-.34,
    reason:'The Wards feel safer on the slower stretch.' },
  { modelId:'police', residentId:0, helpfulShift:0, troublesomeShift:-.24,
    reason:'A watchful corner makes the Finches less inclined to take a reckless bend.' },
  { modelId:'police', residentId:2, helpfulShift:.08, troublesomeShift:-.25,
    reason:'The Millers take more care with their deliveries.' },
  { modelId:'police', residentId:3, helpfulShift:0, troublesomeShift:-.18,
    reason:'The Marshes avoid holding up the road nearby.' },
  { modelId:'police', residentId:5, helpfulShift:.17, troublesomeShift:-.24,
    reason:'The Wards feel someone else is helping keep the street safe.' },
  { modelId:'bin', residentId:2, helpfulShift:0, troublesomeShift:-.10,
    reason:'The Millers have somewhere to put the packaging.' },
  { modelId:'bin', residentId:3, helpfulShift:.14, troublesomeShift:0,
    reason:'The Marshes are encouraged to keep nearby places tidy.' }
];

export const BEHAVIOUR_OPPORTUNITY_CHANCE = VINTAGE_BALANCE.behaviourOpportunityChance;
export const BEHAVIOUR_COOLDOWN_SECONDS = VINTAGE_BALANCE.behaviourCooldownSeconds;
export const BEHAVIOUR_MAX_HISTORY = 12;

export interface BehaviourOdds {
  eventChance: number;
  helpfulChance: number;
  troublesomeChance: number;
}
export interface BehaviourReport {
  /** Monotonically increasing per run: scene feedback never repeats old acts. */
  sequence: number;
  residentId: number;
  action: HouseholdActionId;
  tone: BehaviourTone;
  cell: Cell;
  time: number;
  message: string;
  help?: string;
}
const clamp=(n:number,lower:number,upper:number):number=>Math.max(lower,Math.min(upper,n));

export function householdActionPair(id:number): HouseholdPair {
  const pair=HOUSEHOLD_ACTIONS.find(row=>row.residentId===id);
  if(!pair)throw new Error('Unknown household behaviour '+id);
  return pair;
}

/**
 * Used for previews and event selection, so the forecast is grounded in
 * precisely the same numerical model that drives actual incidents.
 */
export function behaviourOdds(
  residentId:number, irritation:number, cell:Cell,
  placements:readonly NearbyMiniature[]
): BehaviourOdds {
  let helpfulChance=irritation>=72?.30:irritation>=45?.50:.70;
  let eventChance: number = BEHAVIOUR_OPPORTUNITY_CHANCE;
  const nearby=placements.filter(item=>manhattanDistance(item,cell)<=EFFECT_RADIUS);
  for(const item of nearby){
    const care=carePreferenceScale(normalizedCare(item.care));
    for(const impact of MODEL_BEHAVIOUR_MODIFIERS){
      if(impact.modelId!==item.id||impact.residentId!==residentId)continue;
      helpfulChance+=(impact.helpfulShift-impact.troublesomeShift)*care;
      eventChance+=Math.max(0,impact.troublesomeShift)*.055*care;
    }
  }
  helpfulChance=clamp(helpfulChance,.14,.86);
  eventChance=clamp(eventChance,.19,.64);
  return {eventChance,helpfulChance,troublesomeChance:1-helpfulChance};
}

export interface BehaviourPreviewRow {
  residentId:number;
  name:string;
  helpfulLabel:string;
  troublesomeLabel:string;
  helpfulBefore:number;
  helpfulAfter:number;
  eventBefore:number;
  eventAfter:number;
  reasons:string[];
}
export function previewBehaviourInfluence(
  cell:Cell, modelId:ModelId, placements:readonly NearbyMiniature[],
  irritations:readonly {id:number;irritation:number;occupied:boolean}[]
):BehaviourPreviewRow[] {
  const after=[...placements,{...cell,id:modelId,care:'full' as const}];
  return irritations.filter(row=>row.occupied).map(row=>{
    const profile=householdActionPair(row.id);
    const beforeOdds=behaviourOdds(row.id,row.irritation,cell,placements);
    const afterOdds=behaviourOdds(row.id,row.irritation,cell,after);
    const reasons=MODEL_BEHAVIOUR_MODIFIERS.filter(mod=>
      mod.modelId===modelId&&mod.residentId===row.id).map(mod=>mod.reason);
    return {
      residentId:row.id,name:HOMES[row.id].name,
      helpfulLabel:profile.helpful.label,
      troublesomeLabel:profile.troublesome.label,
      helpfulBefore:beforeOdds.helpfulChance,helpfulAfter:afterOdds.helpfulChance,
      eventBefore:beforeOdds.eventChance,eventAfter:afterOdds.eventChance,
      reasons
    };
  }).filter(row=>Math.abs(row.helpfulAfter-row.helpfulBefore)>.005||
    Math.abs(row.eventAfter-row.eventBefore)>.005);
}

/** Independent seeded RNG; litter, traffic and mood use no Math.random(). */
export class HouseholdBehaviourEngine {
  readonly rng:SeededRandom;
  private lastActionAt=new Map<number,number>();
  constructor(seed:number){this.rng=new SeededRandom((seed ^ 0x48614269)>>>0);}
  opportunityOffset(roadLength:number,residentId?:number):number {
    // Finches' brisk cornering and Wards' caution happen at actual bends,
    // not on an arbitrary straight road tile.
    if(residentId===0||residentId===5){
      const bends=bendOpportunityOffsets(residentId);
      if(bends.length)return bends[this.rng.int(bends.length)];
    }
    return 5+this.rng.int(Math.max(1,roadLength-10));
  }
  choose(residentId:number,irritation:number,cell:Cell,now:number,
    models:readonly NearbyMiniature[]):HouseholdAction|null {
    if(now-(this.lastActionAt.get(residentId)??-Infinity)<BEHAVIOUR_COOLDOWN_SECONDS)return null;
    const odds=behaviourOdds(residentId,irritation,cell,models);
    if(this.rng.next()>=odds.eventChance)return null;
    const pair=householdActionPair(residentId);
    return this.rng.next()<odds.helpfulChance?pair.helpful:pair.troublesome;
  }
  mark(residentId:number,time:number):void{
    this.lastActionAt.set(residentId,time);
  }
}
