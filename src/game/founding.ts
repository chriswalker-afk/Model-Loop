import { HOMES, manhattanDistance, type Cell } from './config';
import {
  influencedNeighbourEffect, type BoundaryImprovement, type NeighbourModel
} from './boundaries';

/** The six first-person arrival notes also seed Pass 8C compatibility.
 * Directional lists are intentional: affection need not be mutual. */
export interface FoundingStory {
  id: number;
  epithet: string;
  keepsake: 'map' | 'sketchbook' | 'crates' | 'basket' | 'toolbox' | 'lantern';
  keepsakeLabel: string;
  arrival: string;
  quote: string;
  hope: string;
  worry: string;
  closeTo: readonly number[];
  uneasyNear: readonly number[];
  welcome: string;
}
export const FOUNDING_STORIES: readonly FoundingStory[] = [
  {
    id:0, epithet:'A ROAD TO EVERYWHERE', keepsake:'map', keepsakeLabel:'A folded road map',
    arrival:'The Finches arrive with a well-thumbed road map and a little more luggage than they intended. Before the engine has cooled, someone is already tracing the next bend.',
    quote:'“A good road ought to lead somewhere unexpected.”',
    hope:'Open views, interesting routes and space to explore.',
    worry:'Watchful restrictions and people who wish everything would stay just so.',
    closeTo:[1], uneasyNear:[5,4],
    welcome:'The Finches spread out their map. Already, they are planning the first journey.'
  },
  {
    id:1, epithet:'COLLECTORS OF LITTLE DETAILS', keepsake:'sketchbook', keepsakeLabel:'A travel sketchbook',
    arrival:'The Bells step out with a sketchbook tied in ribbon. They notice the lamplight, the curve of a rooftop and the pattern of the paving before they notice their own front door.',
    quote:'“There is something beautiful even in the smallest corner.”',
    hope:'Green views, unusual details and neighbours who stop to appreciate them.',
    worry:'Haste, noisy deliveries and a street without time to notice anything.',
    closeTo:[4,3], uneasyNear:[2],
    welcome:'The Bells open their sketchbook. The first drawing is of their own doorstep.'
  },
  {
    id:2, epithet:'ALWAYS SOMETHING TO DO', keepsake:'crates', keepsakeLabel:'Three delivery crates',
    arrival:'The Millers have hardly arrived before a small tower of crates appears beside the car. Each box has a destination, and each destination has a timetable.',
    quote:'“There is no sense in waiting when there is work to be done.”',
    hope:'Practical streets, sensible routines and dependable neighbours.',
    worry:'Crowded gatherings and errands that turn into long conversations.',
    closeTo:[5], uneasyNear:[3],
    welcome:'The Millers stack their crates neatly. By tomorrow, they will know every turning.'
  },
  {
    id:3, epithet:'A PLACE FOR EVERYONE', keepsake:'basket', keepsakeLabel:'A wicker picnic basket',
    arrival:'The Marshes arrive with a picnic basket for the neighbours they have not yet met. They have brought more cups than there are people in the car.',
    quote:'“A town is made by the people who stop and say hello.”',
    hope:'Friendly faces, shared spaces and a reason to gather.',
    worry:'Doors that stay shut and neighbours who are always too busy to talk.',
    closeTo:[1], uneasyNear:[2],
    welcome:'The Marshes put the kettle on. Everyone on the road is invited.'
  },
  {
    id:4, epithet:'KEEPERS OF THE OLD STREET', keepsake:'toolbox', keepsakeLabel:'An inherited wooden toolbox',
    arrival:'A wooden toolbox is carefully unloaded from the Hales’ car. Inside are the tools Mr Hale’s father once used to repair the old town gate.',
    quote:'“There is room for new things, of course. But we ought to look after the old ones.”',
    hope:'Familiar details, careful workmanship and things worth preserving.',
    worry:'Reckless driving and changes that erase the character of the town.',
    closeTo:[1,5], uneasyNear:[0],
    welcome:'The Hales put their tools beside the door. Nothing worth keeping will go untended.'
  },
  {
    id:5, epithet:'LOOKING OUT FOR THE STREET', keepsake:'lantern', keepsakeLabel:'An inspection lantern',
    arrival:'The Wards have brought an inspection lantern. Even in daylight, they walk around the nearest bend to make sure everyone will be able to see it safely.',
    quote:'“One careful neighbour can make a whole street feel safer.”',
    hope:'Calm journeys, dependable people and well-kept corners.',
    worry:'Surprise risks, fast drivers and dark, difficult bends.',
    closeTo:[4], uneasyNear:[0],
    welcome:'The Wards hang their lantern by the gate. It is good to know someone is watching out.'
  }
];

export function foundingStory(id: number): FoundingStory {
  const story = FOUNDING_STORIES[id];
  if (!story || story.id !== id) throw new Error('Unknown founding family: ' + id);
  return story;
}
/** Residents' directional preferences, shared by founding and live play.
 * The distance is measured between home plots, not along the vehicle loop.
 * Ordinary houses have no automatic effect; the first nonzero separation
 * possible for two valid houses is two Manhattan squares.
 */
export const NEIGHBOUR_RADIUS = 4;
export const MAX_NEIGHBOUR_EFFECT_PER_LAP = 2.5;
const WELCOME_EFFECT_AT_TWO = -1.5;
const DIFFICULT_EFFECT_AT_TWO = 1.8;
const round2 = (value:number):number => Math.abs(value)<.005
  ? 0 : Math.round(value*100)/100;

export type FoundingNeighbourTone = 'warm' | 'wary' | 'ordinary';
export interface FoundingNeighbourHint {
  id: number;
  name: string;
  distance: number;
  tone: FoundingNeighbourTone;
  /** Directional, per completed circuit, before the total household cap. */
  irritationPerLap: number;
  description: string;
  /** Which real neighbourhood improvement(s) altered the natural score. */
  reasons?: string[];
}
export interface NeighbourhoodSummary {
  residentId:number;
  /** Sum of directional impressions before applying the per-lap cap. */
  uncappedPerLap:number;
  /** Exact value applied by finishLap; capped to +/-2.5. */
  irritationPerLap:number;
  neighbours:FoundingNeighbourHint[];
}
export interface NeighbourhoodForecastLine {
  residentId:number;
  name:string;
  previousPerLap:number;
  predictedPerLap:number;
  changePerLap:number;
}
export interface NeighbourhoodPlacementForecast {
  /** The selected family's new total, even when it is being moved. */
  residentId:number;
  previousPerLap:number;
  predictedPerLap:number;
  changePerLap:number;
  /** All already-settled families whose projected effect changes. */
  affected:NeighbourhoodForecastLine[];
}

export function directedNeighbourEffect(
  residentId:number,neighbourId:number,distance:number
):number {
  if(!Number.isInteger(distance)||distance<2||distance>NEIGHBOUR_RADIUS||
      !HOMES[residentId]||!HOMES[neighbourId]||residentId===neighbourId)return 0;
  const story=foundingStory(residentId);
  const base=story.closeTo.includes(neighbourId) ? WELCOME_EFFECT_AT_TWO
    : story.uneasyNear.includes(neighbourId) ? DIFFICULT_EFFECT_AT_TWO : 0;
  const strength=(NEIGHBOUR_RADIUS+1-distance)/(NEIGHBOUR_RADIUS-1);
  return round2(base*strength);
}

export function foundingNeighbourHints(
  id:number,plot:Cell,placed:readonly (Cell & {id:number})[],
  improvements:readonly BoundaryImprovement[]=[],
  models:readonly NeighbourModel[]=[]
):FoundingNeighbourHint[] {
  const story=foundingStory(id);
  return placed.filter(other=>other.id!==id&&!!HOMES[other.id])
    .map(other=>({other,distance:manhattanDistance(plot,other)}))
    .filter(result=>result.distance>=2&&result.distance<=NEIGHBOUR_RADIUS)
    .sort((a,b)=>a.distance-b.distance||a.other.id-b.other.id)
    .map(({other,distance})=>{
      const name=HOMES[other.id].name;
      const tone:FoundingNeighbourTone=story.closeTo.includes(other.id) ? 'warm'
        : story.uneasyNear.includes(other.id) ? 'wary' : 'ordinary';
      const base=directedNeighbourEffect(id,other.id,distance);
      const influenced=influencedNeighbourEffect(id,other.id,
        {id,x:plot.x,y:plot.y},other,base,improvements,models);
      return {id:other.id,name,distance,tone,
        irritationPerLap:influenced.irritationPerLap,
        reasons:influenced.reasons,
        description:tone==='warm'
          ? name+' may feel like kindred spirits.'
          : tone==='wary'
            ? name+' may make this a lively relationship.'
            : name+' would be nearby.'};
    });
}

/** One pure and deterministic model for inspection, previews and live play. */
export function neighbourhoodSummary(
  residentId:number,homes:readonly (Cell & {id:number})[],
  improvements:readonly BoundaryImprovement[]=[],
  models:readonly NeighbourModel[]=[]
):NeighbourhoodSummary {
  const home=homes.find(h=>h.id===residentId);
  const neighbours=home
    ? foundingNeighbourHints(residentId,home,homes,improvements,models) : [];
  const uncappedPerLap=round2(neighbours.reduce((sum,n)=>sum+n.irritationPerLap,0));
  return {residentId,neighbours,uncappedPerLap,
    irritationPerLap:round2(Math.max(-MAX_NEIGHBOUR_EFFECT_PER_LAP,
      Math.min(MAX_NEIGHBOUR_EFFECT_PER_LAP,uncappedPerLap)))};
}

/** Moving a family may also change every existing neighbour's comfort.
 * Forecast deltas compare capped totals before and after a valid move.
 * Non-settled households are intentionally not predicted. */
export function forecastNeighbourhoodPlacement(
  residentId:number,plot:Cell,current:readonly (Cell & {id:number})[],
  improvements:readonly BoundaryImprovement[]=[],
  models:readonly NeighbourModel[]=[]
):NeighbourhoodPlacementForecast {
  const next=[...current.filter(home=>home.id!==residentId),{
    x:plot.x,y:plot.y,id:residentId
  }];
  const before=neighbourhoodSummary(residentId,current,improvements,models).irritationPerLap;
  const after=neighbourhoodSummary(residentId,next,improvements,models).irritationPerLap;
  const affected:NeighbourhoodForecastLine[]=next.map(home=>{
    const previousPerLap=neighbourhoodSummary(home.id,current,improvements,models).irritationPerLap;
    const predictedPerLap=neighbourhoodSummary(home.id,next,improvements,models).irritationPerLap;
    return {residentId:home.id,name:HOMES[home.id].name,
      previousPerLap,predictedPerLap,
      changePerLap:round2(predictedPerLap-previousPerLap)};
  }).filter(effect=>effect.residentId===residentId||
      Math.abs(effect.changePerLap)>=.005);
  return {residentId,previousPerLap:before,predictedPerLap:after,
    changePerLap:round2(after-before),affected};
}
