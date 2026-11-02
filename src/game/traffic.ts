import { SeededRandom } from './environment';
import { VINTAGE_BALANCE } from './balance';
import type { Cell } from './config';

export type CarPhase = 'driving' | 'returning' | 'at-home' | 'departing';
export const HOME_TRAVEL_SECONDS = 0.7;
export const HOME_DWELL_SECONDS = 2.3;

export interface CarCycle {
  phase: CarPhase;
  distance: number; // Distance driven this lap, measured from the resident's home road tile.
  timer: number;
}
export function newCarCycle(): CarCycle {
  return { phase: 'driving', distance: 0, timer: 0 };
}

/** One coin payout only after an entire circuit, then return to the house. */
export function stepCarCycle(
  car: CarCycle, gameSeconds: number, travelDistance: number, roadLength: number,
  canStartDeparture = true
): boolean {
  if (gameSeconds <= 0 || roadLength <= 0) return false;
  if (car.phase === 'driving') {
    car.distance = Math.min(roadLength, car.distance + Math.max(0, travelDistance));
    if (car.distance < roadLength) return false;
    car.phase = 'returning';
    car.timer = 0;
    return true;
  }
  car.timer += gameSeconds;
  if (car.phase === 'returning' && car.timer >= HOME_TRAVEL_SECONDS) {
    car.phase = 'at-home';
    car.timer = 0;
  } else if (car.phase === 'at-home' && car.timer >= HOME_DWELL_SECONDS) {
    // Never leave the driveway while the resident's entry point is occupied.
    if (canStartDeparture) {
      car.phase = 'departing';
      car.timer = 0;
    } else {
      car.timer = HOME_DWELL_SECONDS;
    }
  } else if (car.phase === 'departing' && car.timer >= HOME_TRAVEL_SECONDS) {
    car.phase = 'driving';
    car.distance = 0;
    car.timer = 0;
  }
  return false;
}

export const TRAFFIC_MIN_GAP = 38; // World pixels, a little longer than a vintage car.
export const TRAFFIC_MERGE_GAP = 58;
export const TRAFFIC_HEADWAY = 0.55; // Seconds of following space above the bumper gap.
export const TRAFFIC_STOP_COOLDOWN = VINTAGE_BALANCE.stopPersonalCooldownSeconds;
export const TRAFFIC_GLOBAL_STOP_GAP = VINTAGE_BALANCE.stopGlobalCooldownSeconds;

export interface RoadVehicle {
  residentId: number;
  /** Absolute world distance on the circular road, starting from ROAD_CELLS[0]. */
  position: number;
  /** The speed this car would travel without a vehicle ahead. */
  desiredSpeed: number;
}
export interface RoadMovement {
  residentId: number;
  distance: number;
  speed: number;
  desiredSpeed: number;
  gapAhead: number;
  leaderId: number | null;
  queued: boolean;
  delaySeconds: number;
}
const normalise = (x: number, length: number): number => ((x % length) + length) % length;

/**
 * Simultaneous, deterministic following along the *entire circular road*.
 * Includes temporarily stopped cars and driveway reservations (speed=0).
 * Iterative forward constraints allow a queue to flow once its leader moves,
 * but prevent one car from teleporting through another at wrap-around.
 */
export function advanceTraffic(
  vehicles: readonly RoadVehicle[], dt: number, roadLength: number
): RoadMovement[] {
  if (roadLength <= 0 || dt <= 0) return vehicles.map(v => ({
    residentId: v.residentId, distance: 0, speed: 0,
    desiredSpeed: Math.max(0, v.desiredSpeed), gapAhead: roadLength,
    leaderId: null, queued: false, delaySeconds: 0
  }));
  const ordered = [...vehicles].sort((a,b) =>
    normalise(a.position,roadLength) - normalise(b.position,roadLength)
    || a.residentId - b.residentId
  );
  const n = ordered.length;
  const gaps = ordered.map((v,i) => {
    if(n<2) return roadLength;
    const ahead=ordered[(i+1)%n];
    return normalise(ahead.position-v.position,roadLength);
  });
  const desired = ordered.map(v => Math.max(0, v.desiredSpeed));
  const moves = ordered.map((_,i) => {
    const unconstrained = desired[i]*dt;
    if(n<2) return unconstrained;
    const followingLimit = Math.max(0,(gaps[i]-TRAFFIC_MIN_GAP)/TRAFFIC_HEADWAY);
    return Math.min(unconstrained,followingLimit*dt);
  });
  // Each following vehicle can approach no closer than MIN_GAP to the
  // *new* position of its leader. Repeat to propagate sudden braking back.
  for(let pass=0;pass<=n;pass++){
    let changed=false;
    for(let i=n-1;i>=0;i--){
      const leader=(i+1)%n;
      const allowance=n<2?Infinity:Math.max(0,gaps[i]-TRAFFIC_MIN_GAP+moves[leader]);
      if(moves[i]>allowance+1e-8){moves[i]=allowance;changed=true;}
    }
    if(!changed)break;
  }
  const byId=new Map<number,RoadMovement>();
  for(let i=0;i<n;i++){
    const actual=moves[i]/dt;
    const isQueued=desired[i]>1 && actual<desired[i]*0.68
      && gaps[i]<TRAFFIC_MIN_GAP+85;
    byId.set(ordered[i].residentId,{
      residentId:ordered[i].residentId,
      distance:moves[i], speed:actual, desiredSpeed:desired[i],
      gapAhead:gaps[i],leaderId:n<2?null:ordered[(i+1)%n].residentId,
      queued:isQueued,
      delaySeconds:desired[i]>0 ? dt*Math.max(0,1-actual/desired[i]) : 0
    });
  }
  return vehicles.map(v=>byId.get(v.residentId)!);
}

/** Reserving a driveway entry blocks approaching cars during departure. */
export function canReserveRoad(
  position: number, vehicles: readonly RoadVehicle[], roadLength: number
): boolean {
  if(roadLength<=0)return false;
  return vehicles.every(v=>{
    const ahead=normalise(v.position-position,roadLength);
    const behind=normalise(position-v.position,roadLength);
    return Math.min(ahead,behind)>=TRAFFIC_MERGE_GAP;
  });
}

export type TrafficIncidentKind = 'admiring' | 'hesitating' | 'chatting';
export interface TrafficStop {
  id: number;
  residentId: number;
  kind: TrafficIncidentKind;
  cell: Cell;
  startedAt: number;
  endsAt: number;
  message: string;
}
export interface QueuedRoadCar {
  residentId: number;
  cell: Cell;
  delaySeconds: number;
}

/**
 * Simulated time, not wall time. A bounded stop can never strand the road;
 * no other stop can start while one remains active.
 */
export class RoadTraffic {
  readonly rng: SeededRandom;
  activeStop: TrafficStop | null = null;
  lastIncident: TrafficStop | null = null;
  queuedCars: QueuedRoadCar[] = [];
  private nextId=1;
  private previousStops=new Map<number,number>();
  private lastGlobalStop=-Infinity;

  constructor(seed:number){this.rng=new SeededRandom((seed ^ 0x53544f50)>>>0);}

  opportunityOffset(roadLength:number):number {
    return 6+this.rng.int(Math.max(1,roadLength-15));
  }

  tick(now:number): boolean {
    if(this.activeStop && now>=this.activeStop.endsAt){
      this.activeStop=null;
      return true;
    }
    return false;
  }

  /** Legacy independent opportunity, retained for existing regression tests.
   *  Unified family actions use HouseholdBehaviourEngine instead. */
  attempt(
    residentId:number, irritation:number, cell:Cell, now:number,
    localSpeedSign=false
  ): TrafficStop | null {
    if(residentId!==1 && residentId!==5)return null;
    if(this.activeStop || now-this.lastGlobalStop<TRAFFIC_GLOBAL_STOP_GAP ||
      now-(this.previousStops.get(residentId)??-Infinity)<TRAFFIC_STOP_COOLDOWN)return null;
    const base=residentId===1?0.32:0.25;
    const mood=irritation>=72?1.45:irritation<45?0.9:1;
    const likelihood=Math.min(0.65,base*mood*(localSpeedSign && residentId===5?0.45:1));
    if(this.rng.next()>=likelihood)return null;
    return this.forceStop(residentId,cell,now);
  }

  /** Gameplay entry point; unlike debug forceStop this honours global and family cooldowns. */
  requestStop(residentId:number,cell:Cell,now:number):TrafficStop|null {
    if(this.activeStop || now-this.lastGlobalStop<TRAFFIC_GLOBAL_STOP_GAP ||
      now-(this.previousStops.get(residentId)??-Infinity)<TRAFFIC_STOP_COOLDOWN) return null;
    return this.forceStop(residentId,cell,now);
  }

  forceStop(residentId:number, cell:Cell, now:number, duration?:number): TrafficStop | null {
    if(this.activeStop || !Number.isFinite(now) || residentId<0 || residentId>5 ||
      !Number.isInteger(residentId))return null;
    const kind:TrafficIncidentKind=residentId===1?'admiring':
      residentId===3?'chatting':'hesitating';
    const seconds=Math.max(1,Math.min(6,duration ??
      (kind==='admiring'?VINTAGE_BALANCE.stopAdmireSeconds:
        kind==='chatting'?VINTAGE_BALANCE.stopChatSeconds:
          VINTAGE_BALANCE.stopHesitateSeconds)));
    const message=kind==='admiring'
      ? 'The Bells have stopped to take in the view. Traffic is slowing behind them.'
      : kind==='chatting'
        ? 'The Marshes paused to chat with a neighbour. Cars are gathering behind.'
        : 'The Wards paused cautiously. Cars behind are beginning to queue.';
    const incident:TrafficStop={
      id:this.nextId++,residentId,kind,cell:{...cell},
      startedAt:now,endsAt:now+seconds,message
    };
    this.activeStop=incident;
    this.lastIncident=incident;
    this.previousStops.set(residentId,now);
    this.lastGlobalStop=now;
    return incident;
  }

  /** A helping driver can clear a queue sooner, but no stop lasts forever. */
  shortenStop(now:number,seconds:number):boolean {
    if(!this.activeStop || seconds<=0)return false;
    this.activeStop.endsAt=Math.max(now,this.activeStop.endsAt-seconds);
    if(this.activeStop.endsAt<=now)this.activeStop=null;
    return true;
  }

  shouldStop(residentId:number):boolean {
    return this.activeStop?.residentId===residentId;
  }

  updateQueue(items:QueuedRoadCar[]):boolean {
    const next=items.filter(item=>item.delaySeconds>0);
    const changed=next.length!==this.queuedCars.length ||
      next.some(item=>!this.queuedCars.some(prev=>prev.residentId===item.residentId));
    this.queuedCars=next;
    return changed;
  }
  queuedNear(cell:Cell,radius=1):number {
    return this.queuedCars.filter(item=>
      Math.abs(item.cell.x-cell.x)+Math.abs(item.cell.y-cell.y)<=radius).length;
  }
}
