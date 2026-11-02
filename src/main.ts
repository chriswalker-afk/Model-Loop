import { AUTO, Game, Scale } from 'phaser';
import { TownScene } from './game/TownScene';
import { BOARD, isOnBoard, MODELS, type Cell, type ModelId } from './game/config';
import { miniatureSvg } from './ui/modelArt';
import { store } from './game/state';
import { CARE_LEVELS, careName, careDescription, modelEffects, normalizedCare,
  UPKEEP_INTERVAL_SECONDS, type CareLevel } from './game/economy';
import { householdProfile, moodClass, moodName } from './game/households';
import { environmentLabel, type EnvironmentKind } from './game/environment';
import { BIN_CAPACITY, BIN_CATCH_RADIUS, LITTER_CLEANUP_COST, binCareDescription } from './game/bins';

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
function signed(n: number): string { return n > 0 ? '+' + n : String(n); }
function meter(label: string, percent: number, symbol: string, color: string, value: string): string {
  return '<div class="meter"><div class="meter-top"><span class="meter-icon">' + symbol +
    '</span><span>' + label + '</span><b>' + value + '</b></div>' +
    '<div class="meter-rail"><div class="meter-fill ' + color + '" style="width:' +
    Math.max(0, Math.min(100, percent)) + '%"></div></div></div>';
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
    '<div class="meter-top"><span class="meter-icon">◉</span><span>Income</span>' +
    '<b class="' + (debit ? 'negative-flow' : 'positive-flow') + '">' +
    signedIncome(flow.net) + '<small>/60s</small></b></div>' +
    '<div class="flow-track"><span class="flow-center"></span><span class="flow-fill ' +
    (debit ? 'outflow' : 'inflow') + '" style="width:' + width +
    '%;left:' + (debit ? 50 - width : 50) + '%"></span></div>' +
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
  const accents = ['#c6ac79', '#a2bca3', '#bd9c7b', '#bba795', '#9cb6c3', '#95ad94'];
  byId('shop').innerHTML = MODELS.map((item, index) => {
    const picked = store.activeModel === item.id;
    const poor = store.money < item.cost;
    const disabled = store.phase !== 'playing' || store.paused;
    const effects = '<span title="Beauty change">✿ ' + signed(item.beauty) +
      '</span><span title="Noise change">◖ ' + signed(item.noise) +
      '</span><span title="Crime change">◇ ' + signed(item.crime) + '</span>';
    return '<button type="button" draggable="' + !disabled +
      '" class="model-box ' + (picked ? 'selected ' : '') +
      (poor ? 'unaffordable ' : '') + '" data-model="' + item.id +
      '" style="--kit-accent:' + accents[index] + '" aria-pressed="' + picked +
      '" aria-label="Select ' + item.name + ', costs ' + item.cost + ' coins" ' +
      (disabled ? 'disabled' : '') + '>' +
      '<span class="box-lip"><span class="box-hole"></span></span>' +
      '<span class="box-series"><span>VINTAGE · 1908</span><span>KIT / 0' + (index + 1) + '</span></span>' +
      '<strong class="box-title">' + item.name + '</strong>' +
      '<span class="display-window"><span class="window-backdrop"></span>' +
      miniatureSvg(item.id) + '<span class="window-glint"></span>' +
      '<span class="kit-window-stamp">' + (picked ? 'LIFTED' : 'HANDMADE') + '</span></span>' +
      '<span class="kit-band"><span class="box-cost"><span class="coin-icon">●</span> ' +
      item.cost + '</span><span class="box-caption">MINIATURE MODEL</span></span>' +
      '<span class="box-effects" aria-label="Beauty ' + signed(item.beauty) +
      ', Noise ' + signed(item.noise) + ', Crime ' + signed(item.crime) + '">' +
      effects + '</span><span class="box-description">' + item.caption + '</span>' +
      '<span class="box-upkeep" title="Maintenance costs ' + item.upkeep +
      ' coins every ' + UPKEEP_INTERVAL_SECONDS +
      ' game seconds at full care; reduce it after placement">Upkeep ' +
      item.upkeep + ' coins / ' + UPKEEP_INTERVAL_SECONDS + 's</span></button>';
  }).join('');
}

function renderPlacementStatus(): void {
  const status = byId('placement-status');
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
    '<span>Hover to preview · click or drag to place · Esc to return it.</span>';
}

function changeClass(value: number, lowerIsBetter: boolean): string {
  if (value === 0) return 'neutral';
  return (lowerIsBetter ? value < 0 : value > 0) ? 'positive' : 'negative';
}

function projectedRow(title: string, before: number, after: number, lowerIsBetter: boolean): string {
  const change = after - before;
  return '<div class="tile-score projected-delta"><span>' + title + '</span>' +
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
    const mood = moodName(resident.irritation, resident.occupied);
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
      '<dt>They find difficult</dt><dd>' + profile.findsDifficult + '</dd></dl>' +
      '<blockquote class="household-remark"></blockquote>' +
      '<div class="household-footprint"><span class="eyebrow">A RECENT TRACE</span>' +
      '<span class="household-last-action"></span></div>' +
      '<p class="household-small-note">A little attention to the journey can make all the difference.</p>';
  }
  panel.className = 'household-detail ' + moodClass(resident.irritation, resident.occupied);
  panel.querySelector<HTMLElement>('.household-mood')!.textContent =
    moodName(resident.irritation, resident.occupied);
  panel.querySelector<HTMLElement>('.household-irritation')!.textContent =
    Math.round(resident.irritation) + ' / 100 irritation';
  panel.querySelector<HTMLElement>('.household-meter-fill')!.style.width =
    (resident.occupied ? 100 - resident.irritation : 0) + '%';
  panel.querySelector<HTMLElement>('.household-remark')!.textContent =
    '“' + resident.lastRemark + '”';
  const latest = store.environment.history.find(event => event.residentId === id);
  panel.querySelector<HTMLElement>('.household-last-action')!.textContent =
    latest ? latest.message : 'Nothing unusual noticed so far.';
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

function environmentNotes(tile: Cell): string {
  const nearby = store.environment.at(tile);
  if (!nearby.length) return '';
  return '<div class="environment-notes"><span class="eyebrow">TRACES LEFT BEHIND</span>' +
    nearby.slice(0, 4).map(effect => {
      const source = store.residents[effect.residentId]?.name ?? 'A neighbour';
      const timeLeft = Math.max(0, Math.ceil(effect.expiresAt - store.elapsedSeconds));
      const icon = effect.kind === 'flowers' ? '✿' : effect.kind === 'skid' ? '◇' : '▱';
      return '<div class="environment-note ' + effect.kind + '">' +
        '<span aria-hidden="true" class="environment-mark">' + icon + '</span>' +
        '<span><strong>' + environmentLabel(effect.kind) + '</strong>' +
        '<small>' + source + ' · fades in ' + timeLeft + 's</small></span></div>';
    }).join('') +
    '<p class="environment-hint">Roadside changes influence nearby journeys. ' +
    'Bins prevent new litter; old rubbish can be cleared separately.</p></div>';
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

function renderPlacedModelCare(): boolean {
  const placed = store.getPlacedModel(store.selected);
  if (!placed || store.activeModel) return false;
  const level = normalizedCare(placed.care);
  const model = store.getModel(placed.id);
  const current = modelEffects(placed.id, level);
  const cell = store.selected!;
  const info = store.tileInfo(cell);
  const panel = byId('tile-panel');
  panel.classList.add('is-active');
  panel.innerHTML =
    '<span class="eyebrow">MODEL CARE · GRID ' + (cell.x + 1) + '/' + (cell.y + 1) + '</span>' +
    '<h3>' + model.name + '</h3>' +
    '<div class="care-heading"><span>' + careName(level) + '</span>' +
    '<strong>' + current.upkeep + ' coins / ' + UPKEEP_INTERVAL_SECONDS + 's</strong></div>' +
    '<p class="tile-tip">Next bill for this model in ' + store.careDueIn(placed) +
    ' game seconds. Choose how carefully it is maintained.</p>' +
    '<div class="care-options" role="group" aria-label="Maintenance level for ' + model.name + '">' +
    CARE_LEVELS.map(care => {
      const effects = modelEffects(placed.id, care);
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
    environmentNotes(cell);
  return true;
}

function renderTilePanel(): void {
  if (renderPlacedModelCare()) return;
  const tile = store.hovered || store.selected;
  const details = store.tileInfo(tile);
  // Hide the decorative empty inspector only in compact landscape layouts.
  // On wider desktops the original guidance panel remains unchanged.
  byId('tile-panel').classList.toggle('is-active', Boolean(details && tile));
  if (!details || !tile) {
    byId('tile-panel').innerHTML =
      '<span class="eyebrow">INSPECT THE TOWN</span><h3>Every square tells a story</h3>' +
      '<p>Hover over the grid to inspect conditions. Select a boxed miniature to preview its effect.</p>';
    return;
  }
  if (store.activeModel) {
    const model = store.getModel(store.activeModel);
    const preview = store.previewPlacement(tile, model.id);
    const status = preview.allowed ? 'READY TO PLACE' : 'CANNOT PLACE HERE';
    byId('tile-panel').innerHTML =
      '<span class="eyebrow">PLACEMENT PREVIEW · ' + (tile.x + 1) + '/' + (tile.y + 1) + '</span>' +
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
        renderHouseholdReactions(preview.householdEffects) : '') +
      (model.id === 'bin' ? '<p class="bin-hint">Catches up to ' +
         BIN_CAPACITY + ' items within ' + BIN_CATCH_RADIUS +
         ' squares. Collection bills are additional to upkeep; existing litter needs separate cleaning.</p>' : '') +
      '<p class="tile-tip">' + preview.reason + '</p>';
    return;
  }
  byId('tile-panel').innerHTML =
    '<span class="eyebrow">GRID ' + (tile.x + 1) + ' / ' + (tile.y + 1) + '</span>' +
    '<h3>' + details.kind + '</h3>' +
    '<div class="tile-score"><span>Beauty</span><b>' + signed(details.beauty) + '</b></div>' +
    '<div class="tile-score"><span>Noise</span><b>' + signed(details.noise) + '</b></div>' +
    '<div class="tile-score"><span>Crime</span><b>' + signed(details.crime) + '</b></div>' +
    '<div class="tile-score"><span>Road safety</span><b>' + details.roadSafety + '%</b></div>' +
    environmentNotes(tile) +
    (store.environment.at(tile, 0).some(effect => effect.kind === 'litter') ?
      '<button type="button" class="clear-litter-button" data-action="clear-litter" data-x="' +
      tile.x + '" data-y="' + tile.y + '"' +
      (store.money < LITTER_CLEANUP_COST || store.paused ? ' disabled' : '') +
      '>Clear litter · ' + LITTER_CLEANUP_COST + ' coins</button>' : '') +
    '<p class="tile-tip">' + (store.canPlace(tile)
      ? 'Free building square. Pick a model kit to see its effect.'
      : 'Existing part of the miniature town.') + '</p>';
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

function renderModal(): void {
  const modal = byId('modal');
  if (store.workshopOpen) {
    modal.hidden = false;
    modal.innerHTML =
      '<div class="dialog" role="dialog" aria-modal="true" aria-label="The family workshop">' +
      '<span class="eyebrow">A PLACE BETWEEN GENERATIONS</span>' +
      '<h2>The Family Workshop</h2>' +
      '<p>Every little town leaves something behind. Blueprints survive even when a run ends.</p>' +
      '<div class="blueprint-wallet">Saved blueprints <strong>' + store.legacy.blueprints + '</strong></div>' +
      upgradeRow('savings', 'Family Savings', 'Start future runs with 35 extra coins per level.', 20) +
      upgradeRow('patience', 'A Steady Hand', 'Residents start future runs with less irritation.', 30) +
      '<p class="dialog-footnote">Permanent upgrades can be purchased between runs. More workshop shelves and heritage models will arrive in later passes.</p>' +
      '<button class="dialog-main" type="button" data-action="workshop">Back to ' +
      (store.phase === 'playing' ? 'the town' : 'the chapter') + '</button></div>';
    return;
  }
  if (store.phase === 'playing') {
    modal.hidden = true;
    modal.innerHTML = '';
    return;
  }
  const won = store.phase === 'complete';
  modal.hidden = false;
  modal.innerHTML =
    '<div class="dialog story-dialog" role="dialog" aria-modal="true" aria-label="Chapter result">' +
    '<span class="eyebrow">' + (won ? 'CHAPTER I COMPLETED' : 'THE TOWN HAS FALLEN QUIET') + '</span>' +
    '<h2>' + (won ? 'The Vintage Years' : 'A Town Remembered') + '</h2>' +
    '<div class="story-frame"><div class="story-moon"></div><div class="story-car"></div>' +
    '<span>THE WORKBENCH &middot; 1908</span></div>' +
    '<p class="story-quote">' + (won ?
      'Father smiled at the little town. "I think we have made something worth keeping."' :
      '"We can always try a different road," his father said, and put the model back on the shelf.') +
    '</p><div class="result-grid"><div><strong>' + Math.round(store.progress) +
    '%</strong><span>Progress</span></div><div><strong>' + store.occupiedHomes +
    '/6</strong><span>Homes remaining</span></div><div><strong>' + store.legacy.blueprints +
    '</strong><span>Saved blueprints</span></div></div>' +
    '<p>Next eras and branching family chapters are planned. This first playable slice focuses on Vintage.</p>' +
    '<div class="dialog-actions"><button type="button" data-action="workshop">Visit workshop</button>' +
    '<button type="button" class="dialog-main" data-action="new-run">Build a new town</button></div></div>';
}

function render(): void {
  const progress = store.progress;
  const community = store.community;
  const safety = store.safety;
  byId('meters').innerHTML =
    meter('Progress',progress,'&#9874;','green',Math.round(progress) + '%') +
    meter('Community',community,'&#9829;','blue',store.occupiedHomes + '/6') +
    meter('Safety',safety,'&#9671;','red',Math.round(safety) + '%') +
    incomeMeter();
  byId('coins').textContent = String(store.money);
  byId('coins').classList.toggle('debt', store.money < 0);
  byId('notice').textContent = store.notice;
  byId('pause').textContent = store.paused ? 'Resume' : 'Pause';
  byId('speed').textContent = store.gameSpeed + 'x';
  renderShop();
  renderPlacementStatus();
  renderTilePanel();
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
        safety: store.safety, irritation: store.averageIrritation };
    }
  };
  (window as typeof window & { __modelLoopDebug?: typeof debug }).__modelLoopDebug = debug;
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const careButton = target.closest<HTMLElement>('[data-care]');
  if (careButton && store.selected) {
    const value = careButton.dataset.care;
    if (value && CARE_LEVELS.some(level => level === value)) {
      store.setModelCare(store.selected, value as CareLevel);
    }
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
  if (action === 'empty-bin' || action === 'clear-litter') {
    const x = Number(actionButton.dataset.x), y = Number(actionButton.dataset.y);
    if (Number.isInteger(x) && Number.isInteger(y) && isOnBoard(x,y)) {
      if (action === 'empty-bin') store.emptyBin({ x,y });
      else store.cleanLitter({ x,y });
    }
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
  if (event.key === 'Escape' && store.activeModel) {
    store.cancelModel();
    return;
  }
  if (!store.activeModel || store.phase !== 'playing' || store.paused ||
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
    store.selectTile(store.hovered);
  }
});

store.subscribe(render);
render();
