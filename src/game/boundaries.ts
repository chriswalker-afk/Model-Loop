import {
  HOMES, ROAD_CELLS, isRoad, manhattanDistance, type Cell, type ModelId
} from './config';

/** A separate miniature collection. These belong to family pairs, not tiles. */
export type BoundaryKind = 'picket' | 'stone' | 'gate' | 'hedge';
export interface BoundaryModel {
  kind: BoundaryKind;
  name: string;
  cost: number;
  description: string;
  /** Percentage of conflict and friendliness that reaches the other home. */
  tensionFactor: number;
  friendshipFactor: number;
}
export const BOUNDARY_MODELS: readonly BoundaryModel[] = [
  {
    kind:'picket',name:'Picket Fence',cost:24,
    description:'A little privacy halves arguments, though neighbours talk a bit less.',
    tensionFactor:0.50,friendshipFactor:0.80
  },
  {
    kind:'stone',name:'Stone Boundary',cost:38,
    description:'Solid privacy reduces tension substantially, but also separates friends.',
    tensionFactor:0.30,friendshipFactor:0.60
  },
  {
    kind:'gate',name:'Shared Garden Gate',cost:32,
    description:'Friendly households visit more often; awkward meetings can get awkward.',
    tensionFactor:1.05,friendshipFactor:1.40
  },
  {
    kind:'hedge',name:'Garden Hedge',cost:29,
    description:'A green, quieter boundary softens disagreements but may hide a bend.',
    tensionFactor:0.65,friendshipFactor:0.90
  }
] as const;
export interface BoundaryImprovement {
  /** Canonical ascending family IDs; exactly one installation per pair. */
  a:number;
  b:number;
  kind:BoundaryKind;
}
export interface NeighbourModel extends Cell {
  id:ModelId;
  care?:string;
  condition?:string;
}
export type BoundaryHome = Cell & {id:number};
export const boundaryDefinition=(kind:BoundaryKind):BoundaryModel =>
  BOUNDARY_MODELS.find(item=>item.kind===kind)!;
export const boundaryKey=(a:number,b:number):string =>
  Math.min(a,b)+':'+Math.max(a,b);
export const boundaryBetween=(a:BoundaryHome,b:BoundaryHome):Cell => ({
  x:(a.x+b.x)/2,y:(a.y+b.y)/2
});

/** Physical eligibility: two genuinely close houses with uninterrupted
 * private ground between them. A boundary cannot cut through the road, another
 * house or the shared town boundary. It never reserves a grid tile.
 */
export function canShareBoundary(
  a:BoundaryHome,b:BoundaryHome,allHomes:readonly BoundaryHome[]
):boolean {
  if (!HOMES[a.id] || !HOMES[b.id] || a.id===b.id) return false;
  const distance=manhattanDistance(a,b);
  if(distance<2||distance>4) return false;
  // Sample the *interior* of the line joining the house centres. Rounding
  // yields the grid cells visually crossed by a slender miniature boundary.
  for(let step=1;step<32;step++){
    const t=step/32;
    const x=Math.round(a.x+(b.x-a.x)*t);
    const y=Math.round(a.y+(b.y-a.y)*t);
    if(isRoad(x,y))return false;
    if(allHomes.some(home=>home.id!==a.id&&home.id!==b.id&&
      home.x===x&&home.y===y))return false;
  }
  return true;
}

/** Keep a hedge's Ward sightline concern grounded in actual road geometry.
 * A corner is detected from a change in the road loop's travel direction.
 */
export function boundaryNearBend(a:BoundaryHome,b:BoundaryHome):boolean {
  const middle=boundaryBetween(a,b);
  return ROAD_CELLS.some((cell,i)=>{
    const before=ROAD_CELLS[(i+ROAD_CELLS.length-1)%ROAD_CELLS.length];
    const after=ROAD_CELLS[(i+1)%ROAD_CELLS.length];
    const incoming={x:cell.x-before.x,y:cell.y-before.y};
    const outgoing={x:after.x-cell.x,y:after.y-cell.y};
    return (incoming.x!==outgoing.x||incoming.y!==outgoing.y) &&
      manhattanDistance(middle,cell)<=2.5;
  });
}
function activeModel(model:NeighbourModel):boolean {
  return model.condition!=='broken' && model.care!=='bare';
}
function nearbyModel(
  a:BoundaryHome,b:BoundaryHome,
  models:readonly NeighbourModel[],kind:ModelId,radius:number
):boolean {
  const mid=boundaryBetween(a,b);
  return models.some(item=>item.id===kind && activeModel(item) &&
    manhattanDistance(item,mid)<=radius);
}
const round2=(n:number):number=>Math.abs(n)<.005?0:Math.round(n*100)/100;
export interface BoundaryInfluence {
  irritationPerLap:number;
  reasons:string[];
}

/** Directional contribution of ONE neighbour to ONE household.
 * Base comes from the unchanged 8C preference/Manhattan-distance model.
 * Existing models are contextual and never added to the circuit elsewhere.
 */
export function influencedNeighbourEffect(
  residentId:number,neighbourId:number,
  a:BoundaryHome,b:BoundaryHome,base:number,
  improvements:readonly BoundaryImprovement[]=[],
  models:readonly NeighbourModel[]=[]
):BoundaryInfluence {
  const reasons:string[]=[];
  let amount=base;
  const installed=improvements.find(item=>
    boundaryKey(item.a,item.b)===boundaryKey(residentId,neighbourId));
  if(installed){
    const definition=boundaryDefinition(installed.kind);
    amount*=base>0?definition.tensionFactor:definition.friendshipFactor;
    if(base!==0)reasons.push(definition.name);
    // An enclosed, tall hedge at a genuine corner makes the safety-minded
    // Wards uneasy. It changes irritation, not the actual collision engine.
    if(installed.kind==='hedge' && residentId===5 && boundaryNearBend(a,b)){
      amount+=.35;
      reasons.push('Hedge obscures a road bend');
    }
  }
  if(base<0&&(residentId===1||residentId===3||neighbourId===1||neighbourId===3) &&
      nearbyModel(a,b,models,'bench',2)){
    amount-=.30;
    reasons.push('Shared bench');
  }
  if(base>0 && residentId===1 && neighbourId===2 &&
      nearbyModel(a,b,models,'tree',2)){
    amount*=.80;
    reasons.push('Oak buffers deliveries');
  }
  if(base>0 && residentId===5 && neighbourId===0 &&
      nearbyModel(a,b,models,'limit',3)){
    amount*=.70;
    reasons.push('Speed sign reassures the Wards');
  }
  return {irritationPerLap:round2(amount),reasons};
}
