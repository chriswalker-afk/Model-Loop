import { SeededRandom } from './environment';
import { VINTAGE_BALANCE } from './balance';
import type { DrivingProfile } from './driving';
import { BOARD, ROAD_CELLS, worldPoint, type Cell } from './config';
import { roundedRoadPointAt, roundedRoadTangentAt } from './roadGeometry';

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
export const TRAFFIC_LEFT_LANE_OFFSET = 11; // Normal left-hand side of the widened road.
export const TRAFFIC_PASSING_LANE_OFFSET = -11;
export const TRAFFIC_LANE_CHANGE_SECONDS = 0.65;
export const TRAFFIC_OVERTAKE_LOOKAHEAD = 160;
export type RoadLane = 'left' | 'passing';
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
  /** Two same-direction lanes. Older one-lane callers default to left. */
  lane?: RoadLane;
  /** A changing car temporarily occupies both lanes. */
  changingTo?: RoadLane | null;
  /** A departing driveway vehicle reserves the entry, never an overtaking target. */
  drivewayReservation?: boolean;
  /** Optional per-household preferences; omitted by older solver callers. */
  driver?: DrivingProfile;
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

type RoadPoint = { x: number; y: number };
export interface RoadPose extends RoadPoint { rotation: number; }

/**
 * Use the same gently curved centreline as the road graphics. Only on-screen
 * position and heading change: each vehicle retains its original grid-cell
 * road index, tile-based travel distance, lane reservations, speed and lap
 * accounting. Normal offsets keep both miniature lanes inside the road on
 * corners instead of cutting diagonally across the engraved curb.
 */
function pointOnRoadLane(distance: number, offset: number): RoadPoint {
  const centre = roundedRoadPointAt(distance);
  const tangent = roundedRoadTangentAt(distance);
  return {
    x: centre.x + tangent.y * offset,
    y: centre.y - tangent.x * offset
  };
}

/** Continuous left-hand driving through every rounded turn and loop seam. */
export function roadPoseAt(distance: number, offset = TRAFFIC_LEFT_LANE_OFFSET): RoadPose {
  const position = pointOnRoadLane(distance, offset);
  const look = BOARD.tile * .17;
  const behind = pointOnRoadLane(distance - look, offset);
  const ahead = pointOnRoadLane(distance + look, offset);
  return {
    ...position,
    rotation: Math.atan2(ahead.y - behind.y, ahead.x - behind.x)
  };
}

/**
 * A roadside display or discarded packaging may encroach on the left edge.
 * Ease toward the centre when free; lateral overtakes are separately planned
 * with front/rear clearance checks and safe longitudinal following.
 */
export function preferredRoadLaneOffset(distance: number, leftEdgeObstructions: readonly Cell[]): number {
  if (leftEdgeObstructions.length === 0) return TRAFFIC_LEFT_LANE_OFFSET;
  const centre = roadPoseAt(distance, 0);
  const forwardX = Math.cos(centre.rotation);
  const forwardY = Math.sin(centre.rotation);
  const blocked = leftEdgeObstructions.some(cell => {
    const obstacle = worldPoint(cell);
    const dx = obstacle.x - centre.x;
    const dy = obstacle.y - centre.y;
    const ahead = dx * forwardX + dy * forwardY;
    const left = dx * forwardY - dy * forwardX;
    return ahead > -BOARD.tile * 0.7 && ahead < BOARD.tile * 1.5 &&
      left > BOARD.tile * 0.3 && left < BOARD.tile * 1.45;
  });
  return blocked ? 0 : TRAFFIC_LEFT_LANE_OFFSET;
}

/** Is the verge obstructing the specified side of the road near this distance? */
function vergeBlockedAt(distance: number, lane: RoadLane, blockedCells: readonly Cell[]): boolean {
  if (!blockedCells.length) return false;
  const centre = roadPoseAt(distance, 0);
  const forwardX = Math.cos(centre.rotation);
  const forwardY = Math.sin(centre.rotation);
  return blockedCells.some(cell => {
    const point = worldPoint(cell);
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    const along = dx * forwardX + dy * forwardY;
    const left = dx * forwardY - dy * forwardX;
    const towardSide = lane === 'left' ? left : -left;
    return along > -BOARD.tile * 0.55 && along < BOARD.tile * 0.8 &&
      towardSide > BOARD.tile * 0.3 && towardSide < BOARD.tile * 1.45;
  });
}

export function passingLaneBlockedAhead(
  distance: number, blockedCells: readonly Cell[], lookahead = 70
): boolean {
  for (let d = 0; d <= lookahead; d += BOARD.tile / 2) {
    if (vergeBlockedAt(distance + d, 'passing', blockedCells)) return true;
  }
  return false;
}

/** No lane changing at a tight bend or towards roadside obstructions. */
export function passingStretchClear(distance: number, blockedCells: readonly Cell[]): boolean {
  const heading = roadPoseAt(distance, 0).rotation;
  for (let ahead = -BOARD.tile * 0.45; ahead <= TRAFFIC_OVERTAKE_LOOKAHEAD; ahead += BOARD.tile / 2) {
    const angle = roadPoseAt(distance + ahead, 0).rotation;
    // First 1.5 tiles must be nearly straight for a sideways manoeuvre.
    if (ahead <= BOARD.tile * 1.5 && Math.cos(angle - heading) < 0.94) return false;
    if (vergeBlockedAt(distance + ahead, 'passing', blockedCells)) return false;
  }
  return true;
}

const laneOf = (vehicle: RoadVehicle): RoadLane => vehicle.lane ?? 'left';
const occupies = (vehicle: RoadVehicle, lane: RoadLane): boolean =>
  laneOf(vehicle) === lane || vehicle.changingTo === lane;
const sharesLane = (a: RoadVehicle, b: RoadVehicle): boolean =>
  (occupies(a, 'left') && occupies(b, 'left')) ||
  (occupies(a, 'passing') && occupies(b, 'passing'));

const forwardGap = (from: number, to: number, length: number): number =>
  normalise(to - from, length);

/**
 * Plan deliberate overtakes, without actually moving the vehicles yet.
 * The faster car changes from left to the right-hand passing lane, passes,
 * and returns left after opening a safe front and rear gap.
 * An occupied lane, roadside obstruction, or sharp corner blocks the change.
 * Existing lane changes reserve both lanes for their full animation.
 */
export function planLaneChanges(
  vehicles: readonly RoadVehicle[], roadLength: number,
  roadsideObstructions: readonly Cell[] = []
): Map<number, RoadLane> {
  const choices = new Map<number, RoadLane>();
  if (roadLength <= 0) return choices;
  // Work on a copy: later decisions must see earlier lane-change reservations.
  const traffic = vehicles.map(vehicle => ({ ...vehicle }));
  const sorted = [...traffic].sort((a, b) => a.residentId - b.residentId);
  for (const car of sorted) {
    if (car.drivewayReservation || car.changingTo) continue;
    const lane = laneOf(car);
    const destination: RoadLane = lane === 'left' ? 'passing' : 'left';
    const others = traffic.filter(other => other.residentId !== car.residentId);
    const inTarget = others.filter(other => occupies(other, destination));
    const forward = inTarget.map(other => forwardGap(car.position, other.position, roadLength));
    const backward = inTarget.map(other => forwardGap(other.position, car.position, roadLength));
    const frontGap = Math.min(roadLength, ...forward);
    const backGap = Math.min(roadLength, ...backward);
    // Personality changes how much clearance a driver wants; the universal
    // hard bumper gap still applies regardless of someone's impatience.
    const safeFront = Math.max(TRAFFIC_MIN_GAP + 20, car.driver?.passingFrontGap ?? 85);
    const safeRear = Math.max(TRAFFIC_MIN_GAP + 20, car.driver?.passingRearGap ?? 75);
    if (frontGap < safeFront || backGap < safeRear) continue;
    if (!passingStretchClear(car.position, roadsideObstructions)) {
      // Returning left need not be blocked by a display on the far verge,
      // but cannot occur mid-bend or into an occupied lane.
      if (lane === 'left') continue;
      const heading = roadPoseAt(car.position, 0).rotation;
      const nextHeading = roadPoseAt(car.position + BOARD.tile, 0).rotation;
      if (Math.cos(nextHeading - heading) < 0.94) continue;
    }

    const ahead = others
      .filter(other => occupies(other, 'left'))
      .map(other => ({ other, gap: forwardGap(car.position, other.position, roadLength) }))
      .sort((a,b) => a.gap - b.gap)[0];
    const lookahead = car.driver?.passingLookahead ?? TRAFFIC_OVERTAKE_LOOKAHEAD;
    const advantage = car.driver?.passingSpeedAdvantage ?? 9;
    if (lane === 'left') {
      if (!ahead || ahead.other.drivewayReservation) continue;
      if (ahead.gap > lookahead) continue;
      if (car.desiredSpeed < ahead.other.desiredSpeed + advantage) continue;
      // Impatient drivers try sooner, cautious ones require a bigger advantage.
      // Everyone still queues if the passing lane is occupied or obstructed.
    } else {
      // Stay in the passing lane until genuinely past the slower vehicle;
      // otherwise the car would weave back left before overtaking.
      if (ahead && ahead.gap < lookahead &&
          car.desiredSpeed >= ahead.other.desiredSpeed + advantage) continue;
    }
    choices.set(car.residentId, destination);
    car.changingTo = destination; // reserve both lanes for subsequent decisions
  }
  return choices;
}


/**
 * Deterministic two-lane following across the entire circular road.
 * Vehicles changing lanes occupy both lanes until their manoeuvre finishes.
 * Minimum bumper gaps are enforced within every occupied lane, even around
 * the loop seam; cars in separate lanes can genuinely overtake one another.
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
  const leaders = ordered.map((vehicle,i) => {
    let gap=roadLength, index=-1;
    for(let j=0;j<n;j++){
      if(i===j || !sharesLane(vehicle,ordered[j]))continue;
      const distance=forwardGap(vehicle.position,ordered[j].position,roadLength);
      if(distance<gap){gap=distance;index=j;}
    }
    return {gap,index};
  });
  const desired = ordered.map(v => Math.max(0, v.desiredSpeed));
  const moves = ordered.map((_,i) => {
    const unconstrained = desired[i]*dt;
    if(leaders[i].index<0)return unconstrained;
    const headway = Math.max(0.35, ordered[i].driver?.headwaySeconds ?? TRAFFIC_HEADWAY);
    const followingLimit=Math.max(0,(leaders[i].gap-TRAFFIC_MIN_GAP)/headway);
    return Math.min(unconstrained,followingLimit*dt);
  });
  // Propagate braking through each lane (including cars changing lanes).
  for(let pass=0;pass<=n;pass++){
    let changed=false;
    for(let i=n-1;i>=0;i--){
      const leader=leaders[i].index;
      if(leader<0)continue;
      const allowance=Math.max(0,leaders[i].gap-TRAFFIC_MIN_GAP+moves[leader]);
      if(moves[i]>allowance+1e-8){moves[i]=allowance;changed=true;}
    }
    if(!changed)break;
  }
  const byId=new Map<number,RoadMovement>();
  for(let i=0;i<n;i++){
    const actual=moves[i]/dt;
    const isQueued=desired[i]>1 && actual<desired[i]*0.68
      && leaders[i].gap<TRAFFIC_MIN_GAP+85;
    byId.set(ordered[i].residentId,{
      residentId:ordered[i].residentId,
      distance:moves[i],speed:actual,desiredSpeed:desired[i],
      gapAhead:leaders[i].gap,
      leaderId:leaders[i].index<0?null:ordered[leaders[i].index].residentId,
      queued:isQueued,
      delaySeconds:desired[i]>0?dt*Math.max(0,1-actual/desired[i]):0
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


/**
 * A road loop can serve several families whose front doors face the SAME
 * carriageway square. Putting their vehicles on that square simultaneously
 * creates a zero-gap follower cycle, which the collision-safe solver correctly
 * refuses to move. Reserve a safe first set; remaining households wait in
 * their driveways and use the normal merge process.
 *
 * This decision is deterministic and does not borrow money, distance or laps.
 */
export interface InitialRoadEntry { residentId:number; position:number; }
export function planInitialRoadEntries(
  entries:readonly InitialRoadEntry[],roadLength:number
):Set<number> {
  const admitted=new Set<number>();
  const used:RoadVehicle[]=[];
  for(const entry of entries){
    if(!Number.isFinite(entry.position)||!Number.isInteger(entry.residentId)||
       admitted.has(entry.residentId))continue;
    if(!canReserveRoad(entry.position,used,roadLength))continue;
    admitted.add(entry.residentId);
    used.push({residentId:entry.residentId,position:entry.position,
      desiredSpeed:0,lane:'left',drivewayReservation:true});
  }
  return admitted;
}

/**
 * Last-resort detector for a genuine circular standstill, rather than a
 * legitimate six-second family pause. No positions are modified here:
 * the scene decides which car to guide back to its driveway, without giving
 * it a lap, a payout or permission to overlap another car.
 */
export const GRIDLOCK_RECOVERY_SECONDS=10;
// Below two world pixels per simulated second, a car would need over twenty
// seconds merely to advance one road square: it is functionally stationary.
export const GRIDLOCK_MEANINGFUL_SPEED=2;
export class TrafficGridlockWatch {
  private stationarySeconds=new Map<number,number>();
  private recoveryCount=0;

  reset():void {
    this.stationarySeconds.clear();
  }

  /** Only a new generation resets the audit tally. An ordinary recovered
   * standstill must clear timers without erasing this run's recovery history.
   */
  resetForNewRun():void {
    this.reset();
    this.recoveryCount=0;
  }

  /** Read-only diagnostics for developer tools and regression tests. */
  stalledFor(residentId:number):number {
    return this.stationarySeconds.get(residentId)??0;
  }
  snapshot():{stalledSeconds:Array<{residentId:number;seconds:number}>;recoveries:number}{
    return {
      stalledSeconds:[...this.stationarySeconds.entries()]
        .map(([residentId,seconds])=>({residentId,seconds}))
        .sort((a,b)=>a.residentId-b.residentId),
      recoveries:this.recoveryCount
    };
  }

  observe(
    dt:number,vehicles:readonly RoadVehicle[],moves:readonly RoadMovement[],
    familyStopActive:boolean
  ):number|null {
    if(!Number.isFinite(dt)||dt<=0)return null;
    const driving=vehicles.filter(vehicle=>!vehicle.drivewayReservation);
    if(driving.length===0){
      this.reset();
      return null;
    }
    const movement=new Map(moves.map(move=>[move.residentId,move]));
    // A family pause and an active driveway reservation are *temporary*
    // legitimate obstructions. Freeze, rather than CLEAR, persistent-stall
    // history while one exists. Clearing every time a car leaves home made the
    // old 10-second gridlock threshold unreachable in a busy six-car town.
    const temporaryStop=familyStopActive ||
      vehicles.some(vehicle=>vehicle.drivewayReservation);
    const active=new Set(driving.map(vehicle=>vehicle.residentId));
    for(const residentId of [...this.stationarySeconds.keys()]){
      if(!active.has(residentId))this.stationarySeconds.delete(residentId);
    }
    for(const vehicle of driving){
      const speed=movement.get(vehicle.residentId)?.speed??Infinity;
      if(speed>=GRIDLOCK_MEANINGFUL_SPEED){
        // Even brief actual movement demonstrates this car can still progress.
        this.stationarySeconds.delete(vehicle.residentId);
      }else if(!temporaryStop){
        this.stationarySeconds.set(vehicle.residentId,
          (this.stationarySeconds.get(vehicle.residentId)??0)+dt);
      }
    }
    if(temporaryStop)return null;

    const stuck=(id:number)=>
      (this.stationarySeconds.get(id)??0)>=GRIDLOCK_RECOVERY_SECONDS;

    // An invalid same-lane overlap can never be resolved by the headway
    // solver; remove the later-numbered car, leaving the other in place.
    const roadLength=ROAD_CELLS.length*BOARD.tile;
    const duplicates:Array<{a:number;b:number}>=[];
    for(let i=0;i<driving.length;i++)for(let j=i+1;j<driving.length;j++){
      const a=driving[i],b=driving[j];
      if(!sharesLane(a,b))continue;
      const gap=forwardGap(a.position,b.position,roadLength);
      if(Math.min(gap,roadLength-gap)<2&&stuck(a.residentId)&&stuck(b.residentId)){
        duplicates.push({a:a.residentId,b:b.residentId});
      }
    }
    if(duplicates.length){
      const pair=duplicates.sort((a,b)=>
        Math.max(a.a,a.b)-Math.max(b.a,b.b))[0];
      this.reset();
      this.recoveryCount++;
      return Math.max(pair.a,pair.b);
    }

    const stationary=driving.filter(car=>stuck(car.residentId));
    if(!stationary.length)return null;
    // A lone passing-lane vehicle can remain blocked by litter or a display
    // forever. It must be allowed to return home even if the OTHER lane is
    // still moving and no follower has joined its queue yet.
    const passingBlocker=stationary.find(car=>
      car.lane==='passing'&&car.desiredSpeed<.35);
    if(passingBlocker){
      this.reset();
      this.recoveryCount++;
      return passingBlocker.residentId;
    }

    if(stationary.length<2)return null;
    // Choose the lead blocked car, rather than a follower with no agency.
    // A leader outside the stationary set is not blocking *this* convoy, so
    // this vehicle is at the front of the persistent stalled group.
    const ids=new Set(stationary.map(car=>car.residentId));
    const blocker=stationary.find(car=>car.desiredSpeed<.35) ??
      stationary.find(car=>{
        const leader=movement.get(car.residentId)?.leaderId;
        return leader===null||leader===undefined||!ids.has(leader);
      }) ?? stationary[0];
    this.reset();
    this.recoveryCount++;
    return blocker.residentId;
  }
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
