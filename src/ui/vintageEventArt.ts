/**
 * Pass 7E — original miniature props and incident illustrations.
 * This ONE source renders to Phaser textures and to the inspector's small
 * inline line-art icons. No Unicode placeholders or random drawing per frame.
 * All dimensions are 72x62, with a fine ivory engraving grammar.
 */
import type {EnvironmentKind} from '../game/environment';
import type {ActivityKind} from '../game/activities';
import {WORLD_ART,worldSvgDataUri} from './vintageWorldArt';

export type EventArtId =
  | `trace-${EnvironmentKind}`
  | `activity-${ActivityKind}`
  | 'incident-damage' | 'incident-break'
  | 'care-economy' | 'care-bare';

export const traceKinds: readonly EnvironmentKind[] =
  ['litter','flowers','skid','courtesy','mended','tidied',
    'heritage','display','guidance','sketch'] as const;
export const activityKinds: readonly ActivityKind[] =
  ['explore','sketch','delivery','working-lunch','picnic','gathering',
    'heritage-visit','safety-round'] as const;
export const eventArtIds: readonly EventArtId[] = [
  ...traceKinds.map(kind => `trace-${kind}` as EventArtId),
  ...activityKinds.map(kind => `activity-${kind}` as EventArtId),
  'incident-damage','incident-break','care-economy','care-bare'
];
export const EVENT_ART_SIZE={width:72,height:62} as const;
const C=WORLD_ART;
const base=(content:string):string =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="62" '+
  'viewBox="0 0 72 62" fill="none" stroke-linecap="round" '+
  'stroke-linejoin="round">'+content+'</svg>';
const p=(d:string,w=1.2,ink:string=C.ink,opacity=1):string =>
  '<path d="'+d+'" stroke="'+ink+'" stroke-width="'+w+
  '" opacity="'+opacity+'"/>';
const fill=(d:string,tint:string=C.shade,w=1.25):string =>
  '<path d="'+d+'" fill="'+tint+'" stroke="'+C.ink+
  '" stroke-width="'+w+'"/>';
const shadow='<ellipse cx="36" cy="53" rx="27" ry="5" fill="'+C.shadow+
  '" opacity=".42"/>';
const board=fill('M8 45 34 36 64 45 37 55Z','#232C25',1.1)+
  p('M8 45v4l29 10V55M37 59l27-10v-4',.8,C.pale,.62);
const wicker=(x=30,y=20):string =>
  fill('M'+x+' '+(y+11)+'q10-5 19 0l-2 17q-8 7-15 0Z','#4A4332')+
  p('M'+x+' '+(y+12)+'q8-19 19-1m-15 6 11-2m-12 8 11-2m-10 7 9-2',1,C.pale)+
  p('M'+(x+3)+' '+(y+13)+'q7-12 12 0',1.1,C.brass);
const framedSign=(name:string):string =>
  fill('M16 16h39v30H16Z','#26312A')+
  p('M20 19h31v23H20ZM24 45v7m22-7v7M13 51h45',.85,C.pale)+
  '<text x="35" y="27" text-anchor="middle" font-size="5.7" '+
  'font-family="Georgia,serif" fill="'+C.ink+'" letter-spacing=".3">'+name+
  '</text>';
const flowers=():string => {
  let stems='';
  for(const [x,y] of [[22,27],[34,16],[47,23]]){
    stems+=p('M36 47Q'+(x+2)+' 34 '+x+' '+y,1.35,C.sage)+
      '<circle cx="'+x+'" cy="'+y+'" r="4.6" fill="#2C4032" '+
      'stroke="'+C.ink+'" stroke-width="1.1"/>'+
      '<circle cx="'+x+'" cy="'+y+'" r="1.7" fill="'+C.brass+'"/>';
  }
  return stems+p('M26 41q-7-9-11-7m27 6q7-10 12-6',1,C.pale);
};
const traceArt:Record<EnvironmentKind,()=>string>={
  litter:()=>shadow+
    fill('M13 39 24 28l14 6-2 14-15 3Z','#575146',1.15)+
    p('M19 39l17-5M24 28l6 13m-4 1 10 6',.85,C.pale)+
    fill('M43 30l14-3 3 16-14 5Z','#3F4539')+
    p('M45 34l13 7m-12 3 11-14M9 52l9-3m29 6 13-4',.95,C.ink),
  flowers:()=>shadow+flowers()+p('M21 48q16 5 32 0',.85,C.brass),
  skid:()=>shadow+p('M12 24q8-9 17-3t17 5q5 3 13-2M12 33q8-9 17-3t17 5q5 3 13-2',
      2.1,C.pale)+
    p('M15 26l7-1m12 2 8 1m-23 8 8-1m18 2 7-1',.6,C.brass)+
    p('M50 15l7-7m-7 0 7 7',.95,C.ink),
  courtesy:()=>shadow+
    p('M10 39q9-19 24-20t28 19',1.1,C.pale)+
    p('M13 45q10-17 21-18t26 18',1.1,C.pale,.72)+
    p('M36 12v29m0 0-7-8m7 8 7-8',1.5,C.brass)+
    p('M16 34l-4 6 7 0m34-2 7 4-7 2',.95,C.ink),
  mended:()=>board+
    fill('M18 24h38v23H18Z','#353F36')+
    p('M18 32h38m-38 8h38M30 25v7m14 0v8m-16 0v7m17-7v7',1,C.pale)+
    p('M17 22l7 5m26-5 6 5M22 47l5-5m22 5 6-5',.85,C.brass),
  tidied:()=>shadow+
    p('M13 39l25-23M17 41l23-22',1.8,C.pale)+
    fill('M13 37 26 47 19 54 7 43Z','#655C42')+
    p('M8 46l9 8m-6-11 11 8m-4-12 9 8',.7,C.ink)+
    p('M42 24h14m-9-5v11m-5 13h15',.9,C.brass)+
    '<circle cx="53" cy="23" r="2" fill="'+C.brass+'"/>',
  heritage:()=>board+
    fill('M27 20 36 13l9 7v29H27Z','#3B453C')+
    p('M26 21l10-9 10 9M29 25h14M29 45h14M35 25v19',1,C.pale)+
    '<circle cx="36" cy="30" r="4" stroke="'+C.brass+
      '" stroke-width="1"/>'+p('M36 26v4l2 1',.8,C.ink),
  display:()=>shadow+framedSign('EXHIBIT')+
    p('M25 33h20m-15 5h10M12 13h47',.9,C.brass),
  guidance:()=>shadow+
    fill('M19 15h37l-4 28H23Z','#2B342B')+
    p('M16 24h40M22 47h32m-32 3h32',1,C.pale)+
    p('M26 34h23m0 0-8-7m8 7-8 7',1.6,C.brass)+
    p('M35 14v-5m-5 0h10',1,C.ink),
  sketch:()=>shadow+
    fill('M17 12h38v34H17Z','#2B322A')+
    p('M21 16h30v26H21Z',.8,C.pale)+
    p('M24 37l9-13 9 9 6-7M24 39h25M25 46v6m22-6v6',1,C.ink)+
    '<circle cx="27" cy="23" r="2" stroke="'+C.brass+
    '" stroke-width=".9"/>'+p('M16 48h40',.75,C.pale)
};
const activityArt:Record<ActivityKind,()=>string>={
  explore:()=>shadow+
    fill('M16 28 32 23l12 5 12-4v23l-12 3-12-5-16 4Z','#2E3B32')+
    p('M32 24v21m12-17v22m-23-17 7-4m9 12 5-7m9-3 3-3',.9,C.pale)+
    '<circle cx="39" cy="28" r="9" fill="#1B2921" stroke="'+C.ink+
      '" stroke-width="1.45"/>'+p('M45 35l12 12m-12-24-7 8',1.55,C.brass),
  sketch:()=>shadow+
    p('M36 12l-18 39m18-39 17 39m-35 0h36',1.8,C.pale)+
    fill('M22 12h29v27H22Z','#262F29')+
    p('M26 17h21v18H26Z',.8,C.pale)+
    p('M28 33l8-12 6 7 4-4M25 41h26',1,C.ink)+
    p('M50 15l8 23',1,C.brass),
  delivery:()=>shadow+
    fill('M9 32 25 26l14 7-16 8Z','#504838')+
    fill('M23 41 39 33v19l-16 6Z','#3C3A2E')+
    p('M23 41l-14-9m21-4 0 16m-7-4v17m-11-23 12 6',1,C.pale)+
    fill('M42 25 56 21 63 30 47 36Z','#564B35')+
    p('M42 25v17l6 5V36m15-6v13l-15 4',1,C.pale)+
    p('M44 32l15-5',.8,C.brass),
  'working-lunch':()=>shadow+
    fill('M13 33h43v13H13Z','#514A38')+
    p('M13 32q20-8 43 0m-37 3h31m-27 7h23',1.25,C.pale)+
    '<circle cx="35" cy="30" r="11" stroke="'+C.ink+
      '" stroke-width="1.4"/>'+p('M29 26l9 8m-5-13 7 12',.7,C.brass)+
    p('M16 47l-5 7m43-7 6 7',1.1,C.ink),
  picnic:()=>shadow+
    fill('M9 43 28 34l35 6-16 13Z','#343F31')+
    p('M13 41l31 10m-24-13 31 9m-25-10 30 8',.85,C.pale)+
    p('M20 37l-7 9m16-11-7 11m16-11-7 14m16-12-7 14',
      .7,C.brass,.79)+wicker(24,13)+
    '<circle cx="55" cy="36" r="4" fill="#E9E2D5" stroke="'+C.pale+
      '" stroke-width=".9"/>'+
    '<circle cx="15" cy="48" r="3" fill="'+C.brass+'"/>',
  gathering:()=>shadow+
    fill('M15 32 34 26l24 7-18 13Z','#3B3E32')+
    p('M16 33v9m24 4v8m18-21v10M20 33l20 10 13-10',1,C.pale)+
    '<circle cx="20" cy="21" r="5" fill="#303B33" stroke="'+C.ink+
      '" stroke-width="1.2"/>'+
    '<circle cx="45" cy="18" r="5" fill="#303B33" stroke="'+C.ink+
      '" stroke-width="1.2"/>'+
    p('M18 28q-8 3-7 10m34-13q10 3 10 11',1.4,C.ink)+
    p('M29 34h13m-12 3h11',.85,C.brass),
  'heritage-visit':()=>shadow+
    fill('M19 19l17-8 17 8v27H19Z','#3B4439')+
    p('M19 20h34M27 26h18M24 40h24M35 19v26',.95,C.pale)+
    '<circle cx="36" cy="31" r="6" stroke="'+C.brass+
      '" stroke-width="1.2"/>'+p('M36 26v5l3 2',1,C.ink)+
    p('M51 49l8-12m-9 5 9 6',1.8,C.ink),
  'safety-round':()=>shadow+
    fill('M22 14 43 14l8 13-8 13H22l-8-13Z','#2C352C')+
    p('M22 19h21M21 35h22m-11-17v17',.9,C.pale)+
    p('M43 42l13 10m-1-6 5 7m-5-7-8 2',1.8,C.brass)+
    '<circle cx="32" cy="27" r="6" stroke="'+C.ink+
      '" stroke-width="1.2"/>'
};
const seal=(broken:boolean):string =>
  '<circle cx="36" cy="30" r="23" fill="#242B25" stroke="'+
  (broken?C.ink:C.brass)+'" stroke-width="1.5"/>'+
  '<circle cx="36" cy="30" r="19" stroke="'+C.pale+
    '" stroke-width=".8" stroke-dasharray="3 2"/>'+
  (broken?
    p('M24 15l11 14-4 9 11 8m-12-5-9 7m20-33 8 8-8 4',2.2,'#DE9990')+
    p('M34 21l9 10-6 5',1.2,C.ink):
    p('M22 22l11 11-4 6 14 4m-9-20 8 5',1.7,C.brass)+
    p('M21 42l6-8',1,C.ink))+
  '<text x="36" y="58" text-anchor="middle" font-size="5.4" '+
  'font-family="Georgia,serif" letter-spacing="1" fill="'+C.pale+'">'+
  (broken?'BROKEN':'REPAIR')+'</text>';
const care=(bare:boolean):string =>
  shadow+
  fill('M27 10h19l-5 12h-9Z','#394237')+
  p('M29 12h16M31 16h12',.9,C.pale)+
  p('M34 23v23m7-23v23',1.6,C.ink)+
  (bare?p('M28 36l21 0m-19 7 17-13',1.8,'#DE9990'):
  p('M29 36l17-3m-17 8 17-3',1.2,C.brass));
export function eventSvg(id:EventArtId):string {
  if(id==='incident-damage')return base(seal(false));
  if(id==='incident-break')return base(seal(true));
  if(id==='care-economy')return base(care(false));
  if(id==='care-bare')return base(care(true));
  if(id.startsWith('trace-')){
    const kind=id.slice(6) as EnvironmentKind;
    const draw=traceArt[kind];
    if(!draw)throw Error('Unknown environment art '+id);
    return base(draw());
  }
  const kind=id.slice(9) as ActivityKind;
  const draw=activityArt[kind];
  if(!draw)throw Error('Unknown activity art '+id);
  return base(draw());
}
export function eventTextureKey(id:EventArtId):string {
  return 'vintage-event-'+id;
}
export function eventDataUri(id:EventArtId):string {
  return worldSvgDataUri(eventSvg(id));
}
/** A visual icon has no spoken text; its neighbouring label is the name. */
export function eventUiIcon(id:EventArtId):string {
  return eventSvg(id).replace('<svg ',
    '<svg class="vintage-event-icon" aria-hidden="true" focusable="false" ');
}
