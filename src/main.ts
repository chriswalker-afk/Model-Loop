import { AUTO, Game, Scale } from 'phaser';
import { TownScene } from './game/TownScene';
import { BOARD, HOMES, isOnBoard, MODELS, type Cell, type ModelId } from './game/config';
import { miniatureSvg } from './ui/modelArt';
import { chapterMotorcarSvg } from './ui/vintageWorldArt';
import { foundingKeepsakeSvg } from './ui/foundingArt';
import { boundaryMiniatureSvg } from './ui/boundaryArt';
import { BOUNDARY_MODELS, type BoundaryKind } from './game/boundaries';
import { foundingStory, MAX_NEIGHBOUR_EFFECT_PER_LAP,
  type NeighbourhoodPlacementForecast } from './game/founding';
import { eventUiIcon } from './ui/vintageEventArt';
import { vintageIcon, vintageFrameCorners, type VintageIcon } from './ui/vintageIcons';
import { store } from './game/state';
import { CARE_LEVELS, careName, careDescription, modelEffects,
  modelCondition, modelConditionName, modelRepairCost, normalizedCare,
  UPKEEP_INTERVAL_SECONDS, type CareLevel } from './game/economy';
import { householdProfile, moodClass, moodName } from './game/households';
import { drivingProfile } from './game/driving';
import { environmentLabel, type EnvironmentKind } from './game/environment';
import { BIN_CAPACITY, BIN_CATCH_RADIUS, LITTER_CLEANUP_COST, binCareDescription } from './game/bins';
import { householdActionPair, type HouseholdActionId } from './game/behaviors';
import { activityDefinition, activityOptionsFor, type ActivityKind } from './game/activities';

const game = new Game({
  type: AUTO,
  width: 1152,
  height: 620,
  parent: 'game-container',
  backgroundColor: '#111515',
  antialias: true,
  render: { pixelArt: false },
  // CSS centres the board on desktop. Phaser auto-centering gives negative
  // canvas offsets inside a horizontally pannable phone viewport.
  scale: { mode: Scale.FIT, autoCenter: Scale.NO_CENTER },
  scene: [TownScene]
});

// The CSS layout can change when the HUD wraps or a phone rotates even if the
// browser's width stays the same. Phaser's FIT scale must follow the actual
// available board viewport, not a guessed breakpoint.
const townViewport = document.getElementById('town-pan');
if (townViewport && typeof ResizeObserver !== 'undefined') {
  let pendingFrame = 0;
  const observer = new ResizeObserver(() => {
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      game.scale.refresh();
    });
  });
  observer.observe(townViewport);
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
// Decorate static plates once, outside frequent live rendering. Corner art
// is an inert, aria-hidden overlay and cannot intercept selection or dragging.
for (const selector of ['.vintage-brand', '.vintage-era']) {
  document.querySelector(selector)?.insertAdjacentHTML('afterbegin', vintageFrameCorners());
}
const coinMark = document.querySelector<HTMLElement>('.balances .coin-icon');
if (coinMark) coinMark.innerHTML = vintageIcon('income');

function signed(n: number): string { return n > 0 ? '+' + n : String(n); }
function signedRelationship(n:number):string {
  return (n>0?'+':'')+n.toFixed(2);
}
function relationshipTone(n:number):string {
  return n<-.005?'warm':n>.005?'wary':'ordinary';
}
function relationshipForecastMarkup(forecast:NeighbourhoodPlacementForecast|null):string {
  if(!forecast)return '';
  const changed=forecast.affected.filter(effect=>effect.residentId!==forecast.residentId);
  return '<section class="founding-relationship-forecast" aria-label="Neighbourhood comfort projection">' +
    '<div class="relationship-forecast-heading"><strong>Life beside this road</strong>' +
    '<span class="relationship-score '+relationshipTone(forecast.predictedPerLap)+'">' +
    signedRelationship(forecast.predictedPerLap)+' irritation / circuit</span></div>' +
    '<p>' + (forecast.previousPerLap!==0
      ? 'Change from current plot: '+signedRelationship(forecast.changePerLap)+' per circuit.'
      : 'Estimated change for this household once the Vintage Years begin.')+'</p>' +
    (changed.length
      ? '<div class="relationship-other-effects"><b>Changes for existing neighbours</b>'+
        changed.map(effect=>'<div class="relationship-other-row"><span>'+effect.name+
          '</span><strong class="relationship-score '+relationshipTone(effect.changePerLap)+'">'+
          signedRelationship(effect.changePerLap)+'</strong></div>').join('')+'</div>'
      : '<p class="relationship-note">No other settled family changes their neighbour comfort.</p>')+
    '<p class="relationship-note">Negative numbers soothe irritation. Positive numbers increase it. '+
    'The total effect is capped at ±'+MAX_NEIGHBOUR_EFFECT_PER_LAP.toFixed(2)+
    ' per completed circuit; preferences are not necessarily mutual.</p></section>';
}

/** One set of hand-engraved icons for the town gauges and tile inspection. */
type TileScoreLabel = 'Beauty' | 'Noise' | 'Crime' | 'Road safety';
const tileIcon: Record<TileScoreLabel, VintageIcon> = {
  'Beauty': 'beauty', 'Noise': 'noise',
  'Crime': 'crime', 'Road safety': 'road-safety'
};
function scoreName(title: TileScoreLabel): string {
  return '<span class="tile-score-name">' + vintageIcon(tileIcon[title]) +
    '<span>' + title + '</span></span>';
}
function meter(label: string, percent: number, icon: VintageIcon,
  color: 'green' | 'blue' | 'red', value: string): string {
  const displayed = Math.max(0, Math.min(100, percent));
  return '<div class="meter meter-' + color + '" role="meter" aria-label="' + label +
    '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    Math.round(displayed) + '" aria-valuetext="' + value + '">' +
    '<div class="meter-top"><span class="meter-icon">' + vintageIcon(icon) +
    '</span><span class="meter-label">' + label + '</span><b>' + value + '</b></div>' +
    '<div class="meter-rail"><div class="meter-fill ' + color + '" style="width:' +
    displayed + '%"></div><span class="meter-graticule" aria-hidden="true"></span></div></div>';
}


function signedIncome(value: number): string {
  return (value > 0 ? '+' : '') + value;
}

function incomeMeter(): string {
  const flow = store.cashflow;
  const width = Math.min(49, Math.abs(flow.net) / 120 * 49);
  const debit = flow.net < 0;
  return '<div class="meter income-meter" title="Rolling sixty-second cashflow. ' +
    'Only completed car circuits generate earnings; placed models charge upkeep." ' +
    'aria-label="Income: ' + signedIncome(flow.net) + ' net coins in the last sixty seconds, ' +
    flow.gross + ' earned from laps and ' + flow.upkeep + ' spent on care.">' +
    '<div class="meter-top"><span class="meter-icon">' + vintageIcon('income') +
    '</span><span class="meter-label">Income</span>' +
    '<b class="' + (debit ? 'negative-flow' : 'positive-flow') + '">' +
    signedIncome(flow.net) + '<small>/60s</small></b></div>' +
    '<div class="flow-track"><span class="flow-center"></span><span class="flow-fill ' +
    (debit ? 'outflow' : 'inflow') + '" style="width:' + width +
    '%;left:' + (debit ? 50 - width : 50) +
    '%"></span><span class="flow-graticule" aria-hidden="true"></span></div>' +
    '<div class="flow-breakdown"><span>+' + flow.gross + ' laps</span>' +
    '<span>−' + flow.upkeep + ' care</span></div></div>';
}

let shopSignature = '';
let dragInProgress = false;
let draggingModelId: ModelId | null = null;

function isModelId(candidate: string | null): candidate is ModelId {
  return candidate !== null && MODELS.some((model) => model.id === candidate);
}

function renderShop(): void {
  // Do not detach a native HTML drag source until its dragend event.
  if (dragInProgress) return;
  const signature = [store.activeModel, store.money, store.phase, store.paused].join(':');
  if (signature === shopSignature) return;
  shopSignature = signature;
  byId('shop').innerHTML = MODELS.map((item, index) => {
    const picked = store.activeModel === item.id;
    const poor = store.money < item.cost;
    const disabled = store.phase !== 'playing' || store.paused;
    const effects = ([
      ['Beauty', item.beauty, 'beauty'],
      ['Noise', item.noise, 'noise'],
      ['Crime', item.crime, 'crime']
    ] as const).map(([label, value, icon]) =>
      '<span class="kit-effect" title="' + label + ' change ' + signed(value) + '">' +
      vintageIcon(icon) + '<span class="kit-effect-number">' + signed(value) +
      '</span><span class="kit-effect-label sr-only">' + label + '</span></span>'
    ).join('');
    return '<button type="button" draggable="' + !disabled +
      '" class="model-box kit-carton ' + (picked ? 'selected ' : '') +
      (poor ? 'unaffordable ' : '') + '" data-model="' + item.id +
      '" aria-pressed="' + picked +
      '" aria-label="Select ' + item.name + ', costs ' + item.cost +
      ' coins; Beauty ' + signed(item.beauty) + ', Noise ' + signed(item.noise) +
      ', Crime ' + signed(item.crime) + '; upkeep ' + item.upkeep +
      ' coins every ' + UPKEEP_INTERVAL_SECONDS + ' seconds" ' +
      (disabled ? 'disabled' : '') + '>' +
      // Each actual plane has its own shape, folded print and cast shadow.
      // The box is a single button: art never intercepts a drag or a click.
      '<span class="kit-side-face" aria-hidden="true"></span>' +
      '<span class="kit-top-face" aria-hidden="true"></span>' +
      '<span class="kit-front-face" aria-hidden="true"></span>' +
      '<span class="kit-front-print" aria-hidden="true"></span>' +
      '<span class="box-lip kit-hanger" aria-hidden="true">' +
      '<span class="box-hole"></span></span>' +
      '<span class="box-series"><span>1908 · SERIES I</span><span>No. 0' + (index + 1) +
      '</span></span>' +
      '<strong class="box-title">' + item.name + '</strong>' +
      '<span class="display-window">' +
      '<span class="kit-window-cavity" aria-hidden="true"></span>' +
      '<span class="window-backdrop" aria-hidden="true"></span>' +
      miniatureSvg(item.id) +
      '<span class="kit-window-rim" aria-hidden="true"></span>' +
      '<span class="window-glint" aria-hidden="true"></span>' +
      '<span class="kit-window-stamp">' + (picked ? 'LIFTED' : 'HANDMADE') +
      '</span></span>' +
      '<span class="kit-ledger">' +
      '<span class="kit-band"><span class="box-cost"><span class="coin-icon" ' +
      'aria-hidden="true">' + vintageIcon('income') + '</span>' + item.cost +
      '</span><span class="box-caption">COINS</span></span>' +
      '<span class="box-effects" aria-label="Beauty ' + signed(item.beauty) +
      ', Noise ' + signed(item.noise) + ', Crime ' + signed(item.crime) + '">' +
      effects + '</span>' +
      '<span class="box-description">' + item.caption + '</span>' +
      '<span class="box-upkeep" title="Maintenance costs ' + item.upkeep +
      ' coins every ' + UPKEEP_INTERVAL_SECONDS +
      ' game seconds at full care; reduce after placement">CARE ' +
      item.upkeep + ' / ' + UPKEEP_INTERVAL_SECONDS + 's</span>' +
      '</span></button>';
  }).join('');
}

/** Optional miniature workbench rather than a second permanent HUD. Buttons
 * stay native and accessible; the workshop retains keyboard focus on update.
 */
function renderBoundaryStudio():void {
  const workshop=byId<HTMLDetailsElement>('boundary-studio');
  workshop.hidden=store.phase!=='playing';
  if(workshop.hidden) {
    // Each generation begins with the miniature tray closed.
    workshop.open=false;
    return;
  }
  if(!workshop.open)return;
  const panel=byId('boundary-studio-content');
  const pairs=store.boundaryPairs;
  const selected=store.boundaryPair
    ? pairs.find(pair=>pair.a===store.boundaryPair?.a &&
        pair.b===store.boundaryPair?.b) : null;
  const chosen=store.boundaryKind;
  const selectedPreview=selected&&chosen
    ? store.previewBoundaryInstallation(selected.a,selected.b,chosen) : null;
  const pairMarkup=pairs.length ? '<div class="boundary-pair-list" role="group" aria-label="Choose two neighbouring families">'+
    pairs.map(pair=> {
      const active=selected?.a===pair.a&&selected?.b===pair.b;
      return '<button type="button" data-boundary-pair="'+pair.a+':'+pair.b+
        '" aria-pressed="'+active+'" class="boundary-pair-choice '+(active?'is-selected':'')+'">'+
        '<span>'+pair.name+'</span><small>'+
        (pair.existing?BOUNDARY_MODELS.find(item=>item.kind===pair.existing!.kind)!.name:'An open boundary')+
        '</small></button>';
    }).join('')+'</div>' :
    '<p class="boundary-empty">No neighbouring gardens share a safe boundary. '+
    'These pieces only fit between homes no more than four squares apart, '+
    'without crossing the road.</p>';
  const catalog=selected
    ? '<div class="boundary-options" role="group" aria-label="Choose a boundary miniature">'+
      BOUNDARY_MODELS.map(item=>
        '<button type="button" data-boundary-kind="'+item.kind+'" aria-pressed="'+
        (chosen===item.kind)+'" class="boundary-option '+(chosen===item.kind?'is-selected':'')+'">'+
        '<span class="boundary-art-box" aria-hidden="true">'+boundaryMiniatureSvg(item.kind)+'</span>'+
        '<span class="boundary-option-copy"><strong>'+item.name+'</strong>'+
        '<small>'+item.description+'</small></span><b>'+item.cost+' coins</b></button>'
      ).join('')+'</div>' : '';
  const projection=selectedPreview?
    '<div class="boundary-forecast" aria-label="Predicted irritation change per completed circuit">'+
      '<h3>Before → After</h3>'+
      selectedPreview.affected.map(effect=>
        '<div class="boundary-forecast-row"><span>'+effect.name+'</span>'+
        '<strong>'+signedRelationship(effect.previousPerLap)+' → '+
        signedRelationship(effect.predictedPerLap)+'</strong>'+
        '<em class="relationship-score '+relationshipTone(effect.changePerLap)+'">'+
        signedRelationship(effect.changePerLap)+'</em></div>'
      ).join('')+
      '<p class="boundary-small-note">Negative changes soothe irritation; positive changes increase it. '+
      'Totals remain capped at ±'+MAX_NEIGHBOUR_EFFECT_PER_LAP.toFixed(2)+
      ' per circuit. An item can help one family but not the other.</p>'+
      '<p class="boundary-purchase-reason" role="status">'+selectedPreview.reason+'</p>'+
      '<div class="boundary-actions">'+
      '<button type="button" data-action="install-boundary" class="boundary-install" '+
      (selectedPreview.allowed?'':'disabled')+'>'+
      (selectedPreview.existing?'Replace boundary':'Install miniature')+
      ' · '+selectedPreview.cost+' coins</button>'+
      (selectedPreview.existing?
        '<button type="button" data-action="remove-boundary" class="boundary-remove" '+
        (store.paused||store.workshopOpen?'disabled':'')+
        '>Remove · no refund</button>':'')+'</div></div>'
    :'';
  const markup='<div class="boundary-help"><p>Place a handmade miniature <strong>between two homes</strong>. '+
    'These pieces cost coins once and use no road or buildable square.</p>'+
    '<p>Select a pair, then a kit. Confirm only after seeing how both families will feel. '+
    'Existing benches, oak trees and speed signs can also change their relationships.</p></div>'+
    pairMarkup+catalog+projection;
  if(panel.innerHTML===markup)return;
  const focused=panel.contains(document.activeElement) &&
    document.activeElement instanceof HTMLButtonElement
      ? document.activeElement : null;
  const attribute=focused?.dataset.boundaryPair?'boundary-pair'
    :focused?.dataset.boundaryKind?'boundary-kind'
    :focused?.dataset.action?'action':null;
  const value=attribute=== 'boundary-pair' ? focused?.dataset.boundaryPair :
    attribute==='boundary-kind'?focused?.dataset.boundaryKind:focused?.dataset.action;
  const scroll=panel.scrollTop;
  panel.innerHTML=markup;
  panel.scrollTop=scroll;
  if(attribute&&value) {
    const matching=Array.from(panel.querySelectorAll<HTMLButtonElement>('button'))
      .find(button=>button.getAttribute('data-'+attribute)===value);
    matching?.focus({preventScroll:true});
  }
}
byId<HTMLDetailsElement>('boundary-studio').addEventListener('toggle',renderBoundaryStudio);

function renderPlacementStatus(): void {
  const status = byId('placement-status');
  if (store.phase === 'founding') {
    byId<HTMLButtonElement>('cancel-placement').hidden = true;
    byId('shop-section').classList.remove('has-selected');
    status.innerHTML = '<strong>Founding the town · ' + store.foundingCount +
      ' / 6</strong><span>Place all six homes to unlock the model collection.</span>';
    return;
  }
  const model = store.activeModel && store.getModel(store.activeModel);
  const cancel = byId<HTMLButtonElement>('cancel-placement');
  cancel.hidden = !model;
  byId('shop-section').classList.toggle('has-selected', !!model);
  if (!model) {
    status.innerHTML = '<strong>Choose a miniature</strong>' +
      '<span>Click a box to lift the model out, or drag it onto the town.</span>';
    return;
  }
  status.innerHTML = '<strong>' + model.name + ' is ready</strong>' +
    '<span>Click or drag to place · hold hover for a hint · Shift+click to inspect first · Esc to cancel.</span>';
}

function changeClass(value: number, lowerIsBetter: boolean): string {
  if (value === 0) return 'neutral';
  return (lowerIsBetter ? value < 0 : value > 0) ? 'positive' : 'negative';
}

function projectedRow(title: TileScoreLabel, before: number, after: number,
  lowerIsBetter: boolean): string {
  const change = after - before;
  return '<div class="tile-score projected-delta">' + scoreName(title) +
    '<div class="score-comparison"><span>' + signed(before) + '</span><i aria-hidden="true">→</i>' +
    '<b class="' + changeClass(change,lowerIsBetter) + '">' + signed(after) + '</b>' +
    '<em class="' + changeClass(change,lowerIsBetter) + '">' + signed(change) + '</em></div></div>';
}

let shownHouseholdId: number | null = null;
function renderHouseholds(): void {
  const list = byId('household-list');
  if (list.children.length !== store.residents.length) {
    list.innerHTML = store.residents.map(resident =>
      '<button type="button" class="household-ticket" data-resident="' + resident.id +
      '" aria-pressed="false"><span class="ticket-house" aria-hidden="true">⌂</span>' +
      '<span class="ticket-copy"><span class="family-name"></span>' +
      '<span class="ticket-track"><span class="ticket-fill"></span></span></span>' +
      '<span class="family-status"></span></button>'
    ).join('');
  }
  for (const resident of store.residents) {
    const ticket = list.querySelector<HTMLButtonElement>('[data-resident="' + resident.id + '"]');
    if (!ticket) continue;
    const mood = store.phase === 'founding'
      ? (store.homeFor(resident.id) ? 'Settled' : 'Awaiting home')
      : moodName(resident.irritation, resident.occupied);
    ticket.className = 'household-ticket ' + moodClass(resident.irritation, resident.occupied) +
      (store.selectedResident === resident.id ? ' active' : '');
    ticket.setAttribute('aria-pressed', String(store.selectedResident === resident.id));
    ticket.setAttribute('aria-label', resident.name + ': ' + mood +
      ', irritation ' + Math.round(resident.irritation) + ' out of 100. View household.');
    ticket.querySelector<HTMLElement>('.family-name')!.textContent = resident.name;
    ticket.querySelector<HTMLElement>('.family-status')!.textContent = mood;
    ticket.querySelector<HTMLElement>('.ticket-fill')!.style.width =
      (resident.occupied ? 100 - resident.irritation : 0) + '%';
  }
}

function renderHouseholdDetail(): void {
  const panel = byId('household-detail');
  const id = store.selectedResident;
  if (id === null) {
    panel.hidden = true;
    shownHouseholdId = null;
    return;
  }
  const resident = store.residents[id];
  if (!resident) return;
  panel.hidden = false;
  const profile = householdProfile(id);
  if (shownHouseholdId !== id) {
    shownHouseholdId = id;
    panel.innerHTML =
      '<div class="household-detail-header"><span class="eyebrow">A HOUSE ON THE LOOP</span>' +
      '<button class="household-close" data-action="close-household" aria-label="Close household details">×</button></div>' +
      '<h3>' + resident.name + '</h3>' +
      '<p class="household-intro">' + profile.introduction + '</p>' +
      '<div class="household-mood-row"><span class="household-mood"></span>' +
      '<strong class="household-irritation"></strong></div>' +
      '<div class="household-meter"><span class="household-meter-fill"></span></div>' +
      '<dl><dt>They appreciate</dt><dd>' + profile.feelsAtHomeWith + '</dd>' +
      '<dt>They find difficult</dt><dd>' + profile.findsDifficult + '</dd>' +
      '<dt>Behind the wheel</dt><dd>' + drivingProfile(id).roadHabit + '</dd></dl>' +
      '<div class="family-actions"><span class="eyebrow">HABITS ON THE ROAD</span>' +
      '<span class="family-action-positive">✿ ' + householdActionPair(id).helpful.label + '</span>' +
      '<span class="family-action-negative">◇ ' + householdActionPair(id).troublesome.label + '</span>' +
      '</div>' +
      '<details class="family-activities"><summary>Everyday activities</summary>' +
      '<p class="household-small-note">' +
      activityOptionsFor(id).map(activity => activity.title).join(' · ') + '</p></details>' +
      '<p class="household-active-activity"></p>' +
      '<p class="household-recovery" hidden>Driving a little more carefully after a roadside accident.</p>' +
      '<blockquote class="household-remark"></blockquote>' +
      '<p class="household-traffic-delay"></p>' +
      '<details class="family-relations"><summary>Who lives nearby · '+
      '<strong class="family-relations-total"></strong></summary>'+
      '<p class="family-relations-explanation">Neighbour comfort affects irritation once per completed circuit. '+
      'The combined effect is capped at ±'+MAX_NEIGHBOUR_EFFECT_PER_LAP.toFixed(2)+
      '; other street and driving conditions still matter.</p>'+
      '<div class="family-relations-list"></div>'+
      '<button type="button" class="open-boundary-studio" data-action="open-boundary-studio">'+
      'Explore fences, gates & gardens</button></details>' +
       '<div class="household-footprint"><span class="eyebrow">A RECENT TRACE</span>' +
      '<span class="household-last-action"></span></div>' +
      '<details class="family-neighbourhood"><summary>Shared moments</summary>' +
      '<ol class="neighbourhood-story-list"></ol></details>' +
      '<p class="household-small-note">A little attention to the journey can make all the difference.</p>';
  }
  panel.className = 'household-detail ' + moodClass(resident.irritation, resident.occupied);
  panel.querySelector<HTMLElement>('.household-mood')!.textContent =
    moodName(resident.irritation, resident.occupied);
  panel.querySelector<HTMLElement>('.household-irritation')!.textContent =
    Math.round(resident.irritation) + ' / 100 irritation';
  panel.querySelector<HTMLElement>('.household-meter-fill')!.style.width =
    (resident.occupied ? 100 - resident.irritation : 0) + '%';
  const delay = panel.querySelector<HTMLElement>('.household-traffic-delay')!;
  delay.textContent = resident.trafficDelay > 0.1
    ? 'Time lost waiting behind traffic: ' + resident.trafficDelay.toFixed(1) + ' seconds.'
    : '';
  delay.hidden = resident.trafficDelay <= 0.1;
  const relations=store.neighbourhoodFor(id);
  const relationsPanel=panel.querySelector<HTMLDetailsElement>('.family-relations')!;
  const total=panel.querySelector<HTMLElement>('.family-relations-total')!;
  total.className='family-relations-total relationship-score '+
    relationshipTone(relations.irritationPerLap);
  total.textContent=signedRelationship(relations.irritationPerLap)+'/circuit';
  const content=resident.occupied
    ? relations.neighbours.length
      ? relations.neighbours.map(near=>
        '<div class="family-relations-row"><span><b>'+near.name+'</b> · '+
        near.distance+' squares away'+
        (near.reasons?.length?'<small class="relationship-context">'+
          near.reasons.join(' · ')+'</small>':'')+
        '</span><strong class="relationship-score '+
        relationshipTone(near.irritationPerLap)+'">'+
        signedRelationship(near.irritationPerLap)+'</strong></div>').join('')
      : '<p class="relationship-note">No other families live within four squares.</p>'
    : '<p class="relationship-note">This household has moved away.</p>';
  const relationsList=panel.querySelector<HTMLElement>('.family-relations-list')!;
  if(relationsList.innerHTML!==content)relationsList.innerHTML=content;
  relationsPanel.hidden=false;
  const currentActivity = store.activities.forResident(id);
  const activityLine = panel.querySelector<HTMLElement>('.household-active-activity')!;
  activityLine.hidden = !currentActivity;
  activityLine.textContent = currentActivity
    ? 'RIGHT NOW · ' + activityDefinition(currentActivity.kind).title +
      ' · ' + currentActivity.phase.replace('-', ' ')
    : '';
  const recovery=panel.querySelector<HTMLElement>('.household-recovery')!;
  recovery.hidden=store.driverCautionFactor(id)===1;
  panel.querySelector<HTMLElement>('.household-remark')!.textContent =
    '“' + resident.lastRemark + '”';
  const latest = store.behaviourHistory.find(event => event.residentId === id);
  const activity = store.activities.history.find(event => event.residentId === id);
  const older = store.environment.history.find(event => event.residentId === id);
  const neighbour=store.neighbours.notesForResident(id)[0];
  const otherLatest=activity && (!latest || activity.time >= latest.time)
    ? activity : latest;
  panel.querySelector<HTMLElement>('.household-last-action')!.textContent =
    neighbour && (!otherLatest || neighbour.time >= otherLatest.time)
      ? neighbour.message :
    otherLatest?.message ?? older?.message ?? 'Nothing unusual noticed so far.';
  const shared=store.neighbours.notesForResident(id).slice(0,5);
  const storyBox=panel.querySelector<HTMLDetailsElement>('.family-neighbourhood')!;
  storyBox.hidden=shared.length===0;
  const storyList=panel.querySelector<HTMLOListElement>('.neighbourhood-story-list')!;
  const markup=renderNeighbourhoodItems(shared);
  if(storyList.innerHTML!==markup)storyList.innerHTML=markup;
}

function renderHouseholdReactions(
  effects: { residentId: number; name: string; irritationChangePerLap: number }[]
): string {
  if (!effects.length) return '';
  const moreAtEase = effects.filter(effect => effect.irritationChangePerLap < -0.05)
    .sort((a, b) => a.irritationChangePerLap - b.irritationChangePerLap)[0];
  const lessAtEase = effects.filter(effect => effect.irritationChangePerLap > 0.05)
    .sort((a, b) => b.irritationChangePerLap - a.irritationChangePerLap)[0];
  const line = (effect: typeof moreAtEase, label: string, klass: string) => effect
    ? '<div class="voice-line ' + klass + '"><span>' + label + ' · ' + effect.name +
      '</span><strong>' + signed(effect.irritationChangePerLap) + '</strong></div>'
    : '';
  return '<div class="preview-voices" aria-label="Different households react differently">' +
    '<div class="preview-voices-heading">Different journeys, different reactions</div>' +
    line(moreAtEase, 'Most relieved', 'good') +
    line(lessAtEase, 'Less comfortable', 'wary') +
    (!lessAtEase ? '<span class="quiet-note">No household expects to mind this model.</span>' : '') +
    '<small>Estimated irritation change each circuit</small></div>';
}

function renderBehaviourForecast(
  effects: Array<{
    residentId:number;name:string;helpfulLabel:string;troublesomeLabel:string;
    helpfulBefore:number;helpfulAfter:number;eventBefore:number;eventAfter:number;
    reasons:string[];
  }>
):string {
  if(!effects.length)return '';
  const percent=(n:number)=>Math.round(n*100)+'%';
  return '<details class="behaviour-forecast">' +
    '<summary>How this miniature changes driver habits</summary>' +
    '<p class="behaviour-forecast-caption">When an incident occurs, residents may help or hinder. ' +
      'Nearby objects change these chances; upkeep makes their influence stronger.</p>' +
    effects.map(row=>
      '<div class="behaviour-forecast-row"><strong>'+row.name+'</strong>' +
      '<span>Helpful action: '+row.helpfulLabel+'</span>' +
      '<b>Helpful share: '+percent(row.helpfulBefore)+' → '+percent(row.helpfulAfter)+'</b>' +
      '<span>Chance of any incident: '+percent(row.eventBefore)+' → '+
        percent(row.eventAfter)+'</span>' +
      '<small>'+row.reasons.join(' ')+'</small></div>'
    ).join('')+
    '</details>';
}

function renderNeighbourhoodItems(notes: readonly {
  time:number;sourceResidentId:number;actorId:number;message:string
}[]): string {
  return notes.map(note=>
    '<li><span class="neighbour-meta">' +
    Math.floor(note.time) + 's · ' +
    (store.residents[note.actorId]?.name ?? 'A neighbour') +
    '</span><span class="neighbour-text">' + note.message + '</span></li>'
  ).join('');
}

/** Only a click reveals a local event history, never the persistent HUD. */
function neighbourhoodNotes(tile:Cell):string {
  const notes=store.neighbours.notesNear(tile).slice(0,4);
  if(!notes.length)return '';
  return '<details class="neighbourhood-stories"><summary>What happened nearby · ' +
    notes.length + '</summary><ol class="neighbourhood-story-list">' +
    renderNeighbourhoodItems(notes) + '</ol></details>';
}

function accidentNotes(tile: Cell): string {
  const recent = store.accidents.active.find(incident =>
    (incident.model.x === tile.x && incident.model.y === tile.y) ||
    (incident.road.x === tile.x && incident.road.y === tile.y));
  if (!recent) return '';
  const model = store.getModel(recent.modelId);
  return '<div class="environment-notes accident-notes">' +
    '<span class="eyebrow">ROADSIDE INCIDENT</span>' +
    '<div class="environment-note"><span class="environment-mark" aria-hidden="true">' +
    eventUiIcon(recent.after === 'broken' ? 'incident-break' : 'incident-damage') +
    '</span>' +
    '<span><strong>' + model.name + ' · ' + modelConditionName(recent.after) +
    '</strong><p>One of the cars clipped this model. Roadside traffic is slower ' +
    'until the area is clear. Wards can help with the traffic; the Hales ' +
    'may restore part of the damage.</p><p>About ' +
    Math.ceil(Math.max(0,recent.endsAt-store.elapsedSeconds)) +
    ' game seconds of disruption remain.</p></span></div></div>';
}

function activityNotes(tile: Cell): string {
  const activity = store.activities.active.find(item =>
    (item.cell.x === tile.x && item.cell.y === tile.y) ||
    (item.roadCell.x === tile.x && item.roadCell.y === tile.y));
  if (!activity) return '';
  const details = activityDefinition(activity.kind);
  const phase = activity.phase === 'setting-up' ? 'Setting up' :
    activity.phase === 'underway' ? 'Underway' : 'Packing up';
  return '<div class="environment-notes activity-notes"><span class="eyebrow">' +
    'A LITTLE ACTIVITY</span><div class="environment-note"><span class="environment-mark" ' +
    'aria-hidden="true">' + eventUiIcon(`activity-${activity.kind}`) +
    '</span><span><strong>' + details.title + '</strong>' +
    '<p>' + details.description + '</p><p>' + phase + ' · About ' +
    Math.ceil(Math.max(0, activity.endsAt - store.elapsedSeconds)) +
    ' game seconds remaining. Cars pull over and rejoin when the road is clear.</p>' +
    '</span></div></div>';
}

function environmentNotes(tile: Cell): string {
  const nearby = store.environment.at(tile);
  if (!nearby.length) return '';
  return '<div class="environment-notes"><span class="eyebrow">TRACES LEFT BEHIND</span>' +
    nearby.slice(0, 4).map(effect => {
      const source = store.residents[effect.residentId]?.name ?? 'A neighbour';
      const timeLeft = Math.max(0, Math.ceil(effect.expiresAt - store.elapsedSeconds));
      return '<div class="environment-note ' + effect.kind + '">' +
        '<span aria-hidden="true" class="environment-mark">' +
          eventUiIcon(`trace-${effect.kind}`) + '</span>' +
        '<span><strong>' + environmentLabel(effect.kind) + '</strong>' +
        '<small>' + source + ' · fades in ' + timeLeft + 's</small></span></div>';
    }).join('') +
    '<p class="environment-hint">Traces change the next journeys. Repairs and tidy-ups ' +
    'can undo damage, while displays slow cars and bins catch new litter.</p></div>';
}

function binStatusPanel(cell: Cell): string {
  const info = store.getBinStatus(cell);
  if (!info) return '';
  const item = store.getPlacedModel(cell)!;
  const percent = Math.round(info.fill / info.capacity * 100);
  const emptyDisabled = !info.collectionPrice || store.money < info.collectionPrice ||
    store.paused || store.workshopOpen || store.phase !== 'playing';
  return '<section class="bin-status" aria-label="Rubbish bin collection">' +
    '<div class="bin-status-head"><strong>COLLECTION CAPACITY</strong><span>' +
      info.fill + ' / ' + info.capacity + ' pieces</span></div>' +
    '<div class="bin-fill-track" role="progressbar" aria-label="Bin fill" aria-valuemin="0"' +
      ' aria-valuemax="' + BIN_CAPACITY + '" aria-valuenow="' + info.fill + '">' +
      '<span style="width:' + percent + '%" class="' +
      (info.overflowed ? 'overflow' : '') + '"></span></div>' +
    (info.overflowed ? '<p class="bin-overflow"><strong>Overflow!</strong> This bin cannot catch litter. ' +
      'Nearby Beauty and Crime are getting worse.</p>' :
      info.fill === info.capacity
        ? '<p class="bin-overflow">Full — the next piece of litter may overflow.</p>'
        : '<p class="bin-hint">Intercepts litter within ' + BIN_CATCH_RADIUS +
          ' squares · ' + Math.round(info.reliability * 100) + '% catch reliability.</p>') +
    '<div class="bin-cost-line"><span>Routine care</span><b>' + info.regularUpkeep +
      ' coins / 20s</b></div>' +
    '<div class="bin-cost-line"><span>Automatic collection</span><b>' +
      (info.collectionDueIn === null ? 'Disabled' :
      'In ' + info.collectionDueIn + 's') + '</b></div>' +
    '<button type="button" data-action="empty-bin" data-x="' + item.x +
      '" data-y="' + item.y + '" class="empty-bin-button" ' +
      (emptyDisabled ? 'disabled' : '') + '>Empty now · ' +
      info.collectionPrice + ' coins</button>' +
    '<small class="bin-hint">Collection costs appear in net Income. ' +
      'Emptying a full or overflowing bin costs more.</small></section>';
}


const TILE_HOVER_DELAY_MS = 600;
let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null;
let hoverKey: string | null = null;
let hoverReady = false;

/** A full inspection is reserved for a click. Hover only reveals a small hint. */
function tileDetailsHeader(label: string): string {
  return vintageFrameCorners() +
    '<div class="tile-detail-top"><span class="eyebrow">' + label + '</span>' +
    '<button type="button" class="tile-close" data-action="close-tile" ' +
    'aria-label="Close square details" title="Close details">×</button></div>';
}

/** Live care, expiry and local conditions can update without losing keyboard focus. */
function updateTilePanelMarkup(content: string, key: string): void {
  const panel = byId('tile-panel');
  const sameSelection = panel.dataset.detailKey === key;
  const oldForecast = panel.querySelector<HTMLDetailsElement>('.behaviour-forecast');
  const keepForecast = sameSelection && !!oldForecast?.open;
  const oldStories=panel.querySelector<HTMLDetailsElement>('.neighbourhood-stories');
  const keepStories=sameSelection && !!oldStories?.open;
  const focused = sameSelection && panel.contains(document.activeElement)
    ? document.activeElement as HTMLElement : null;
  const focusedCare = focused?.getAttribute('data-care');
  const focusedAction = focused?.getAttribute('data-action');
  const focusedForecast = focused === oldForecast?.querySelector('summary');
  const focusedStories = focused === oldStories?.querySelector('summary');
  const oldScroll = sameSelection ? panel.scrollTop : 0;

  panel.innerHTML = content;
  panel.dataset.detailKey = key;
  const forecast = panel.querySelector<HTMLDetailsElement>('.behaviour-forecast');
  if (keepForecast && forecast) forecast.open = true;
  const stories=panel.querySelector<HTMLDetailsElement>('.neighbourhood-stories');
  if (keepStories && stories) stories.open=true;
  panel.scrollTop = oldScroll;
  const focusTarget = focusedStories ? stories?.querySelector('summary') :
    focusedForecast ? forecast?.querySelector('summary') :
    focusedCare ? panel.querySelector('[data-care="' + focusedCare + '"]') :
    focusedAction ? panel.querySelector('[data-action="' + focusedAction + '"]') : null;
  if (focusTarget instanceof HTMLElement) focusTarget.focus({ preventScroll: true });
}

function renderTilePeek(): void {
  const peek = byId('tile-peek');
  const tile = store.hovered;
  const allowedHover = window.matchMedia(
    '(min-width: 701px) and (hover: hover) and (pointer: fine)'
  ).matches;
  const eligible = allowedHover && (store.phase === 'playing' ||
    store.phase === 'founding') &&
    !store.workshopOpen && !store.selected && !!tile;
  const key = eligible ? tile!.x + ',' + tile!.y + ':' + (store.activeModel ?? 'inspect') : null;
  if (key !== hoverKey) {
    if (hoverDelayTimer !== null) clearTimeout(hoverDelayTimer);
    hoverDelayTimer = null;
    hoverKey = key;
    hoverReady = false;
    if (key !== null) {
      hoverDelayTimer = setTimeout(() => {
        hoverDelayTimer = null;
        if (hoverKey !== key) return;
        hoverReady = true;
        renderTilePeek();
      }, TILE_HOVER_DELAY_MS);
    }
  }
  if (!eligible || !hoverReady || !tile) {
    peek.hidden = true;
    peek.textContent = '';
    return;
  }
  const info = store.tileInfo(tile);
  if (!info) { peek.hidden = true; return; }
  let description: string;
  if (store.phase === 'founding') {
    const preview = store.previewFoundingHome(tile);
    description = store.foundingFamily === null
      ? 'Choose a family from the tray'
      : preview.allowed && preview.relationshipForecast
        ? 'READY FOR A HOME · '+signedRelationship(
          preview.relationshipForecast.predictedPerLap)+' irritation / circuit'
        : preview.reason;
  } else if (store.activeModel) {
    const model = store.getModel(store.activeModel);
    const preview = store.previewPlacement(tile, model.id);
    description = preview.allowed
      ? 'READY TO PLACE · ' + model.name + ' · ' + model.cost + ' coins'
      : 'CANNOT PLACE HERE · ' + preview.reason;
  } else if (store.getPlacedModel(tile)) {
    const placed = store.getPlacedModel(tile)!;
    const state = modelCondition(placed.condition);
    description = state !== 'intact' ? modelConditionName(state) + ' miniature · Click to repair'
      : 'Placed miniature · Click to change care';
  } else if (store.activities.isOccupied(tile)) {
    const ongoing = store.activities.at(tile)[0];
    description = activityDefinition(ongoing.kind).title + ' · Click to inspect';
  } else if (store.canPlace(tile)) {
    description = 'Available square · Click for details';
  } else {
    description = 'Click for details';
  }
  peek.innerHTML = '<strong>' + info.kind + '</strong><span>' +
    description + '</span>';
  peek.hidden = false;
  // Anchor to the *actual* canvas, not an assumed page grid. This also works
  // when the whole town is letterboxed inside a short landscape viewport.
  const board = byId('game-container').querySelector('canvas');
  const frame = peek.parentElement;
  if (!board || !frame) return;
  const canvas = board.getBoundingClientRect();
  const rect = frame.getBoundingClientRect();
  const pointX = canvas.left - rect.left +
    (BOARD.left + (tile.x + .5) * BOARD.tile) / BOARD.width * canvas.width;
  const pointY = canvas.top - rect.top +
    (BOARD.top + (tile.y + .5) * BOARD.tile) / BOARD.height * canvas.height;
  const width = peek.offsetWidth;
  const height = peek.offsetHeight;
  let left = pointX + 16;
  if (left + width + 8 > rect.width) left = pointX - width - 16;
  let top = pointY - height - 15;
  if (top < 7) top = pointY + 15;
  peek.style.left = Math.max(8, Math.min(left, rect.width - width - 8)) + 'px';
  peek.style.top = Math.max(7, Math.min(top, rect.height - height - 7)) + 'px';
}

function renderPlacedModelCare(): boolean {
  const placed = store.getPlacedModel(store.selected);
  if (!placed || store.activeModel) return false;
  const level = normalizedCare(placed.care);
  const model = store.getModel(placed.id);
  const condition = modelCondition(placed.condition);
  const current = modelEffects(placed.id, level, condition);
  const repairPrice = modelRepairCost(placed.id,condition);
  const cell = store.selected!;
  const info = store.tileInfo(cell);
  const panel = byId('tile-panel');
  panel.classList.add('is-active');
  const content =
    tileDetailsHeader('MODEL CARE · GRID ' + (cell.x + 1) + '/' + (cell.y + 1)) +
    '<h3>' + model.name + '</h3>' +
    '<div class="model-condition condition-' + condition + '">' +
    '<strong>Condition · ' + modelConditionName(condition) + '</strong>' +
    '<p>' + (condition === 'intact' ? 'The miniature is undamaged.' :
      condition === 'damaged' ?
        'Roadside impact: approximately half its usual benefits remain.' :
        'Broken by a roadside impact. Benefits and regular upkeep are suspended.') +
    '</p>' +
    (condition !== 'intact' ? '<button type="button" class="repair-model-button" ' +
      'data-action="repair-model" data-x="' + cell.x + '" data-y="' + cell.y + '"' +
      (store.money < repairPrice || store.paused || store.workshopOpen ? ' disabled' : '') +
      '>Repair miniature · ' + repairPrice + ' coins</button>' : '') +
    '</div>' +
    '<div class="care-heading"><span>' + careName(level) + '</span>' +
    '<strong>' + current.upkeep + ' coins / ' + UPKEEP_INTERVAL_SECONDS + 's</strong></div>' +
    '<p class="tile-tip">' + (condition === 'broken'
      ? 'No regular upkeep is due while broken. Repair it to restore benefits.'
      : 'Next bill in ' + store.careDueIn(placed) +
        ' game seconds. Choose how carefully it is maintained.') + '</p>' +
    '<div class="care-options" role="group" aria-label="Maintenance level for ' + model.name + '">' +
    CARE_LEVELS.map(care => {
      const effects = modelEffects(placed.id, care, condition);
      return '<button type="button" class="care-option ' +
        (care === level ? 'active' : '') + '" data-care="' + care +
        '" aria-pressed="' + (care === level) + '">' +
        '<span class="care-label"><strong>' + careName(care) + '</strong><b>' +
        effects.upkeep + ' / ' + UPKEEP_INTERVAL_SECONDS + 's</b></span>' +
        '<span class="care-description">' +
        (placed.id === 'bin' ? binCareDescription(care) : careDescription(care)) + '</span>' +
        '<span class="care-stats">Beauty ' + signed(effects.beauty) +
        ' · Noise ' + signed(effects.noise) +
        ' · Crime ' + signed(effects.crime) + '</span>' +
        (placed.id === 'limit' ?
          '<span class="care-speed">Cars travel at ' +
          Math.round(effects.speedMultiplier * 100) + '% of normal speed in range.</span>' : '') +
        '</button>';
    }).join('') +
    '</div>' +
    (info ? '<div class="care-now">Local conditions: Beauty ' + signed(info.beauty) +
      ' · Noise ' + signed(info.noise) + ' · Crime ' + signed(info.crime) + '</div>' : '') +
    '<p class="care-warning">A reduced care bill can mean less beauty, more noise or more crime. ' +
    'The effects on residents change too.</p>' +
    (placed.id === 'bin' ? binStatusPanel(cell) : '') +
    activityNotes(cell) + accidentNotes(cell) + environmentNotes(cell) +
    neighbourhoodNotes(cell);
  updateTilePanelMarkup(content, 'care:' + cell.x + ',' + cell.y);
  return true;
}

function renderTilePanel(): void {
  const panel = byId('tile-panel');
  if (store.phase === 'founding') {
    const tile = store.selected;
    const panel = byId('tile-panel');
    panel.hidden = !tile;
    panel.classList.toggle('is-active',!!tile);
    if (tile) {
      const preview = store.previewFoundingHome(tile);
      const family = store.foundingFamily;
      const familyName = family === null ? 'A founding home' : HOMES[family].name;
      const neighbours = preview.neighbours.length
        ? '<div class="founding-neighbour-preview"><strong>Near this plot</strong>' +
          preview.neighbours.map(hint =>
            '<p class="founding-neighbour-hint '+hint.tone+'"><b>'+hint.name+
            '</b><small>'+hint.distance+' squares away · '+hint.description+
            ' ('+signedRelationship(hint.irritationPerLap)+' irritation / circuit)</small></p>'
          ).join('') + '</div>' : '';
      const content = tileDetailsHeader('FOUNDING PLOT · ' + (tile.x+1) + '/' + (tile.y+1)) +
        '<h3>' + familyName + '</h3>' +
        '<div class="preview-status ' + (preview.allowed?'valid':'invalid') + '">' +
          (preview.allowed?'AVAILABLE PLOT':'NOT AVAILABLE') + '</div>' +
        '<p>' + preview.reason + '</p>' + neighbours +
        relationshipForecastMarkup(preview.relationshipForecast) +
        (preview.allowed
          ? '<button class="founding-place-button" data-action="place-founding" data-x="'+
            tile.x+'" data-y="'+tile.y+'">Place '+familyName+' here</button>'
          : '');
      updateTilePanelMarkup(content,'founding:'+tile.x+','+tile.y+':'+family+':'+store.foundingCount);
    }
    return;
  }
  const tile = store.selected;
  const details = store.tileInfo(tile);
  panel.hidden = !details;
  panel.classList.toggle('is-active', !!details);
  if (!details || !tile) {
    panel.innerHTML = '';
    delete panel.dataset.detailKey;
    return;
  }
  if (renderPlacedModelCare()) return;
  if (store.activeModel) {
    const model = store.getModel(store.activeModel);
    const preview = store.previewPlacement(tile, model.id);
    const status = preview.allowed ? 'READY TO PLACE' : 'CANNOT PLACE HERE';
    const content =
      tileDetailsHeader('PLACEMENT PREVIEW · ' + (tile.x + 1) + '/' + (tile.y + 1)) +
      '<h3>' + model.name + '</h3><div class="preview-status ' +
      (preview.allowed ? 'valid' : 'invalid') + '">' + status + '</div>' +
      '<p class="projection-caption">Local tile values · now → after</p>' +
      projectedRow('Beauty',preview.before.beauty,preview.after.beauty,false) +
      projectedRow('Noise',preview.before.noise,preview.after.noise,true) +
      projectedRow('Crime',preview.before.crime,preview.after.crime,true) +
      (preview.canPlace ?
        '<div class="preview-residents"><b>' + preview.affectedHouseholds +
        ' household cars</b> use this loop. <b>' + preview.affectedRoadTiles +
        ' road squares</b> are in range.' +
        '<span>Estimated irritation change per lap: <strong>' +
        signed(preview.irritationChangePerLap) + '</strong> on average across occupied homes.</span></div>' +
        renderHouseholdReactions(preview.householdEffects) +
        renderBehaviourForecast(preview.behaviourEffects) +
        (preview.neighbourEffects.length
          ? '<section class="model-neighbour-impact"><strong>Extra neighbour comfort per circuit</strong>'+
            preview.neighbourEffects.map(effect=>
              '<div class="boundary-forecast-row"><span>'+effect.name+'</span><b>'+
              signedRelationship(effect.previousPerLap)+' → '+
              signedRelationship(effect.predictedPerLap)+'</b>'+
              '<em class="relationship-score '+relationshipTone(effect.changePerLap)+'">'+
              signedRelationship(effect.changePerLap)+'</em></div>').join('')+
            '</section>' : '') : '') +
      (model.id === 'bin' ? '<p class="bin-hint">Catches up to ' +
         BIN_CAPACITY + ' items within ' + BIN_CATCH_RADIUS +
         ' squares. Collection bills are additional to upkeep; existing litter needs separate cleaning.</p>' : '') +
      '<p class="tile-tip">' + preview.reason + '</p>';
    updateTilePanelMarkup(content, 'preview:' + tile.x + ',' + tile.y + ':' + model.id);
    return;
  }
  const content = tileDetailsHeader('GRID ' + (tile.x + 1) + ' / ' + (tile.y + 1)) +
    '<h3>' + details.kind + '</h3>' +
    '<div class="tile-score">' + scoreName('Beauty') +
      '<b>' + signed(details.beauty) + '</b></div>' +
    '<div class="tile-score">' + scoreName('Noise') +
      '<b>' + signed(details.noise) + '</b></div>' +
    '<div class="tile-score">' + scoreName('Crime') +
      '<b>' + signed(details.crime) + '</b></div>' +
    '<div class="tile-score">' + scoreName('Road safety') +
      '<b>' + details.roadSafety + '%</b></div>' +
    (store.traffic.queuedNear(tile) > 0
      ? '<p class="traffic-tile-note">Cars are queueing nearby: slower journeys, higher noise and irritation.</p>'
      : '') +
    activityNotes(tile) + accidentNotes(tile) + environmentNotes(tile) +
    neighbourhoodNotes(tile) +
    (store.environment.at(tile, 0).some(effect => effect.kind === 'litter') ?
      '<button type="button" class="clear-litter-button" data-action="clear-litter" data-x="' +
      tile.x + '" data-y="' + tile.y + '"' +
      (store.money < LITTER_CLEANUP_COST || store.paused ? ' disabled' : '') +
      '>Clear litter · ' + LITTER_CLEANUP_COST + ' coins</button>' : '') +
    '<p class="tile-tip">' + (store.canPlace(tile)
      ? 'Free building square. Pick a model kit to see its effect.'
      : 'Existing part of the miniature town.') + '</p>';
  updateTilePanelMarkup(content, 'tile:' + tile.x + ',' + tile.y);
}

function upgradeRow(type: 'savings' | 'patience', title: string, description: string, costBase: number): string {
  const level = store.legacy.upgrades[type];
  const cost = (level + 1) * costBase;
  const max = level >= 3;
  const canBuy = store.phase !== 'playing' && !max && store.legacy.blueprints >= cost;
  return '<div class="upgrade"><div><h3>' + title + ' <span>LEVEL ' + level + '/3</span></h3>' +
    '<p>' + description + '</p></div><button type="button" data-upgrade="' + type +
    '" ' + (canBuy ? '' : 'disabled') + '>' + (max ? 'Preserved' : cost + ' blueprints') +
    '</button></div>';
}

/**
 * Workbench notes are attached to actual milestones, not random lore rolls.
 * Kept collapsible in the workshop rather than extending the persistent HUD.
 */
function renderWorkshopDiary(): string {
  if (store.workbenchMoments.length === 0) {
    return '<p class="workbench-empty">The first little workbench note is written at 25% Progress.</p>';
  }
  return '<details class="workbench-diary"><summary>From the workbench · ' +
    store.workbenchMoments.length + ' notes</summary><ol>' +
    store.workbenchMoments.map(moment =>
      '<li><small>' + moment.milestone * 25 + '% Progress</small><p>' +
      moment.line + '</p></li>'
    ).join('') + '</ol></details>';
}
function renderRunLedger(): string {
  const numbers = store.runSummary;
  return '<details class="workbench-ledger"><summary>The little town in numbers</summary>' +
    '<dl><dt>Car circuits</dt><dd>' + numbers.completedLaps + '</dd>' +
    '<dt>Earned from circuits</dt><dd>+' + numbers.earnings + ' coins</dd>' +
    '<dt>Spent on care, repairs & collection</dt><dd>−' + numbers.servicing + ' coins</dd>' +
    '<dt>Of that: repairs</dt><dd>−' + numbers.repairSpending + ' coins</dd>' +
    '<dt>Purchased miniatures</dt><dd>−' + numbers.purchases + ' coins</dd>' +
    '<dt>Helpful / troublesome acts</dt><dd>' + store.ledger.helpfulActions +
      ' / ' + store.ledger.troublesomeActions + '</dd>' +
    '<dt>Packaging caught in bins</dt><dd>' + numbers.capturedPackaging + '</dd>' +
    '<dt>Roadside impacts</dt><dd>' + numbers.roadsideAccidents + '</dd>' +
    '<dt>Hale restorations / Ward assists</dt><dd>' +
      numbers.haleRestorations + ' / ' + numbers.wardAssists + '</dd>' +
    '<dt>Neighbourly follow-ups</dt><dd>' + numbers.neighbourResponses + '</dd>' +
    '<dt>Longest traffic queue</dt><dd>' + numbers.peakQueue + ' cars</dd>' +
    '</dl><p class="ledger-hint">These are totals for this run; the Income meter shows ' +
    'only the last 60 seconds.</p></details>';
}

// Dialog content can update while time passes: never recreate focused buttons
// when their markup is unchanged, and return focus when the modal closes.
let modalKind: 'closed' | 'workshop' | 'chapter' | 'arrival' | 'founding-review' = 'closed';
let modalReturnFocus: HTMLElement | null = null;
let lastModalMarkup = '';
function setBackgroundInert(inert:boolean):void {
  document.querySelectorAll<HTMLElement>('#app > header, #app > main')
    .forEach(el=>{el.inert=inert;});
}
function setModalContent(modal:HTMLElement,
  kind:'workshop'|'chapter'|'arrival'|'founding-review',
  markup:string):void {
  const previous=document.activeElement;
  const wasInside=modal.contains(previous);
  const action=wasInside&&previous instanceof HTMLElement?previous.dataset.action:null;
  const upgrade=wasInside&&previous instanceof HTMLElement?previous.dataset.upgrade:null;
  const heading=wasInside&&previous instanceof HTMLElement&&
    previous.tagName==='H2';
  const summaryClass=wasInside&&previous instanceof HTMLElement&&
    previous.tagName==='SUMMARY'?
    previous.parentElement?.className:null;
  const openDetails=Array.from(modal.querySelectorAll<HTMLDetailsElement>(
    '.workbench-diary[open],.workbench-ledger[open]'
  )).map(el=>el.className);
  if(modalKind==='closed')
    modalReturnFocus=previous instanceof HTMLElement?previous:null;
  // Compare source markup instead of serialised innerHTML: browsers normalise
  // inline SVG attributes, so a DOM round-trip is not a reliable cache key.
  const changed=lastModalMarkup!==markup;
  modal.hidden=false;
  setBackgroundInert(true);
  if(changed){
    modal.innerHTML=markup;
    lastModalMarkup=markup;
    if(modalKind===kind)for(const selector of openDetails){
      if(selector==='workbench-diary'||selector==='workbench-ledger')
        modal.querySelector<HTMLDetailsElement>('details.'+selector)!.open=true;
    }
  }
  if(modalKind!==kind){
    modalKind=kind;
    modal.querySelector<HTMLElement>('h2[tabindex="-1"]')
      ?.focus({preventScroll:true});
  }else if(changed&&action){
    modal.querySelector<HTMLElement>('[data-action="'+action+'"]')
      ?.focus({preventScroll:true});
  }else if(changed&&upgrade){
    modal.querySelector<HTMLElement>('[data-upgrade="'+upgrade+'"]')
      ?.focus({preventScroll:true});
  }else if(changed&&summaryClass&&
    (summaryClass==='workbench-diary'||summaryClass==='workbench-ledger')){
    modal.querySelector<HTMLElement>('.'+summaryClass+' summary')
      ?.focus({preventScroll:true});
  }else if(changed&&heading){
    modal.querySelector<HTMLElement>('h2[tabindex="-1"]')
      ?.focus({preventScroll:true});
  }
}
function closeModalContent(modal:HTMLElement):void {
  if(modalKind==='closed')return;
  modal.hidden=true;
  modal.innerHTML='';
  lastModalMarkup='';
  setBackgroundInert(false);
  modalKind='closed';
  if(modalReturnFocus?.isConnected)modalReturnFocus.focus({preventScroll:true});
  modalReturnFocus=null;
}
function renderModal(): void {
  const modal = byId('modal');
  if (store.phase === 'founding' && store.foundingIntroId !== null) {
    const id = store.foundingIntroId;
    const family=HOMES[id],story=foundingStory(id);
    const markup =
      '<div class="dialog vintage-dialog founding-arrival-dialog" role="dialog" aria-modal="true" aria-labelledby="arrival-title">' +
      vintageFrameCorners() +
      '<span class="eyebrow">FAMILY ARRIVAL · 1908 · ' + (store.foundingCount+1) + ' OF 6</span>' +
      '<h2 id="arrival-title" tabindex="-1">' + family.name + '</h2>' +
      '<p class="founding-epithet">' + story.epithet + '</p>' +
      '<div class="founding-keepsake">' + foundingKeepsakeSvg(id) +
      '<span>' + story.keepsakeLabel + '</span></div>' +
      '<p class="founding-arrival-story">' + story.arrival + '</p>' +
      '<blockquote class="founding-quote">' + story.quote + '</blockquote>' +
      '<div class="founding-arrival-character"><div><strong>Hoping for</strong><p>' +
      story.hope + '</p></div><div><strong>Find difficult</strong><p>' +
      story.worry + '</p></div></div>' +
      '<div class="founding-arrival-neighbours"><b>Neighbourly instincts</b><p>Would welcome ' +
      story.closeTo.map(other=>HOMES[other].name).join(' and ') +
      ' nearby. May find ' + story.uneasyNear.map(other=>HOMES[other].name).join(' and ') +
      ' a little more difficult.</p></div>' +
      '<button type="button" class="dialog-main" data-action="acknowledge-arrival">Choose their plot</button>' +
      '</div>';
    setModalContent(modal,'arrival',markup);
    return;
  }
  if (store.phase === 'founding' && store.foundingReviewOpen) {
    const rows=store.placedHomes.map(home=>{
      const social=store.neighbourhoodFor(home.id);
      return '<li><strong>'+home.name+'</strong><span>Plot '+(home.x+1)+' / '+(home.y+1)+
        '</span><small class="relationship-score '+relationshipTone(social.irritationPerLap)+'">'+
        signedRelationship(social.irritationPerLap)+
        ' irritation / circuit</small>'+
        '<button data-action="move-founding" data-id="'+home.id+'">Move home</button></li>';
    }).join('');
    const markup =
      '<div class="dialog vintage-dialog founding-review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">' +
      vintageFrameCorners() +
      '<span class="eyebrow">1908 · THE TOWN TAKES SHAPE</span>' +
      '<h2 id="review-title" tabindex="-1">A Town Begins</h2>' +
      '<p>Six families now have somewhere to call home. Walk the street once more, and move any house you would prefer in a different place.</p>' +
      '<ol class="founding-review-list">' + rows + '</ol>' +
      '<p class="founding-review-note">Nothing has been charged. There has been no traffic or loss of time. '+
      'The figures show each family’s neighbour irritation per completed circuit. Negative is helpful, '+
      'positive is troublesome, and totals are capped at ±'+
      MAX_NEIGHBOUR_EFFECT_PER_LAP.toFixed(2)+'.</p>' +
      '<div class="dialog-actions"><button data-action="close-founding-review">Keep arranging</button>' +
      '<button class="dialog-main" data-action="confirm-vintage">Begin the Vintage Years</button></div></div>';
    setModalContent(modal,'founding-review',markup);
    return;
  }
  if (store.workshopOpen) {
    const markup =
      '<div class="dialog vintage-dialog workshop-dialog" role="dialog" aria-modal="true" aria-labelledby="workshop-title">' +
      vintageFrameCorners() +
      '<span class="eyebrow">A PLACE BETWEEN GENERATIONS</span>' +
      '<h2 id="workshop-title" tabindex="-1">The Family Workshop</h2>' +
      '<div class="workbench-engraving" aria-hidden="true">' +
      miniatureSvg('lamp') + '<span>THE COLLECTOR\'S DESK · 1908</span></div>' +
      '<p>Every little town leaves something behind. Blueprints survive even when a run ends.</p>' +
      '<div class="blueprint-wallet">Saved blueprints <strong>' + store.legacy.blueprints + '</strong></div>' +
      upgradeRow('savings', 'Family Savings', 'Start future runs with 35 extra coins per level.', 20) +
      upgradeRow('patience', 'A Steady Hand', 'Residents start future runs with less irritation.', 30) +
      renderWorkshopDiary() + renderRunLedger() +
      '<p class="dialog-footnote">Permanent upgrades can be purchased between runs. More workshop shelves and heritage models will arrive in later passes.</p>' +
      '<button class="dialog-main" type="button" data-action="workshop">Back to ' +
      (store.phase === 'playing' ? 'the town' : 'the chapter') + '</button></div>';
    setModalContent(modal,'workshop',markup);
    return;
  }
  if (store.phase === 'playing' || store.phase === 'founding') {
    closeModalContent(modal);
    return;
  }
  const won = store.phase === 'complete';
  const markup =
    '<div class="dialog story-dialog vintage-dialog" role="dialog" aria-modal="true" aria-labelledby="chapter-title">' +
    vintageFrameCorners() +
    '<span class="eyebrow">' + (won ? 'CHAPTER I COMPLETED' : 'THE TOWN HAS FALLEN QUIET') + '</span>' +
    '<h2 id="chapter-title" tabindex="-1">' +
      (won ? 'The Vintage Years' : 'A Town Remembered') + '</h2>' +
    '<div class="story-frame vintage-story-frame">' +
      '<div class="story-vehicle" aria-hidden="true">' +
      chapterMotorcarSvg() + '</div>' +
      '<span>THE WORKBENCH &middot; 1908</span></div>' +
    '<p class="story-quote">' + (won ?
      'Father smiled at the little town. "I think we have made something worth keeping."' :
      '"We can always try a different road," his father said, and put the model back on the shelf.') +
    '</p><p class="story-coda">' + store.closingLine +
    '</p><div class="result-grid"><div><strong>' + Math.round(store.progress) +
    '%</strong><span>Progress</span></div><div><strong>' + store.occupiedHomes +
    '/6</strong><span>Homes remaining</span></div><div><strong>' + store.legacy.blueprints +
    '</strong><span>Saved blueprints</span></div></div>' +
    '<p>Next eras and branching family chapters are planned. This first playable slice focuses on Vintage.</p>' +
    '<div class="dialog-actions"><button type="button" data-action="workshop">Visit workshop</button>' +
    '<button type="button" class="dialog-main" data-action="new-run">Build a new town</button></div></div>';
  setModalContent(modal,'chapter',markup);
}


function renderFounding(): void {
  const founding = store.phase === 'founding';
  const panel = byId('founding-panel');
  panel.hidden = !founding;
  byId('shop-section').classList.toggle('founding-locked', founding);
  byId('shop').setAttribute('aria-hidden',String(founding));
  if (!founding) return;

  byId('founding-progress').textContent = store.foundingCount + ' OF 6 HOMES';
  const tray=byId('founding-family-list');
  // Build the actual buttons once. Frequent pointer hover updates must never
  // replace a focused calling card or interrupt its screen-reader label.
  if(tray.children.length!==store.residents.length) {
    tray.innerHTML = store.residents.map(resident => {
      const story=foundingStory(resident.id);
      return '<button type="button" data-founding-family="'+resident.id+
        '" class="founding-card" aria-pressed="false">'+
        '<span class="founding-card-image" aria-hidden="true">'+foundingKeepsakeSvg(resident.id)+'</span>'+
        '<span class="founding-card-copy"><span class="founding-card-number">0'+
        (resident.id+1)+' · '+story.epithet+'</span><strong>'+resident.name+
        '</strong><small class="founding-card-status"></small></span></button>';
    }).join('');
  }
  for(const resident of store.residents) {
    const card=tray.querySelector<HTMLButtonElement>(
      '[data-founding-family="'+resident.id+'"]');
    if(!card)continue;
    const selected=store.foundingFamily===resident.id;
    const settled=!!store.homeFor(resident.id);
    card.className='founding-card'+(selected?' is-selected':'')+
      (settled?' is-settled':'');
    card.setAttribute('aria-pressed',String(selected));
    card.setAttribute('aria-label',resident.name+
      (settled?', settled. Select to move the home.':', awaiting a plot. Select to meet the family.'));
    card.querySelector<HTMLElement>('.founding-card-status')!.textContent=
      settled?'SETTLED · CHANGE PLOT':'AWAITING A HOME';
  }

  const ready=store.foundingCount===store.residents.length;
  const next=byId<HTMLButtonElement>('begin-vintage');
  next.disabled=!ready;
  next.textContent=ready?'Review the founding town':'Settle all six homes to continue';
  byId('founding-guidance').textContent = store.foundingFamily !== null
    ? 'Choose a marked roadside plot for ' + store.residents[store.foundingFamily].name +
      '. Shift+click to inspect; arrow keys and Enter also work.'
    : ready ? 'Six homes are settled. Review their arrangement before the first cars depart.'
    : 'Choose a family to hear their story, then find a place beside the road.';
}

let lastAnnouncementRevision = -1;
function render(): void {
  const progress = store.progress;
  const community = store.community;
  const safety = store.safety;
  byId('meters').innerHTML = vintageFrameCorners() +
    meter('Progress',progress,'progress','green',Math.round(progress) + '%') +
    meter('Community',community,'community','blue',store.occupiedHomes + '/6') +
    meter('Safety',safety,'safety','red',Math.round(safety) + '%') +
    incomeMeter();
  byId('coins').textContent = String(store.money);
  byId('coins').classList.toggle('debt', store.money < 0);
  byId('notice').textContent = store.notice;
  // The tile and coins repaint frequently. Assistive technology receives
  // only an actual new meaningful incident, not every visual re-render.
  if (store.announcementRevision !== lastAnnouncementRevision) {
    lastAnnouncementRevision = store.announcementRevision;
    byId('event-announcement').textContent = store.announcement;
  }
  const trafficTag = byId('traffic-status');
  const queued = store.traffic.queuedCars.length;
  const stop = store.traffic.activeStop;
  trafficTag.hidden = !queued && !stop;
  trafficTag.textContent = queued
    ? queued + (queued === 1 ? ' CAR DELAYED' : ' CARS QUEUED')
    : 'ROAD PAUSE';
  byId<HTMLButtonElement>('pause').disabled = store.phase !== 'playing';
  byId<HTMLButtonElement>('speed').disabled = store.phase !== 'playing';
  byId('pause').textContent = store.paused ? 'Resume' : 'Pause';
  byId('speed').textContent = store.gameSpeed + 'x';
  renderShop();
  renderPlacementStatus();
  renderFounding();
  renderBoundaryStudio();
  renderTilePanel();
  renderTilePeek();
  renderHouseholds();
  renderHouseholdDetail();
  byId('workbench-note').textContent = 'AT THE WORKBENCH · ' + store.workbenchLine;
  renderModal();
}

// Convert document drag coordinates to the Phaser scene's fixed world grid.
function cellFromClient(clientX: number, clientY: number): Cell | null {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-container canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 ||
      clientX < rect.left || clientY < rect.top ||
      clientX > rect.right || clientY > rect.bottom) return null;
  const x = Math.floor(((clientX - rect.left) / rect.width * BOARD.width - BOARD.left) / BOARD.tile);
  const y = Math.floor(((clientY - rect.top) / rect.height * BOARD.height - BOARD.top) / BOARD.tile);
  return isOnBoard(x,y) ? { x,y } : null;
}

// Available only on the Vite development server; never shipped on GitHub Pages.
// In the browser console:
// __modelLoopDebug.seed(1234)
// __modelLoopDebug.trigger('litter', 2, 4, 3)
// __modelLoopDebug.trigger('flowers', 1, 9, 3)
// __modelLoopDebug.trigger('skid', 0, 12, 3)
// __modelLoopDebug.trafficStop(1, 4.2) // stop the actual Bell car
// __modelLoopDebug.trafficSnapshot()    // inspect gap, phase and current queue
// __modelLoopDebug.behaviourAction(3, 'tidy', 4, 3) // Marshes clear roadside rubbish
// __modelLoopDebug.behaviourAction(4, 'display', 8, 3) // Hales' display slows cars
if (import.meta.env.DEV) {
  const debug = {
    seed(seed: number) { store.newRun(seed); },
    trigger(kind: EnvironmentKind, residentId: number, x: number, y: number): boolean {
      if (!['litter', 'flowers', 'skid'].includes(kind) ||
        !Number.isInteger(residentId) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
      return store.debugEnvironmentEvent(kind, residentId, { x, y });
    },
    snapshot() {
      return { seed: store.environment.seed, effects: store.environment.effects.map(x => ({ ...x })),
        events: store.environment.history.map(x => ({ ...x })),
        safety: store.safety, irritation: store.averageIrritation,
        activeStop: store.traffic.activeStop, queued: store.traffic.queuedCars.map(x => ({ ...x })),
        behaviour: store.behaviourHistory.map(x => ({ ...x })),
        activities: store.activities.active.map(x => ({ ...x })),
        activityHistory: store.activities.history.map(x => ({ ...x })),
        accidents: store.accidents.history.map(x => ({ ...x })),
        activeAccidents: store.accidents.active.map(x => ({ ...x })),
        neighbours: store.neighbours.history.map(x => ({ ...x })),
        pendingNeighbours: store.neighbours.pending.map(x => ({ ...x })),
        modelConditions: store.placements.map(item => ({
          x:item.x,y:item.y,id:item.id,condition:modelCondition(item.condition)})),
        summary: store.runSummary, workbench: store.workbenchMoments.map(x => ({ ...x })) };
    },
    trafficStop(id: number, duration?: number): boolean {
      if (!Number.isInteger(id) || id < 0 || id > 5) return false;
      return (game.scene.getScene('TownScene') as TownScene).forceTrafficStop(id,duration);
    },
    trafficSnapshot() {
      return (game.scene.getScene('TownScene') as TownScene).trafficSnapshot();
    },
    /** Test-only deterministic driving audit. Production builds remove this
     * entire debug object. Simulated frames advance the REAL Phaser scene,
     * including its traffic solver, events, economy and gridlock marshal.
     * Keep a hard limit so a mistyped console call cannot lock the browser.
     */
    auditAdvance(frames:number,deltaMilliseconds=60) {
      if(!Number.isInteger(frames)||frames<0||frames>8000 ||
        !Number.isFinite(deltaMilliseconds)||deltaMilliseconds<16||
        deltaMilliseconds>60) throw new Error('Invalid audit frame request');
      const scene=game.scene.getScene('TownScene') as TownScene;
      for(let frame=0;frame<frames&&store.phase==='playing';frame++){
        scene.update(0,deltaMilliseconds);
      }
      return {
        elapsed:store.elapsedSeconds,progress:store.progress,
        phase:store.phase,money:store.money,
        completedLaps:store.runSummary.completedLaps,
        residents:store.residents.map(resident=>({
          id:resident.id,occupied:resident.occupied,laps:resident.laps,
          irritation:resident.irritation
        })),
        traffic:scene.trafficSnapshot(),
        queued:store.traffic.queuedCars.length,
        trafficDelay:store.ledger.secondsLostInTraffic,
        recoveries:scene.trafficSnapshot()[0]?.recoveryCount??0
      };
    },
    miniatureArt() {
      return (game.scene.getScene('TownScene') as TownScene).miniatureArtSnapshot();
    },
    worldArt() {
      return (game.scene.getScene('TownScene') as TownScene).worldArtSnapshot();
    },
    eventArt() {
      return (game.scene.getScene('TownScene') as TownScene).eventArtSnapshot();
    },
    behaviourAction(id:number,action:HouseholdActionId,x:number,y:number):boolean {
      if(!Number.isInteger(id) || id<0 || id>5 ||
        !Number.isInteger(x) || !Number.isInteger(y))return false;
      return store.debugHouseholdAction(id,action,{x,y});
    },
    activity(kind:ActivityKind,x:number,y:number):boolean {
      if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
      return store.debugActivity(kind,{x,y});
    },
    impact(id:number,roadX:number,roadY:number,modelX:number,modelY:number,
      severity:'damage'|'break'='damage'):boolean {
      if(!Number.isInteger(id)||id<0||id>5||
        ![roadX,roadY,modelX,modelY].every(Number.isInteger))return false;
      return store.debugRoadsideAccident(id,
        {x:roadX,y:roadY},{x:modelX,y:modelY},severity);
    }
  };
  (window as typeof window & { __modelLoopDebug?: typeof debug }).__modelLoopDebug = debug;
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const pairButton=target.closest<HTMLElement>('[data-boundary-pair]');
  if(pairButton) {
    const raw=pairButton.dataset.boundaryPair??'';
    if(/^\d+:\d+$/.test(raw)) {
      const [a,b]=raw.split(':').map(Number);
      store.chooseBoundaryPair(a,b);
    }
    return;
  }
  const kindButton=target.closest<HTMLElement>('[data-boundary-kind]');
  if(kindButton) {
    const kind=kindButton.dataset.boundaryKind;
    if(BOUNDARY_MODELS.some(item=>item.kind===kind))
      store.chooseBoundaryKind(kind as BoundaryKind);
    return;
  }
  const careButton = target.closest<HTMLElement>('[data-care]');
  if (careButton && store.selected) {
    const value = careButton.dataset.care;
    if (value && CARE_LEVELS.some(level => level === value)) {
      store.setModelCare(store.selected, value as CareLevel);
    }
    return;
  }
  const founder = target.closest<HTMLElement>('[data-founding-family]');
  if (founder) {
    store.chooseFoundingFamily(Number(founder.dataset.foundingFamily));
    if(store.foundingIntroId === null)
      byId('game-container').focus({preventScroll:true});
    return;
  }
  const familyButton = target.closest<HTMLElement>('[data-resident]');
  if (familyButton) {
    const id = Number(familyButton.dataset.resident);
    if (Number.isInteger(id) && id >= 0 && id < store.residents.length) {
      store.selectResident(id);
    }
    return;
  }
  const modelButton = target.closest<HTMLElement>('[data-model]');
  if (modelButton) {
    const id = modelButton.dataset.model || null;
    if (isModelId(id)) {
      store.selectModel(id);
      // Keyboard players can move the preview with arrows and press Enter.
      if (store.activeModel) byId('game-container').focus({ preventScroll: true });
    }
    return;
  }
  const upgradeButton = target.closest<HTMLElement>('[data-upgrade]');
  if (upgradeButton) {
    store.upgrade(upgradeButton.dataset.upgrade as 'savings' | 'patience');
    return;
  }
  const actionButton = target.closest<HTMLElement>('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if(action==='open-boundary-studio') {
    const workshop=byId<HTMLDetailsElement>('boundary-studio');
    workshop.open=true;
    const family=store.selectedResident;
    const pair=store.boundaryPairs.find(item=>
      item.a===family||item.b===family);
    if(pair)store.chooseBoundaryPair(pair.a,pair.b);
    workshop.scrollIntoView({block:'nearest',behavior:'auto'});
    workshop.querySelector('summary')?.focus({preventScroll:true});
    return;
  }
  if(action==='install-boundary'||action==='remove-boundary') {
    const pair=store.boundaryPair,kind=store.boundaryKind;
    if(pair){
      if(action==='install-boundary'&&kind)store.installBoundary(pair.a,pair.b,kind);
      if(action==='remove-boundary')store.removeBoundary(pair.a,pair.b);
    }
    return;
  }
  if (action === 'close-tile') {
    store.dismissTile();
    byId('game-container').focus({ preventScroll: true });
    return;
  }
  if (action === 'empty-bin' || action === 'clear-litter' || action === 'repair-model') {
    const x = Number(actionButton.dataset.x), y = Number(actionButton.dataset.y);
    if (Number.isInteger(x) && Number.isInteger(y) && isOnBoard(x,y)) {
      if (action === 'empty-bin') store.emptyBin({ x,y });
      else if (action === 'repair-model') store.repairModel({x,y});
      else store.cleanLitter({ x,y });
    }
    return;
  }
  if (action === 'acknowledge-arrival') {
    store.acknowledgeFoundingIntroduction();
    byId('game-container').focus({preventScroll:true});
    return;
  }
  if (action === 'begin-vintage') {
    store.openFoundingReview();
    return;
  }
  if (action === 'close-founding-review') {
    store.closeFoundingReview();
    return;
  }
  if (action === 'move-founding') {
    const id=Number(actionButton.dataset.id);
    if(Number.isInteger(id)&&id>=0&&id<HOMES.length) {
      store.chooseFoundingFamily(id);
      byId('game-container').focus({preventScroll:true});
    }
    return;
  }
  if (action === 'confirm-vintage') {
    if (store.beginVintageYears())
      byId('game-container').focus({preventScroll:true});
    return;
  }
  if (action === 'place-founding') {
    const x=Number(actionButton.dataset.x),y=Number(actionButton.dataset.y);
    if(Number.isInteger(x)&&Number.isInteger(y)&&isOnBoard(x,y))
      store.placeFoundingHome({x,y});
    byId('game-container').focus({preventScroll:true});
    return;
  }
  if (action === 'pause') store.togglePause();
  if (action === 'speed') store.toggleSpeed();
  if (action === 'workshop') store.toggleWorkshop();
  if (action === 'cancel-model') store.cancelModel();
  if (action === 'close-household') store.selectResident(null);
  if (action === 'new-run') {
    store.newRun();
    game.scene.getScene('TownScene').scene.restart();
  }
});

document.addEventListener('dragstart', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const box = target.closest<HTMLElement>('[data-model]');
  const id = box?.dataset.model || null;
  if (!isModelId(id) || store.phase !== 'playing' || store.paused) return;
  dragInProgress = true;
  draggingModelId = id;
  box?.classList.add('dragging');
  event.dataTransfer?.setData('text/plain',id);
  if(event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  store.setActiveModel(id);
});

document.addEventListener('dragover', (event) => {
  if (!draggingModelId || !(event.target instanceof Element) ||
      !event.target.closest('#game-container')) return;
  event.preventDefault();
  if(event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  store.setHovered(cellFromClient(event.clientX,event.clientY));
});

document.addEventListener('drop', (event) => {
  if (!draggingModelId || !(event.target instanceof Element) ||
      !event.target.closest('#game-container')) return;
  event.preventDefault();
  const id = draggingModelId;
  const cell = cellFromClient(event.clientX,event.clientY);
  dragInProgress = false;
  draggingModelId = null;
  store.setActiveModel(id);
  if (cell) store.selectTile(cell);
  else {
    store.notice = 'Move the miniature onto a valid square inside the town.';
    store.notify();
  }
  shopSignature = '';
  renderShop();
});

document.addEventListener('dragend', () => {
  if (!dragInProgress && !draggingModelId) return;
  dragInProgress = false;
  draggingModelId = null;
  store.setHovered(null);
  shopSignature = '';
  renderShop();
});

document.addEventListener('keydown', (event) => {
  if(modalKind!=='closed'){
    if(event.key==='Escape'){
      event.preventDefault();
      if(modalKind==='arrival')store.acknowledgeFoundingIntroduction();
      else if(modalKind==='founding-review')store.closeFoundingReview();
      else if(store.workshopOpen)store.toggleWorkshop();
      else byId('modal').querySelector<HTMLElement>('.dialog-main')
        ?.focus({preventScroll:true});
      return;
    }
    if(event.key==='Tab'){
      const dialog=byId('modal').querySelector<HTMLElement>('.vintage-dialog');
      if(!dialog)return;
      const controls=Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])'
      )).filter(el=>el.getClientRects().length>0);
      const first=controls[0],last=controls[controls.length-1];
      if(!first||!last){event.preventDefault();dialog.focus();return;}
      if(event.shiftKey&&(document.activeElement===first||
        document.activeElement===dialog.querySelector('h2')||
        !dialog.contains(document.activeElement))){
        event.preventDefault();last.focus({preventScroll:true});
      }else if(!event.shiftKey&&(document.activeElement===last||
        !dialog.contains(document.activeElement))){
        event.preventDefault();first.focus({preventScroll:true});
      }
    }
    return;
  }
  if (event.key === 'Escape' && store.phase === 'founding' &&
      store.foundingFamily !== null) {
    store.chooseFoundingFamily(null);
    return;
  }
  if (event.key === 'Escape' && !store.activeModel && store.selected) {
    store.dismissTile();
    byId('game-container').focus({ preventScroll: true });
    return;
  }
  if (event.key === 'Escape' && store.activeModel) {
    store.cancelModel();
    return;
  }
  // Arrow/Enter inspection must remain available even without a lifted model.
  if ((store.phase !== 'playing' && store.phase !== 'founding') || store.paused ||
      store.workshopOpen || document.activeElement !== byId('game-container')) return;
  const movement: Record<string, [number,number]> = {
    ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0]
  };
  const offset = movement[event.key];
  if (offset) {
    event.preventDefault();
    const current = store.hovered || store.selected || { x: 4, y: 4 };
    const next = { x: Math.max(0,Math.min(BOARD.cols-1,current.x+offset[0])),
      y: Math.max(0,Math.min(BOARD.rows-1,current.y+offset[1])) };
    store.setHovered(next);
  }
  if (event.key === 'Enter' && store.hovered) {
    event.preventDefault();
    if (event.shiftKey) store.inspectTile(store.hovered);
    else store.selectTile(store.hovered);
  }
});

store.subscribe(render);
render();
