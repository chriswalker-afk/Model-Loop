/** Eleven original miniature garden and family keepsake vignettes, drawn
 * in the game's fine etched-chalk Victorian engraving language. Transparent
 * background; tiny sage and brass details are the only colour.
 */
export const GARDEN_ART_SIZE={width:72,height:72} as const;
export function gardenTextureKey(variant:string):string {
  return 'vintage-garden-'+variant;
}
export function gardenSvg(variant:string):string {
  const ink='#d8dace',shade='#819489',brass='#cbb681',dark='#29382e';
  const P=(stroke:string=ink)=>`stroke="${stroke}" fill="none" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
  let contents='';
  switch(variant){
    case 'grass-a':
      contents=`<path d="M4 60Q24 63 68 59" ${P(shade)}/>`+
        `<path d="M9 59l-3-12m3 12 5-17m-5 17 1-23m12 22-5-12m5 12 7-18m-7 18 1-22m13 21-3-13m3 13 6-22m-6 22 1-17m14 15-4-13m4 13 6-19m-6 19v-18m10 16-3-12" ${P(ink)}/>`;
      break;
    case 'grass-b':
      contents=`<path d="M3 61q36 6 66-1" ${P(shade)}/>`+
        `<path d="M6 61Q5 43 2 40m4 21q11-14 7-25m11 25L19 41m5 20 4-25m12 24-3-22m3 22 10-23m1 23-3-14m14 15-4-28m4 28 6-17" ${P(ink)}/>`+
        `<path d="M28 53q-4-9-9-8m9 8q8-9 14-9m8 10q-3-12-11-14" ${P(shade)}/>`;
      break;
    case 'wildflowers':
      contents=`<path d="M4 63q30 2 64-1M13 61V40m17 22V32m15 30V42m16 19V36" ${P(shade)}/>`+
        `<path d="M13 51l-7-8m7 11 9-13m8 11-8-9m8 4 9-9m6 14-7-8m7 9 9-10m7 10 7-7" ${P(ink)}/>`+
        [ [13,39],[30,31],[45,41],[61,35] ].map(([x,y],i)=>
          `<circle cx="${x}" cy="${y}" r="3.1" fill="${i%2?brass:ink}" opacity=".88"/>`+
          `<circle cx="${x}" cy="${y}" r="1.15" fill="${dark}"/>`).join('');
      break;
    case 'shrub':
      contents=`<path d="M7 61H66M35 61v-27" ${P(brass)}/>`+
        `<path d="M11 51Q2 38 18 31Q17 16 34 18Q46 8 53 26Q68 25 64 42Q69 56 54 57Q39 62 29 55Q17 59 11 51Z" fill="${dark}" stroke="${ink}" stroke-width="1.3"/>`+
        `<path d="M17 41q9-8 18-2m4-14q8-7 13 2M29 52q6-9 13-7m11 1 7-6" ${P(shade)}/>`;
      break;
    case 'sapling':
      contents=`<path d="M8 64h56M36 63V37m0 12-10-12m10 6 13-16" ${P(brass)}/>`+
        `<path d="M12 37Q5 25 21 19Q23 3 39 14Q53 4 58 19Q69 29 59 38Q56 49 39 43Q20 51 12 37Z" fill="${dark}" stroke="${shade}" stroke-width="1.7"/>`+
        `<path d="M19 30q8-8 16-4m2-9 11 10m-7 13 10-9" ${P(ink)}/>`;
      break;
    case 'finch-map':
      contents=`<path d="M13 60h46M16 42h30v18H16zm5 0v-7h20v7" fill="${dark}" stroke="${ink}" stroke-width="1.6"/>`+
        `<path d="M30 43v16m-12-8h26m-2-6h9l8-5V21l-11 5-9-4-7 7v15" ${P(brass)}/>`+
        `<path d="M43 26v14m9-18v19m-21 4-4-7 6-5" ${P(ink)}/>`+
        `<circle cx="26" cy="50" r="2" fill="${brass}"/>`;
      break;
    case 'bell-easel':
      contents=`<path d="M35 15 14 63m21-48 21 48M15 63h42M35 39v24" ${P(brass)}/>`+
        `<path d="M18 17h33v28H18z" fill="${dark}" stroke="${ink}" stroke-width="1.6"/>`+
        `<path d="M24 37q7-13 12-9t10-5M23 40h23m-22-19h5" ${P(shade)}/>`+
        `<path d="M20 48h31" ${P(ink)}/>`;
      break;
    case 'miller-crates':
      contents=`<path d="M5 63h63M10 42h27v20H10zm25 5h24v15H35zM25 27h27v20H25z" fill="${dark}" stroke="${ink}" stroke-width="1.6"/>`+
        `<path d="m11 43 24 17m0-17L11 60m25-12 22 13m0-12L36 61M26 28l25 17m0-17L26 46" ${P(brass)}/>`;
      break;
    case 'marsh-hamper':
      contents=`<path d="M8 63h57M15 42h43l-5 19H20z" fill="${dark}" stroke="${ink}" stroke-width="1.5"/>`+
        `<path d="M20 42Q17 21 36 21Q56 22 54 42M27 42v18m16-18v18m-25-8h37m-35-6h37" ${P(brass)}/>`+
        `<path d="M29 24l-4-10m10 7 2-12m7 14 8-12" ${P(shade)}/>`;
      break;
    case 'hale-watering-can':
      contents=`<path d="M8 63h58M18 37h28l-4 24H24z" fill="${dark}" stroke="${ink}" stroke-width="1.8"/>`+
        `<path d="M45 40l17-14-5-5m-39 21Q4 24 19 21q13-1 13 15M28 33l9-5" ${P(brass)}/>`+
        `<path d="M55 28l5 6m-1 2 4 3m-8 1 2 4" ${P(shade)}/>`;
      break;
    case 'ward-lantern':
      contents=`<path d="M8 64h55M32 58V22m-7 37h16M22 33h21v22H22z" fill="${dark}" stroke="${ink}" stroke-width="1.6"/>`+
        `<path d="M27 33V23q5-12 11 0v10M24 37h17M26 51h13m-5-13v12M29 55l-3 7m13-7 3 7" ${P(brass)}/>`+
        `<path d="M15 44l-6-3m39 3 6-3M17 34l-6-7m36 7 6-7" ${P(shade)}/>`+
        `<circle cx="33.5" cy="44" r="5" fill="${brass}" opacity=".28"/>`;
      break;
    default:
      return gardenSvg('grass-a');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">`+
    contents+'</svg>';
}
