import type { ModelId } from '../game/config';

/**
 * The single source of miniature geometry in BOTH the collector's packaging
 * and the Phaser town. Every image on the board is a cached texture produced
 * from the very same SVG string returned to the HTML shop.
 *
 * Source coordinates: 130 × 104. Top-left illumination, fine engraved ivory
 * outlines, modest brass/foliage accents and the same foreshortened plinth.
 * No asset download, fonts, remote image or filter per-frame.
 */
const ink = '#E9E2D5';
const secondary = '#B8B2A5';
const brass = '#D9B66B';

export const MODEL_ART_WIDTH = 130;
export const MODEL_ART_HEIGHT = 104;
export const miniatureTextureKey = (id: ModelId): string => 'vintage-miniature-' + id;

function plinth(): string {
  return '<ellipse cx="65" cy="94" rx="43" ry="8" fill="#050805" opacity=".63"/>' +
    '<path d="M23 77 65 66 107 77 65 92Z" fill="#343A32" stroke="' + ink + '" stroke-width="1.2"/>' +
    '<path d="M23 77 65 92V97L23 82Z" fill="#1C231D" stroke="' + secondary + '" stroke-width=".9"/>' +
    '<path d="M65 92 107 77V82L65 97Z" fill="#111A14" stroke="' + secondary + '" stroke-width=".9"/>' +
    '<path d="M30 77 65 69 99 77 65 87Z" fill="#151D17" stroke="' + secondary + '" stroke-width=".55"/>' +
    '<path d="M30 79 64 89 99 79M24 80l40 14m2 0 40-14" stroke="' + brass +
    '" stroke-width=".45" opacity=".58" fill="none"/>' +
    '<path d="M31 85l8 3m51-4 8-3" stroke="' + ink + '" stroke-width=".55" opacity=".7"/>';
}

function lamp(): string {
  return '<defs><radialGradient id="gas-lamp-halo"><stop stop-color="' + brass +
    '" stop-opacity=".23"/><stop offset=".48" stop-color="' + brass +
    '" stop-opacity=".065"/><stop offset="1" stop-color="' + brass +
    '" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="65" cy="27" r="29" fill="url(#gas-lamp-halo)"/>' +
    // finial, tiered cap and delicate top
    '<path d="M65 1V5m-3-2 3-3 3 3M54 14 65 6l11 8M51 16l14-10 14 10" ' +
      'fill="none" stroke="' + ink + '" stroke-width="1.1"/>' +
    '<path d="M52 16h26l-3 5H55Z" fill="#273129" stroke="' + ink + '" stroke-width="1"/>' +
    '<path d="M56 21h18l-2 23H58Z" fill="#2B3025" fill-opacity=".47" stroke="' + ink + '" stroke-width="1.3"/>' +
    '<path d="M59 22v21m6-22v22m6-21v21M58 25h14M57 40h16" stroke="' + secondary + '" stroke-width=".85"/>' +
    '<path d="M64 35q-4-5 1-11q5 6 0 11Z" fill="' + brass + '" fill-opacity=".88"/>' +
    '<path d="M63 31v5m2-5v5" stroke="' + ink + '" stroke-width=".5" opacity=".75"/>' +
    '<path d="M53 44h24l-4 4H57ZM59 48h12l-3 3h-6Z" fill="#2B332B" stroke="' + ink + '" stroke-width="1"/>' +
    // iron shaft, fluting, collar and foot
    '<path d="M63 51h4l1 25h-6Z" fill="#29332B" stroke="' + ink + '" stroke-width="1.05"/>' +
    '<path d="M64 53v21m3-20-1 19M62 62h6m-6 6h6" stroke="' + secondary + '" stroke-width=".65"/>' +
    '<path d="M58 74h14l3 4H55ZM53 78h24v3H53Z" fill="#2B3129" stroke="' + ink +
    '" stroke-width="1.05"/>' +
    '<path d="M51 80h28m-23-3h18M59 50h12" stroke="' + brass + '" stroke-width=".55"/>';
}

function tree(): string {
  const clusters: Array<[number,number,number]> = [
    [46,34,17],[56,19,19],[75,17,17],[87,33,18],[74,43,20],
    [54,45,18],[38,45,13],[68,9,14],[87,19,12]
  ];
  const branches =
    '<path d="M62 77 65 52l-2-32m4 55-2-24 12-21m-12 26-16-23m16 8 3-22" ' +
      'stroke="' + ink + '" stroke-width="2.35" stroke-linecap="round" fill="none"/>' +
    '<path d="M61 77 64 59l-6-13m11 26-3-21m-4 5-3-16" stroke="' +
      secondary + '" stroke-width=".73" fill="none"/>';
  const leaves = clusters.map(([x,y,r],i) =>
    '<path d="M' + (x-r*.94) + ' ' + y + 'q-3 -11 7 -16q2 -' + (r*.7) +
    ' 13 -' + (r*.8) + 'q10 -11 20 1q' + (r*.7) + ' 8 0 16q-7 12-21 9q-8 5-19 0Z" ' +
    'fill="' + (i%3===0?'#26372B':'#263129') + '" stroke="' +
    (i%4===0?ink:secondary) + '" stroke-width="' +
    (i%4===0?'1.18':'.92') + '" opacity=".91"/>'
  ).join('');
  const detail = Array.from({length:26},(_,i)=>{
    const x=36+(i*17)%56,y=9+(i*11)%43;
    return '<path d="M'+x+' '+y+'q3 -5 8 -4m-5 7 4-2" stroke="' +
      (i%7===0?brass:secondary) + '" stroke-width=".55" opacity=".56" fill="none"/>';
  }).join('');
  return branches + leaves + detail +
    '<path d="M57 74 72 77m-13 2 13-1" stroke="' + ink + '" stroke-width=".9"/>';
}

function bench(): string {
  return '<g stroke-linecap="round" stroke-linejoin="round">' +
    // swept Victorian wrought-iron end frames
    '<path d="M35 49Q32 43 34 40q4-3 8 3l5 10m38 3q9-4 9-10q-1-5-6-4l-6 7" ' +
      'fill="none" stroke="' + ink + '" stroke-width="1.6"/>' +
    '<path d="M34 48Q49 40 79 34l11 5-38 14Z" fill="#3C362C" stroke="' + ink + '" stroke-width="1.1"/>' +
    '<path d="M31 58Q50 51 80 45l13 7-42 14Z" fill="#38352C" stroke="' + ink + '" stroke-width="1.2"/>' +
    // wooden slats with engraved longitudinal grain
    '<path d="m38 47 41-11m-36 15 41-11m-44 19 42-12m-37 16 42-12" stroke="' +
      secondary + '" stroke-width=".88" fill="none"/>' +
    '<path d="M39 49q19-6 39-11m-35 22q19-6 40-11" stroke="' + brass +
      '" stroke-width=".52" opacity=".65"/>' +
    '<path d="M35 47v12m55-18v13M38 61l-5 17m18-12-3 13m37-20 5 19m-7-29 1 12" ' +
      'fill="none" stroke="' + ink + '" stroke-width="1.4"/>' +
    '<path d="M30 79h9m43-1h12M32 58q-7 9 1 11q4 1 5-3m50-5q11 7 4 11q-5 2-7-3" ' +
      'stroke="' + secondary + '" stroke-width="1" fill="none"/>' +
    '<path d="M45 55 79 47m-29 14 34-11" stroke="' + ink + '" stroke-width=".65"/>' +
    '</g>';
}

function limit(): string {
  // A hand-painted pre-war roadside warning board; not a modern circular sign.
  return '<path d="M63 78V35h4v43Z" fill="#282F28" stroke="' + ink + '" stroke-width="1.1"/>' +
    '<path d="M59 78h12m-7-42v41m-6-2h14" fill="none" stroke="' + secondary + '" stroke-width=".75"/>' +
    '<path d="M41 13h48l4 5-4 36H41l-4-5V18Z" fill="#282D27" stroke="' + ink +
      '" stroke-width="1.55"/>' +
    '<path d="M44 17h42l2 3-2 30H44l-2-3V20Z" fill="#161B17" stroke="' +
      secondary + '" stroke-width=".85"/>' +
    '<path d="M45 26h39M45 44h39m-27-25h16" stroke="' + brass +
      '" stroke-width=".6" opacity=".85"/>' +
    '<text x="65" y="25" text-anchor="middle" font-size="6.5" letter-spacing=".5" ' +
      'font-family="Georgia,serif" fill="' + ink + '">MOTOR CARS</text>' +
    '<text x="65" y="41" text-anchor="middle" font-size="17" font-weight="700" ' +
      'font-family="Georgia,serif" fill="' + ink + '">20</text>' +
    '<text x="65" y="48" text-anchor="middle" font-size="5.5" letter-spacing=".6" ' +
      'font-family="Georgia,serif" fill="' + secondary + '">MILES / HOUR</text>' +
    '<path d="M47 55 83 55m-18 0v3" stroke="' + ink + '" stroke-width=".85"/>';
}

function police(): string {
  // Period constable/observation post, keeping the existing 'police' game ID.
  // Not the anachronistic 1929-style blue police telephone box.
  return '<path d="M47 76V30l18-9 18 9v46l-18 6Z" fill="#292D2A" stroke="' +
    ink + '" stroke-width="1.3"/>' +
    '<path d="m42 31 23-15 23 15-23 8Z" fill="#3A4038" stroke="' + ink +
      '" stroke-width="1.5"/>' +
    '<path d="M44 31 65 24 86 31m-22-7v13m-13-10v46m29-44v46" stroke="' +
      secondary + '" stroke-width=".8" fill="none"/>' +
    '<path d="M55 40h21v31H55Z" fill="#151C17" stroke="' + ink + '" stroke-width="1.2"/>' +
    '<path d="M58 43h15v13H58Z" fill="#2C3933" stroke="' + secondary + '" stroke-width=".65"/>' +
    '<path d="M65 43v13m-7-7h15m-13 10h11m-13 4h11" stroke="' +
      ink + '" stroke-width=".65"/>' +
    '<path d="M45 75 65 82 85 75M54 78h23" stroke="' + ink + '" stroke-width="1"/>' +
    '<path d="M65 13v4m-6-4h12M62 13q3-7 6 0" fill="none" stroke="' +
      brass + '" stroke-width="1.15"/>' +
    '<path d="M50 31h30m-33 4h36" stroke="' + ink + '" stroke-width=".6"/>' +
    '<circle cx="76" cy="61" r="1.5" fill="' + brass + '"/>' +
    '<text x="65" y="36" text-anchor="middle" font-size="5.1" ' +
      'font-family="Georgia,serif" letter-spacing=".55" fill="' + ink + '">CONSTABLE</text>';
}

function bin(): string {
  return '<path d="M46 32 49 73q16 9 32 0l3-41Z" fill="#26322B" stroke="' +
    ink + '" stroke-width="1.25"/>' +
    '<path d="M50 34v38m7-38v41m8-40v42m8-42v40m7-40-2 38" stroke="' +
    secondary + '" stroke-width="1.4" fill="none"/>' +
    '<path d="M47 43h36m-35 15h34M49 72q16 8 31 0" fill="none" stroke="' + ink +
    '" stroke-width=".78"/>' +
    '<path d="M39 30l8-7h36l8 7-26 7Z" fill="#3B4138" stroke="' + ink + '" stroke-width="1.45"/>' +
    '<path d="M46 23 65 18l19 5m-38 4h39" fill="none" stroke="' + secondary + '" stroke-width=".8"/>' +
    '<path d="M54 18q11-10 22 0M56 16l2-5h15l2 5" stroke="' + ink +
      '" stroke-width="1.05" fill="none"/>' +
    '<path d="M59 44h12v15H59Z" fill="#242B25" stroke="' + brass + '" stroke-width=".8"/>' +
    '<path d="M62 47l6 8m0-8-6 8" stroke="' + ink + '" stroke-width=".85"/>' +
    '<path d="M52 76 49 81m29-5 3 5m-31 0h32" stroke="' + ink +
      '" stroke-width="1.1" fill="none"/>' +
    '<path d="m44 33 4 38m35-38-3 38" stroke="' + brass +
      '" stroke-width=".45" opacity=".68"/>';
}

const modelIllustration: Record<ModelId, () => string> = {
  lamp, tree, bench, limit, police, bin
};

const readableName: Record<ModelId, string> = {
  lamp: 'gas lamppost', tree: 'oak tree', bench: 'park bench',
  limit: 'vintage speed notice', police: 'constable watch post',
  bin: 'cast-iron rubbish bin'
};

/**
 * Fixed-size SVG, suited to browser DOM and Phaser's SVG texture loader.
 * Do not fork these paths for a "quick simplified" placed-world version.
 */
export function miniatureSvg(id: ModelId): string {
  return '<svg class="miniature-svg" xmlns="http://www.w3.org/2000/svg" ' +
    'width="130" height="104" viewBox="0 0 130 104" role="img" ' +
    'aria-label="Engraved miniature ' + readableName[id] + ' on a display plinth" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    plinth() + modelIllustration[id]() + '</svg>';
}

/** Phaser preloads exactly the same SVG string as a texture once per kit. */
export function miniatureDataUri(id: ModelId): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(miniatureSvg(id));
}

/** Different model IDs are a permanent contract, artwork is not a new economy. */
export const modelArtIdentifiers: readonly ModelId[] =
  ['lamp', 'tree', 'bench', 'limit', 'police', 'bin'] as const;
