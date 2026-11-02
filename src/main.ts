import { AUTO, Game, Scale } from 'phaser';
import { TownScene } from './game/TownScene';
import { BOARD, isOnBoard, MODELS, type Cell, type ModelId } from './game/config';
import { miniatureSvg } from './ui/modelArt';
import { store } from './game/state';

const game = new Game({
  type: AUTO,
  width: 1152,
  height: 620,
  parent: 'game-container',
  backgroundColor: '#111515',
  antialias: true,
  render: { pixelArt: false },
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
  scene: [TownScene]
});

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
  const accents = ['#c6ac79', '#a2bca3', '#bd9c7b', '#bba795', '#9cb6c3'];
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
      effects + '</span><span class="box-description">' + item.caption + '</span></button>';
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

function renderTilePanel(): void {
  const tile = store.hovered || store.selected;
  const details = store.tileInfo(tile);
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
        signed(preview.irritationChangePerLap) + '</strong> before individual temperament.</span></div>' : '') +
      '<p class="tile-tip">' + preview.reason + '</p>';
    return;
  }
  byId('tile-panel').innerHTML =
    '<span class="eyebrow">GRID ' + (tile.x + 1) + ' / ' + (tile.y + 1) + '</span>' +
    '<h3>' + details.kind + '</h3>' +
    '<div class="tile-score"><span>Beauty</span><b>' + signed(details.beauty) + '</b></div>' +
    '<div class="tile-score"><span>Noise</span><b>' + signed(details.noise) + '</b></div>' +
    '<div class="tile-score"><span>Crime</span><b>' + signed(details.crime) + '</b></div>' +
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
  const income = Math.min(100, store.money / 3);
  byId('meters').innerHTML =
    meter('Progress',progress,'&#9874;','green',Math.round(progress) + '%') +
    meter('Community',community,'&#9829;','blue',store.occupiedHomes + '/6') +
    meter('Safety',safety,'&#9671;','red',Math.round(safety) + '%') +
    meter('Income',income,'&#9679;','yellow',String(store.money));
  byId('coins').textContent = String(store.money);
  byId('notice').textContent = store.notice;
  byId('pause').textContent = store.paused ? 'Resume' : 'Pause';
  byId('speed').textContent = store.gameSpeed + 'x';
  renderShop();
  renderPlacementStatus();
  renderTilePanel();
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

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
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
  if (action === 'pause') store.togglePause();
  if (action === 'speed') store.toggleSpeed();
  if (action === 'workshop') store.toggleWorkshop();
  if (action === 'cancel-model') store.cancelModel();
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
