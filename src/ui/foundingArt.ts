import { foundingStory } from '../game/founding';

const ink='#e6dfcf', brass='#d7b673', shade='#29342c';
const base = (body:string,label:string):string =>
  '<svg class="founding-keepsake-art" viewBox="0 0 180 110" '+
  'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+label+'">'+
  '<ellipse cx="91" cy="96" rx="65" ry="8" fill="#0c140f" opacity=".52"/>'+
  '<g stroke="'+ink+'" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round">'+
  body+'</g></svg>';

/** Six original tiny prop illustrations; no downloaded imagery or video. */
export function foundingKeepsakeSvg(id:number):string {
  const story=foundingStory(id);
  let body='';
  switch(story.keepsake){
    case 'map':
      body='<path d="M22 78L48 33L90 45L125 26L157 41L148 89L112 74L73 87L37 72Z" fill="'+shade+'"/>'+
        '<path d="M48 33L37 72M90 45L73 87M125 26L112 74"/>'+
        '<path d="M47 56q21-18 29-2t26-5 38 11" stroke="'+brass+'" stroke-dasharray="4 4"/>'+
        '<circle cx="47" cy="56" r="4" fill="'+brass+'"/><path d="M136 57l4 5 7-6"/>';
      break;
    case 'sketchbook':
      body='<path d="M36 84L48 29L137 37L124 90Z" fill="'+shade+'"/>'+
        '<path d="M49 33L131 41M43 43l-8 39M57 42q30 16 65 2M63 68q16-19 30-8t23-5"/>'+
        '<path d="M108 25l38 54 7-5-37-53Z" fill="'+brass+'" stroke="'+brass+'"/>'+
        '<path d="M134 70l14 13-4-17" fill="'+ink+'"/>'+
        '<path d="M58 31v11m10-10v12m11-11v12"/>';
      break;
    case 'crates':
      body='<path d="M29 49h61v44H29Z" fill="'+shade+'"/>'+
        '<path d="M91 34h59v59H91Z" fill="'+shade+'"/>'+
        '<path d="M45 21h48v26H45Z" fill="'+shade+'"/>'+
        '<path d="M29 49l61 44m0-44L29 93M91 34l59 59m0-59L91 93M45 21l48 26m0-26L45 47"/>'+
        '<path d="M52 60h18v8H52ZM108 54h23v9h-23Z" fill="'+brass+'"/>'+
        '<path d="M28 98h129" stroke="'+brass+'"/>';
      break;
    case 'basket':
      body='<path d="M39 55h100l-10 36H51Z" fill="'+shade+'"/>'+
        '<path d="M58 55q3-49 32-47 30-1 34 47" stroke="'+brass+'" stroke-width="4"/>'+
        '<path d="M50 65h78M47 75h85M61 56l8 35m9-36l4 36m10-36l4 36m9-36l5 36m9-36l5 36"/>'+
        '<path d="M28 46q20-14 38 0m52-3q19-16 35 2" stroke="'+brass+'"/>'+
        '<path d="M31 42l11-13 10 10 12-14 11 14" fill="'+shade+'"/>';
      break;
    case 'toolbox':
      body='<path d="M22 48h136v45H22Z" fill="'+shade+'"/>'+
        '<path d="M67 48V34q0-10 23-10t23 10v14M22 65h136"/>'+
        '<rect x="81" y="59" width="18" height="11" rx="2" fill="'+brass+'"/>'+
        '<path d="M39 39l13-15 9 3-6 8 9 11M133 41l-13-15-7 7 9 12"/>'+
        '<path d="M115 12q-2 16 9 19l13-11q-4 19-19 20l-20 22"/>'+
        '<path d="M47 78l20 0m49 0h20"/>';
      break;
    case 'lantern':
      body='<path d="M76 16q14-15 28 0v11H76Z"/>'+
        '<path d="M69 29h42l-7 55H76Z" fill="'+shade+'"/>'+
        '<path d="M78 32h25v47H78Z"/>'+
        '<path d="M91 71q-16-15-4-28 2 11 9 15 3-7 0-13 14 13-5 26Z" fill="'+brass+'" stroke="'+brass+'"/>'+
        '<path d="M65 84h50v9H65Z" fill="'+shade+'"/>'+
        '<path d="M90 5v-5m-35 20-12-8m82 8 12-8M52 48H34m94 0h18" stroke="'+brass+'"/>';
      break;
  }
  return base(body,story.keepsakeLabel);
}
