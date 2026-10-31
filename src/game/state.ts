import { adjacentToRoad, HOMES, isOnBoard, isRoad, MODELS, type Cell, type ModelId } from './config';

export type Phase = 'playing' | 'complete' | 'lost';
export interface Resident {
  id: number;
  name: string;
  temperament: number;
  irritation: number;
  occupied: boolean;
  laps: number;
  warned: boolean;
}
export interface PlacedModel extends Cell { id: ModelId; }
export interface PermanentUpgrades { savings: number; patience: number; }
export interface Legacy { blueprints: number; upgrades: PermanentUpgrades; }
export interface TileInfo { kind: string; beauty: number; noise: number; crime: number; }

const KEY = 'model-loop-legacy-v1';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function readLegacy(): Legacy {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!data || typeof data !== 'object') throw new Error('No legacy saved');
    const value = data as Partial<Legacy>;
    return {
      blueprints: clamp(Number(value.blueprints) || 0, 0, 999999),
      upgrades: {
        savings: clamp(Number(value.upgrades?.savings) || 0, 0, 3),
        patience: clamp(Number(value.upgrades?.patience) || 0, 0, 3)
      }
    };
  } catch {
    return { blueprints: 0, upgrades: { savings: 0, patience: 0 } };
  }
}

export class GameStore {
  private listeners = new Set<() => void>();
  legacy: Legacy = readLegacy();
  phase: Phase = 'playing';
  money = 0;
  progress = 0;
  gameSpeed: 1 | 2 = 1;
  paused = false;
  activeModel: ModelId | null = null;
  selected: Cell | null = null;
  hovered: Cell | null = null;
  placements: PlacedModel[] = [];
  residents: Resident[] = [];
  notice = 'Choose a boxed miniature, then place it beside the road.';
  workshopOpen = false;

  constructor() { this.newRun(); }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify(): void { this.listeners.forEach((listener) => listener()); }

  newRun(): void {
    this.phase = 'playing';
    this.money = 145 + this.legacy.upgrades.savings * 35;
    this.progress = 0;
    this.gameSpeed = 1;
    this.paused = false;
    this.activeModel = null;
    this.selected = null;
    this.hovered = null;
    this.placements = [];
    this.workshopOpen = false;
    this.residents = HOMES.map((home) => ({
      id: home.id,
      name: home.name,
      temperament: home.temperament,
      irritation: Math.max(0, 12 - this.legacy.upgrades.patience * 6),
      occupied: true,
      laps: 0,
      warned: false
    }));
    this.notice = 'The year is 1908. Keep the neighbourhood happy as the cars circle.';
    this.notify();
  }

  get occupiedHomes(): number {
    return this.residents.filter((resident) => resident.occupied).length;
  }
  get closedHomes(): number { return this.residents.length - this.occupiedHomes; }
  get averageIrritation(): number {
    const active = this.residents.filter((resident) => resident.occupied);
    if (active.length === 0) return 100;
    return active.reduce((total, resident) => total + resident.irritation, 0) / active.length;
  }
  get community(): number { return Math.round(this.occupiedHomes / HOMES.length * 100); }
  get safety(): number { return Math.round(clamp(100 - this.averageIrritation(), 0, 100)); }

  getModel(id: ModelId) { return MODELS.find((model) => model.id === id)!; }
  selectModel(id: ModelId): void {
    if (this.phase !== 'playing') return;
    this.activeModel = this.activeModel === id ? null : id;
    this.notice = this.activeModel ? 'Choose an empty square next to the road.' : 'Model selection cleared.';
    this.notify();
  }
  setHovered(cell: Cell | null): void {
    if (this.hovered?.x === cell?.x && this.hovered?.y === cell?.y) return;
    this.hovered = cell;
    this.notify();
  }
  selectTile(cell: Cell): void {
    this.selected = cell;
    if (this.activeModel) this.place(cell, this.activeModel);
    this.notify();
  }
  canPlace(cell: Cell): boolean {
    return isOnBoard(cell.x, cell.y)
      && !isRoad(cell.x, cell.y)
      && adjacentToRoad(cell.x, cell.y)
      && !HOMES.some((home) => home.x === cell.x && home.y === cell.y)
      && !this.placements.some((placed) => placed.x === cell.x && placed.y === cell.y);
  }
  place(cell: Cell, id: ModelId): boolean {
    if (this.phase !== 'playing') return false;
    const model = this.getModel(id);
    if (!this.canPlace(cell)) {
      this.notice = 'Build on an empty square directly beside the road.';
      return false;
    }
    if (this.money < model.cost) {
      this.notice = 'Not enough coins for this model yet.';
      return false;
    }
    this.money -= model.cost;
    this.placements.push({ ...cell, id });
    this.activeModel = null;
    this.notice = model.name + ' added to the miniature town.';
    return true;
  }
  tileInfo(cell: Cell | null): TileInfo | null {
    if (!cell || !isOnBoard(cell.x, cell.y)) return null;
    let kind = isRoad(cell.x, cell.y) ? 'Road tile' : 'Grass tile';
    const home = HOMES.find((item) => item.x === cell.x && item.y === cell.y);
    if (home) {
      const resident = this.residents.find((item) => item.id === home.id);
      kind = resident?.occupied ? home.name : 'Vacant home';
    }
    const model = this.placements.find((item) => item.x === cell.x && item.y === cell.y);
    if (model) kind = this.getModel(model.id).name;
    const nearby = this.placements.filter((item) =>
      Math.abs(item.x - cell.x) + Math.abs(item.y - cell.y) <= 2);
    return {
      kind,
      beauty: 1 + nearby.reduce((total, item) => total + this.getModel(item.id).beauty, 0),
      noise: (isRoad(cell.x, cell.y) ? 2 : 0) +
        nearby.reduce((total, item) => total + this.getModel(item.id).noise, 0),
      crime: Math.max(0, 2 + nearby.reduce((total, item) => total + this.getModel(item.id).crime, 0))
    };
  }

  passTile(id: number, tile: Cell): void {
    if (this.phase !== 'playing') return;
    const resident = this.residents[id];
    if (!resident?.occupied) return;
    let change = 0.27;
    if (tile.x === 20 && tile.y >= 5) change += 0.2;
    if (tile.x <= 3 && tile.y >= 7) change += 0.15;
    this.placements.forEach((placed) => {
      if (Math.abs(placed.x - tile.x) + Math.abs(placed.y - tile.y) <= 2) {
        change += this.getModel(placed.id).comfort;
      }
    });
    resident.irritation = clamp(resident.irritation + change * resident.temperament, 0, 100);
    if (resident.irritation >= 72 && !resident.warned) {
      resident.warned = true;
      this.notice = resident.name + ' are thinking of leaving. Make their journeys nicer!';
      this.notify();
    }
    if (resident.irritation >= 100) {
      resident.occupied = false;
      this.notice = resident.name + ' have moved away. Their home has closed.';
      if (this.closedHomes >= 3) this.endRun(false);
      this.notify();
    }
  }

  finishLap(id: number): void {
    if (this.phase !== 'playing') return;
    const resident = this.residents[id];
    if (!resident?.occupied) return;
    resident.laps += 1;
    this.money += resident.irritation < 65 ? 15 : 8;
    this.progress = clamp(this.progress + (resident.irritation < 65 ? 3.0 : 1.7), 0, 100);
    if (this.progress >= 100) this.endRun(true);
    this.notify();
  }

  endRun(won: boolean): void {
    if (this.phase !== 'playing') return;
    this.phase = won ? 'complete' : 'lost';
    const reward = won ? 20 + this.occupiedHomes * 2 : 5 + Math.floor(this.progress / 20);
    this.legacy.blueprints += reward;
    this.save();
    this.notice = won ? 'Vintage chapter complete. The family has new stories to tell.' :
      'The town has fallen quiet. The family keeps what they learned.';
    this.workshopOpen = false;
    this.notify();
  }

  upgrade(type: keyof PermanentUpgrades): boolean {
    if (this.phase === 'playing') return false;
    const level = this.legacy.upgrades[type];
    const baseCost = type === 'savings' ? 20 : 30;
    const cost = baseCost * (level + 1);
    if (level >= 3 || this.legacy.blueprints < cost) return false;
    this.legacy.blueprints -= cost;
    this.legacy.upgrades[type] += 1;
    this.notice = 'Blueprint preserved. It will help in the next run.';
    this.save();
    this.notify();
    return true;
  }

  togglePause(): void {
    if (this.phase !== 'playing') return;
    this.paused = !this.paused;
    this.notify();
  }
  toggleSpeed(): void {
    this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
    this.notify();
  }
  toggleWorkshop(): void {
    this.workshopOpen = !this.workshopOpen;
    this.notify();
  }

  private save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.legacy)); } catch { /* storage disabled */ }
  }
}

export const store = new GameStore();
