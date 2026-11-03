import type { GameStore } from '../game/state';
import {
  HOME_IMPROVEMENT_CATALOG, homeImprovementDefinition,
  type HomeImprovementKind, type HomeImprovementSlot
} from '../game/homeImprovements';
import { UPKEEP_INTERVAL_SECONDS } from '../game/economy';
import { MAX_NEIGHBOUR_EFFECT_PER_LAP } from '../game/founding';

const signed = (value:number):string =>
  (value>0?'+':'')+value.toFixed(2);
const tone = (value:number):string =>
  value<-.005?'warm':value>.005?'wary':'ordinary';

export function homeImprovementSlotMarkup(
  game:GameStore,residentId:number,slot:HomeImprovementSlot,
  selected:HomeImprovementKind|null
):string {
  const installed=game.getHomeImprovement(residentId,slot);
  const options=HOME_IMPROVEMENT_CATALOG.filter(item=>item.slot===slot)
    .map(item=>{
      const chosen=selected===item.kind;
      const fitted=installed?.kind===item.kind;
      return '<button type="button" class="home-improvement-option'+
        (chosen?' is-chosen':'')+(fitted?' is-fitted':'')+
        '" data-home-option="'+item.kind+'" aria-pressed="'+chosen+'">'+
        '<span class="home-option-heading"><strong>'+item.name+'</strong>'+
        '<b>'+item.cost+' coins</b></span>'+
        '<span class="home-option-description">'+item.description+'</span>'+
        '<span class="home-option-footer">Care '+item.upkeep+' / '+
          UPKEEP_INTERVAL_SECONDS+'s'+
          (fitted?' · Installed':'')+'</span></button>';
    }).join('');
  const existing=installed ? homeImprovementDefinition(installed.kind) : null;
  const locked=game.phase!=='playing'||game.paused||game.workshopOpen;
  const installedMarkup=existing
    ? '<div class="home-improvement-installed" aria-label="Installed '+slot+'">'+
      '<div><span class="home-status-label">CURRENTLY INSTALLED</span>'+
      '<strong>'+existing.name+'</strong><small>Care '+existing.upkeep+
      ' coins every '+UPKEEP_INTERVAL_SECONDS+' game seconds</small></div>'+
      '<button type="button" class="home-improvement-remove" '+
        'data-action="remove-home-improvement" data-home-slot="'+slot+'"'+
        (locked?' disabled':'')+
        ' aria-label="Remove '+existing.name+' from '+
        game.residents[residentId].name+'">Remove</button></div>'
    : '<p class="home-slot-empty">Nothing added to this part of the property yet.</p>';

  let forecast='';
  if(selected){
    const item=homeImprovementDefinition(selected);
    const preview=game.previewHomeImprovement(residentId,selected);
    const change=(after:number,before:number)=>
      Math.round((after-before)*100)/100;
    const local=[
      {label:'Beauty',before:preview.effectsBefore.beauty,after:preview.effectsAfter.beauty},
      {label:'Noise',before:preview.effectsBefore.noise,after:preview.effectsAfter.noise},
      {label:'Crime',before:preview.effectsBefore.crime,after:preview.effectsAfter.crime}
    ].filter(row=>row.before!==row.after);
    const personal=change(
      preview.effectsAfter.comfortPerLap,preview.effectsBefore.comfortPerLap);
    const owned=preview.affected.find(row=>row.residentId===residentId);
    const neighbours=preview.affected.filter(row=>row.residentId!==residentId);
    forecast='<section class="home-improvement-forecast" aria-label="'+
      item.name+' purchase forecast">'+
      '<span class="home-status-label">BEFORE YOU BUILD · '+item.name+'</span>'+
      '<p>'+item.description+'</p>'+
      '<div class="home-forecast-upkeep"><span>House care</span>'+
      '<strong>'+preview.upkeepBefore+' → '+preview.upkeepAfter+
      ' coins / '+UPKEEP_INTERVAL_SECONDS+'s</strong></div>'+
      (owned?
        '<div class="home-forecast-owner"><span>This household · irritation/circuit</span>'+
          '<strong class="relationship-score '+tone(owned.changePerLap)+'">'+
          signed(owned.previousPerLap)+' → '+signed(owned.predictedPerLap)+
          ' <em>('+signed(owned.changePerLap)+')</em></strong></div>'
        :'')+
      (neighbours.length
        ? '<div class="home-forecast-neighbours"><span>Nearby families</span>'+
          neighbours.map(row=>
            '<div class="home-forecast-neighbour"><span>'+row.name+'</span>'+
            '<strong class="relationship-score '+tone(row.changePerLap)+'">'+
            signed(row.previousPerLap)+' → '+signed(row.predictedPerLap)+
            ' <em>('+signed(row.changePerLap)+')</em></strong></div>'
          ).join('')+'</div>'
        :'<p class="home-forecast-quiet">No other household’s neighbour comfort changes.</p>')+
      (personal!==0?
        '<p class="home-forecast-personal">Garden calm: '+signed(personal)+
        ' irritation per circuit, included in the forecast above.</p>':'')+
      (local.length?
        '<div class="home-forecast-local">'+local.map(row=>
          '<span>'+row.label+' '+(row.after-row.before>0?'+':'')+
            (row.after-row.before)+'</span>').join('')+'</div>'
        :'')+
      '<p class="home-forecast-note">Negative irritation changes are helpful. '+
      'Totals are capped at ±'+MAX_NEIGHBOUR_EFFECT_PER_LAP.toFixed(2)+
      ' per circuit; this is a prediction, not a guarantee of better moods. '+
      'Previewing is free. Care is charged during play.</p>'+
      '<p class="home-forecast-reason" role="status">'+preview.reason+'</p>'+
      '<button type="button" class="home-improvement-buy" '+
        'data-action="install-home-improvement" data-home-kind="'+selected+'"'+
        (!preview.allowed?' disabled':'')+'>'+
        (preview.existing?'Replace':'Add to home')+
        ' · '+item.cost+' coins</button>'+
      '</section>';
  }
  return '<div class="home-improvement-content">'+installedMarkup+
    '<div class="home-improvement-options" role="group" aria-label="Choose a '+slot+
    ' for '+game.residents[residentId].name+'">'+options+'</div>'+
    forecast+'</div>';
}
