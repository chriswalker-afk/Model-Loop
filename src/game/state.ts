import { adjacentToRoad, EFFECT_RADIUS, HOMES, isOnBoard, isRoad, isScenery, manhattanDistance, MODELS, ROAD_CELLS, type Cell, type ModelId } from './config';
import { householdProfile, modelReactionPerTile } from './households';
import { careName, FLOW_WINDOW_SECONDS, modelEffects, normalizedCare, summarizeFlow,
  UPKEEP_INTERVAL_SECONDS, type CareLevel, type Cashflow, type CashflowEvent } from './economy';
import { LivingEnvironment, type EnvironmentKind, type EnvironmentalEvent } from './environment';

export type Phase = 'playing' | 'complete' | 'lost';
export interface Resident {
  id: number;
  name: string;
  temperament: number;
  irritation: number;
  occupied: boolean;
  laps: number;
  warned: boolean;
  unsettled: boolean;
  lastRemark: string;
  seenModels: Record<string, number>;
  lastEventLap: number;
  nextEventOffset: number;
}
export interface JourneyReaction {
  residentId: number;
  text: string;
  calmer: boolean;
}
export interface HouseholdEffect {
  residentId: number;
  name: string;
  irritationChangePerLap: number;
}
export interface PlacedModel extends Cell {
  id: ModelId;
  care?: CareLevel; // Older prototype saves/tests without a care level default to full.
  nextBillAt?: number;
}
export interface PermanentUpgrades { savings: number; patience: number; }
export interface Legacy { blueprints: number; upgrades: PermanentUpgrades; }
export interface TileInfo { kind: string; beauty: number; noise: number; crime: number; roadSafety: number; }
export interface PlacementPreview {
  cell: Cell;
  modelId: ModelId;
  canPlace: boolean;
  canAfford: boolean;
  allowed: boolean;
  reason: string;
  before: TileInfo;
  after: TileInfo;
  affectedRoadTiles: number;
  affectedHouseholds: number;
  irritationChangePerLap: number;
  householdEffects: HouseholdEffect[];
}

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
  selectedResident: number | null = null;
  workbenchLine = 'The boy lined up the little houses. His father adjusted one of them.';
  private reachedMilestone = 0;
  private statusTick = 0;
  private clockSeconds = 0;
  private economyRefreshSeconds = 0;
  private cashflowEvents: CashflowEvent[] = [];
  environment = new LivingEnvironment(1);
  lastEnvironmentEvent: EnvironmentalEvent | null = null;

  get elapsedSeconds(): number { return this.clockSeconds; }
  get cashflow(): Cashflow {
    const scheduled = this.placements.reduce((total, item) =>
      total + modelEffects(item.id, normalizedCare(item.care)).upkeep, 0);
    return summarizeFlow(this.cashflowEvents, this.clockSeconds, scheduled, this.placements.length);
  }
  // Deliberately excludes purchase costs: income tracks regular money earned
  // through completed circuits and lost to maintenance, not the coin balance.
  tickEconomy(seconds: number): void {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen ||
        !Number.isFinite(seconds) || seconds <= 0) return;
    this.clockSeconds += seconds;
    const environmentChanged = this.environment.tick(this.clockSeconds);
    let billed = 0;
    for (const placed of this.placements) {
      if (placed.nextBillAt === undefined) placed.nextBillAt = this.clockSeconds + UPKEEP_INTERVAL_SECONDS;
      while (placed.nextBillAt <= this.clockSeconds) {
        const price = modelEffects(placed.id, normalizedCare(placed.care)).upkeep;
        if (price > 0) {
          this.money -= price; // A temporary deficit is recoverable through later laps.
          billed += price;
          this.recordCashflow(-price, 'upkeep', placed.nextBillAt);
        }
        placed.nextBillAt += UPKEEP_INTERVAL_SECONDS;
      }
    }
    this.cashflowEvents = this.cashflowEvents.filter(
      entry => entry.at > this.clockSeconds - FLOW_WINDOW_SECONDS);
    if (environmentChanged) this.notify();
    if (billed > 0) {
      this.notice = 'Workshop care bill: −' + billed + ' coins. ' +
        (this.money < 0 ? 'The town is in debt until more cars finish their circuits.' : 'Adjust each model’s care to manage expenses.');
      this.notify();
    }
    this.economyRefreshSeconds += seconds;
    if (this.economyRefreshSeconds >= 1) {
      this.economyRefreshSeconds %= 1;
      this.notify();
    }
  }
  private recordCashflow(amount: number, category: CashflowEvent['category'], at = this.clockSeconds): void {
    this.cashflowEvents.push({ amount, category, at });
  }

  constructor() { this.newRun(); }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify(): void { this.listeners.forEach((listener) => listener()); }

  newRun(seed?: number): void {
    this.environment = new LivingEnvironment(seed ?? (Date.now() >>> 0));
    this.lastEnvironmentEvent = null;
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
    this.selectedResident = null;
    this.reachedMilestone = 0;
    this.statusTick = 0;
    this.clockSeconds = 0;
    this.economyRefreshSeconds = 0;
    this.cashflowEvents = [];
    this.workbenchLine = 'The boy lined up the little houses. His father adjusted one of them.';
    this.residents = HOMES.map((home) => ({
      id: home.id,
      name: home.name,
      temperament: home.temperament,
      irritation: Math.max(0, 12 - this.legacy.upgrades.patience * 6),
      occupied: true,
      laps: 0,
      warned: false,
      unsettled: false,
      lastRemark: householdProfile(home.id).firstRemark,
      seenModels: {},
      lastEventLap: -1,
      nextEventOffset: this.environment.opportunityOffset(ROAD_CELLS.length)
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
  // Actual road hazards and maintained protections, not how irritated people are.
  get safety(): number {
    const protections = this.placements.reduce((sum, item) => {
      const points = item.id === 'limit' ? 4 : item.id === 'lamp' ? 2 :
        item.id === 'police' ? 3 : 0;
      const care = normalizedCare(item.care);
      return sum + points * (care === 'full' ? 1 : care === 'economy' ? 0.5 : 0.1);
    }, 0);
    return Math.round(clamp(90 + Math.min(10, protections) -
      this.environment.hazardPenalty, 0, 100));
  }

  getModel(id: ModelId) { return MODELS.find((model) => model.id === id)!; }
  getPlacedModel(cell: Cell | null): PlacedModel | null {
    if (!cell) return null;
    return this.placements.find(item => item.x === cell.x && item.y === cell.y) || null;
  }
  careDueIn(item: PlacedModel): number {
    return Math.max(0, Math.ceil((item.nextBillAt ?? this.clockSeconds + UPKEEP_INTERVAL_SECONDS) - this.clockSeconds));
  }
  setModelCare(cell: Cell, care: CareLevel): boolean {
    if (this.phase !== 'playing' || this.workshopOpen) return false;
    const placed = this.getPlacedModel(cell);
    if (!placed) return false;
    if (normalizedCare(placed.care) === care) return true;
    placed.care = care;
    const price = modelEffects(placed.id, care).upkeep;
    this.notice = this.getModel(placed.id).name + ': ' + careName(care) +
      '. Next service bill ' + price + ' coins per ' + UPKEEP_INTERVAL_SECONDS + 's.';
    this.selected = { x: placed.x, y: placed.y };
    this.notify();
    return true;
  }
  speedMultiplierAt(tile: Cell): number {
    let multiplier = 1;
    for (const placed of this.placements) {
      if (placed.id !== 'limit' || manhattanDistance(placed, tile) > EFFECT_RADIUS) continue;
      multiplier = Math.min(multiplier, modelEffects(placed.id, normalizedCare(placed.care)).speedMultiplier);
    }
    return multiplier;
  }
  selectResident(id: number | null): void {
    this.selectedResident = this.selectedResident === id ? null : id;
    this.notify();
  }
  projectedHouseholdEffects(cell: Cell, modelId: ModelId): HouseholdEffect[] {
    const covered = ROAD_CELLS.filter(road => manhattanDistance(road, cell) <= EFFECT_RADIUS).length;
    return this.residents.filter(resident => resident.occupied).map(resident => ({
      residentId: resident.id,
      name: resident.name,
      irritationChangePerLap: Math.round(
        modelReactionPerTile(resident.id, modelId) * covered * resident.temperament * 10
      ) / 10
    }));
  }
  selectModel(id: ModelId): void {
    this.setActiveModel(this.activeModel === id ? null : id);
  }
  setActiveModel(id: ModelId | null): void {
    if (id && (this.phase !== 'playing' || this.paused || this.workshopOpen)) return;
    this.activeModel = id;
    this.hovered = null;
    if (id) this.selected = null;
    this.notice = id
      ? this.getModel(id).name + ' lifted from its box. Hover over the town to preview, then click to place. Esc cancels.'
      : 'Miniature returned to its box. Choose another model to continue.';
    this.notify();
  }
  cancelModel(): void {
    if (this.activeModel) this.setActiveModel(null);
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
      && !isScenery(cell.x, cell.y)
      && !this.placements.some((placed) => placed.x === cell.x && placed.y === cell.y);
  }
  place(cell: Cell, id: ModelId): boolean {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen) return false;
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
    this.placements.push({ ...cell, id, care: 'full',
      nextBillAt: this.clockSeconds + UPKEEP_INTERVAL_SECONDS });
    this.activeModel = null;
    this.notice = model.name + ' added to the miniature town.';
    return true;
  }
  private calculateTileInfo(cell: Cell, placements: PlacedModel[]): TileInfo {
    const environmental = this.environment.modifiersAt(cell);
    let kind = isRoad(cell.x, cell.y) ? 'Road tile' : 'Grass tile';
    const home = HOMES.find((item) => item.x === cell.x && item.y === cell.y);
    if (home) {
      const resident = this.residents.find((item) => item.id === home.id);
      kind = resident?.occupied ? home.name : 'Vacant home';
    }
    const model = placements.find((item) => item.x === cell.x && item.y === cell.y);
    if (model) kind = this.getModel(model.id).name;
    const nearby = placements.filter((item) => manhattanDistance(item, cell) <= EFFECT_RADIUS);
    return {
      kind,
      beauty: 1 + environmental.beauty + nearby.reduce((total, item) =>
        total + modelEffects(item.id, normalizedCare(item.care)).beauty, 0),
      noise: (isRoad(cell.x, cell.y) ? 2 : 0) + environmental.noise
        + nearby.reduce((total, item) =>
          total + modelEffects(item.id, normalizedCare(item.care)).noise, 0),
      crime: Math.max(0, 2 + nearby.reduce((total, item) =>
        total + modelEffects(item.id, normalizedCare(item.care)).crime, 0)),
      roadSafety: Math.round(clamp(90 -
        this.environment.at(cell).filter(effect => effect.kind === 'skid').length * 12, 0, 100))
    };
  }

  tileInfo(cell: Cell | null): TileInfo | null {
    return cell && isOnBoard(cell.x, cell.y)
      ? this.calculateTileInfo(cell, this.placements)
      : null;
  }

  // Shared, non-mutating prediction: the preview uses precisely the same
  // scoring and road radius as the purchased model's real simulation effects.
  previewPlacement(cell: Cell, id: ModelId): PlacementPreview {
    const model = this.getModel(id);
    const canPlace = this.canPlace(cell);
    const canAfford = this.money >= model.cost;
    const allowed = this.phase === 'playing' && !this.paused && !this.workshopOpen && canPlace && canAfford;
    let reason = 'Click to build or drag the model box onto this square.';
    if (!canPlace) reason = 'That square is occupied, on the road, or too far from it.';
    else if (!canAfford) reason = 'Not enough coins for this model.';
    else if (this.paused) reason = 'Resume the game before building.';
    else if (this.workshopOpen || this.phase !== 'playing') reason = 'Return to the running town before building.';

    const before = this.calculateTileInfo(cell, this.placements);
    const after = canPlace
      ? this.calculateTileInfo(cell, [...this.placements, { ...cell, id }])
      : before;
    const affectedRoadTiles = ROAD_CELLS.filter((road) =>
      manhattanDistance(road, cell) <= EFFECT_RADIUS).length;

    const householdEffects = canPlace ? this.projectedHouseholdEffects(cell, id) : [];
    const averageChange = householdEffects.length
      ? householdEffects.reduce((sum, effect) => sum + effect.irritationChangePerLap, 0) / householdEffects.length
      : 0;
    return {
      cell, modelId: id, canPlace, canAfford, allowed, reason,
      before, after, affectedRoadTiles,
      affectedHouseholds: this.occupiedHomes,
      irritationChangePerLap: Math.round(averageChange * 10) / 10,
      householdEffects
    };
  }

  passTile(id: number, tile: Cell): JourneyReaction | null {
    if (this.phase !== 'playing') return null;
    const resident = this.residents[id];
    if (!resident?.occupied) return null;
    const profile = householdProfile(id);
    let change = 0.27;
    if (tile.x === 20 && tile.y >= 5) change += 0.2;
    if (tile.x <= 3 && tile.y >= 7) change += 0.15;

    let encountered: PlacedModel | null = null;
    let strongestReaction = 0;
    for (const placed of this.placements) {
      if (manhattanDistance(placed, tile) > EFFECT_RADIUS) continue;
      const impact = modelReactionPerTile(id, placed.id, normalizedCare(placed.care));
      change += impact;
      const key = placed.id + ':' + placed.x + ',' + placed.y;
      if (resident.seenModels[key] !== resident.laps && Math.abs(impact) > Math.abs(strongestReaction)) {
        encountered = placed;
        strongestReaction = impact;
      }
      resident.seenModels[key] = resident.laps;
    }

    // An empty house is a visible reminder of what the town has lost.
    // Some residents mind that more than others; the feedback stays understated.
    if (this.closedHomes > 0 && id === 3) change += this.closedHomes * 0.08;
    if (this.closedHomes > 0 && id === 5) change += this.closedHomes * 0.045;

    // Roadside changes affect the next journeys too: events have consequences,
    // rather than existing solely as decorations or permanent HUD penalties.
    change += this.environment.modifiersAt(tile).irritation;
    resident.irritation = clamp(resident.irritation + change * resident.temperament, 0, 100);
    const home = HOMES.find(home => home.id === id)!;
    const startIndex = ROAD_CELLS.findIndex(road => manhattanDistance(road, home) === 1);
    const tileIndex = ROAD_CELLS.findIndex(road => road.x === tile.x && road.y === tile.y);
    if (tileIndex >= 0 && startIndex >= 0 && resident.lastEventLap !== resident.laps) {
      const journeyOffset = (tileIndex - startIndex + ROAD_CELLS.length) % ROAD_CELLS.length;
      if (journeyOffset >= resident.nextEventOffset) {
        resident.lastEventLap = resident.laps;
        resident.nextEventOffset = this.environment.opportunityOffset(ROAD_CELLS.length);
        const event = this.environment.attempt(
          id, resident.irritation, tile, this.clockSeconds, this.placements
        );
        if (event) this.recordEnvironmentEvent(event);
      }
    }
    let reaction: JourneyReaction | null = null;
    if (encountered && Math.abs(strongestReaction) >= 0.15) {
      const text = profile.remarks[encountered.id];
      resident.lastRemark = text;
      reaction = { residentId: id, text, calmer: strongestReaction < 0 };
    }
    if (resident.irritation >= 45 && !resident.unsettled) {
      resident.unsettled = true;
      if (!reaction) resident.lastRemark = profile.warning;
      this.notice = resident.name + ' seem unsettled on their journeys.';
      this.notify();
    }
    if (resident.irritation >= 72 && !resident.warned) {
      resident.warned = true;
      resident.lastRemark = profile.warning;
      this.notice = resident.name + ' are close to leaving. Listen to what troubles them.';
      reaction = { residentId: id, text: profile.warning, calmer: false };
      this.notify();
    }
    if (resident.irritation >= 100) {
      resident.occupied = false;
      resident.lastRemark = 'The house is quiet now.';
      this.notice = resident.name + ' have moved away. Their home has closed.';
      if (this.closedHomes >= 3) this.endRun(false);
      this.notify();
      return null;
    }

    this.statusTick++;
    if (reaction || this.statusTick % 14 === 0) this.notify();
    return reaction;
  }

  private recordEnvironmentEvent(event: EnvironmentalEvent): void {
    this.lastEnvironmentEvent = event;
    this.notice = event.message;
    this.notify();
  }

  /**
   * Used only by the Vite development-only console helper and browser tests.
   * The live game never exposes a UI control to spawn an environmental event.
   */
  debugEnvironmentEvent(kind: EnvironmentKind, residentId: number, roadCell: Cell): boolean {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen) return false;
    const event = this.environment.force(kind, residentId, roadCell, this.clockSeconds, this.placements);
    if (!event) return false;
    this.recordEnvironmentEvent(event);
    return true;
  }

  finishLap(id: number): number {
    if (this.phase !== 'playing') return 0;
    const resident = this.residents[id];
    if (!resident?.occupied) return 0;
    resident.laps += 1;
    const earned = resident.irritation < 65 ? 15 : 8;
    this.money += earned;
    this.recordCashflow(earned, 'lap');
    this.notice = resident.name + ' completed a circuit: +' + earned + ' coins.';
    this.progress = clamp(this.progress + (resident.irritation < 65 ? 3.0 : 1.7), 0, 100);
    const milestone = Math.min(3, Math.floor(this.progress / 25));
    if (milestone > this.reachedMilestone) {
      this.reachedMilestone = milestone;
      const mostRestless = this.residents.filter(home => home.occupied)
        .sort((a, b) => b.irritation - a.irritation)[0];
      if (mostRestless) this.workbenchLine = householdProfile(mostRestless.id).workbenchLine;
    }
    if (this.progress >= 100) this.endRun(true);
    this.notify();
    return earned;
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
