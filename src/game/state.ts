import { adjacentToRoad, EFFECT_RADIUS, HOMES, isOnBoard, isRoad, isScenery, manhattanDistance, MODELS, ROAD_CELLS, type Cell, type ModelId } from './config';
import { householdProfile, modelReactionPerTile } from './households';
import { careName, FLOW_WINDOW_SECONDS, modelEffects, normalizedCare, summarizeFlow,
  UPKEEP_INTERVAL_SECONDS, type CareLevel, type Cashflow, type CashflowEvent } from './economy';
import { LivingEnvironment, type EnvironmentKind, type EnvironmentalEvent, type LitterDiversion } from './environment';
import {
  BIN_CAPACITY, BIN_CATCH_RADIUS, LITTER_CLEANUP_COST, binCatchChance,
  binCollectionInterval, collectionCost, withinBinCatchment
} from './bins';
import { RoadTraffic, type QueuedRoadCar } from './traffic';
import {
  BEHAVIOUR_MAX_HISTORY, HouseholdBehaviourEngine, householdActionPair,
  previewBehaviourInfluence, type BehaviourReport, type BehaviourPreviewRow,
  type HouseholdAction, type HouseholdActionId
} from './behaviors';

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
  trafficDelay: number; // Total seconds lost behind other road users.
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
  fill?: number; // Only bin models use these three collection fields.
  overflowed?: boolean;
  nextCollectionAt?: number;
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
  behaviourEffects: BehaviourPreviewRow[];
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
  traffic = new RoadTraffic(1);
  behaviour = new HouseholdBehaviourEngine(1);
  behaviourHistory: BehaviourReport[] = [];
  private lastCongestionNoticeAt = -Infinity;

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
    const trafficCleared = this.traffic.tick(this.clockSeconds);
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
      if (placed.id !== 'bin') continue;
      const interval = binCollectionInterval(normalizedCare(placed.care));
      if (interval === null) {
        placed.nextCollectionAt = undefined;
        continue;
      }
      if (placed.nextCollectionAt === undefined) {
        placed.nextCollectionAt = this.clockSeconds + interval;
      }
      while (placed.nextCollectionAt <= this.clockSeconds) {
        const cost = collectionCost(placed.fill ?? 0, !!placed.overflowed);
        if (cost > 0) {
          // Routine collectors will service a filled bin, even if the town is
          // temporarily in debt. The charge remains real, within net Income.
          this.money -= cost;
          billed += cost;
          this.recordCashflow(-cost, 'upkeep', placed.nextCollectionAt);
          placed.fill = 0;
          placed.overflowed = false;
        }
        placed.nextCollectionAt += interval;
      }
    }
    this.cashflowEvents = this.cashflowEvents.filter(
      entry => entry.at > this.clockSeconds - FLOW_WINDOW_SECONDS);
    if (environmentChanged || trafficCleared) this.notify();
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
    const runSeed = seed ?? (Date.now() >>> 0);
    this.environment = new LivingEnvironment(runSeed);
    this.traffic = new RoadTraffic(runSeed);
    this.behaviour = new HouseholdBehaviourEngine(runSeed);
    this.behaviourHistory = [];
    this.lastCongestionNoticeAt = -Infinity;
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
      nextEventOffset: this.behaviour.opportunityOffset(ROAD_CELLS.length),
      trafficDelay: 0
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
      this.environment.hazardPenalty - Math.min(6, this.traffic.queuedCars.length * 2),
      0, 100));
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
    if (placed.id === 'bin') {
      const interval = binCollectionInterval(care);
      placed.nextCollectionAt = interval === null ? undefined
        : this.clockSeconds + interval;
    }
    const price = modelEffects(placed.id, care).upkeep;
    this.notice = this.getModel(placed.id).name + ': ' + careName(care) +
      '. Next service bill ' + price + ' coins per ' + UPKEEP_INTERVAL_SECONDS + 's.';
    this.selected = { x: placed.x, y: placed.y };
    this.notify();
    return true;
  }
  getBinStatus(cell: Cell | null): {
    fill: number; capacity: number; overflowed: boolean; radius: number;
    reliability: number; collectionPrice: number; collectionDueIn: number | null;
    regularUpkeep: number;
  } | null {
    const item = this.getPlacedModel(cell);
    if (!item || item.id !== 'bin') return null;
    const level = normalizedCare(item.care);
    const interval = binCollectionInterval(level);
    return {
      fill: item.fill ?? 0, capacity: BIN_CAPACITY, overflowed: !!item.overflowed,
      radius: BIN_CATCH_RADIUS, reliability: binCatchChance(level),
      collectionPrice: collectionCost(item.fill ?? 0, !!item.overflowed),
      collectionDueIn: interval === null ? null :
        Math.ceil(Math.max(0, (item.nextCollectionAt ??
          this.clockSeconds + interval) - this.clockSeconds)),
      regularUpkeep: modelEffects('bin', level).upkeep
    };
  }

  /** A collection costs coins and counts towards the rolling Income outflow. */
  emptyBin(cell: Cell): boolean {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen) return false;
    const bin = this.getPlacedModel(cell);
    if (!bin || bin.id !== 'bin') return false;
    const cost = collectionCost(bin.fill ?? 0, !!bin.overflowed);
    if (!cost) {
      this.notice = 'The rubbish bin is already empty.';
      this.notify();
      return false;
    }
    if (this.money < cost) {
      this.notice = 'Need ' + cost + ' coins to empty this bin.';
      this.notify();
      return false;
    }
    this.money -= cost;
    this.recordCashflow(-cost, 'upkeep');
    bin.fill = 0;
    bin.overflowed = false;
    const interval = binCollectionInterval(normalizedCare(bin.care));
    bin.nextCollectionAt = interval === null ? undefined : this.clockSeconds + interval;
    this.notice = 'The rubbish bin was emptied for ' + cost + ' coins.';
    this.notify();
    return true;
  }

  /** A placed bin prevents *new* litter; old scraps require separate tidying. */
  cleanLitter(cell: Cell): boolean {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen) return false;
    const litter = this.environment.effects.find(effect =>
      effect.kind === 'litter' && effect.cell.x === cell.x && effect.cell.y === cell.y);
    if (!litter) return false;
    if (this.money < LITTER_CLEANUP_COST) {
      this.notice = 'Need ' + LITTER_CLEANUP_COST + ' coins to tidy this corner.';
      this.notify();
      return false;
    }
    if (!this.environment.removeEffect(litter.id, 'litter')) return false;
    this.money -= LITTER_CLEANUP_COST;
    this.recordCashflow(-LITTER_CLEANUP_COST, 'upkeep');
    this.notice = 'A little roadside rubbish was cleared for ' +
      LITTER_CLEANUP_COST + ' coins.';
    this.notify();
    return true;
  }

  private interceptLitter(roadCell: Cell): LitterDiversion | null {
    const covered = this.placements.filter(item => item.id === 'bin'
      && withinBinCatchment(item, roadCell))
      .sort((a, b) =>
        manhattanDistance(a, roadCell) - manhattanDistance(b, roadCell)
        || a.x - b.x || a.y - b.y
      );
    if (covered.length === 0) return null;
    // Try any non-full bins first, so an overlapping second bin is genuinely
    // useful. Missed catches from poor maintenance still become roadside litter.
    for (const bin of covered) {
      if ((bin.fill ?? 0) >= BIN_CAPACITY) continue;
      if (this.environment.rng.next() >= binCatchChance(normalizedCare(bin.care))) continue;
      bin.fill = Math.min(BIN_CAPACITY, (bin.fill ?? 0) + 1);
      return { status: 'captured', bin: { x: bin.x, y: bin.y } };
    }
    const full = covered.find(bin => (bin.fill ?? 0) >= BIN_CAPACITY);
    if (full) {
      full.overflowed = true;
      return { status: 'overflow', bin: { x: full.x, y: full.y } };
    }
    return null;
  }

  speedMultiplierAt(tile: Cell): number {
    let multiplier = 1;
    for (const placed of this.placements) {
      if (placed.id !== 'limit' || manhattanDistance(placed, tile) > EFFECT_RADIUS) continue;
      multiplier = Math.min(multiplier, modelEffects(placed.id, normalizedCare(placed.care)).speedMultiplier);
    }
    return Math.min(multiplier, this.environment.slowdownAt(tile));
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
      && !this.placements.some((placed) => placed.x === cell.x && placed.y === cell.y)
      && !this.environment.effects.some(effect =>
        effect.cell.x === cell.x && effect.cell.y === cell.y);
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
      nextBillAt: this.clockSeconds + UPKEEP_INTERVAL_SECONDS,
      ...(id === 'bin' ? {
        fill: 0, overflowed: false, nextCollectionAt: this.clockSeconds + 60
      } : {})
    });
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
    const overflowing = nearby.filter(item => item.id === 'bin' && item.overflowed).length;
    return {
      kind,
      beauty: 1 + environmental.beauty - 2 * overflowing + nearby.reduce((total, item) =>
        total + modelEffects(item.id, normalizedCare(item.care)).beauty, 0),
      noise: (isRoad(cell.x, cell.y) ? 2 : 0) + environmental.noise
        + Math.min(3, this.traffic.queuedNear(cell))
        + nearby.reduce((total, item) =>
          total + modelEffects(item.id, normalizedCare(item.care)).noise, 0),
      crime: Math.max(0, 2 + overflowing + nearby.reduce((total, item) =>
        total + modelEffects(item.id, normalizedCare(item.care)).crime, 0)),
      roadSafety: Math.round(clamp(90 -
        this.environment.at(cell).filter(effect => effect.kind === 'skid').length * 12 -
        this.traffic.queuedNear(cell) * 2, 0, 100))
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
      manhattanDistance(road, cell) <= (id === 'bin' ? BIN_CATCH_RADIUS : EFFECT_RADIUS)).length;

    const householdEffects = canPlace ? this.projectedHouseholdEffects(cell, id) : [];
    const behaviourEffects = canPlace
      ? previewBehaviourInfluence(cell, id, this.placements, this.residents)
      : [];
    const averageChange = householdEffects.length
      ? householdEffects.reduce((sum, effect) => sum + effect.irritationChangePerLap, 0) / householdEffects.length
      : 0;
    return {
      cell, modelId: id, canPlace, canAfford, allowed, reason,
      before, after, affectedRoadTiles,
      affectedHouseholds: this.occupiedHomes,
      irritationChangePerLap: Math.round(averageChange * 10) / 10,
      householdEffects, behaviourEffects
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

    // Roadside changes affect subsequent journeys; a bin that overflows also
    // becomes an ongoing nuisance, until someone pays for collection.
    change += this.environment.modifiersAt(tile).irritation;
    change += this.placements.filter(item => item.id === 'bin' && item.overflowed
      && manhattanDistance(item, tile) <= EFFECT_RADIUS).length * 0.12;
    resident.irritation = clamp(resident.irritation + change * resident.temperament, 0, 100);
    const home = HOMES.find(home => home.id === id)!;
    const startIndex = ROAD_CELLS.findIndex(road => manhattanDistance(road, home) === 1);
    const tileIndex = ROAD_CELLS.findIndex(road => road.x === tile.x && road.y === tile.y);
    if (tileIndex >= 0 && startIndex >= 0 &&
      resident.lastEventLap !== resident.laps) {
      const offset = (tileIndex - startIndex + ROAD_CELLS.length) % ROAD_CELLS.length;
      if (offset >= resident.nextEventOffset) {
        resident.lastEventLap = resident.laps;
        resident.nextEventOffset = this.behaviour.opportunityOffset(ROAD_CELLS.length);
        const action = this.behaviour.choose(id, resident.irritation,
          tile, this.clockSeconds, this.placements);
        if (action) this.performHouseholdAction(id, action, tile);
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

  /** A single, attributable activity for every family on a given circuit. */
  private performHouseholdAction(
    residentId: number, action: HouseholdAction, road: Cell, naturally = true
  ): boolean {
    const resident = this.residents[residentId];
    if (!resident?.occupied || !isRoad(road.x, road.y) || this.phase !== 'playing') return false;
    let message = action.message;
    let effectCell = road;
    if (action.mechanic === 'stop') {
      // Another driver could already be stopped; unsuccessful actions do not
      // create duplicate pop-ups or generate more income.
      const stop = this.traffic.requestStop(residentId, road, this.clockSeconds);
      if (!stop) return false;
      message = stop.message;
    } else {
      const kind = action.environmentKind;
      if (!kind) return false;
      const event = this.environment.force(kind, residentId, road,
        this.clockSeconds, this.placements, tile => this.interceptLitter(tile));
      if (!event) return false;
      effectCell = event.cell;
      if (action.id === 'litter' && event.outcome) {
        // Respect capacity and overflow messages; placing a bin changes the
        // outcome of a litter event, not the whole person's character.
        message = event.message;
      } else {
        if (action.id === 'mend') {
          const repaired = this.environment.removeNearby('skid',road,2);
          if (repaired) message += ' The tyre scuffs have been cleared.';
        } else if (action.id === 'tidy') {
          const cleared = this.environment.removeNearby('litter',road,3);
          if (cleared) message += ' A discarded wrapper was collected.';
        } else if (action.id === 'courtesy' || action.id === 'guide') {
          const helped = this.traffic.activeStop?.residentId !== residentId &&
            this.traffic.shortenStop(this.clockSeconds,
              action.id === 'guide' ? 3 : 1.8);
          if (helped) message += ' The queue began to clear sooner.';
        }
        event.message = message;
      }
      this.lastEnvironmentEvent = event;
    }
    // Preserve the Pass 2 ambient rubbish: another family's inconvenient
    // act can also leave a small wrapper behind. It is a *consequence* of
    // this one action, never a second roll for a separate household action.
    // Forced developer actions stay isolated for reproducible QA.
    if (naturally && action.tone === 'troublesome' && action.id !== 'litter' &&
      this.environment.rng.next() < 0.22) {
      const wrapper = this.environment.force('litter', residentId, road,
        this.clockSeconds, this.placements, tile => this.interceptLitter(tile));
      if (wrapper) {
        this.lastEnvironmentEvent = wrapper;
        message += wrapper.outcome === 'captured'
          ? ' A piece of paper made it into the rubbish bin.'
          : wrapper.outcome === 'overflow'
            ? ' A stray wrapper spilled beside the full bin.'
            : ' A stray wrapper was left by the verge.';
      }
    }
    this.behaviour.mark(residentId,this.clockSeconds);
    resident.lastRemark = action.tone === 'helpful'
      ? action.id === 'mend' ? 'That ought to last a little longer.'
        : action.id === 'guide' ? 'There we are. All moving again.'
        : 'A small thing, but it makes a difference.'
      : action.id === 'display' ? 'I thought the neighbours might like to see it.'
        : action.id === 'chat' ? 'There is always time for a quick word.'
        : 'I shall be on my way in a moment.';
    this.behaviourHistory.unshift({
      residentId,action:action.id,tone:action.tone,cell:{...effectCell},
      time:this.clockSeconds,message
    });
    if(this.behaviourHistory.length>BEHAVIOUR_MAX_HISTORY)
      this.behaviourHistory.length=BEHAVIOUR_MAX_HISTORY;
    this.notice=message;
    this.notify();
    return true;
  }

  /** Repeatable manual forcing is exclusively exposed in the Vite dev bundle. */
  debugHouseholdAction(
    residentId:number,actionId:HouseholdActionId,road:Cell
  ):boolean {
    if(this.phase!=='playing'||this.paused||this.workshopOpen ||
      !this.residents[residentId]?.occupied)return false;
    const pair=householdActionPair(residentId);
    const action=[pair.helpful,pair.troublesome].find(item=>item.id===actionId);
    return action?this.performHouseholdAction(residentId,action,road,false):false;
  }

  /**
   * Queue delays cost time and generate irritation, but do not directly
   * generate or remove coins: fewer completed circuits means less income.
   */
  reportTrafficFlow(queued: QueuedRoadCar[]): void {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen) return;
    const prior = this.traffic.queuedCars.length;
    const changed = this.traffic.updateQueue(queued);
    for (const item of queued) {
      const resident = this.residents[item.residentId];
      if (!resident?.occupied) continue;
      resident.trafficDelay += item.delaySeconds;
      const helpfulNearby = this.environment.at(item.cell).some(effect =>
        effect.kind === 'guidance' || effect.kind === 'courtesy');
      resident.irritation = clamp(resident.irritation +
        item.delaySeconds * resident.temperament * (helpfulNearby ? 0.23 : 0.42),
        0, 100);
    }
    if (changed) {
      if (this.traffic.queuedCars.length >= 2 && prior < 2 &&
        this.clockSeconds - this.lastCongestionNoticeAt >= 25) {
        this.notice = this.traffic.queuedCars.length +
          ' cars have queued behind slower traffic. Circuits are taking longer.';
        this.lastCongestionNoticeAt = this.clockSeconds;
      }
      this.notify();
    }
  }

  debugTrafficStop(id: number, cell: Cell, duration?: number): boolean {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen ||
      !this.residents[id]?.occupied || !isRoad(cell.x, cell.y)) return false;
    const incident = this.traffic.forceStop(id, cell, this.clockSeconds, duration);
    if (!incident) return false;
    this.notice = incident.message;
    this.notify();
    return true;
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
    const event = this.environment.force(kind, residentId, roadCell, this.clockSeconds,
      this.placements, road => this.interceptLitter(road));
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
