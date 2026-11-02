import { adjacentToRoad, EFFECT_RADIUS, HOMES, isOnBoard, isRoad, isScenery, manhattanDistance, MODELS, ROAD_CELLS, type Cell, type ModelId } from './config';
import { householdProfile, modelReactionPerTile } from './households';
import { careName, FLOW_WINDOW_SECONDS, modelEffects, modelRepairCost,
  modelCondition, modelConditionFactor, normalizedCare, summarizeFlow,
  UPKEEP_INTERVAL_SECONDS, type CareLevel, type Cashflow, type CashflowEvent,
  type ModelCondition } from './economy';
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
import { VINTAGE_BALANCE, newRunLedger, summariseRun, type RunLedger } from './balance';
import { chooseWorkshopMoment, chooseClosingMoment, type WorkshopMoment } from './workbench';
import {
  ActivityEngine, activityDefinition, type ActivityKind,
  type ActivityCompletion, type ActivityOutcome
} from './activities';
import { RoadsideAccidentEngine, type RoadsideIncident,
  type ImpactSeverity } from './damage';
import { isBendApproach } from './driving';
import { NeighbourhoodStories, type NeighbourRequest } from './neighbours';
import type { RoadLane } from './traffic';

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
  condition?: ModelCondition; // Physical state is independent of selected care.
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
  workbenchMoments: WorkshopMoment[] = [];
  closingLine = '';
  ledger: RunLedger = newRunLedger();
  /** Important happenings are announced once; routine lap payments are not. */
  announcement = '';
  announcementRevision = 0;
  private noticeHoldUntil = 0;
  private noticePriority = 0;
  private reachedMilestone = 0;
  private statusTick = 0;
  private clockSeconds = 0;
  private economyRefreshSeconds = 0;
  private cashflowEvents: CashflowEvent[] = [];
  environment = new LivingEnvironment(1);
  lastEnvironmentEvent: EnvironmentalEvent | null = null;
  traffic = new RoadTraffic(1);
  behaviour = new HouseholdBehaviourEngine(1);
  activities = new ActivityEngine(1);
  accidents = new RoadsideAccidentEngine(1);
  neighbours = new NeighbourhoodStories(1);
  private cautiousUntil = new Map<number,number>();
  behaviourHistory: BehaviourReport[] = [];
  latestBehaviourReport: BehaviourReport | null = null;
  private nextBehaviourSequence = 1;
  private lastCongestionNoticeAt = -Infinity;

  get elapsedSeconds(): number { return this.clockSeconds; }
  get cashflow(): Cashflow {
    const scheduled = this.placements.reduce((total, item) =>
      total + modelEffects(item.id, normalizedCare(item.care),
        modelCondition(item.condition)).upkeep, 0);
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
    const activityTick = this.activities.tick(this.clockSeconds);
    const accidentChanged = this.accidents.tick(this.clockSeconds);
    const neighbourExpired = this.neighbours.tick(this.clockSeconds);
    for (const finished of activityTick.completed) this.finishActivity(finished);
    this.ledger.maximumEnvironmentalEffects = Math.max(
      this.ledger.maximumEnvironmentalEffects, this.environment.effects.length
    );
    let billed = 0;
    for (const placed of this.placements) {
      if (placed.nextBillAt === undefined) placed.nextBillAt = this.clockSeconds + UPKEEP_INTERVAL_SECONDS;
      while (placed.nextBillAt <= this.clockSeconds) {
        const price = modelEffects(placed.id, normalizedCare(placed.care),
          modelCondition(placed.condition)).upkeep;
        if (price > 0) {
          this.money -= price; // A temporary deficit is recoverable through later laps.
          billed += price;
          this.recordCashflow(-price, 'upkeep', placed.nextBillAt);
        }
        placed.nextBillAt += UPKEEP_INTERVAL_SECONDS;
      }
      if (placed.id !== 'bin') continue;
      if (modelCondition(placed.condition) === 'broken') {
        placed.nextCollectionAt = undefined;
        continue;
      }
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
    if (environmentChanged || trafficCleared || activityTick.changed ||
        accidentChanged || neighbourExpired) this.notify();
    if (billed > 0) {
      this.publishNotice('Workshop care bill: −' + billed + ' coins. ' +
        (this.money < 0 ? 'The town is in debt until more cars finish their circuits.' :
          'Adjust each model’s care to manage expenses.'), this.money < 0 ? 2 : 0);
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
    if (category === 'lap') {
      this.ledger.completedLaps++;
      this.ledger.coinsEarned += amount;
    } else if (amount < 0) {
      this.ledger.carePaid -= amount;
    }
  }

  /**
   * Keep a meaningful incident visible for a few simulated seconds instead
   * of immediately replacing it with a lap coin or routine bill. The public
   * announcement stream excludes routine earnings to protect screen readers.
   */
  private publishNotice(message: string, priority: 0 | 1 | 2 = 0): void {
    if (priority < this.noticePriority && this.clockSeconds < this.noticeHoldUntil) return;
    this.notice = message;
    this.noticePriority = priority;
    this.noticeHoldUntil = this.clockSeconds +
      (priority === 0 ? 0.7 : VINTAGE_BALANCE.significantActionNoticeSeconds);
    if (priority > 0) {
      this.announcement = message;
      this.announcementRevision++;
    }
  }

  get runSummary() { return summariseRun(this.ledger); }

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
    this.activities = new ActivityEngine(runSeed);
    this.accidents = new RoadsideAccidentEngine(runSeed);
    this.neighbours = new NeighbourhoodStories(runSeed);
    this.cautiousUntil.clear();
    this.behaviourHistory = [];
    this.latestBehaviourReport = null;
    this.nextBehaviourSequence = 1;
    this.ledger = newRunLedger();
    this.workbenchMoments = [];
    this.closingLine = '';
    this.announcement = '';
    this.announcementRevision++;
    this.noticeHoldUntil = 0;
    this.noticePriority = 0;
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
      nextEventOffset: this.behaviour.opportunityOffset(ROAD_CELLS.length, home.id),
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
      return sum + points * (care === 'full' ? 1 : care === 'economy' ? 0.5 : 0.1)
        * modelConditionFactor(item.condition);
    }, 0);
    return Math.round(clamp(90 + Math.min(10, protections) -
      this.environment.hazardPenalty - this.accidents.hazardPenalty -
      Math.min(6, this.traffic.queuedCars.length * 2),
      0, 100));
  }

  getModel(id: ModelId) { return MODELS.find((model) => model.id === id)!; }
  getPlacedModel(cell: Cell | null): PlacedModel | null {
    if (!cell) return null;
    return this.placements.find(item => item.x === cell.x && item.y === cell.y) || null;
  }
  /** A deliberate, paid recovery; no coins or Progress are rewarded for
   * causing accidents or fixing them. Broken minis stop accruing upkeep. */
  repairModel(cell: Cell): boolean {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen) return false;
    const item = this.getPlacedModel(cell);
    if (!item || modelCondition(item.condition)==='intact') return false;
    const cost = modelRepairCost(item.id,item.condition);
    if (this.money < cost) {
      this.publishNotice('Need ' + cost + ' coins to repair the ' +
        this.getModel(item.id).name + '.', 1);
      this.notify();
      return false;
    }
    const old = modelCondition(item.condition);
    this.money -= cost;
    this.recordCashflow(-cost,'upkeep');
    this.ledger.repairSpending=(this.ledger.repairSpending??0)+cost;
    item.condition = 'intact';
    this.neighbours.cancel('hale-restore',cell);
    item.nextBillAt = this.clockSeconds + UPKEEP_INTERVAL_SECONDS;
    if(item.id === 'bin'){
      const interval=binCollectionInterval(normalizedCare(item.care));
      item.nextCollectionAt=interval === null ? undefined : this.clockSeconds+interval;
    }
    this.publishNotice(this.getModel(item.id).name + ' repaired from ' +
      old + ' for ' + cost + ' coins. Its benefits have returned.', 1);
    this.selected={x:item.x,y:item.y};
    this.notify();
    return true;
  }

  /** Only called for an actual tile crossing on the left driving lane.
   * Safe overtaking/merging and stationary or parked vehicles cannot cause
   * a random roadside impact. Geometry is checked again by the engine. */
  considerRoadsideAccident(
    residentId: number, road: Cell, actualSpeed: number,
    lane: RoadLane, changingLane = false
  ): RoadsideIncident | null {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen ||
      lane !== 'left' || changingLane || actualSpeed < 48 ||
      !isRoad(road.x,road.y) || !this.residents[residentId]?.occupied ||
      this.activities.forResident(residentId) || this.traffic.shouldStop(residentId)) return null;
    if(this.activities.active.some(activity =>
      manhattanDistance(activity.roadCell,road)<=1))return null;
    const idx=ROAD_CELLS.findIndex(cell=>cell.x===road.x&&cell.y===road.y);
    const nearby=this.placements.filter(item=>manhattanDistance(item,road)<=2);
    const obscured=this.environment.at(road,1).some(effect=>
      effect.kind==='litter'||effect.kind==='display'||effect.kind==='skid') ||
      nearby.some(item=>item.id==='tree'&&modelCondition(item.condition)!=='broken');
    const protectedCorner=nearby.some(item=>
      (item.id==='limit'||item.id==='lamp'||item.id==='police') &&
      modelConditionFactor(item.condition)>.4 && normalizedCare(item.care)!=='bare');
    const impact=this.accidents.consider(residentId,road,this.placements,this.clockSeconds,{
      speed:actualSpeed,bend:idx>=0&&isBendApproach(idx),
      obscured,protected:protectedCorner
    });
    if(impact)this.applyRoadsideImpact(impact);
    return impact;
  }
  /** Developer-only force with the same left-verge physical contact rule. */
  debugRoadsideAccident(
    residentId: number, road: Cell, modelCell: Cell,
    severity: ImpactSeverity = 'damage'
  ): boolean {
    if(this.phase!=='playing'||this.paused||this.workshopOpen ||
      !this.residents[residentId]?.occupied) return false;
    const model=this.getPlacedModel(modelCell);
    if(!model)return false;
    const incident=this.accidents.force(residentId,road,model,this.clockSeconds,severity);
    if(!incident)return false;
    this.applyRoadsideImpact(incident);
    return true;
  }
  private applyRoadsideImpact(incident: RoadsideIncident): void {
    const item=this.getPlacedModel(incident.model);
    if(!item)return;
    item.condition=incident.after;
    // An accident is a concrete new thread, not an unconnected surprise.
    const thread=this.neighbours.begin('accident',incident.residentId,
      incident.model,this.clockSeconds,this.residents[incident.residentId].name+
      ' clipped the '+this.getModel(item.id).name+' by the road.');
    this.neighbours.request(thread,'ward-visit',incident.residentId,
      incident.road,incident.model,this.clockSeconds,{incidentId:incident.id});
    this.neighbours.request(thread,'hale-restore',incident.residentId,
      incident.road,incident.model,this.clockSeconds,{incidentId:incident.id});
    // Even an enthusiastic driver is a little more circumspect immediately
    // after a mishap. Real driving speed uses this temporary factor.
    this.cautiousUntil.set(incident.residentId,this.clockSeconds+26);
    this.ledger.roadsideAccidents=(this.ledger.roadsideAccidents??0)+1;
    const resident=this.residents[incident.residentId];
    resident.irritation=clamp(resident.irritation+(incident.after==='broken'?2.5:1.3),0,100);
    resident.lastRemark=incident.residentId===0
      ? 'That bend was tighter than I thought.'
      : 'I should have given the roadside a little more room.';
    const modelName=this.getModel(item.id).name;
    this.publishNotice(resident.name + ' clipped the ' + modelName +
      ' at a nearby corner. The miniature is now ' + incident.after +
      '. Click it to arrange a repair.',2);
    this.notify();
  }

  /** Short, observable post-incident caution; never overrides hard traffic
   * safety, speed signs, overtaking lanes or the shared collision solver. */
  driverCautionFactor(residentId:number):number {
    return (this.cautiousUntil.get(residentId)??0)>this.clockSeconds
      ? residentId===0?.82:.9 : 1;
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
    const price = modelEffects(placed.id, care, modelCondition(placed.condition)).upkeep;
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
    const interval = modelCondition(item.condition) === 'broken'
      ? null : binCollectionInterval(level);
    return {
      fill: item.fill ?? 0, capacity: BIN_CAPACITY, overflowed: !!item.overflowed,
      radius: BIN_CATCH_RADIUS,
      reliability: binCatchChance(level) * modelConditionFactor(item.condition),
      collectionPrice: collectionCost(item.fill ?? 0, !!item.overflowed),
      collectionDueIn: interval === null ? null :
        Math.ceil(Math.max(0, (item.nextCollectionAt ??
          this.clockSeconds + interval) - this.clockSeconds)),
      regularUpkeep: modelEffects('bin', level,modelCondition(item.condition)).upkeep
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
    this.ledger.manualCollections++;
    this.publishNotice('The rubbish bin was emptied for ' + cost + ' coins.', 1);
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
    this.ledger.manualClearances++;
    this.neighbours.cancel('marsh-clean',cell);
    this.publishNotice('A little roadside rubbish was cleared for ' +
      LITTER_CLEANUP_COST + ' coins.', 1);
    this.notify();
    return true;
  }

  private interceptLitter(roadCell: Cell): LitterDiversion | null {
    const covered = this.placements.filter(item => item.id === 'bin'
      && modelCondition(item.condition) !== 'broken'
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
      if (this.environment.rng.next() >= binCatchChance(normalizedCare(bin.care))
        * modelConditionFactor(bin.condition)) continue;
      bin.fill = Math.min(BIN_CAPACITY, (bin.fill ?? 0) + 1);
      this.ledger.litterCaught++;
      return { status: 'captured', bin: { x: bin.x, y: bin.y } };
    }
    const full = covered.find(bin => (bin.fill ?? 0) >= BIN_CAPACITY);
    if (full) {
      if (!full.overflowed) this.ledger.overflowingBins++;
      full.overflowed = true;
      return { status: 'overflow', bin: { x: full.x, y: full.y } };
    }
    return null;
  }

  speedMultiplierAt(tile: Cell): number {
    let multiplier = 1;
    for (const placed of this.placements) {
      if (placed.id !== 'limit' || manhattanDistance(placed, tile) > EFFECT_RADIUS) continue;
      multiplier = Math.min(multiplier, modelEffects(placed.id,
        normalizedCare(placed.care),modelCondition(placed.condition)).speedMultiplier);
    }
    return Math.min(multiplier, this.environment.slowdownAt(tile),
      this.activities.slowdownAt(tile), this.accidents.slowAt(tile));
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
  /** Inspect placement projections without committing a purchase (Shift+click). */
  inspectTile(cell: Cell): void {
    this.selected = cell;
    this.notify();
  }
  /** Explicitly dismiss the clicked-square inspector without cancelling a model kit. */
  dismissTile(): void {
    if (!this.selected) return;
    this.selected = null;
    this.hovered = null;
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
        effect.cell.x === cell.x && effect.cell.y === cell.y)
      && !this.activities.isOccupied(cell);
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
    this.ledger.miniaturePurchases += model.cost;
    this.placements.push({ ...cell, id, care: 'full', condition: 'intact',
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
    const activity = this.activities.modifiersAt(cell);
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
      beauty: 1 + environmental.beauty + activity.beauty - 2 * overflowing + nearby.reduce((total, item) =>
        total + modelEffects(item.id, normalizedCare(item.care),
          modelCondition(item.condition)).beauty, 0),
      noise: (isRoad(cell.x, cell.y) ? 2 : 0) + environmental.noise + activity.noise
        + Math.min(3, this.traffic.queuedNear(cell))
        + nearby.reduce((total, item) =>
          total + modelEffects(item.id, normalizedCare(item.care),
            modelCondition(item.condition)).noise, 0),
      crime: Math.max(0, 2 + overflowing + nearby.reduce((total, item) =>
        total + modelEffects(item.id, normalizedCare(item.care),
          modelCondition(item.condition)).crime, 0)),
      roadSafety: Math.round(clamp(90 -
        this.environment.at(cell).filter(effect => effect.kind === 'skid').length * 12 -
        this.accidents.atRoad(cell).length * 7 -
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

  passTile(id: number, tile: Cell, canParkForActivity = true): JourneyReaction | null {
    if (this.phase !== 'playing') return null;
    const resident = this.residents[id];
    if (!resident?.occupied) return null;
    const profile = householdProfile(id);
    let change = VINTAGE_BALANCE.ambientIrritationPerTile;
    if (tile.x === 20 && tile.y >= 5) change += VINTAGE_BALANCE.eastBendIrritation;
    if (tile.x <= 3 && tile.y >= 7) change += VINTAGE_BALANCE.westBendIrritation;

    let encountered: PlacedModel | null = null;
    let strongestReaction = 0;
    for (const placed of this.placements) {
      if (manhattanDistance(placed, tile) > EFFECT_RADIUS) continue;
      const impact = modelReactionPerTile(id, placed.id, normalizedCare(placed.care),
        modelCondition(placed.condition));
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
    change += this.activities.modifiersAt(tile).irritation;
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
        resident.nextEventOffset = this.behaviour.opportunityOffset(ROAD_CELLS.length, id);
        const action = this.behaviour.choose(id, resident.irritation,
          tile, this.clockSeconds, this.placements,
          canParkForActivity && !this.traffic.shouldStop(id));
        if (action) {
          const success = this.performHouseholdAction(id, action, tile, true,
            canParkForActivity && !this.traffic.shouldStop(id));
          if (!success && action.mechanic === 'activity') {
            // A full verge should not turn a picnic into invisible litter.
            const alternative = householdActionPair(id)[action.tone];
            if (alternative.id !== 'litter')
              this.performHouseholdAction(id, alternative, tile, false, false);
          }
        }
      }
    }
    let reaction: JourneyReaction | null = null;
    if (encountered && Math.abs(strongestReaction) >= 0.15) {
      const text = profile.remarks[encountered.id];
      resident.lastRemark = text;
      reaction = { residentId: id, text, calmer: strongestReaction < 0 };
    }
    if (resident.irritation >= VINTAGE_BALANCE.firstWarningIrritation && !resident.unsettled) {
      resident.unsettled = true;
      if (!reaction) resident.lastRemark = profile.warning;
      this.publishNotice(resident.name + ' seem unsettled on their journeys.', 1);
      this.notify();
    }
    if (resident.irritation >= VINTAGE_BALANCE.secondWarningIrritation && !resident.warned) {
      resident.warned = true;
      resident.lastRemark = profile.warning;
      this.publishNotice(resident.name + ' are close to leaving. Listen to what troubles them.', 2);
      reaction = { residentId: id, text: profile.warning, calmer: false };
      this.notify();
    }
    if (resident.irritation >= 100) {
      resident.occupied = false;
      this.activities.cancelResident(id);
      resident.lastRemark = 'The house is quiet now.';
      this.publishNotice(resident.name + ' have moved away. Their home has closed.', 2);
      if (this.closedHomes >= 3) this.endRun(false);
      this.notify();
      return null;
    }

    this.statusTick++;
    if (reaction || this.statusTick % 14 === 0) this.notify();
    return reaction;
  }

  /** One genuinely damaged miniature restored by the Hales, at most one
   * condition step per action; a broken miniature needs two helping visits. */
  private haleRestoreOne(road: Cell): {model: PlacedModel; before: ModelCondition} | null {
    const model=this.placements.filter(placed =>
      modelCondition(placed.condition)!=='intact' &&
      manhattanDistance(placed,road)<=2)
      .sort((a,b)=>manhattanDistance(a,road)-manhattanDistance(b,road) ||
        a.x-b.x||a.y-b.y)[0];
    if(!model)return null;
    const before=modelCondition(model.condition);
    model.condition=before==='broken'?'damaged':'intact';
    this.ledger.haleRestorations=(this.ledger.haleRestorations??0)+1;
    return {model,before};
  }

  /**
   * Activities replace, never supplement, a family's one event opportunity
   * this circuit. Developer-forced legacy actions remain instantaneous, but
   * natural Miller packaging must follow a visible roadside delivery.
   */
  private performHouseholdAction(
    residentId: number, action: HouseholdAction, road: Cell,
    naturally = false, canParkForActivity = true
  ): boolean {
    const resident = this.residents[residentId];
    if (!resident?.occupied || !isRoad(road.x, road.y) || this.phase !== 'playing') return false;
    let message = action.message;
    let effectCell = road;
    const activityKind = action.mechanic === 'activity' ? action.activityKind :
      (naturally && action.id === 'litter' ? 'delivery' : undefined);
    if (activityKind && !canParkForActivity) return false;
    if (activityKind) {
      const hurry = naturally && action.id === 'litter' ? .78 : undefined;
      const blocked = [...this.placements, ...this.environment.effects.map(effect => effect.cell)];
      const activity = this.activities.start(activityKind, residentId, road,
        this.clockSeconds, blocked, this.placements, hurry);
      if (!activity) return false;
      message = activityDefinition(activityKind).started;
      effectCell = activity.cell;
    } else if (action.mechanic === 'activity') {
      return false;
    } else if (action.mechanic === 'stop') {
      // Another driver could already be stopped; unsuccessful actions do not
      // create duplicate pop-ups or generate more income.
      const stop = this.traffic.requestStop(residentId, road, this.clockSeconds);
      if (!stop) return false;
      message = stop.message;
    } else {
      const kind = action.environmentKind;
      if (!kind) return false;
      const haleRepair = action.id === 'restore' ? this.haleRestoreOne(road) : null;
      if (haleRepair) {
        message = 'The Hales restored ' + this.getModel(haleRepair.model.id).name +
          ' from ' + haleRepair.before + ' to ' + haleRepair.model.condition + '.';
        effectCell = {x:haleRepair.model.x,y:haleRepair.model.y};
      } else {
      const occupiedVerge = [...this.placements,
        ...this.activities.active.map(activity => activity.cell)];
      const event = this.environment.force(kind, residentId, road,
        this.clockSeconds, occupiedVerge, tile => this.interceptLitter(tile));
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
        } else if (action.id === 'guide') {
          // Wards shorten a genuine collision-zone disruption, but cannot
          // magically fix the damaged miniature itself.
          const assisted = this.accidents.wardAssistance(road,this.clockSeconds);
          if (assisted) {
            this.ledger.wardAssists=(this.ledger.wardAssists??0)+1;
            message += ' The damaged corner was cleared sooner.';
          }
          const helped = this.traffic.activeStop?.residentId !== residentId &&
            this.traffic.shortenStop(this.clockSeconds, 3);
          if (helped) message += ' The queue began to clear sooner.';
        }
        event.message = message;
      }
      this.lastEnvironmentEvent = event;
      }
    }
    // The chosen activity's eventual cleanup, litter and bin interception are
    // resolved when its packing-away phase finishes, not before setup begins.
    this.behaviour.mark(residentId,this.clockSeconds);
    this.ledger[action.tone === 'helpful' ? 'helpfulActions' : 'troublesomeActions']++;
    this.ledger.maximumEnvironmentalEffects = Math.max(
      this.ledger.maximumEnvironmentalEffects, this.environment.effects.length
    );
    resident.lastRemark = action.afterRemark;
    const report: BehaviourReport = {
      sequence:this.nextBehaviourSequence++,
      residentId,action:action.id,tone:action.tone,cell:{...effectCell},
      time:this.clockSeconds,message
    };
    this.latestBehaviourReport = report;
    this.behaviourHistory.unshift(report);
    if(this.behaviourHistory.length>BEHAVIOUR_MAX_HISTORY)
      this.behaviourHistory.length=BEHAVIOUR_MAX_HISTORY;
    this.publishNotice(message, action.tone === 'troublesome' ? 2 : 1);
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
    return action?this.performHouseholdAction(residentId,action,road):false;
  }

  /** Dev-only entry point for exact, repeatable activity stages. */
  debugActivity(kind: ActivityKind, road: Cell): boolean {
    if(this.phase !== 'playing' || this.paused || this.workshopOpen) return false;
    const definition = activityDefinition(kind);
    const resident = this.residents[definition.residentId];
    if (!resident?.occupied) return false;
    const blocked = [...this.placements, ...this.environment.effects.map(effect => effect.cell)];
    const activity = this.activities.start(kind, resident.id, road,
      this.clockSeconds, blocked, this.placements);
    if (!activity) return false;
    this.publishNotice(definition.started, 1);
    this.notify();
    return true;
  }

  private finishActivity({ activity, leavesLitter }: ActivityCompletion): void {
    const resident = this.residents[activity.residentId];
    if (!resident?.occupied) return;
    const definition = activityDefinition(activity.kind);
    // Visits are genuinely useful when damage or a real traffic hazard exists,
    // without inventing a second random action or extra currency.
    const haleRepair=activity.kind==='heritage-visit'
      ? this.haleRestoreOne(activity.roadCell) : null;
    const wardHelp=activity.kind==='safety-round'
      ? this.accidents.wardAssistance(activity.roadCell,this.clockSeconds) : null;
    const effect = haleRepair ? undefined :
      leavesLitter ? 'litter' : definition.cleanEffect;
    const event = effect ? this.environment.force(effect, activity.residentId,
      activity.roadCell, this.clockSeconds, this.placements,
      tile => this.interceptLitter(tile), activity.cell) : null;
    let outcome: ActivityOutcome = leavesLitter ? 'none' : 'clean';
    let message = haleRepair
      ? 'The Hales repaired ' + this.getModel(haleRepair.model.id).name +
        ' from ' + haleRepair.before + ' to ' + haleRepair.model.condition + '.'
      : definition.finished;
    if (wardHelp) {
      this.ledger.wardAssists=(this.ledger.wardAssists??0)+1;
      message += ' The accident site was made safer sooner.';
    }
    if (effect && !event) {
      // A full environment sprite cap cannot create a ghost piece of litter
      // or pretend a new roadside improvement has appeared.
      outcome = 'none';
      message = resident.name + ' have finished and packed everything away.';
    }
    if (leavesLitter && event) {
      outcome = event.outcome === 'captured' ? 'captured' :
        event.outcome === 'overflow' ? 'overflow' : 'litter';
      message = outcome === 'captured'
        ? resident.name + ' packed up and put the scraps in a nearby bin.'
        : outcome === 'overflow'
          ? resident.name + ' packed up, but the full bin overflowed.'
          : resident.name + ' left some scraps behind after ' +
            (activity.kind === 'picnic' ? 'the picnic.' :
              activity.kind === 'working-lunch' ? 'lunch.' :
                activity.kind === 'gathering' ? 'the gathering.' : 'the delivery.');
    }
    if (event) {
      event.message = message;
      this.lastEnvironmentEvent = event;
    }
    this.activities.recordCompletion(activity, this.clockSeconds, outcome, message);
    resident.lastRemark = leavesLitter && outcome === 'litter'
      ? 'We ought to have taken that with us.' : definition.finished;
    this.ledger.maximumEnvironmentalEffects = Math.max(
      this.ledger.maximumEnvironmentalEffects, this.environment.effects.length);
    this.publishNotice(message, outcome === 'litter' || outcome === 'overflow' ? 2 : 1);
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
      this.ledger.secondsLostInTraffic += item.delaySeconds;
      const helpfulNearby = this.environment.at(item.cell).some(effect =>
        effect.kind === 'guidance' || effect.kind === 'courtesy');
      resident.irritation = clamp(resident.irritation +
        item.delaySeconds * resident.temperament * (helpfulNearby ?
          VINTAGE_BALANCE.queueIrritationWithHelp :
          VINTAGE_BALANCE.queueIrritationPerLostSecond),
        0, 100);
    }
    this.ledger.largestQueue = Math.max(this.ledger.largestQueue, queued.length);
    if (changed) {
      if (this.traffic.queuedCars.length >= 2 && prior < 2 &&
        this.clockSeconds - this.lastCongestionNoticeAt >=
          VINTAGE_BALANCE.queueNoticeCooldownSeconds) {
        this.publishNotice(this.traffic.queuedCars.length +
          ' cars have queued behind slower traffic. Circuits are taking longer.', 1);
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
    this.publishNotice(incident.message, 2);
    this.notify();
    return true;
  }

  private recordEnvironmentEvent(event: EnvironmentalEvent): void {
    this.lastEnvironmentEvent = event;
    this.ledger.maximumEnvironmentalEffects = Math.max(
      this.ledger.maximumEnvironmentalEffects, this.environment.effects.length
    );
    this.publishNotice(event.message, 1);
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
    this.publishNotice(resident.name + ' completed a circuit: +' + earned + ' coins.');
    this.progress = clamp(this.progress + (resident.irritation < 65 ? 3.0 : 1.7), 0, 100);
    const milestone = Math.min(3, Math.floor(this.progress / 25));
    if (milestone > this.reachedMilestone) {
      for (let step = this.reachedMilestone + 1; step <= milestone; step++) {
        const moment = chooseWorkshopMoment({
          milestone: step as 1 | 2 | 3, ledger: this.ledger,
          models: this.placements.map(item => item.id),
          closedHomes: this.closedHomes, coins: this.money
        });
        this.workbenchMoments.push(moment);
        this.workbenchLine = moment.line;
      }
      this.reachedMilestone = milestone;
    }
    if (this.progress >= 100) this.endRun(true);
    this.notify();
    return earned;
  }

  endRun(won: boolean): void {
    if (this.phase !== 'playing') return;
    this.phase = won ? 'complete' : 'lost';
    // A finished chapter should not leave a frozen family picnic on screen.
    this.activities.cancelAll();
    this.accidents.clearActive();
    this.neighbours.clearPending();
    this.closingLine = chooseClosingMoment(won, this.ledger, this.closedHomes);
    const reward = won ? 20 + this.occupiedHomes * 2 : 5 + Math.floor(this.progress / 20);
    this.legacy.blueprints += reward;
    this.save();
    this.publishNotice(won ? 'Vintage chapter complete. The family has new stories to tell.' :
      'The town has fallen quiet. The family keeps what they learned.', 2);
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
