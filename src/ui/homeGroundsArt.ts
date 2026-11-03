/**
 * Pass C: engraved *architectural* grounds for a household, not standalone
 * roadside models. Each transparent SVG shares the native 140x148 house
 * viewport and exact image origin. The garden sits at the foundations and
 * the boundary follows the plot's near and receding edges, so both layers
 * read as one hand-assembled property when superimposed on the house art.
 *
 * Never use one of these as a Phaser physics body or an occupied grid tile.
 */
import { foundingStory } from '../game/founding';
import { manhattanDistance, type Cell } from '../game/config';
import {
  HOME_IMPROVEMENT_CATALOG, type HomeImprovementKind
} from '../game/homeImprovements';
import { WORLD_ART, WORLD_HOUSE_SIZE } from './vintageWorldArt';

export type GateFacing = 'left'|'right'|'centre';
export interface GroundHome extends Cell {id:number}
export type HomeGroundTexture = {
  residentId:number;kind:HomeImprovementKind;facing:GateFacing;
  key:string;
};
const A = WORLD_ART;
const edge = A.ink, green = '#95A891', gold=A.brass, dark = '#172119';
const path = (d:string,color:string=edge,width=1.65,opacity=1):string=>
  '<path d="'+d+'" stroke="'+color+'" stroke-width="'+width+
  '" opacity="'+opacity+'" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
const solid = (d:string,fill:string,stroke:string=edge,width=1.5,opacity=1):string=>
  '<path d="'+d+'" fill="'+fill+'" stroke="'+stroke+
  '" stroke-width="'+width+'" opacity="'+opacity+'" stroke-linejoin="round"/>';
const circle = (x:number,y:number,r:number,color:string,opacity=1):string=>
  '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+color+'" opacity="'+opacity+'"/>';

/** A friendly neighbour's real home determines which side a shared gate faces.
 * Otherwise it opens to the centre path; no invented neighbour or pair object.
 */
export function homeGateFacing(
  residentId:number,homes:readonly GroundHome[]
):GateFacing{
  const owner=homes.find(home=>home.id===residentId);
  if(!owner)return 'centre';
  const friends=foundingStory(residentId).closeTo;
  const closest=homes.filter(home=>home.id!==residentId&&
    friends.includes(home.id)&&manhattanDistance(owner,home)<=4)
    .sort((a,b)=>manhattanDistance(owner,a)-manhattanDistance(owner,b)||
      a.id-b.id)[0];
  if(!closest)return 'centre';
  const dx=closest.x-owner.x;
  return Math.abs(dx)<1?'centre':dx<0?'left':'right';
}
export function homeGroundTextureKey(
  residentId:number,kind:HomeImprovementKind,facing:GateFacing='centre'
):string {
  // Gate direction is the only neighbour-dependent visual variant.
  return 'vintage-property-'+residentId+'-'+kind+
    (kind==='gate'?'-'+facing:'');
}
export function allHomeGroundTextures():HomeGroundTexture[] {
  const entries:HomeGroundTexture[]=[];
  for(let residentId=0;residentId<6;residentId++)
    for(const {kind} of HOME_IMPROVEMENT_CATALOG)
      for(const facing of (kind==='gate'
        ? ['left','right','centre'] as const
        : ['centre'] as const))
        entries.push({residentId,kind,facing,
          key:homeGroundTextureKey(residentId,kind,facing)});
  return entries;
}

/** This is the same horizon and material treatment used by every house's
 * engraved doorstep. Transparent pixels retain the hand-drawn façade.
 */
function plotBase():string{
  return '<ellipse cx="70" cy="139" rx="63" ry="7" fill="'+dark+'" opacity=".64"/>'+
    solid('M9 139Q16 130 28 128L111 128Q123 132 131 139Q69 148 9 139Z',
      '#28342B',A.muted,.8,.56)+
    path('M10 139Q69 148 130 139',A.pale,1.1,.55);
}
function littleLeaves(cx:number,cy:number,flavour:number):string{
  let result='';
  const offsets=[[-8,2],[-3,-4],[5,-1],[10,3],[-1,4]];
  for(let j=0;j<offsets.length;j++){
    const [ox,oy]=offsets[j];
    const dx=(flavour+j)%3-1;
    const x=cx+ox+dx,y=cy+oy+(flavour%2);
    result+=solid('M'+x+' '+(y+4)+'q-7-5-1-10q6-4 10 3q2 4-9 7Z',
      '#334438',green,1,.87)+
      path('M'+x+' '+(y+3)+'l1-6',A.pale,.85,.72);
  }
  return result;
}
function wildflower(x:number,y:number,salt:number):string{
  const petals=[[-3,-1],[3,-1],[0,-4],[0,3]];
  return path('M'+x+' '+(y+11)+'v-9m0 5-4-3m4 5 3-4',green,1.3,.94)+
    petals.map(([dx,dy])=>circle(x+dx,y+dy,2.0,salt%3===0?gold:A.ink,.92)).join('')+
    circle(x,y,1.6,dark);
}
function gardenArt(kind:HomeImprovementKind,homeId:number):string{
  const shift=homeId%3-1;
  let detail=plotBase();
  switch(kind){
  case 'front':
    detail+=solid('M13 134Q20 124 37 127L53 138L46 143L12 141Z',
      '#314139',green,1.45,.96)+
      solid('M88 138L105 127Q123 124 128 135L127 141L93 143Z',
        '#314139',green,1.45,.96)+
      littleLeaves(32+shift,132,homeId)+littleLeaves(108-shift,133,homeId+3)+
      path('M67 123l-5 9 6 4-3 8M72 124l4 8-5 4 4 8',A.brass,1,.6)+
      path('M60 141h21M65 135h12M68 129h7',A.pale,1.2,.65);
    break;
  case 'flowers':
    detail+=solid('M11 140Q20 128 37 128L53 139Q31 146 11 140Z',
      '#3A4033',A.pale,1,.88)+
      solid('M87 139Q106 127 129 139Q107 146 87 139Z',
        '#3A4033',A.pale,1,.88)+
      [16,28,41,97,108,121].map((x,i)=>
        wildflower(x+shift,126+(i%2)*4,homeId+i)).join('')+
      path('M53 143q17-6 34 0',A.pale,1.2,.58);
    break;
  case 'kitchen':
    for(const x of [12,94]){
      detail+=solid('M'+x+' 133l31-3 4 12-35 2Z','#384034',A.pale,1.7,.88);
      for(let row=0;row<3;row++){
        const yy=134+row*3;
        detail+=path('M'+(x+4)+' '+yy+'l25-2',A.brass,.75,.55);
        for(let j=0;j<3;j++){
          const bx=x+6+j*9+(row%2)*2;
          detail+=path('M'+bx+' '+(yy+1)+'q-4-5-6-4m6 4q3-6 6-5',green,.9,.84);
        }
      }
    }
    detail+=path('M57 135l6 0m14 0h6M59 142h23',A.pale,1.1,.55);
    break;
  case 'patio':
    detail+=solid('M29 137Q70 123 111 137L114 142Q69 151 26 142Z',
      '#3C423A',A.pale,1.6,.96);
    for(let x=35;x<=103;x+=14)detail+=path('M'+x+' 135v8',A.muted,.95,.63);
    detail+=path('M37 139h66M54 133h33M31 142h78',A.muted,1,.55)+
      // Tiny garden-side bistro table and paired chairs, inside the
      // house's own base rather than a separate rentable tile.
      solid('M101 124q8-5 15 0l-1 3h-15Z','#434B3D',A.ink,1.3)+
      path('M108 127v13m-7-1h15M92 128l-3 4v7m30-11 3 4v7',A.brass,1.5,.88)+
      circle(106+shift,121,2,A.brass,.8);
    break;
  default: break;
  }
  return detail;
}
function commonBoundary():string{
  return plotBase()+
    // Receding side edges join the house's front walls and form one plot.
    path('M11 138L20 114M129 138L120 114',A.pale,1.2,.9);
}
function pickets(left:number,right:number,y:number):string{
  let out=path('M'+left+' '+(y-4)+'H'+right+
    'M'+left+' '+(y+1)+'H'+right,A.pale,1.8,.85);
  for(let x=left;x<=right;x+=7.5){
    const xx=Number(x.toFixed(1));
    out+=solid('M'+(xx-1.5)+' '+(y+5)+'v-12l1.5-3 1.5 3v12Z',
      '#314034',A.ink,1.05,.98);
  }
  return out;
}
function stonewall(left:number,right:number,y:number):string{
  return solid('M'+left+' '+(y-4)+'h'+(right-left)+'v10h-'+(right-left)+'Z',
    '#414239',A.ink,1.5,.97)+
    path('M'+(left-1)+' '+(y-5)+'h'+(right-left+2),A.pale,2.5,.92)+
    path('M'+left+' '+(y+1)+'h'+(right-left)+
      'M'+(left+9)+' '+(y+1)+'v5M'+(left+27)+' '+(y+1)+'v5',
      A.pale,.7,.58);
}
function hedge(left:number,right:number,y:number):string{
  let out=solid('M'+left+' '+(y+2)+'Q'+(left+2)+' '+(y-13)+' '+
    (left+12)+' '+(y-12)+'H'+(right-12)+'Q'+(right-1)+' '+(y-15)+' '+
    right+' '+(y+2)+'L'+right+' '+(y+7)+'H'+left+'Z',
    '#344A3D',green,1.4,.94);
  for(let x=left+4;x<right-2;x+=9){
    out+=path('M'+x+' '+(y-4)+'q-3-6-7-3m7 3q4-7 7-4',A.pale,.9,.6)+
      path('M'+(x-3)+' '+(y+3)+'l5-8',green,.8,.72);
  }
  return out;
}
function gardenGate(left:number,right:number):string{
  const centre=(left+right)/2;
  let out=path('M'+left+' 133v10M'+right+' 133v10',A.brass,2,.98);
  for(let x=left+2;x<=right-2;x+=5)out+=path(
    'M'+x+' 135v8l-2-5m2 5 2-5',A.ink,1.4,.91);
  return out+
    path('M'+(left+1)+' 137q'+(centre-left-1)+'-8 '+
      (right-left-2)+' 0',A.pale,1.3,.85)+
    circle(right-3,139,1.5,A.brass,.94)+
    path('M'+centre+' 135v9',A.brass,1.2,.78);
}
function boundaryArt(kind:HomeImprovementKind,homeId:number,facing:GateFacing):string{
  let detail=commonBoundary();
  switch(kind){
  case 'picket':
    detail+=pickets(11,56,139)+pickets(85,129,139)+
      path('M11 137l8-21M129 137l-9-21',A.pale,1.1,.7);
    break;
  case 'stone':
    detail+=stonewall(9,56,139)+stonewall(85,131,139)+
      solid('M9 138l10-21 6 0-9 21Z','#45473D',A.pale,1.2,.85)+
      solid('M123 117l8 21-7 0-7-21Z','#45473D',A.pale,1.2,.85);
    break;
  case 'hedge':
    detail+=hedge(9,56,135)+hedge(84,131,135)+
      littleLeaves(19,124,homeId)+littleLeaves(119,124,homeId+2);
    break;
  case 'gate': {
    // The gate is built *into* the plot edging. Its open side points to
    // an existing nearby friendly home when that geometry makes sense.
    const sides=facing==='left'?[[12,36],[83,130]]:
      facing==='right'?[[10,57],[104,128]]:
      [[10,53],[86,130]];
    detail+=path('M10 142h120',A.pale,1.1,.47);
    const [leftSegment,rightSegment]=sides;
    detail+=stonewall(leftSegment[0],leftSegment[1],141).replace(/v10/g,'v6')+
      stonewall(rightSegment[0],rightSegment[1],141).replace(/v10/g,'v6');
    if(facing==='left')detail+=gardenGate(37,59);
    else if(facing==='right')detail+=gardenGate(82,103);
    else detail+=gardenGate(57,85);
    detail+=path('M10 137l8-17M130 137l-8-17',A.pale,1.3,.65);
    break;
  }
  default:break;
  }
  return detail;
}

/** Transparent, full-size house-aligned architectural layer. Artwork never
 * spills beyond the original house bitmap, regardless of upgrade variant.
 */
export function homeGroundsSvg(
  residentId:number,kind:HomeImprovementKind,facing:GateFacing='centre'
):string{
  if(!Number.isInteger(residentId)||residentId<0||residentId>=6||
      !HOME_IMPROVEMENT_CATALOG.some(item=>item.kind===kind))
    throw Error('Unknown property art style');
  const isBoundary=HOME_IMPROVEMENT_CATALOG.find(item=>item.kind===kind)!.slot==='boundary';
  const body=isBoundary
    ? boundaryArt(kind,residentId,facing)
    : gardenArt(kind,residentId);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+
    WORLD_HOUSE_SIZE.width+'" height="'+WORLD_HOUSE_SIZE.height+
    '" viewBox="0 0 '+WORLD_HOUSE_SIZE.width+' '+WORLD_HOUSE_SIZE.height+
    '" data-house-id="'+residentId+'" data-ground-kind="'+kind+
    '" data-gate-facing="'+(kind==='gate'?facing:'centre')+
    '" aria-hidden="true" fill="none" stroke-linecap="round" '+
    'stroke-linejoin="round">'+body+'</svg>';
}
