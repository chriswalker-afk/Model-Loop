import {
  isOnBoard, isRoad, manhattanDistance, SCENERY_CELLS, type Cell
} from './config';

/**
 * Cosmetic scenery is deliberately NOT a model, an environmental event or a
 * tile reservation. Its plan is derived from the current homes and obstructions
 * every time a redraw is needed. It never changes money, stats, accidents,
 * household irritation or the traffic simulation.
 */
export const GARDEN_VARIANTS = [
  'grass-a','grass-b','wildflowers','shrub','sapling',
  'finch-map','bell-easel','miller-crates','marsh-hamper',
  'hale-watering-can','ward-lantern'
] as const;
export type GardenVariant=typeof GARDEN_VARIANTS[number];
export const FAMILY_GARDEN_PROP:readonly GardenVariant[] = [
  'finch-map','bell-easel','miller-crates','marsh-hamper',
  'hale-watering-can','ward-lantern'
];
export const FAMILY_PROP_LABELS:readonly string[] = [
  'Travel trunk and folded map','A small sketch easel',
  'Neatly stacked delivery crates','A picnic hamper',
  'Watering can and garden tools','An inspection lantern'
];
export type GardenHome=Cell & {id:number};
export interface GardenDetail {
  /** Stable for equal inputs; changes when a prop has to move aside. */
  key:string;
  residentId:number;
  variant:GardenVariant;
  cell:Cell;
  /** World pixel scale, not a gameplay footprint. */
  displayWidth:number;
  displayHeight:number;
}
export interface GardenObstructions {
  homes:readonly GardenHome[];
  modelCells?:readonly Cell[];
  civicCells?:readonly Cell[];
  activityCells?:readonly Cell[];
  effectCells?:readonly Cell[];
  boundaryPoints?:readonly Cell[];
}

const same=(a:Cell,b:Cell):boolean=>a.x===b.x&&a.y===b.y;
const fixedHash=(id:number,x:number,y:number,salt:number):number=>{
  let v=((id+19)*1013904223 ^ (x+27)*374761393 ^
    (y+31)*668265263 ^ (salt+7)*2246822519)>>>0;
  v=Math.imul(v^(v>>>15),2246822519);
  v=Math.imul(v^(v>>>13),3266489917);
  return (v^(v>>>16))>>>0;
};
const delta:readonly Cell[]=[
  {x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1},
  {x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},{x:1,y:1},
  {x:-2,y:0},{x:2,y:0},{x:0,y:-2},{x:0,y:2}
];

export function planGardenDetails(conditions:GardenObstructions):GardenDetail[] {
  const {homes}=conditions;
  const forbidden:Cell[]=[
    ...homes,...(conditions.modelCells??[]),
    ...(conditions.civicCells??[]),...(conditions.activityCells??[]),
    ...(conditions.effectCells??[])
  ];
  const boundaries=conditions.boundaryPoints??[];
  const all:GardenDetail[]=[];
  // Family order must not affect which possession gets the nicest patch.
  for(const home of [...homes].sort((a,b)=>a.id-b.id)){
    const candidates=delta.map(offset=>({
      x:home.x+offset.x,y:home.y+offset.y
    })).filter(cell=>
      isOnBoard(cell.x,cell.y)&&!isRoad(cell.x,cell.y)&&
      !forbidden.some(item=>same(item,cell))&&
      // Two households may be near the same patch; little garden models
      // cannot occupy one another's visual position.
      !all.some(detail=>same(detail.cell,cell))&&
      // Boundary miniatures are positioned at half-tile coordinates.
      !boundaries.some(point=>
        Math.abs(point.x-cell.x)<=.65&&Math.abs(point.y-cell.y)<=.65)
    ).sort((a,b)=>
      // First favour one-square gardening. Tie break using a stable hash
      // (never Math.random), independent of redraw count or frame rate.
      (Math.max(Math.abs(a.x-home.x),Math.abs(a.y-home.y))-
       Math.max(Math.abs(b.x-home.x),Math.abs(b.y-home.y)))||
      fixedHash(home.id,a.x,a.y,23)-fixedHash(home.id,b.x,b.y,23)
    );
    const variants:readonly GardenVariant[]=[
      FAMILY_GARDEN_PROP[home.id]??'grass-a',
      home.id%2===0?'grass-a':'grass-b',
      'wildflowers',home.id%3===0?'sapling':'shrub'
    ];
    const selected=candidates.slice(0,variants.length);
    selected.forEach((cell,i)=>{
      const variant=variants[i];
      const sapling=variant==='sapling';
      const prop=i===0;
      const dimensions=sapling?{displayWidth:32,displayHeight:42}:
        prop?{displayWidth:36,displayHeight:35}:
        {displayWidth:29,displayHeight:27};
      all.push({
        key:`${home.id}:${variant}:${cell.x},${cell.y}`,
        residentId:home.id,variant,cell,...dimensions
      });
    });
  }
  return all;
}

/** Progressive civic buildings; no hidden reserved squares before reveal.
 * The reference test town intentionally retains its historic complete view.
 */
export const CIVIC_PROGRESS_THRESHOLDS=[8,24,48,72] as const;
export function civicStageAt(progress:number):number {
  if(!Number.isFinite(progress))return 0;
  return CIVIC_PROGRESS_THRESHOLDS.filter(value=>progress>=value).length;
}
export function civicRevealStage(cell:Cell):number {
  const index=SCENERY_CELLS.findIndex(site=>same(site,cell));
  if(index<0)return 0;
  if(index===10)return 4; // clock hall: an established community
  if(index===11)return 3; // fountain
  if(index===12)return 2; // notice board
  if(index===0)return 2; // park bandstand
  if([1,4,7].includes(index))return 1;
  if([2,5,8].includes(index))return 2;
  return 3;
}
export function eligibleCivicSites(
  stage:number,candidates:readonly Cell[],
  homes:readonly Cell[],models:readonly Cell[],
  incidental:readonly Cell[]=[]
):Cell[] {
  if(stage<=0)return [];
  return candidates.filter(cell=>
    civicRevealStage(cell)>0&&civicRevealStage(cell)<=stage&&
    !models.some(model=>same(model,cell))&&
    !incidental.some(item=>same(item,cell))&&
    homes.every(home=>
      Math.max(Math.abs(cell.x-home.x),Math.abs(cell.y-home.y))>=
        (cell.x===11&&cell.y===6?3:2))
  ).map(cell=>({...cell}));
}

/** One shared audit helper: any visible decoration with a gameplay footprint
 * is a bug. Garden sprites never reserve a tile, even for garden saplings.
 */
export function gardenRespectsRoadAndModels(
  details:readonly GardenDetail[],models:readonly Cell[]
):boolean {
  return details.every(detail=>
    isOnBoard(detail.cell.x,detail.cell.y)&&!isRoad(detail.cell.x,detail.cell.y)&&
    !models.some(model=>same(model,detail.cell))&&
    detail.displayWidth<=36&&detail.displayHeight<=42
  );
}

export function nearestGardenToHome(
  residentId:number,details:readonly GardenDetail[],homes:readonly GardenHome[]
):number {
  const home=homes.find(site=>site.id===residentId);
  if(!home)return Infinity;
  return Math.min(Infinity,...details.filter(detail=>detail.residentId===residentId)
    .map(detail=>manhattanDistance(detail.cell,home)));
}
