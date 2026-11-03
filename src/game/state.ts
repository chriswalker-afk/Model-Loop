import { adjacentToRoad, EFFECT_RADIUS, HOMES, isOnBoard, isRoad, isScenery, manhattanDistance, MODELS, ROAD_CELLS, SCENERY_CELLS, setActiveScenery, type Cell, type ModelId } from './config';
import { householdProfile, modelReactionPerTile } from './households';
import { foundingNeighbourHints, forecastNeighbourhoodPlacement, neighbourhoodSummary,
  type FoundingNeighbourHint, type NeighbourhoodPlacementForecast,
  type NeighbourhoodSummary, type NeighbourhoodForecastLine } from './founding';
import {
  homeGroundsAt, homeGroundsEffects, homeImprovementAt,
  homeImprovementDefinition, homeImprovementUpkeep, isHomeImprovementKind,
  type HomeImprovement, type HomeImprovementKind, type HomeImprovementSlot,
  type HomeGroundsEffects
} from './homeImprovements';
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
import { NeighbourhoodStories } from './neighbours';
import { moodLitterChance } from './mood';
import {
  planGardenDetails, civicStageAt, eligibleCivicSites,
  type GardenDetail
} from './livingScenery';
import type { RoadLane } from './traffic';

export type Phase = 'founding' | 'playing' | 'complete' | 'lost';
export type HomeSite = Cell & Pick<(typeof HOMES)[number], 'id' | 'name' | 'color' | 'temperament'>;
export interface FoundingPlotPreview {
  allowed:boolean;
  reason:string;
  neighbours:FoundingNeighbourHint[];
  /** Null for invalid plots. Uses the exact same scoring as the live circuit. */
  relationshipForecast:NeighbourhoodPlacementForecast | null;
}
export interface FoundingArrival { id:number; cell:Cell; revision:number; moved:boolean; }
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
export interface HomeImprovementPreview {
  residentId:number;
  kind:HomeImprovementKind;
  slot:HomeImprovementSlot;
  cost:number;
  existing:HomeImprovement|null;
  allowed:boolean;
  reason:string;
  upkeepBefore:number;
  upkeepAfter:number;
  effectsBefore:HomeGroundsEffects;
  effectsAfter:HomeGroundsEffects;
  /** Live capped irritation per circuit for every affected occupied family. */
  affected:NeighbourhoodForecastLine[];
}
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
  /** Separate from ordinary per-tile car reactions; added to per-circuit
   * neighbour comfort only when the model meaningfully affects a family pair. */
  neighbourEffects: NeighbourhoodForecastLine[];
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
  phase: Phase = 'founding';
  // Homes belong to this particular run. HOMES holds immutable identities,
  // artwork and temperaments; its historical coordinates are test fixtures only.
  homeSites: Array<Cell | null> = Array.from({length: HOMES.length}, () => null);
  /** Actual visible civic pieces, not invisible future reservations. */
  scenerySites: Cell[] = [];
  private plannedCivicSites:Cell[] = [];
  civicStage = 0;
  foundingFamily: number | null = null;
  foundingIntroId: number | null = null;
  foundingReviewOpen = false;
  foundingRecentArrival: FoundingArrival | null = null;
  private introducedFamilies = new Set<number>();
  private foundingArrivalRevision = 0;
  money = 0;
  progress = 0;
  gameSpeed: 1 | 2 = 1;
  paused = false;
  activeModel: ModelId | null = null;
  selected: Cell | null = null;
  hovered: Cell | null = null;
  placements: PlacedModel[] = [];
  /** Exactly one boundary and one garden per household; never a pair object. */
  homeImprovements: HomeImprovement[] = [];
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
    const modelUpkeep = this.placements.reduce((total, item) =>
      total + modelEffects(item.id, normalizedCare(item.care),
        modelCondition(item.condition)).upkeep, 0);
    const activeHomeFeatures=this.homeImprovements.filter(item=>
      this.residents[item.residentId]?.occupied);
    const homeUpkeep=activeHomeFeatures.reduce((total,item)=>
      total+homeImprovementDefinition(item.kind).upkeep,0);
    return summarizeFlow(this.cashflowEvents, this.clockSeconds,
      modelUpkeep+homeUpkeep,this.placements.length+activeHomeFeatures.length);
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
    // Home features use the same 20-second service interval and ledger as
    // workshop models. A vacant home neither pays nor grants social comfort.
    for(const item of this.homeImprovements){
      if(!this.residents[item.residentId]?.occupied)continue;
      while(item.nextBillAt<=this.clockSeconds){
        const price=homeImprovementDefinition(item.kind).upkeep;
        if(price>0){
          this.money-=price;
          billed+=price;
          this.recordCashflow(-price,'upkeep',item.nextBillAt);
        }
        item.nextBillAt+=UPKEEP_INTERVAL_SECONDS;
      }
    }
    this.cashflowEvents = this.cashflowEvents.filter(
      entry => entry.at > this.clockSeconds - FLOW_WINDOW_SECONDS);
    if (environmentChanged || trafficCleared || activityTick.changed ||
        accidentChanged || neighbourExpired) this.notify();
    if (billed > 0) {
      this.publishNotice('Town care bill: −' + billed + ' coins. ' +
        (this.money < 0 ? 'The town is in debt until more cars finish their circuits.' :
          'Workshop models and household grounds both need regular upkeep.'),
        this.money < 0 ? 2 : 0);
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

  // The opt-in reference layout preserves historical deterministic simulations.
  // Normal runs always begin with a bare road and an unplaced roster.
  constructor(private readonly referenceLayoutFixture = false) { this.newRun(); }

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
    this.phase = 'founding';
    this.homeSites = HOMES.map(() => null);
    this.scenerySites = [];
    this.plannedCivicSites = [];
    this.civicStage = 0;
    setActiveScenery([]);
    this.foundingFamily = null;
    this.foundingIntroId = null;
    this.foundingReviewOpen = false;
    this.foundingRecentArrival = null;
    this.foundingArrivalRevision = 0;
    this.introducedFamilies.clear();
    this.money = 145 + this.legacy.upgrades.savings * 35;
    this.progress = 0;
    this.gameSpeed = 1;
    this.paused = false;
    this.activeModel = null;
    this.selected = null;
    this.hovered = null;
    this.placements = [];
    this.homeImprovements = [];
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
    this.notice = '1908 — A road awaits six families. Choose the first household to settle.';
    if (this.referenceLayoutFixture) this.foundFromReferenceLayout();
    this.notify();
  }

  /**
   * Pure display state: no garden decoration enters placements, scenerySites,
   * the traffic simulation, ledger, safety or even the tile occupancy rules.
   * Recalculate rather than mutate, so models and activity props automatically
   * take precedence over foliage without charging the player.
   */
  get gardenDetails():GardenDetail[] {
    // Pass C will integrate paid grounds into the home art. These existing
    // tiny founding props remain purely cosmetic and reserve no plot cells.
    return planGardenDetails({
      homes:this.placedHomes,
      modelCells:this.placements,
      civicCells:SCENERY_CELLS,
      activityCells:this.activities.active.map(activity=>activity.cell),
      effectCells:this.environment.effects.map(effect=>effect.cell)
    });
  }

  get foundingCount(): number { return this.homeSites.filter(Boolean).length; }
  get placedHomes(): Array<HomeSite> {
    return HOMES.flatMap(home => {
      const site = this.homeSites[home.id];
      return site ? [{ ...home, ...site }] : [];
    });
  }
  homeFor(id: number): (HomeSite) | null {
    const template = HOMES[id], site = this.homeSites[id];
    return template && site ? { ...template, ...site } : null;
  }
  homeAt(cell: Cell): (HomeSite) | null {
    return this.placedHomes.find(home => home.x === cell.x && home.y === cell.y) ?? null;
  }
  /** Household comfort belongs to the selected run, not static HOME sites.
   * Empty homes are visible, but families who moved away no longer contribute
   * positive or negative social effects to other families' circuits.
   */
  neighbourhoodFor(residentId:number):NeighbourhoodSummary {
    const living=this.placedHomes.filter(home=>this.residents[home.id]?.occupied);
    return neighbourhoodSummary(residentId,living,this.homeImprovements,this.placements);
  }

  /** Per-house home care model; a new run has no purchased features. */
  getHomeImprovement(residentId:number,slot:HomeImprovementSlot):HomeImprovement|null {
    return homeImprovementAt(residentId,slot,this.homeImprovements);
  }
  homeUpkeepFor(residentId:number):number {
    return this.residents[residentId]?.occupied
      ? homeImprovementUpkeep(residentId,this.homeImprovements):0;
  }
  /** One source of truth for price, scheduled care, directional relationships
   * and before/after garden effects. All values are calculated without writes.
   */
  previewHomeImprovement(
    residentId:number,kind:HomeImprovementKind
  ):HomeImprovementPreview {
    const validId=Number.isInteger(residentId)&&!!HOMES[residentId];
    const validKind=isHomeImprovementKind(kind);
    const definition=validKind?homeImprovementDefinition(kind):null;
    const slot=definition?.slot??'boundary';
    const existing=validId?this.getHomeImprovement(residentId,slot):null;
    const cost=definition?.cost??0;
    const before=validId?homeGroundsEffects(residentId,this.homeImprovements):
      {beauty:0,noise:0,crime:0,roadSafety:0,comfortPerLap:0};
    const living=this.placedHomes.filter(home=>this.residents[home.id]?.occupied);
    let reason='Ready to improve this home.';
    if(this.phase!=='playing'||!validId||!validKind||!this.homeFor(residentId))
      reason='Choose a settled home and an available improvement.';
    else if(!this.residents[residentId]?.occupied)
      reason='This family has moved away; the house is currently empty.';
    else if(this.paused||this.workshopOpen)
      reason='Resume the town and close the workshop before purchasing.';
    else if(existing?.kind===kind)
      reason='This improvement is already installed at this home.';
    else if(this.money<cost)
      reason='Not enough coins for this improvement.';
    const allowed=reason==='Ready to improve this home.';
    const proposed=validId&&validKind
      ? [...this.homeImprovements.filter(item=>item.residentId!==residentId||
          item.slot!==slot),{residentId,slot,kind,
          nextBillAt:this.clockSeconds+UPKEEP_INTERVAL_SECONDS}]
      : this.homeImprovements;
    const affected=validId&&validKind?living.map(home=>{
      const previousPerLap=neighbourhoodSummary(home.id,living,
        this.homeImprovements,this.placements).irritationPerLap;
      const predictedPerLap=neighbourhoodSummary(home.id,living,
        proposed,this.placements).irritationPerLap;
      return {residentId:home.id,name:home.name,previousPerLap,predictedPerLap,
        changePerLap:Math.round((predictedPerLap-previousPerLap)*100)/100};
    }).filter(row=>row.residentId===residentId||Math.abs(row.changePerLap)>=.005):[];
    return {residentId,kind,slot,cost,existing,allowed,reason,
      upkeepBefore:validId?this.homeUpkeepFor(residentId):0,
      upkeepAfter:validId?homeImprovementUpkeep(residentId,proposed):0,
      effectsBefore:before,
      effectsAfter:validId?homeGroundsEffects(residentId,proposed):before,
      affected};
  }
  /** Full-price replacement. Every purchase begins its own next care cycle.
   * No invisible grid tile is occupied by installing property improvements.
   */
  installHomeImprovement(residentId:number,kind:HomeImprovementKind):boolean {
    const preview=this.previewHomeImprovement(residentId,kind);
    if(!preview.allowed)return false;
    this.money-=preview.cost;
    this.ledger.miniaturePurchases+=preview.cost;
    this.homeImprovements=this.homeImprovements.filter(item=>
      item.residentId!==residentId||item.slot!==preview.slot);
    this.homeImprovements.push({residentId,slot:preview.slot,kind,
      nextBillAt:this.clockSeconds+UPKEEP_INTERVAL_SECONDS});
    this.publishNotice(homeImprovementDefinition(kind).name+' added to '+
      this.residents[residentId].name+' home. Care costs '+
      homeImprovementDefinition(kind).upkeep+' coins every '+
      UPKEEP_INTERVAL_SECONDS+' seconds.',1);
    this.notify();
    return true;
  }
  /** Removing a feature cancels its future care, but never refunds purchases.
   * Vacant homes can have abandoned improvements removed without a new charge.
   */
  removeHomeImprovement(residentId:number,slot:HomeImprovementSlot):boolean {
    if(this.phase!=='playing'||this.paused||this.workshopOpen||
        !Number.isInteger(residentId)||!HOMES[residentId]||
        (slot!=='boundary'&&slot!=='garden'))return false;
    const existing=this.getHomeImprovement(residentId,slot);
    if(!existing)return false;
    this.homeImprovements=this.homeImprovements.filter(item=>
      item.residentId!==residentId||item.slot!==slot);
    this.publishNotice(homeImprovementDefinition(existing.kind).name+
      ' removed from '+this.residents[residentId].name+
      ' home. Previous purchases are not refunded.',1);
    this.notify();
    return true;
  }

  /** Houses need an actual adjoining road and enough space for their artwork. */
  canPlaceHome(cell: Cell, id: number | null = this.foundingFamily): boolean {
    if (this.phase !== 'founding' || id === null || !HOMES[id] ||
        !Number.isInteger(cell.x) || !Number.isInteger(cell.y) ||
        !isOnBoard(cell.x, cell.y) || isRoad(cell.x, cell.y) ||
        !adjacentToRoad(cell.x, cell.y)) return false;
    return this.placedHomes.every(home => home.id === id ||
      Math.max(Math.abs(home.x - cell.x), Math.abs(home.y - cell.y)) >= 2);
  }
  previewFoundingHome(cell: Cell, id: number | null = this.foundingFamily): FoundingPlotPreview {
    if (this.phase !== 'founding' || id === null || !HOMES[id])
      return { allowed:false, reason:'Choose a family from the tray.',
        neighbours:[],relationshipForecast:null };
    const neighbours = isOnBoard(cell.x,cell.y)
      ? foundingNeighbourHints(id,cell,this.placedHomes) : [];
    let reason = 'A valid roadside plot. Select to settle this family here.';
    if (!isOnBoard(cell.x,cell.y)) reason = 'Outside the town boundary.';
    else if (isRoad(cell.x,cell.y)) reason = 'Homes cannot stand on the road.';
    else if (!adjacentToRoad(cell.x,cell.y)) reason = 'Every home needs a plot directly beside the road.';
    else if (this.placedHomes.some(home => home.id !== id &&
      Math.max(Math.abs(home.x-cell.x),Math.abs(home.y-cell.y))<2))
      reason = 'Leave at least one clear grid square between house plots.';
    const allowed=this.canPlaceHome(cell,id);
    return { allowed,reason,neighbours:allowed?neighbours:[],
      relationshipForecast:allowed
        ? forecastNeighbourhoodPlacement(id,cell,this.placedHomes) : null };
  }
  chooseFoundingFamily(id: number | null): void {
    if (this.phase !== 'founding' ||
      (id !== null && (!Number.isInteger(id) || !HOMES[id]))) return;
    this.foundingFamily = id;
    this.foundingReviewOpen = false;
    this.foundingIntroId = id !== null && !this.introducedFamilies.has(id) ? id : null;
    if (id !== null) this.introducedFamilies.add(id);
    this.selected = null;
    this.hovered = null;
    this.notice = id === null
      ? 'Choose a family to settle beside the road.'
      : 'Find a roadside plot for ' + HOMES[id].name +
        '. Green plots are available; you can move homes until the chapter begins.';
    this.notify();
  }
  acknowledgeFoundingIntroduction(): void {
    if (this.phase !== 'founding' || this.foundingIntroId === null) return;
    this.foundingIntroId = null;
    this.notify();
  }
  openFoundingReview(): boolean {
    if (this.phase !== 'founding' || this.foundingCount !== HOMES.length) return false;
    this.foundingIntroId = null;
    this.foundingReviewOpen = true;
    this.notify();
    return true;
  }
  closeFoundingReview(): void {
    if (!this.foundingReviewOpen) return;
    this.foundingReviewOpen = false;
    this.notify();
  }
  placeFoundingHome(cell: Cell, id: number | null = this.foundingFamily): boolean {
    if (!this.canPlaceHome(cell, id)) {
      this.notice = 'Choose an empty roadside square with room around the house.';
      this.notify();
      return false;
    }
    const family = id as number;
    const moved = !!this.homeSites[family];
    this.homeSites[family] = { x: cell.x, y: cell.y };
    this.foundingRecentArrival = {
      id:family,cell:{ x:cell.x,y:cell.y },
      moved,revision:++this.foundingArrivalRevision
    };
    this.foundingFamily = null;
    this.foundingIntroId = null;
    this.foundingReviewOpen = false;
    this.selected = null;
    this.hovered = null;
    this.notice = HOMES[family].name + (moved ? ' have moved to a different plot.' :
      ' have settled into their new home.') +
      (this.foundingCount === HOMES.length
        ? ' All six homes are ready. Begin the Vintage Years when you are happy.'
        : ' Choose another household.');
    this.notify();
    return true;
  }
  /** No traffic, wages, purchases, time or incidents can start before this. */
  beginVintageYears(): boolean {
    if (this.phase !== 'founding' || this.foundingCount !== HOMES.length) return false;
    this.plannedCivicSites = SCENERY_CELLS.filter(cell => this.placedHomes.every(home =>
      Math.max(Math.abs(cell.x - home.x), Math.abs(cell.y - home.y)) >=
        (cell.x === 11 && cell.y === 6 ? 3 : 2)));
    // Landmarks now grow with the town. Nothing is invisibly blocked in
    // advance; a paid model on a future civic plot takes precedence.
    this.scenerySites = [];
    this.civicStage = 0;
    setActiveScenery([]);
    this.phase = 'playing';
    this.foundingFamily = null;
    this.foundingIntroId = null;
    this.foundingReviewOpen = false;
    this.selected = null;
    this.hovered = null;
    this.notice = 'The town is founded. The first vintage motorcars begin their journeys.';
    this.notify();
    return true;
  }
  /** Opt-in fixture for existing balance/browser tests, never the default run. */
  foundFromReferenceLayout(): void {
    if (this.phase !== 'founding') return;
    this.homeSites = HOMES.map(home => ({ x: home.x, y: home.y }));
    this.beginVintageYears();
    // Preserve the original decorative baseline for historical regression tests.
    if (this.referenceLayoutFixture) {
      this.scenerySites = SCENERY_CELLS.map(site => ({ ...site }));
      this.civicStage = 4;
      setActiveScenery(this.scenerySites);
    }
  }
  /** Four small civic growth milestones. Revealed landmarks occupy only
   * available squares and cannot displace paid kits or active activities.
   * Delayed civic pieces carry no income, beauty, safety or mood bonus.
   */
  private revealCivicGrowth():void {
    if(this.phase!=='playing'||this.referenceLayoutFixture)return;
    const nextStage=civicStageAt(this.progress);
    if(nextStage<=this.civicStage)return;
    const eligible=eligibleCivicSites(nextStage,this.plannedCivicSites,
      this.placedHomes,this.placements,[
        ...this.activities.active.map(activity=>activity.cell),
        ...this.environment.effects.map(effect=>effect.cell)
      ]);
    this.civicStage=nextStage;
    this.scenerySites=eligible;
    setActiveScenery(eligible);
    const names=[
      'The first little trees take root around the town.',
      'A park and notice board are taking shape.',
      'The fountain arrives as the town finds its rhythm.',
      'The clock hall completes the town centre.'
    ];
    if(eligible.length){
      this.publishNotice(names[nextStage-1]??'The town grows a little more.',1);
    }
  }

  get occupiedHomes(): number {
    return this.phase === 'founding'
      ? this.foundingCount : this.residents.filter(resident => resident.occupied).length;
  }
  get closedHomes(): number {
    return this.phase === 'founding' ? 0 : this.residents.length - this.occupiedHomes;
  }
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
    if (this.phase === 'founding') {
      if (this.foundingFamily !== null) {
        this.placeFoundingHome(cell);
      } else {
        const household = this.homeAt(cell);
        if (household) this.chooseFoundingFamily(household.id);
        else {
          this.selected = cell;
          this.notify();
        }
      }
      return;
    }
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
      && !this.homeAt(cell)
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
    // Paid home grounds are local environmental effects, not new build tiles.
    const grounds=homeGroundsAt(cell,
      this.placedHomes.filter(home=>this.residents[home.id]?.occupied),
      this.homeImprovements);
    let kind = isRoad(cell.x, cell.y) ? 'Road tile' : 'Grass tile';
    const home = this.homeAt(cell);
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
      beauty: 1 + environmental.beauty + activity.beauty + grounds.beauty - 2 * overflowing + nearby.reduce((total, item) =>
        total + modelEffects(item.id, normalizedCare(item.care),
          modelCondition(item.condition)).beauty, 0),
      noise: (isRoad(cell.x, cell.y) ? 2 : 0) + environmental.noise + activity.noise + grounds.noise
        + Math.min(3, this.traffic.queuedNear(cell))
        + nearby.reduce((total, item) =>
          total + modelEffects(item.id, normalizedCare(item.care),
            modelCondition(item.condition)).noise, 0),
      crime: Math.max(0, 2 + grounds.crime + overflowing + nearby.reduce((total, item) =>
        total + modelEffects(item.id, normalizedCare(item.care),
          modelCondition(item.condition)).crime, 0)),
      roadSafety: Math.round(clamp(90 + grounds.roadSafety -
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
    const living=this.placedHomes.filter(home=>this.residents[home.id]?.occupied);
    const neighbourEffects:NeighbourhoodForecastLine[]=canPlace
      ? living.map(home=>{
        const previousPerLap=neighbourhoodSummary(home.id,living,
          this.homeImprovements,this.placements).irritationPerLap;
        const predictedPerLap=neighbourhoodSummary(home.id,living,
          this.homeImprovements,[...this.placements,{...cell,id}]).irritationPerLap;
        return {residentId:home.id,name:home.name,previousPerLap,predictedPerLap,
          changePerLap:Math.round((predictedPerLap-previousPerLap)*100)/100};
      }).filter(effect=>Math.abs(effect.changePerLap)>=.005)
      : [];
    const averageChange = householdEffects.length
      ? householdEffects.reduce((sum, effect) => sum + effect.irritationChangePerLap, 0) / householdEffects.length
      : 0;
    return {
      cell, modelId: id, canPlace, canAfford, allowed, reason,
      before, after, affectedRoadTiles,
      affectedHouseholds: this.occupiedHomes,
      irritationChangePerLap: Math.round(averageChange * 10) / 10,
      householdEffects, behaviourEffects, neighbourEffects
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
    const home = this.homeFor(id)!;
    const startIndex = ROAD_CELLS.findIndex(road => manhattanDistance(road, home) === 1);
    const tileIndex = ROAD_CELLS.findIndex(road => road.x === tile.x && road.y === tile.y);
    let actedThisTile=false;
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
          actedThisTile=success;
          if (!success && action.mechanic === 'activity') {
            // A full verge should not turn a picnic into invisible litter.
            const alternative = householdActionPair(id)[action.tone];
            if (alternative.id !== 'litter')
              actedThisTile=this.performHouseholdAction(id, alternative, tile, false, false);
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
    // Optional linked response is checked once per real tile crossing, not
    // every frame. Passing cars, parked cars and stopped drivers are excluded.
    if (canParkForActivity && !actedThisTile && !this.paused && !this.workshopOpen &&
        !this.activities.forResident(id) && !this.traffic.shouldStop(id))
      this.respondToNeighbourhood(id,tile);
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
  private haleRestoreOne(road: Cell, target?: Cell): {model: PlacedModel; before: ModelCondition} | null {
    const model=this.placements.filter(placed =>
      modelCondition(placed.condition)!=='intact' &&
      manhattanDistance(placed,road)<=2 &&
      (!target || (placed.x===target.x && placed.y===target.y)))
      .sort((a,b)=>manhattanDistance(a,road)-manhattanDistance(b,road) ||
        a.x-b.x||a.y-b.y)[0];
    if(!model)return null;
    const before=modelCondition(model.condition);
    model.condition=before==='broken'?'damaged':'intact';
    this.ledger.haleRestorations=(this.ledger.haleRestorations??0)+1;
    return {model,before};
  }

  /**
   * A chance encounter with a *real* outstanding need, on the actor's
   * actual left-lane route. These small responses consume no coins and
   * award no circuits, Progress or additional official helpful action.
   * They have their own seed, cooldown, maximum requests and expiry.
   */
  private respondToNeighbourhood(residentId:number,road:Cell):boolean {
    const task=this.neighbours.candidate(residentId,road,this.clockSeconds,
      this.residents[residentId]?.irritation??50);
    if(!task)return false;
    const source=this.residents[task.sourceResidentId];
    let message:string|null=null;
    const model=this.getPlacedModel(task.target);
    if(task.kind==='ward-visit'){
      if(!model||modelCondition(model.condition)==='intact'){
        this.neighbours.discard(task.id);return false;
      }
      const helped=this.accidents.active.find(event=>event.id===task.incidentId);
      const assisted=helped?.wardHelped ? null :
        this.accidents.wardAssistance(road,this.clockSeconds,task.incidentId);
      if(assisted){
        this.ledger.wardAssists=(this.ledger.wardAssists??0)+1;
        message='The Wards came past the damaged '+this.getModel(model.id).name+
          ' and helped traffic through the corner.';
      }else{
        message='The Wards slowed to check the damaged '+
          this.getModel(model.id).name+' and the nearby sightline.';
      }
    }else if(task.kind==='hale-restore'){
      if(!model||modelCondition(model.condition)==='intact'){
        this.neighbours.discard(task.id);return false;
      }
      const repaired=this.haleRestoreOne(road,task.target);
      if(!repaired){this.neighbours.discard(task.id);return false;}
      message='The Hales noticed the damaged '+this.getModel(repaired.model.id).name+
        ' and restored it from '+repaired.before+' to '+repaired.model.condition+'.';
    }else if(task.kind==='marsh-clean'){
      const litter=this.environment.effects.find(effect=>
        effect.id===task.effectId && effect.kind==='litter' &&
        effect.cell.x===task.target.x&&effect.cell.y===task.target.y);
      if(!litter){this.neighbours.discard(task.id);return false;}
      if(!this.environment.removeEffect(litter.id,'litter'))return false;
      message='The Marshes collected the scraps left after a neighbour’s visit.';
    }else if(task.kind==='marsh-admire'){
      const sketch=this.environment.effects.find(effect=>
        effect.id===task.effectId&&effect.kind==='sketch');
      if(!sketch){this.neighbours.discard(task.id);return false;}
      message='The Marshes paused to admire the Bells’ sketch of the town.';
    }
    if(!message)return false;
    const note=this.neighbours.complete(task,this.clockSeconds,message);
    if(!note)return false;
    this.ledger.neighbourResponses=(this.ledger.neighbourResponses??0)+1;
    if(source?.occupied && source.id!==residentId) {
      source.irritation=clamp(source.irritation-.38,0,100);
      source.lastRemark=task.kind==='hale-restore'
        ? 'It was good of them to mend what was damaged.'
        : task.kind==='ward-visit' ? 'Someone checked that everything was safe.'
        : 'A neighbour noticed. That was thoughtful.';
    }
    const actor=this.residents[residentId];
    if(actor)actor.lastRemark=task.kind==='marsh-clean'
      ? 'A shared space deserves a little care.'
      : task.kind==='hale-restore' ? 'We should look after things worth keeping.'
      : task.kind==='ward-visit' ? 'Best to make sure everyone can get past safely.'
      : 'It is lovely when someone shares their work.';
    this.publishNotice(message,1);
    this.notify();
    return true;
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
      const baseLitter=hurry??activityDefinition(activityKind).litterChance;
      const litterChance=moodLitterChance(baseLitter,resident.irritation);
      const blocked = [...this.placements, ...this.placedHomes, ...this.environment.effects.map(effect => effect.cell)];
      const activity = this.activities.start(activityKind, residentId, road,
        this.clockSeconds, blocked, this.placements, litterChance);
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
        this.neighbours.completeMatching('hale-restore',effectCell,
          this.clockSeconds,message);
      } else {
      const occupiedVerge = [...this.placements, ...this.placedHomes,
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
          if (cleared) {
            message += ' A discarded wrapper was collected.';
            this.neighbours.completeMatching('marsh-clean',cleared.cell,
              this.clockSeconds,message);
          }
        } else if (action.id === 'guide') {
          // Wards shorten a genuine collision-zone disruption, but cannot
          // magically fix the damaged miniature itself.
          const assisted = this.accidents.wardAssistance(road,this.clockSeconds);
          if (assisted) {
            this.ledger.wardAssists=(this.ledger.wardAssists??0)+1;
            message += ' The damaged corner was cleared sooner.';
            this.neighbours.completeMatching('ward-visit',assisted.model,
              this.clockSeconds,message);
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
    const blocked = [...this.placements, ...this.placedHomes, ...this.environment.effects.map(effect => effect.cell)];
    const activity = this.activities.start(kind, resident.id, road,
      this.clockSeconds, blocked, this.placements,
      moodLitterChance(definition.litterChance,resident.irritation));
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
      activity.roadCell, this.clockSeconds, [...this.placements, ...this.placedHomes],
      tile => this.interceptLitter(tile), activity.cell) : null;
    let outcome: ActivityOutcome = leavesLitter ? 'none' : 'clean';
    let message = haleRepair
      ? 'The Hales repaired ' + this.getModel(haleRepair.model.id).name +
        ' from ' + haleRepair.before + ' to ' + haleRepair.model.condition + '.'
      : definition.finished;
    if (wardHelp) {
      this.ledger.wardAssists=(this.ledger.wardAssists??0)+1;
      message += ' The accident site was made safer sooner.';
      this.neighbours.completeMatching('ward-visit',wardHelp.model,
        this.clockSeconds,message);
    }
    if (haleRepair)
      this.neighbours.completeMatching('hale-restore',haleRepair.model,
        this.clockSeconds,message);
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
      const actualEffect=this.environment.effects.find(effect=>effect.id===event.effectId);
      if(event.kind==='litter' && actualEffect && event.outcome!=='captured'){
        const story=this.neighbours.begin('litter',activity.residentId,
          actualEffect.cell,this.clockSeconds,
          resident.name+' left some food or packaging scraps after a roadside visit.');
        this.neighbours.request(story,'marsh-clean',activity.residentId,
          activity.roadCell,actualEffect.cell,this.clockSeconds,
          {effectId:actualEffect.id});
      }else if(event.kind==='sketch' && actualEffect) {
        const story=this.neighbours.begin('sketch',activity.residentId,
          actualEffect.cell,this.clockSeconds,
          'The Bells left a little streetside sketch for the neighbourhood.');
        this.neighbours.request(story,'marsh-admire',activity.residentId,
          activity.roadCell,actualEffect.cell,this.clockSeconds,
          {effectId:actualEffect.id});
      }
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

  /**
   * A zero-gap road deadlock has no valid traffic-solver movement. The traffic
   * marshal can guide a single family back to its driveway to make space.
   * This does not award a circuit, change coins or bypass ordinary road entry.
   */
  reportTrafficRecovery(residentId:number):void {
    if(this.phase!=='playing'||!this.residents[residentId]?.occupied)return;
    this.publishNotice('A traffic marshal helped '+this.residents[residentId].name+
      ' return safely to their driveway. The road can move again.',2);
    this.notify();
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
      [...this.placements, ...this.placedHomes], road => this.interceptLitter(road));
    if (!event) return false;
    this.recordEnvironmentEvent(event);
    return true;
  }

  finishLap(id: number): number {
    if (this.phase !== 'playing' || this.paused || this.workshopOpen) return 0;
    const resident = this.residents[id];
    if (!resident?.occupied) return 0;
    // Apply once per REAL completed circuit, never on a paused frame, a
    // ceremonial arrival or a road tile. A distance-four warm neighbour has
    // exactly the same effect in the forecast and here.
    const social=this.neighbourhoodFor(id);
    resident.irritation=clamp(resident.irritation+social.irritationPerLap,0,100);
    resident.laps += 1;
    // Their first completed circuit is a grounded opportunity to notice the
    // neighbours. No invented random friendship bonus or extra HUD meter.
    if (resident.laps===1 && social.neighbours.length) {
      const notable=social.neighbours.filter(n=>n.irritationPerLap!==0)
        .sort((a,b)=>Math.abs(b.irritationPerLap)-Math.abs(a.irritationPerLap))[0];
      if(notable) {
        resident.lastRemark=notable.irritationPerLap<0
          ? 'It is lovely having '+notable.name+' so close.'
          : 'We would feel calmer with a little distance from '+notable.name+'.';
        this.publishNotice(resident.name+
          (notable.irritationPerLap<0
            ? ' appreciate living near ' : ' are uneasy living near ')+
          notable.name+'.',1);
      }
    }
    if (resident.irritation >= VINTAGE_BALANCE.firstWarningIrritation && !resident.unsettled) {
      resident.unsettled=true;
      this.publishNotice(resident.name+' seem unsettled on their journeys.',1);
    }
    if (resident.irritation >= VINTAGE_BALANCE.secondWarningIrritation && !resident.warned) {
      resident.warned=true;
      resident.lastRemark=householdProfile(id).warning;
      this.publishNotice(resident.name+' are close to leaving. Listen to what troubles them.',2);
    }
    if (resident.irritation>=100) {
      resident.occupied=false;
      this.activities.cancelResident(id);
      resident.lastRemark='The house is quiet now.';
      this.publishNotice(resident.name+' have moved away. Their home has closed.',2);
      if (this.closedHomes>=3) this.endRun(false);
      this.notify();
      return 0;
    }
    const earned = resident.irritation < 65 ? 15 : 8;
    this.money += earned;
    this.recordCashflow(earned, 'lap');
    this.publishNotice(resident.name + ' completed a circuit: +' + earned + ' coins.');
    this.progress = clamp(this.progress + (resident.irritation < 65 ? 3.0 : 1.7), 0, 100);
    this.revealCivicGrowth();
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
    if (this.phase === 'playing' || this.phase === 'founding') return false;
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
    if (this.phase !== 'playing') return;
    this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
    this.notify();
  }
  toggleWorkshop(): void {
    if (this.phase === 'founding') return;
    this.workshopOpen = !this.workshopOpen;
    this.notify();
  }

  private save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.legacy)); } catch { /* storage disabled */ }
  }
}

// Historical automated tests may opt into the old six-home benchmark. This
// switch is unavailable on production GitHub Pages.
export const store = new GameStore(
  typeof window !== 'undefined' && import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has('referenceTown')
);
