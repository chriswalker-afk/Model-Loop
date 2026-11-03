/**
 * Pass 7D: the handmade 1908 world illustration library.
 *
 * Finely engraved SVG originals, drawn once by Phaser's loader, not regenerated
 * during traffic updates. All assets use top-left lighting, charcoal boards,
 * restrained ivory/brass accents, small architectural shadows and etched detail.
 *
 * Motorcars face +X in their native drawing; TownScene's existing ROAD pose
 * rotation provides their direction. These drawings NEVER define hitboxes.
 */
export const WORLD_ART = {
  ink: '#E9E2D5',
  pale: '#C3BFAE',
  muted: '#92978C',
  brass: '#D9B66B',
  chalk: '#D4D6CA',
  shadow: '#0B100D',
  shade: '#212A22',
  sage: '#9DAE99'
} as const;

export type CarVariant = 'runabout' | 'tourer' | 'delivery' | 'landaulette';
export type SceneryVariant =
  'clock-hall' | 'garden-fountain' | 'park-notice' | 'bandstand' |
  'oak-a' | 'oak-b' | 'oak-c';

export const carVariants: readonly CarVariant[] = [
  'runabout','tourer','delivery','tourer','delivery','landaulette'
];
export const sceneryVariants: readonly SceneryVariant[] = [
  'clock-hall','garden-fountain','park-notice','bandstand','oak-a','oak-b','oak-c'
];
export const WORLD_CAR_SIZE = { width:152, height:86 } as const;
export const WORLD_HOUSE_SIZE = { width:140, height:148 } as const;

function wrap(width:number,height:number,body:string):string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width +
    '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height +
    '" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    body + '</svg>';
}
const E=WORLD_ART;
function strokePath(d:string,w=1.35,color:string=E.ink,opacity=1):string {
  return '<path d="' + d + '" stroke="' + color + '" stroke-width="' +
    w + '" opacity="' + opacity + '"/>';
}
function filledPath(d:string,fill:string=E.shade,w=1.5):string {
  return '<path d="' + d + '" fill="' + fill + '" stroke="' + E.ink +
    '" stroke-width="' + w + '"/>';
}
function ellipse(cx:number,cy:number,rx:number,ry:number,
  color:string=E.muted,opacity=.55):string {
  return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' +
    ry + '" stroke="' + color + '" stroke-width="1" opacity="' + opacity + '"/>';
}
function archWindow(x:number,y:number,w=15,h=24):string {
  return '<path d="M' + x + ' ' + (y+h) + 'v-' + (h-7) +
    'q' + (w/2) + ' -13 ' + w + ' 0v' + (h-7) + 'Z" fill="#1A2520" stroke="' +
    E.ink + '" stroke-width="1.65"/>' +
    strokePath('M'+(x+w/2)+' '+(y+2)+'v'+(h-2)+'M'+x+' '+(y+h/2)+
      'h'+w,1.15,E.pale) +
    strokePath('M'+(x-2)+' '+(y+h+2)+'h'+(w+4),1.35,E.brass,.68);
}
function sashWindow(x:number,y:number,w=17,h=22):string {
  return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+
    '" fill="#19241F" stroke="'+E.ink+'" stroke-width="1.6"/>'+
    strokePath('M'+(x+w/2)+' '+y+'v'+h+'M'+x+' '+(y+h/2)+'h'+w+
      'M'+(x+3)+' '+(y+3)+'l4 4M'+(x+w-5)+' '+(y+3)+'l-4 4',
      1,E.pale)+
    strokePath('M'+(x-3)+' '+(y+h+2)+'h'+(w+6),1.35,E.brass,.64);
}
function brickwork(x:number,y:number,w:number,h:number):string {
  let marks='';
  for(let row=0;row<4;row++){
    const yy=y+5+row*8;
    if(yy>=y+h-3)break;
    marks+=strokePath('M'+x+' '+yy+'h'+w,.55,E.pale,.36);
    for(let col=0;col<5;col++){
      const xx=x+((row%2)*8)+col*16;
      if(xx<x+w-2)marks+=strokePath('M'+xx+' '+yy+'v6',.54,E.pale,.35);
    }
  }
  return marks;
}
function fence(left:number,right:number,y:number):string {
  let rails=strokePath('M'+left+' '+y+'H'+right+
    'M'+left+' '+(y+10)+'H'+right,1.15,E.pale,.75);
  for(let x=left;x<=right;x+=9)rails+=strokePath(
    'M'+x+' '+(y+13)+'v-18l-2 3m2-3 2 3',.9,E.ink,.73);
  return rails;
}

/** Tiny spoked coach wheels at four body corners; no modern capsule tyres. */
function wheels():string {
  let out='';
  for(const x of [28,118]){
    for(const y of [19,67]){
      out+='<circle cx="'+x+'" cy="'+y+'" r="10.3" fill="#080D0A" stroke="'+
        E.ink+'" stroke-width="1.6"/>'+
        '<circle cx="'+x+'" cy="'+y+'" r="7.1" stroke="'+E.pale+
        '" stroke-width="1"/>';
      for(let a=0;a<8;a++){
        const angle=a*Math.PI/4;
        const x2=(x+7.1*Math.cos(angle)).toFixed(2);
        const y2=(y+7.1*Math.sin(angle)).toFixed(2);
        out+=strokePath('M'+x+' '+y+'L'+x2+' '+y2,.83,E.ink,.83);
      }
      out+='<circle cx="'+x+'" cy="'+y+'" r="1.55" fill="'+E.brass+'"/>';
    }
  }
  return out;
}
function carFrame(tint:string):string {
  return '<ellipse cx="76" cy="45" rx="62" ry="27" fill="#050806" opacity=".36"/>'+
    // exposed chassis, bonnet, radiator and brass head lamps
    filledPath('M14 34 26 27 114 27 130 31 141 36 141 51 132 56 26 57 13 51Z',
      '#222923',1.55)+
    filledPath('M103 30 129 30 136 37 136 50 126 55 104 54Z','#34382F',1.55)+
    strokePath('M106 33v18M113 32v20M120 33v18M129 35v16',.65,E.pale,.85)+
    filledPath('M138 33h7v20h-7Z','#181D18',1.5)+
    strokePath('M141 36v14M140 39h4m-4 5h4',.68,E.brass,.9)+
    '<circle cx="137" cy="27" r="3" fill="'+E.brass+
      '" stroke="'+E.ink+'" stroke-width=".8"/>'+
    '<circle cx="137" cy="59" r="3" fill="'+E.brass+
      '" stroke="'+E.ink+'" stroke-width=".8"/>'+
    strokePath('M18 32h10M18 54h10M129 28l11-4M129 58l11 4',1,E.ink,.84)+
    '<path d="M28 29 60 24h45v37H59L28 56Z" fill="'+tint+
      '" fill-opacity=".67" stroke="'+E.ink+'" stroke-width="1.7"/>'+
    strokePath('M29 30 29 55M28 34h77m-76 18h76',.7,E.pale,.65)+
    wheels();
}
function vintageCab(variant:CarVariant):string {
  if(variant==='runabout')return (
    // small rear luggage rack, low windshield and open twin seats
    filledPath('M24 31 43 29 48 35 48 52 27 55Z','#37382E',1.25)+
    strokePath('M22 33l-7 2v15l8 2M18 35v15',1,E.brass,.75)+
    filledPath('M52 30 84 29 91 36 91 51 82 56 52 55Z','#1A221D',1.5)+
    filledPath('M56 35 72 34 75 40 75 48 55 49Z','#3D483F',.9)+
    filledPath('M77 34 85 35 85 50 77 51Z','#515044',1)+
    strokePath('M93 28l4 28M94 29l-5-3M94 55l-5 4',1.55,E.ink)+
    strokePath('M54 31q13-11 29 0',.8,E.brass,.8));
  if(variant==='tourer')return (
    // two exposed passenger rows, folding canopy and divided windscreen
    filledPath('M27 31 97 27 108 33 106 53 95 60 27 56Z','#232B25',1.6)+
    filledPath('M32 31 54 30 56 56 32 55Z','#626358',1.15)+
    filledPath('M59 31 83 29 85 57 59 56Z','#4C584F',1.15)+
    strokePath('M36 33h14m-14 19h14M64 33h16m-16 20h16',1.2,E.pale)+
    strokePath('M32 25q31-14 66 1M32 25l-3 7m68-6 6 7m-51-10v7m29-8v8',
      1.6,E.ink)+
    strokePath('M100 29v26M104 33v20',1.2,E.brass,.85));
  if(variant==='delivery')return (
    // upright wooden tradesman's body with side panels and roof rack
    filledPath('M24 25 81 21 93 29 93 57 27 60 22 51Z','#343A32',1.5)+
    filledPath('M29 28 78 26 85 32 84 52 31 54Z','#222D26',1.2)+
    strokePath('M31 29v25m13-26v26m15-28v29m15-28v26M29 40h55',1,E.pale,.75)+
    filledPath('M86 29 106 29v27H86Z','#43574D',1.5)+
    strokePath('M95 30v25M87 42h18',1.25,E.ink,.88)+
    strokePath('M24 22q29-11 62-2M29 18h50M29 17v7m50-7v5',1.3,E.ink)+
    strokePath('M34 36h38M34 44h38',.65,E.brass,.55));
  return (
    // formal closed landaulette with high coach roof and divided glass
    filledPath('M28 24 78 22 99 29 99 55 78 62 29 57Z','#2C3029',1.65)+
    filledPath('M31 29 76 26 90 32 90 53 77 58 32 55Z','#263832',1.1)+
    strokePath('M48 28v28M66 27v29M31 42h59',1.5,E.ink)+
    strokePath('M34 31h11m7-1h10m7-1h12M34 51h11m7 0h10m7 0h12',
      .8,E.pale,.8)+
    filledPath('M80 20 99 25 105 30 27 25 29 21Z','#3C4138',1.25)+
    strokePath('M29 19l17-4h45l13 11',1,E.brass,.82)+
    strokePath('M100 30v25M104 32v21',1.35,E.ink)+
    '<circle cx="39" cy="40" r="2" fill="'+E.brass+'" opacity=".7"/>');
}

/** Recognisably pre-1910 vehicles, with six household assignments. */
export function carSvg(residentIndex:number,tint='#6D786C'):string {
  const variant=carVariants[residentIndex];
  if(!variant)throw Error('Unknown resident motorcar: '+residentIndex);
  return wrap(WORLD_CAR_SIZE.width,WORLD_CAR_SIZE.height,
    carFrame(tint) + vintageCab(variant) +
    strokePath('M15 41h9M142 42h5',1.15,E.brass));
}

/** Six genuinely distinct period houses, all facing the miniature town. */
export function houseSvg(index:number):string {
  if(!Number.isInteger(index)||index<0||index>5)
    throw Error('Unknown house style: '+index);
  const ground='<ellipse cx="70" cy="135" rx="60" ry="8" fill="'+E.shadow+
    '" opacity=".48"/>'+
    strokePath('M13 129h114M21 134h100',1,E.pale,.45);
  let silhouette='';
  switch(index){
  case 0: // Finches: tall twin gables, enclosed bay and red-brick lintels.
    silhouette=
      filledPath('M25 62 29 31 50 13 77 28 88 13 112 32 116 62 116 121 25 121Z','#34332C')+
      filledPath('M18 61 49 20 78 59 87 21 121 61 114 64 87 35 76 70 49 32 26 68Z','#4A4A3D',2)+
      strokePath('M20 62 49 24 77 63 87 24 119 62M46 18l4-7 5 7',1.2,E.brass)+
      brickwork(26,69,88,45)+
      sashWindow(35,76,19,28)+sashWindow(85,73,20,29)+
      filledPath('M58 84 78 78 81 122H57Z','#202923')+
      strokePath('M61 89l14-4m-14 8 14-4M65 121V85',1.1,E.pale)+
      filledPath('M50 121 58 114h24l6 7Z','#3E4238')+
      strokePath('M96 31v-22h10v30M94 11h14',1.3,E.ink)+
      fence(25,48,117)+fence(91,116,117);
    break;
  case 1: // Bells: cottage with long half-timbered roof and open porch.
    silhouette=
      filledPath('M17 63 32 43 107 43 123 64 119 120H19Z','#2C3931')+
      filledPath('M11 65 35 30 102 29 129 65 121 68 101 40 37 42 20 69Z','#4C5044',2)+
      strokePath('M34 35l69-1M24 65l12-21M118 65l-17-22',1.1,E.brass)+
      strokePath('M20 73h100M35 47v74M100 47v74M39 49l60 60m-60 0 60-60',
        1.3,E.pale,.74)+
      sashWindow(42,72,18,26)+sashWindow(83,72,18,26)+
      filledPath('M59 88h23v33H59Z','#1C2922')+
      strokePath('M58 87h25M62 93h17M70 90v31',1.1,E.pale)+
      strokePath('M54 85l16-12 17 12',1.45,E.ink)+
      strokePath('M24 120h94M23 114h96',.9,E.ink)+
      fence(16,45,125)+fence(95,124,125);
    break;
  case 2: // Millers: stone villa with dormer and slate mansard roof.
    silhouette=
      filledPath('M23 53 30 26 108 26 117 56 117 124H23Z','#383B36')+
      filledPath('M19 54 29 19 108 19 122 54 114 60H26Z','#343C39',2)+
      strokePath('M30 22h78M25 52h92M33 30h71m-77 10h84',1.1,E.pale)+
      filledPath('M55 38 55 11 70 3 84 11 84 39Z','#313A32')+
      sashWindow(62,15,15,19)+
      strokePath('M55 12 69 2 84 12M31 66h78',1.3,E.brass)+
      archWindow(33,75,20,30)+archWindow(86,75,20,30)+
      filledPath('M58 90Q69 68 80 90V123H58Z','#1A231D')+
      strokePath('M62 93q7-14 14 0v29M69 91v31M55 124h29',1.2,E.ink)+
      brickwork(23,109,94,12)+
      strokePath('M109 22v-17h8v21M108 5h11',1.6,E.ink);
    break;
  case 3: // Marshes: low Victorian garden cottage with veranda and chimney.
    silhouette=
      filledPath('M20 75 35 48 106 48 120 75V124H20Z','#323C32')+
      filledPath('M13 74 36 37h68l24 37-10 2-17-25H38L20 77Z','#4C4B3F',2)+
      strokePath('M28 63h83M37 42h67',1,E.brass,.84)+
      filledPath('M45 53 45 23 61 14 78 23 78 53Z','#303D34')+
      strokePath('M43 25 61 11 80 25',1.3,E.ink)+
      sashWindow(53,29,18,19)+
      sashWindow(28,85,17,20)+sashWindow(94,85,17,20)+
      filledPath('M59 86h23v38H59Z','#1C2821')+
      strokePath('M63 92h15M70 86v38M57 88 71 78 85 88',1.2,E.pale)+
      strokePath('M17 109h106M21 115h99M33 76v41m73-41v41',1.3,E.ink)+
      strokePath('M26 117v9m86-9v9M15 124h110',1.4,E.pale)+
      strokePath('M102 46v-25h11v31M100 21h15',1.2,E.ink);
    break;
  case 4: // Hales: artisan's half-timber workshop with arched carriage bay.
    silhouette=
      filledPath('M18 58 29 28 108 28 124 57V125H18Z','#363B34')+
      filledPath('M11 61 30 17 108 17 129 60 121 62 105 27H33L20 64Z','#4A4D40',2)+
      strokePath('M30 20h76M24 58h102',1.2,E.brass)+
      strokePath('M19 66h103M29 29v95M107 29v95M29 67l25 32m-25 0 25-32m54 0-23 30m23-2-23-28',
        1.3,E.pale,.75)+
      filledPath('M50 88q19-26 38 0v37H50Z','#17251C')+
      strokePath('M56 93q13-20 26 0v30M69 84v40M52 112h34',1.35,E.ink)+
      sashWindow(35,41,15,20)+sashWindow(88,41,15,20)+
      filledPath('M53 17 53 7h30v10Z','#313A31')+
      strokePath('M54 9h28M67 8v9',1.05,E.ink)+
      strokePath('M13 126h114M15 121h112',1,E.pale);
    break;
  default: // Wards: symmetrical late-Victorian brick townhouse with bay.
    silhouette=
      filledPath('M23 48 33 25h75l12 22v78H23Z','#35342F')+
      filledPath('M15 49 31 18h78l18 31-8 5-15-28H36L23 54Z','#515044',2)+
      strokePath('M31 19h77M18 50h105M25 60h93',1.4,E.brass)+
      brickwork(24,63,95,57)+
      filledPath('M31 77 36 71h26l6 6v28l-6 7H36l-5-6Z','#27332A')+
      sashWindow(38,77,23,24)+
      sashWindow(83,74,24,29)+
      filledPath('M60 93h21v32H60Z','#1B241E')+
      strokePath('M69 93v31M63 98h15M61 123h20',1.25,E.pale)+
      filledPath('M56 91 70 82 85 91Z','#454B3F')+
      strokePath('M54 91 70 80 87 91',1.15,E.brass)+
      strokePath('M98 25v-17h10v20M95 8h15',1.1,E.ink)+
      fence(15,45,120)+fence(95,125,120);
  }
  return wrap(WORLD_HOUSE_SIZE.width,WORLD_HOUSE_SIZE.height,
    ground+silhouette+
    strokePath('M16 131h108',.8,E.ink,.63)+
    // tiny engraved front-stone number rather than a modern flat icon
    '<text x="119" y="138" text-anchor="end" font-family="Georgia,serif" '+
    'font-size="7.5" letter-spacing=".5" fill="'+E.pale+'">1908 · '+(index+1)+'</text>');
}

/** Irregular chalk foliage with visible branching and 40+ fine details. */
function oakSvg(style:0|1|2):string {
  const leafClouds=[
    [[37,53,20],[54,35,19],[83,31,20],[97,49,17],[68,55,26],[49,65,18],[89,67,17]],
    [[35,44,19],[54,29,19],[78,30,22],[97,48,21],[70,59,25],[43,64,19],[94,70,15]],
    [[39,54,23],[64,34,23],[90,40,24],[101,60,14],[62,65,25],[44,73,15],[83,73,15]]
  ][style];
  const sky=strokePath('M64 110 65 79 59 56 52 39m13 33 17-34m-18 42 25-23m-26 23-18-23',
    3,E.ink,.92)+
    strokePath('M69 112 68 86m-4 3-5-21m6 12 11-24m-14 35-11-10',
      1.05,E.pale,.9);
  const clouds=leafClouds.map(([x,y,r],i)=>
    filledPath('M'+(x-r)+' '+y+'q-5 -13 7 -18q4 -11 16 -8q12 -9 21 3'+
    'q13 6 8 20q8 14-7 20q-9 10-24 3q-15 4-21-8Z',
      i%3===0?'#2A3930':'#24352B',1.2)).join('');
  let leaves='';
  for(let i=0;i<55;i++){
    const x=26+(i*37+style*13)%80,y=20+(i*17+style*9)%62;
    leaves+=strokePath('M'+x+' '+y+'q4 -5 8-4m-7 9 5-2',
      .73,i%9===0?E.brass:E.pale,.5+(i%3)*.08);
  }
  return wrap(136,128,
    '<ellipse cx="69" cy="118" rx="34" ry="5" fill="'+E.shadow+'" opacity=".4"/>'+
    sky+clouds+leaves+
    strokePath('M58 107q10 4 21 0M55 115q11 2 25 0',1,E.ink));
}
function hallSvg():string {
  let facade='';
  for(const x of [23,48,115,140]){
    facade+=archWindow(x,101,14,27);
  }
  for(const x of [33,127]){
    facade+=strokePath('M'+x+' 80v64m-5-58h10',1.25,E.pale,.9);
  }
  for(let y=83;y<139;y+=12)facade+=strokePath('M18 '+y+'h145',.5,E.pale,.27);
  const clockFace='<circle cx="89" cy="52" r="15" fill="#1E2822" stroke="'+
    E.ink+'" stroke-width="2.25"/>'+
    '<circle cx="89" cy="52" r="11.5" stroke="'+E.brass+
      '" stroke-width=".8"/>'+
    Array.from({length:12},(_,i)=>{
      const a=i*Math.PI/6;
      const x1=(89+10*Math.sin(a)).toFixed(1),y1=(52-10*Math.cos(a)).toFixed(1);
      const x2=(89+12*Math.sin(a)).toFixed(1),y2=(52-12*Math.cos(a)).toFixed(1);
      return strokePath('M'+x1+' '+y1+'L'+x2+' '+y2,.95,E.ink);
    }).join('')+
    strokePath('M89 52v-7m0 7 6 3',1.65,E.ink);
  return wrap(180,180,
    '<ellipse cx="90" cy="161" rx="81" ry="8" fill="'+E.shadow+'" opacity=".52"/>'+
    filledPath('M16 88 30 78h120l14 10v66H16Z','#2C342D',2)+
    filledPath('M9 88 28 69h125l20 19-9 3H17Z','#41463B',2)+
    strokePath('M24 77h133M10 88h163',1.2,E.brass,.7)+
    // clock tower shaft above main building, with parapet and slate spire
    filledPath('M69 29h40v58H69Z','#353D33',1.8)+
    filledPath('M63 30 88 2 115 30l-6 4H70Z','#484B41',2)+
    strokePath('M88 5v-4m-6 4 6-4 6 4',1,E.brass)+
    strokePath('M66 33h47M70 74h38m-37 6h36',1,E.pale)+
    clockFace+
    '<rect x="77" y="69" width="25" height="9" fill="#1A231D" stroke="'+
    E.ink+'" stroke-width=".8"/>'+
    facade+
    filledPath('M70 114q19-34 38 0v40H70Z','#141C16',1.9)+
    strokePath('M76 118q13-24 25 0v35M89 111v44M73 153h34',1.15,E.pale)+
    strokePath('M14 151h151M25 157h131M68 88h42',1.15,E.brass,.65)+
    fence(8,63,144)+fence(115,171,144)+
    '<text x="89" y="171" font-family="Georgia,serif" font-size="8.5" '+
    'text-anchor="middle" letter-spacing="2" fill="'+E.pale+'">TOWN HALL</text>');
}
function fountainSvg():string {
  return wrap(118,94,
    '<ellipse cx="59" cy="81" rx="55" ry="8" fill="'+E.shadow+'" opacity=".42"/>'+
    '<ellipse cx="59" cy="71" rx="52" ry="16" fill="#253833" stroke="'+
      E.ink+'" stroke-width="2"/>'+
    '<ellipse cx="59" cy="65" rx="49" ry="14" fill="#192B27" stroke="'+
      E.pale+'" stroke-width="1.4"/>'+
    ellipse(59,65,40,10,E.pale,.5)+
    strokePath('M10 67v10q49 20 98 0V67M13 76q46 19 92 0',1.25,E.ink)+
    filledPath('M53 52 56 28h6l3 24Z','#3D4841',1.3)+
    '<ellipse cx="59" cy="43" rx="24" ry="7" fill="#293B35" stroke="'+
      E.ink+'" stroke-width="1.4"/>'+
    '<ellipse cx="59" cy="39" rx="22" ry="6" stroke="'+E.pale+
      '" stroke-width="1.3"/>'+
    filledPath('M57 38 57 18h4v20Z','#39443B',1.2)+
    '<ellipse cx="59" cy="16" rx="10" ry="4" fill="#344B41" stroke="'+
      E.ink+'" stroke-width="1.35"/>'+
    strokePath('M59 11v-8m-4 5 4-5 4 5M53 17q-20 14-24 39m33-39q26 12 29 39m-30-39q5 22 9 36',
      1.2,E.pale,.9)+
    strokePath('M28 54q-4 8-4 13m66-14q5 8 4 13',.9,E.brass,.82)+
    '<circle cx="59" cy="9" r="2" fill="'+E.brass+'"/>'+
    '<path d="M20 71q39 10 78 0" stroke="'+E.brass+
      '" stroke-width=".65" opacity=".45"/>');
}
function noticeSvg():string {
  return wrap(105,107,
    '<ellipse cx="52" cy="94" rx="39" ry="5" fill="'+E.shadow+'" opacity=".4"/>'+
    filledPath('M16 27 90 27 94 32 94 70 12 70 12 32Z','#2B3129',1.8)+
    strokePath('M20 32h67v32H20Z',.9,E.pale)+
    filledPath('M7 29 18 21h70l12 8-6 3H12Z','#46483D')+
    strokePath('M51 18v-8m-7 8 7-8 7 8',1.1,E.brass)+
    '<text x="53" y="43" text-anchor="middle" font-family="Georgia,serif" '+
    'letter-spacing="2.6" font-size="10.6" fill="'+E.ink+'">TOWN PARK</text>'+
    '<path d="M25 48h56m-51 6h46m-38 6h29" stroke="'+E.pale+
    '" stroke-width=".8" opacity=".77"/>'+
    strokePath('M22 70v23M84 70v23M16 94h15M77 94h14',2,E.ink)+
    strokePath('M18 27v42m71-42v42',1,E.brass,.63));
}
function gazeboSvg():string {
  return wrap(140,132,
    '<ellipse cx="70" cy="119" rx="55" ry="7" fill="'+E.shadow+'" opacity=".4"/>'+
    filledPath('M26 99 70 82 114 99 70 115Z','#2E3A31',1.6)+
    filledPath('M26 99 70 115v6L26 105Z','#202B22')+
    filledPath('M70 115 114 99v6L70 121Z','#18241C')+
    // curved Edwardian bandstand canopy
    filledPath('M15 57 70 15 126 57 70 75Z','#42463C',2)+
    filledPath('M27 59Q70 34 113 59L70 72Z','#344036',1.3)+
    strokePath('M70 16V7m-7 3 7-6 7 6M16 57l54-42 55 42M29 59 70 19l43 40',
      1.3,E.pale)+
    Array.from({length:10},(_,i)=>strokePath('M70 17L'+(20+i*11)+' 59',
      .73,E.ink,.62)).join('')+
    strokePath('M36 66v33m21-26v38m27-39v38m22-44v33',
      3,E.ink)+
    strokePath('M36 66v33m21-26v38m27-39v38m22-44v33',
      .8,E.brass,.9)+
    strokePath('M34 85h75m-70 7h63M35 83l20 9m-12-9 21 9m-10-9 21 9m-10-9 22 9m-8-9 16 9',
      1.05,E.ink,.84)+
    strokePath('M34 97h72M24 105l46 15 46-15',1.2,E.pale,.86)+
    '<circle cx="70" cy="9" r="3" fill="'+E.brass+'"/>');
}
export function scenerySvg(variant:SceneryVariant):string {
  switch(variant){
    case 'clock-hall':return hallSvg();
    case 'garden-fountain':return fountainSvg();
    case 'park-notice':return noticeSvg();
    case 'bandstand':return gazeboSvg();
    case 'oak-a':return oakSvg(0);
    case 'oak-b':return oakSvg(1);
    case 'oak-c':return oakSvg(2);
  }
}
export const sceneryDimensions: Record<SceneryVariant,{width:number;height:number}> = {
  'clock-hall': {width:180,height:180},
  'garden-fountain': {width:118,height:94},
  'park-notice': {width:105,height:107},
  'bandstand': {width:140,height:132},
  'oak-a': {width:136,height:128},
  'oak-b': {width:136,height:128},
  'oak-c': {width:136,height:128}
};

/**
 * Formal side elevation of the same 1908 landaulette coachwork, composed from
 * this library's ivory/brass engraving palette. Town cars are top-down to
 * convey road position; the chapter plate needs a proper side-profile model
 * rather than tipping that top-down texture on its edge.
 */
export function chapterMotorcarSvg():string {
  const tyre=(cx:number):string=>{
    let spokes='';
    for(let i=0;i<12;i++){
      const angle=i*Math.PI/6;
      const outerX=(cx+16.1*Math.cos(angle)).toFixed(2);
      const outerY=(103+16.1*Math.sin(angle)).toFixed(2);
      spokes+=strokePath('M'+cx+' 103L'+outerX+' '+outerY,.76,E.pale,.84);
    }
    return '<circle cx="'+cx+'" cy="103" r="21" fill="#0B120D" '+
      'stroke="'+E.ink+'" stroke-width="2.1"/>'+
      '<circle cx="'+cx+'" cy="103" r="17.6" stroke="'+E.pale+
      '" stroke-width=".9"/>'+spokes+
      '<circle cx="'+cx+'" cy="103" r="3.9" fill="#4A4330" stroke="'+
      E.brass+'" stroke-width="1"/>';
  };
  return wrap(264,142,
    '<ellipse cx="135" cy="127" rx="119" ry="9" fill="'+E.shadow+
      '" opacity=".64"/>'+
    // Exposed frame/side steps and rear luggage basket.
    filledPath('M10 90 34 85 215 85 247 94 246 105 17 105Z','#232B23',1.6)+
    filledPath('M20 92h211l-15 5H29Z','#3B4034',1.05)+
    strokePath('M30 92h177m-180 6h179M44 105h158',.88,E.brass,.85)+
    filledPath('M9 72h25v27H9Z','#2C372D')+
    strokePath('M12 74h20m-19 6h19m-19 6h19m-19 6h19',.85,E.pale)+
    // Carriage body and tall landaulette canopy.
    filledPath('M35 62h139l23 12v25H35Z','#333B32',1.85)+
    filledPath('M49 30 66 23h96l16 10v43H49Z','#303B32',1.7)+
    filledPath('M43 33 64 18h101l19 16-7 5H53Z','#3D4136',1.5)+
    strokePath('M64 23h99M51 36h126',1.1,E.brass,.85)+
    // Three divided coach windows with visible brass mullions.
    filledPath('M60 39h35v30H60Z','#1B3028',1.1)+
    filledPath('M98 39h32v30H98Z','#1B3028',1.1)+
    filledPath('M133 39h32v30h-32Z','#1B3028',1.1)+
    strokePath('M78 39v30M114 39v30M149 39v30M60 53h105',1.2,E.pale,.82)+
    strokePath('M64 43l9 8m4-9 8 12m17-11 10 11m22-11 10 11',.68,E.muted,.7)+
    // Door seams, side handles, roof strap and brass door clasps.
    strokePath('M97 36v60M132 36v60M49 77h128m-98 5h7m26 0h7m29 0h7',
      1.2,E.ink,.88)+
    strokePath('M48 29l15-11 97 0 17 10M52 31h125',.9,E.brass,.8)+
    '<circle cx="84" cy="82" r="1.8" fill="'+E.brass+'"/>'+
    '<circle cx="118" cy="82" r="1.8" fill="'+E.brass+'"/>'+
    // Scrolled bonnet, front windscreen, front radiator and lamps.
    filledPath('M178 66 214 69 241 77v18h-57Z','#3D4338',1.7)+
    strokePath('M182 70h31m-29 7h49m-49 7h51M183 90h52',.84,E.pale,.86)+
    filledPath('M239 71h8v28h-8Z','#1C271E',1.35)+
    strokePath('M241 74v22m3-21v20',.86,E.brass,.9)+
    strokePath('M179 35l6 37M182 39l-4-4m7 37 5 4',1.5,E.ink)+
    '<circle cx="237" cy="64" r="4.4" fill="#443D2A" stroke="'+
      E.brass+'" stroke-width="1.4"/>'+
    '<circle cx="245" cy="68" r="2.3" fill="'+E.brass+'"/>'+
    // Side fenders are structural arches over both real spoked wheels.
    strokePath('M35 100q2-28 27-29q26 0 31 29',2.25,E.ink)+
    strokePath('M165 100q3-28 28-29q27 0 31 29',2.25,E.ink)+
    strokePath('M38 99q5-23 24-24q20-1 27 24M169 99q5-23 24-24q20-1 27 24',
      .75,E.brass,.72)+
    tyre(64)+tyre(195)+
    strokePath('M28 106h12m46 0h87m44 0h16',1.65,E.ink,.8)+
    '<text x="132" y="135" text-anchor="middle" font-family="Georgia,serif" '+
    'font-size="7.2" letter-spacing="2" fill="'+E.pale+
    '">MOTOR CARRIAGE · 1908</text>');
}

export const carTextureKey=(index:number):string=>'vintage-car-'+index;
export const houseTextureKey=(index:number):string=>'vintage-house-'+index;
export const sceneryTextureKey=(variant:SceneryVariant):string=>'vintage-scenery-'+variant;

/** Same lossless Base64 format that Phaser's SVGFile loader already uses in 7C. */
export function worldSvgDataUri(svg:string):string {
  const bytes=new TextEncoder().encode(svg);
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return 'data:image/svg+xml;base64,'+btoa(binary);
}
