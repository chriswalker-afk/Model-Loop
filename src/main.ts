import { AUTO, Game } from 'phaser';
import { TownScene } from './game/TownScene';
import { MODELS, type ModelId } from './game/config';
import { store } from './game/state';

const game = new Game({
  type: AUTO,
  width: 1152,
  height: 620,
  parent: 'game-container',
  backgroundColor: '#111515',
  antialias: true,
  render: { pixelArt: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
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

function miniatureSvg(id: ModelId): string {
  let shape = '';
  if (id === 'lamp') {
    shape = '<path d="M50 75V32 M38 76H62 M41 32H59 L57 17H43Z M38 17H62L50 9Z M44 36H56 M50 11V7"/>' +
      '<path d="M45 20V30M55 20V30" stroke="#d1ad72"/>';
  } else if (id === 'tree') {
    shape = '<path d="M50 77V49M50 62L35 47M50 58L65 43M38 76H62"/>' +
      '<path d="M29 48C17 36 27 20 39 24C41 10 58 8 65 20C84 16 91 41 75 48C73 61 54 59 50 55C41 63 29 57 29 48Z"/>';
  } else if (id === 'bench') {
    shape = '<path d="M23 37H77V53H23ZM20 58H80V65H20ZM28 65V76M72 65V76M28 37V29M72 37V29"/>' +
      '<path d="M28 44H72M28 49H72M29 60H71" stroke="#d1ad72"/>';
  } else if (id === 'limit') {
    shape = '<circle cx="50" cy="34" r="23"/><circle cx="50" cy="34" r="19" stroke="#d1ad72"/>' +
      '<path d="M50 57V80M40 80H60"/><text x="50" y="41" font-size="22" fill="#e7e4d8" stroke="none" text-anchor="middle" font-family="Georgia">20</text>';
  } else {
    shape = '<path d="M32 75V30H68V75ZM28 30L50 16L72 30ZM29 76H71M38 37H62V52H38ZM43 75V60H57V75"/>' +
      '<path d="M50 20V29M45 24H55" stroke="#d1ad72"/>';
  }
  return '<svg class="miniature-svg" viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg" ' +
    'fill="none" stroke="#e0ddd1" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' + shape + '</svg>';
}

let shopSignature = '';
function renderShop(): void {
  const signature = [store.activeModel,store.money,store.phase].join(':');
  if (signature === shopSignature) return;
  shopSignature = signature;
  byId('shop').innerHTML = MODELS.map((item, index) => {
    const picked = store.activeModel === item.id;
    const poor = store.money < item.cost;
    const effects = '<span>Beauty ' + signed(item.beauty) + '</span><span>Noise ' +
      signed(item.noise) + '</span><span>Crime ' + signed(item.crime) + '</span>';
    return '<button type="button" class="model-box ' +
      (picked ? 'selected ' : '') + (poor ? 'unaffordable' : '') +
      '" data-model="' + item.id + '" aria-pressed="' + picked + '"' +
      ' aria-label="Select ' + item.name + ', costs ' + item.cost + ' coins">' +
      '<span class="box-lip"><span class="box-hole"></span></span>' +
      '<span class="box-series">MODEL NO. 0' + (index + 1) + ' &middot; VINTAGE</span>' +
      '<strong class="box-title">' + item.name + '</strong>' +
      '<span class="display-window">' + miniatureSvg(item.id) +
      '<span class="window-glint"></span></span>' +
      '<span class="box-cost"><span class="coin-icon">&#9679;</span> ' + item.cost + '</span>' +
      '<span class="box-description">' + item.caption + '</span>' +
      '<span class="box-effects">' + effects + '</span></button>';
  }).join('');
}

function renderTilePanel(): void {
  const tile = store.hovered || store.selected;
  const details = store.tileInfo(tile);
  if (!details || !tile) {
    byId('tile-panel').innerHTML =
      '<span class="eyebrow">INSPECT THE TOWN</span><h3>Every square tells a story</h3>' +
      '<p>Hover over a square to see beauty, noise and crime. Click to inspect or build.</p>';
    return;
  }
  const canBuild = store.canPlace(tile);
  byId('tile-panel').innerHTML =
    '<span class="eyebrow">GRID ' + (tile.x + 1) + ' / ' + (tile.y + 1) + '</span>' +
    '<h3>' + details.kind + '</h3>' +
    '<div class="tile-score"><span>Beauty</span><b>' + signed(details.beauty) + '</b></div>' +
    '<div class="tile-score"><span>Noise</span><b>' + signed(details.noise) + '</b></div>' +
    '<div class="tile-score"><span>Crime</span><b>' + signed(details.crime) + '</b></div>' +
    '<p class="tile-tip">' + (store.activeModel ?
      (canBuild ? 'Click to place your chosen miniature.' : 'Choose an empty square beside the road.') :
      (canBuild ? 'Available for a miniature.' : 'A piece of the existing town.')) + '</p>';
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
  renderTilePanel();
  renderModal();
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const modelButton = target.closest<HTMLElement>('[data-model]');
  if (modelButton) {
    store.selectModel(modelButton.dataset.model as ModelId);
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
  if (action === 'new-run') {
    store.newRun();
    game.scene.getScene('TownScene').scene.restart();
  }
});

store.subscribe(render);
render();
