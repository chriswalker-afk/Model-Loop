import {
  ROAD_CELLS, manhattanDistance, type Cell, type ModelId
} from './config';

/** A feature now belongs to ONE family's property, never an unordered pair. */
export type HomeImprovementSlot='boundary'|'garden';
export type HomeBoundaryKind='picket'|'stone'|'hedge'|'gate';
export type HomeGardenKind='front'|'flowers'|'kitchen'|'patio';
export type HomeImprovementKind=HomeBoundaryKind|HomeGardenKind;

export interface HomeImprovementDefinition {
  kind:HomeImprovementKind;
  slot:HomeImprovementSlot;
  name:string;
  description:string;
  cost:number;
  /** Coins charged every UPKEEP_INTERVAL_SECONDS while occupied. */
  upkeep:number;
  /** Percentage of owner-experienced tension/friendliness remaining. */
  tensionFactor:number;
  friendshipFactor:number;
  /** Unconditional calm for the owner, applied once per completed circuit. */
  comfortPerLap:number;
  /** Local environmental influence for tile inspection near this home. */
  beauty:number;
  noise:number;
  crime:number;
  roadSafety:number;
}

/** One boundary style and one garden style per home. This is run-local, not
 * an account upgrade, a road model or a pairwise connection. */
export interface HomeImprovement {
  residentId:number;
  slot:HomeImprovementSlot;
  kind:HomeImprovementKind;
  nextBillAt:number;
}
export type HomeSite=Cell&{id:number};
export interface NeighbourModel extends Cell {
  id:ModelId;
  care?:string;
  condition?:string;
}

export const HOME_IMPROVEMENT_CATALOG:readonly HomeImprovementDefinition[]=[
  {
    kind:'picket',slot:'boundary',name:'Low Picket Fence',
    description:'A little privacy softens disagreements, though neighbours call less often.',
    cost:24,upkeep:1,tensionFactor:.55,friendshipFactor:.86,
    comfortPerLap:0,beauty:1,noise:0,crime:0,roadSafety:0
  },
  {
    kind:'stone',slot:'boundary',name:'Stone Boundary Wall',
    description:'Strong privacy reduces friction, but puts some distance between friends.',
    cost:38,upkeep:2,tensionFactor:.35,friendshipFactor:.65,
    comfortPerLap:0,beauty:0,noise:-1,crime:-1,roadSafety:0
  },
  {
    kind:'hedge',slot:'boundary',name:'Tall Garden Hedge',
    description:'A green buffer for noise and arguments; sightlines can worry the Wards.',
    cost:29,upkeep:2,tensionFactor:.58,friendshipFactor:.91,
    comfortPerLap:0,beauty:2,noise:-1,crime:0,roadSafety:0
  },
  {
    kind:'gate',slot:'boundary',name:'Shared Garden Gate',
    description:'Invites welcome visits, though awkward neighbours can still be awkward.',
    cost:32,upkeep:1,tensionFactor:1.04,friendshipFactor:1.35,
    comfortPerLap:0,beauty:1,noise:0,crime:0,roadSafety:0
  },
  {
    kind:'front',slot:'garden',name:'Front Garden',
    description:'A cared-for little patch helps its household feel settled.',
    cost:28,upkeep:2,tensionFactor:1,friendshipFactor:1,
    comfortPerLap:-.22,beauty:2,noise:-1,crime:0,roadSafety:0
  },
  {
    kind:'flowers',slot:'garden',name:'Flower Border',
    description:'A colourful welcome that brightens the house and nearby street.',
    cost:20,upkeep:1,tensionFactor:1,friendshipFactor:1,
    comfortPerLap:-.12,beauty:3,noise:0,crime:0,roadSafety:0
  },
  {
    kind:'kitchen',slot:'garden',name:'Kitchen Garden',
    description:'A useful and quiet place to work; the family feels more at home.',
    cost:32,upkeep:2,tensionFactor:1,friendshipFactor:1,
    comfortPerLap:-.18,beauty:1,noise:0,crime:0,roadSafety:0
  },
  {
    kind:'patio',slot:'garden',name:'Seating Corner',
    description:'A friendly spot to gather, sometimes at the cost of a little noise.',
    cost:34,upkeep:2,tensionFactor:1,friendshipFactor:1.12,
    comfortPerLap:-.18,beauty:1,noise:1,crime:0,roadSafety:0
  }
];

export function isHomeImprovementKind(kind:unknown):kind is HomeImprovementKind {
  return typeof kind==='string'&&
    HOME_IMPROVEMENT_CATALOG.some(def=>def.kind===kind);
}
export function homeImprovementDefinition(kind:HomeImprovementKind):HomeImprovementDefinition {
  const def=HOME_IMPROVEMENT_CATALOG.find(item=>item.kind===kind);
  if(!def)throw new Error('Unknown home improvement: '+kind);
  return def;
}
export function homeImprovementAt(
  residentId:number,slot:HomeImprovementSlot,
  improvements:readonly HomeImprovement[]
):HomeImprovement|null {
  return improvements.find(item=>item.residentId===residentId&&item.slot===slot)??null;
}
export function homeImprovementUpkeep(
  residentId:number,improvements:readonly HomeImprovement[]
):number {
  return improvements.filter(item=>item.residentId===residentId)
    .reduce((sum,item)=>sum+homeImprovementDefinition(item.kind).upkeep,0);
}
const round2=(value:number)=>Math.abs(value)<.005?0:Math.round(value*100)/100;

export interface HomeGroundsEffects {
  beauty:number;noise:number;crime:number;roadSafety:number;
  comfortPerLap:number;
}
const neutral=():HomeGroundsEffects=>({
  beauty:0,noise:0,crime:0,roadSafety:0,comfortPerLap:0
});
export function homeGroundsEffects(
  residentId:number,improvements:readonly HomeImprovement[]
):HomeGroundsEffects {
  return improvements.filter(item=>item.residentId===residentId)
    .reduce((total,item)=>{
      const def=homeImprovementDefinition(item.kind);
      total.beauty+=def.beauty;total.noise+=def.noise;
      total.crime+=def.crime;total.roadSafety+=def.roadSafety;
      total.comfortPerLap+=def.comfortPerLap;
      return total;
    },neutral());
}
/** A house enhancement changes tile information, but never grid occupancy. */
export function homeGroundsAt(
  cell:Cell,homes:readonly HomeSite[],
  improvements:readonly HomeImprovement[]
):HomeGroundsEffects {
  const result=neutral();
  for(const home of homes){
    if(manhattanDistance(home,cell)>1)continue;
    const effect=homeGroundsEffects(home.id,improvements);
    result.beauty+=effect.beauty;
    result.noise+=effect.noise;
    result.crime+=effect.crime;
    result.roadSafety+=effect.roadSafety;
  }
  // A garden's calming effect is per household circuit, not per nearby tile.
  return result;
}

/** Roadway sightline concerns derive from actual physical road turns. */
export function homeNearBend(home:HomeSite):boolean {
  return ROAD_CELLS.some((cell,i)=>{
    const before=ROAD_CELLS[(i+ROAD_CELLS.length-1)%ROAD_CELLS.length];
    const after=ROAD_CELLS[(i+1)%ROAD_CELLS.length];
    return (cell.x-before.x!==after.x-cell.x||
      cell.y-before.y!==after.y-cell.y)&&
      manhattanDistance(cell,home)<=2.5;
  });
}

export function homePersonalComfort(
  residentId:number,homes:readonly HomeSite[],
  improvements:readonly HomeImprovement[]
):number {
  const house=homes.find(item=>item.id===residentId);
  if(!house)return 0;
  let value=homeGroundsEffects(residentId,improvements).comfortPerLap;
  if(residentId===5 &&
      homeImprovementAt(residentId,'boundary',improvements)?.kind==='hedge'&&
      homeNearBend(house))value+=.28;
  return round2(value);
}

export interface NeighbourInfluence {
  irritationPerLap:number;
  reasons:string[];
}
const nearbyModel=(a:HomeSite,b:HomeSite,models:readonly NeighbourModel[],
  kind:ModelId,radius:number):boolean=>{
  const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return models.some(item=>item.id===kind&&item.condition!=='broken'&&
    item.care!=='bare'&&manhattanDistance(midpoint,item)<=radius);
};

/** The existing 8C directional relationship is modified by the features of
 * EACH home; the owner's boundary acts fully, the neighbour's partially.
 * No special pair objects are required, even if the houses face a road.
 */
export function influencedNeighbourEffect(
  residentId:number,neighbourId:number,
  owner:HomeSite,neighbour:HomeSite,base:number,
  improvements:readonly HomeImprovement[]=[],
  models:readonly NeighbourModel[]=[]
):NeighbourInfluence {
  let amount=base;
  const reasons:string[]=[];
  if(base!==0){
    const own=homeImprovementAt(residentId,'boundary',improvements);
    const other=homeImprovementAt(neighbourId,'boundary',improvements);
    const ownGarden=homeImprovementAt(residentId,'garden',improvements);
    if(own){
      const definition=homeImprovementDefinition(own.kind);
      amount*=base>0?definition.tensionFactor:definition.friendshipFactor;
      reasons.push(definition.name+' at home');
    }
    if(other){
      const definition=homeImprovementDefinition(other.kind);
      const factor=base>0?definition.tensionFactor:definition.friendshipFactor;
      amount*=1+(factor-1)*.30;
      reasons.push(definition.name+' next door');
    }
    if(base<0&&ownGarden?.kind==='patio'){
      amount*=homeImprovementDefinition('patio').friendshipFactor;
      reasons.push('Seating corner');
    }
  }
  // Existing ordinary roadside models retain their contextual social effects.
  if(base<0&&(residentId===1||residentId===3||neighbourId===1||neighbourId===3)
    &&nearbyModel(owner,neighbour,models,'bench',2)){
    amount-=.30;reasons.push('Shared bench');
  }
  if(base>0&&residentId===1&&neighbourId===2&&
    nearbyModel(owner,neighbour,models,'tree',2)){
    amount*=.80;reasons.push('Oak buffers deliveries');
  }
  if(base>0&&residentId===5&&neighbourId===0&&
    nearbyModel(owner,neighbour,models,'limit',3)){
    amount*=.70;reasons.push('Speed sign reassures the Wards');
  }
  return {irritationPerLap:round2(amount),reasons};
}
