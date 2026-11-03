import type { BoundaryKind } from '../game/boundaries';

/** Original, hand-etched model-box sketches. Kept in the shop as small pieces
 * of the same monochrome-with-brass miniature world, not colourful UI icons.
 */
export function boundaryMiniatureSvg(kind:BoundaryKind):string {
  const ink='#e0ddce', brass='#d0b77f', green='#9bb7a0';
  let art='';
  if(kind==='picket'){
    art='<path d="M12 59H148" stroke="'+ink+'" stroke-width="1.5"/>'+
      '<path d="M20 44H140M20 55H140" stroke="'+brass+'" stroke-width="2"/>'+
      Array.from({length:8},(_,i)=>{
        const x=22+i*16;
        return '<path d="M'+x+' 66V26l6-7 6 7v40Z" fill="#26352b" '+
          'stroke="'+ink+'" stroke-width="1.2"/>';
      }).join('');
  } else if(kind==='stone'){
    art='<path d="M10 63H150" stroke="'+ink+'"/>'+
      '<path d="M16 28h128v35H16Z" fill="#333c36" stroke="'+ink+'" stroke-width="1.4"/>'+
      '<path d="M16 40H144M16 51H144M32 28v12m31-12v12m31-12v12m32-12v12'+
      'M48 40v11m32-11v11m32-11v11m-79 0v12m31-12v12m31-12v12m31-12v12" '+
      'stroke="'+brass+'" stroke-width=".9"/>';
  } else if(kind==='gate'){
    art='<path d="M14 62H146M28 17V65m104-48v48" stroke="'+ink+'" stroke-width="3"/>'+
      '<path d="M28 23l41 15v26H28Z" fill="#26352b" stroke="'+ink+'" stroke-width="1.6"/>'+
      '<path d="M132 23L84 36v28h48Z" fill="#26352b" stroke="'+ink+'" stroke-width="1.6"/>'+
      '<path d="M38 28v35m13-31v32m11-29v28m32-23v24m13-28v28m13-32v32" stroke="'+brass+'"/>'+
      '<circle cx="74" cy="51" r="3" fill="'+brass+'"/>';
  }else{
    art='<path d="M11 63H149" stroke="'+ink+'" stroke-width="1.2"/>'+
      Array.from({length:9},(_,i)=>{
        const x=21+i*14, y=35+(i%3-1)*3;
        return '<path d="M'+x+' 61v-22" stroke="'+brass+'" stroke-width="1.1"/>'+
          '<ellipse cx="'+x+'" cy="'+y+'" rx="13" ry="19" fill="#293c30" '+
          'stroke="'+green+'" stroke-width="1.2"/>';
      }).join('')+
      '<path d="M16 48q19-12 34 1t33-5 40 4 21-7" stroke="'+brass+'" stroke-width=".9"/>';
  }
  return '<svg class="boundary-miniature-art" viewBox="0 0 160 80" '+
    'role="img" aria-label="'+
    ({picket:'Engraved picket fence',stone:'Engraved stone wall',
      gate:'Engraved shared garden gate',hedge:'Engraved tall garden hedge'}[kind])+
    '" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" '+
    'stroke-linejoin="round">'+art+'</svg>';
}
