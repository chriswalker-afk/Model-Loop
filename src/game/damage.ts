import {
  HOMES, ROAD_CELLS, isRoad, manhattanDistance, type Cell, type ModelId
} from './config';
import { SeededRandom } from './environment';
import { modelCondition, type ModelCondition } from './economy';

export type ImpactSeverity = 'damage' | 'break';
export interface VulnerableModel extends Cell {
  id: ModelId;
  condition?: ModelCondition;
}
export interface RoadsideIncident {
  id: number;
  residentId: number;
  road: Cell;
  model: Cell;
  modelId: ModelId;
  before: ModelCondition;
  after: ModelCondition;
  speed: number;
  severity: ImpactSeverity;
  startedAt: number;
  endsAt: number;
  wardHelped: boolean;
}
export const MAX_ACTIVE_ROADSIDE_INCIDENTS = 2;
export const MAX_ROADSIDE_INCIDENT_HISTORY = 12;
export const ACCIDENT_GLOBAL_COOLDOWN = 34;
export const ACCIDENT_DRIVER_COOLDOWN = 72;
export const ACCIDENT_MODEL_COOLDOWN = 85;
export const ACCIDENT_SCENE_SECONDS = 16;

/** A genuine contact with a purchased model requires one tile of separation
 * and the car-facing LEFT verge, never a distant or opposite-side prop. */
export function leftVergeContact(road: Cell, model: Cell): boolean {
  if (!isRoad(road.x, road.y) || manhattanDistance(road, model) !== 1) return false;
  const index = ROAD_CELLS.findIndex(cell => cell.x === road.x && cell.y === road.y);
  if (index < 0) return false;
  const next = ROAD_CELLS[(index + 1) % ROAD_CELLS.length];
  const dx = next.x - road.x, dy = next.y - road.y;
  const left = dy * (model.x - road.x) - dx * (model.y - road.y);
  return left > 0;
}
export interface RoadsideRisk {
  speed: number;
  bend: boolean;
  obscured: boolean;
  protected: boolean;
}
export function roadsideImpactChance(residentId: number, context: RoadsideRisk): number {
  if (context.speed < 48) return 0;
  const pace = Math.min(1.4, Math.max(0, (context.speed - 45) / 56));
  // Adventurousness increases risk, not an exemption from collision rules.
  const temperament = [1.55, .76, 1.23, .94, .70, .39][residentId] ?? 0;
  const geometry = context.bend ? 2.1 : .45;
  const sight = context.obscured ? 1.55 : 1;
  const precautions = context.protected ? .48 : 1;
  return Math.min(.012, .0018 * pace * temperament * geometry * sight * precautions);
}
const keyOf = (cell: Cell) => cell.x + ',' + cell.y;
export class RoadsideAccidentEngine {
  readonly rng: SeededRandom;
  readonly active: RoadsideIncident[] = [];
  readonly history: RoadsideIncident[] = [];
  latest: RoadsideIncident | null = null;
  revision = 0;
  private nextId = 1;
  private lastGlobal = -Infinity;
  private lastDriver = new Map<number,number>();
  private lastModel = new Map<string,number>();

  constructor(seed: number) {
    this.rng = new SeededRandom((seed ^ 0x41434349) >>> 0);
  }
  private eligible(
    residentId: number, road: Cell, models: readonly VulnerableModel[], now: number
  ): VulnerableModel[] {
    if (!Number.isFinite(now) || !HOMES.some(home => home.id === residentId) ||
      now - this.lastGlobal < ACCIDENT_GLOBAL_COOLDOWN ||
      now - (this.lastDriver.get(residentId) ?? -Infinity) < ACCIDENT_DRIVER_COOLDOWN ||
      this.active.length >= MAX_ACTIVE_ROADSIDE_INCIDENTS) return [];
    return models.filter(model =>
      modelCondition(model.condition) !== 'broken' &&
      leftVergeContact(road, model) &&
      now - (this.lastModel.get(keyOf(model)) ?? -Infinity) >= ACCIDENT_MODEL_COOLDOWN &&
      !this.active.some(incident => keyOf(incident.model) === keyOf(model))
    ).sort((a,b)=>a.x-b.x||a.y-b.y||a.id.localeCompare(b.id));
  }
  /** Called only for actual, unobstructed, left-lane driving tile crossings. */
  consider(
    residentId: number, road: Cell, models: readonly VulnerableModel[],
    now: number, risk: RoadsideRisk
  ): RoadsideIncident | null {
    const available = this.eligible(residentId,road,models,now);
    if (!available.length || this.rng.next() >= roadsideImpactChance(residentId,risk))
      return null;
    const model = available[this.rng.int(available.length)];
    const severity: ImpactSeverity =
      modelCondition(model.condition) === 'damaged' || this.rng.next() < .18
        ? 'break' : 'damage';
    return this.record(residentId,road,model,now,risk.speed,severity);
  }
  /** Deterministic developer/test hook. Checks the *same real adjacency* as
   * natural incidents but skips chance; cannot affect a distant model. */
  force(
    residentId: number, road: Cell, model: VulnerableModel, now: number,
    severity: ImpactSeverity = 'damage'
  ): RoadsideIncident | null {
    if (!isRoad(road.x,road.y) || !leftVergeContact(road,model) ||
      !HOMES.some(home=>home.id===residentId) ||
      modelCondition(model.condition)==='broken' ||
      this.active.length>=MAX_ACTIVE_ROADSIDE_INCIDENTS ||
      this.active.some(incident=>keyOf(incident.model)===keyOf(model)))return null;
    return this.record(residentId,road,model,now,90,severity);
  }
  private record(
    residentId: number, road: Cell, model: VulnerableModel, now: number,
    speed: number, severity: ImpactSeverity
  ): RoadsideIncident {
    const before = modelCondition(model.condition);
    const after: ModelCondition = before === 'damaged' || severity === 'break'
      ? 'broken' : 'damaged';
    const incident: RoadsideIncident = {
      id: this.nextId++,residentId,road:{...road},model:{x:model.x,y:model.y},
      modelId:model.id,before,after,speed,severity:after==='broken'?'break':'damage',
      startedAt:now,endsAt:now+ACCIDENT_SCENE_SECONDS,wardHelped:false
    };
    this.active.push(incident);
    this.history.unshift({...incident});
    if(this.history.length>MAX_ROADSIDE_INCIDENT_HISTORY)
      this.history.length=MAX_ROADSIDE_INCIDENT_HISTORY;
    this.latest=incident;
    this.revision++;
    this.lastGlobal=now;
    this.lastDriver.set(residentId,now);
    this.lastModel.set(keyOf(model),now);
    return incident;
  }
  tick(now: number): boolean {
    const before=this.active.length;
    for(let i=this.active.length-1;i>=0;i--){
      if(this.active[i].endsAt<=now)this.active.splice(i,1);
    }
    if(before!==this.active.length)this.revision++;
    return before!==this.active.length;
  }
  /** Wards shorten the physical roadside disruption, not erase damage. */
  wardAssistance(road: Cell, now: number): RoadsideIncident | null {
    const event=this.active.filter(incident=>
      !incident.wardHelped && incident.endsAt>now &&
      manhattanDistance(road,incident.road)<=2
    ).sort((a,b)=>manhattanDistance(road,a.road)-manhattanDistance(road,b.road) ||
      a.id-b.id)[0];
    if(!event)return null;
    event.wardHelped=true;
    event.endsAt=Math.max(now+1,event.endsAt-8);
    const previous=this.history.find(item=>item.id===event.id);
    if(previous){previous.wardHelped=true;previous.endsAt=event.endsAt;}
    this.revision++;
    return event;
  }
  clearActive(): void {
    if(!this.active.length)return;
    this.active.length=0;
    this.revision++;
  }
  atRoad(road: Cell): RoadsideIncident[] {
    return this.active.filter(event => manhattanDistance(road,event.road)<=1);
  }
  slowAt(road: Cell): number {
    return this.atRoad(road).length ? .58 : 1;
  }
  get hazardPenalty(): number { return this.active.length*7; }
}
