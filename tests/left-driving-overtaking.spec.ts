import { test, expect } from '@playwright/test';
import { BOARD, ROAD_CELLS, worldPoint } from '../src/game/config';
import {
  TRAFFIC_LEFT_LANE_OFFSET, TRAFFIC_PASSING_LANE_OFFSET, TRAFFIC_MIN_GAP,
  advanceTraffic, passingStretchClear, planLaneChanges, roadPoseAt,
  type RoadVehicle
} from '../src/game/traffic';

const roadLength = ROAD_CELLS.length * BOARD.tile;
const straightIndex = ROAD_CELLS.findIndex(cell => cell.x === 7 && cell.y === 2);
const straightPosition = straightIndex * BOARD.tile;

test('every road bend and wrap has continuous left and passing lane paths', () => {
  const mid = (straightIndex + .5) * BOARD.tile;
  const centre = roadPoseAt(mid, 0);
  const left = roadPoseAt(mid, TRAFFIC_LEFT_LANE_OFFSET);
  const passing = roadPoseAt(mid, TRAFFIC_PASSING_LANE_OFFSET);
  expect(left.y).toBeLessThan(centre.y);
  expect(passing.y).toBeGreaterThan(centre.y);
  expect(Math.hypot(left.x-passing.x, left.y-passing.y)).toBeGreaterThan(20);
  for (let index = 0; index < ROAD_CELLS.length; index++) {
    for (const offset of [TRAFFIC_LEFT_LANE_OFFSET, TRAFFIC_PASSING_LANE_OFFSET]) {
      const before = roadPoseAt(index * BOARD.tile - .01, offset);
      const after = roadPoseAt(index * BOARD.tile + .01, offset);
      expect(Math.hypot(after.x-before.x, after.y-before.y)).toBeLessThan(.1);
    }
  }
  const start = roadPoseAt(.01);
  const wrap = roadPoseAt(roadLength + .01);
  expect(Math.hypot(start.x-wrap.x, start.y-wrap.y)).toBeLessThan(.001);
});

test('fast driver overtakes a stopped car only when passing lane is clear', () => {
  expect(straightIndex).toBeGreaterThan(0);
  expect(passingStretchClear(straightPosition, [])).toBe(true);
  const cars: RoadVehicle[] = [
    { residentId: 0, position: straightPosition, desiredSpeed: 105, lane: 'left' },
    { residentId: 1, position: straightPosition + 110, desiredSpeed: 0, lane: 'left' }
  ];
  expect(planLaneChanges(cars, roadLength).get(0)).toBe('passing');
  // During the manoeuvre both lanes are reserved; a car may not pass through
  // the slower vehicle before the sideways move has finished.
  const changing: RoadVehicle[] = [
    { ...cars[0], position: cars[1].position - 55, changingTo: 'passing' },
    cars[1]
  ];
  const reserved = advanceTraffic(changing, .5, roadLength)[0];
  expect(reserved.distance).toBeLessThanOrEqual(55 - TRAFFIC_MIN_GAP + 1e-6);
  // Once properly in the separate lane, overtaking is real longitudinal
  // progress, not an animation placed over a car in an impassable lane.
  cars[0].lane = 'passing';
  for (let i = 0; i < 25; i++) {
    const movement = advanceTraffic(cars, .1, roadLength);
    cars.forEach((car, index) => car.position += movement[index].distance);
  }
  expect(cars[0].position).toBeGreaterThan(cars[1].position + 70);
});

test('a car returns left after passing, but never merges into an unsafe gap', () => {
  const leader: RoadVehicle = {
    residentId: 1, position: straightPosition - 86, desiredSpeed: 0, lane: 'left'
  };
  const passer: RoadVehicle = {
    residentId: 0, position: straightPosition, desiredSpeed: 105, lane: 'passing'
  };
  expect(planLaneChanges([passer, leader], roadLength).get(0)).toBe('left');
  leader.position = straightPosition - 35;
  expect(planLaneChanges([passer, leader], roadLength).has(0)).toBe(false);
  leader.position = straightPosition + 110;
  expect(planLaneChanges([passer, leader], roadLength).has(0)).toBe(false);
});

test('a passing vehicle or roadside display blocks an unsafe overtake', () => {
  const follower: RoadVehicle = {
    residentId: 0, position: straightPosition, desiredSpeed: 105, lane: 'left'
  };
  const slow: RoadVehicle = {
    residentId: 1, position: straightPosition + 110, desiredSpeed: 0, lane: 'left'
  };
  const occupied: RoadVehicle = {
    residentId: 2, position: straightPosition + 40, desiredSpeed: 88, lane: 'passing'
  };
  expect(planLaneChanges([follower, slow, occupied], roadLength).has(0)).toBe(false);
  expect(planLaneChanges([follower, slow], roadLength, [{x:7,y:3}]).has(0)).toBe(false);
  const queued = advanceTraffic([follower, slow], 1, roadLength)[0];
  expect(queued.distance).toBeLessThan(follower.desiredSpeed);
  expect(queued.leaderId).toBe(1);
});

test('passing-lane vehicles cannot drive through other passing vehicles', () => {
  const vehicles: RoadVehicle[] = [
    {residentId:0,position:roadLength-60,desiredSpeed:110,lane:'passing'},
    {residentId:1,position:5,desiredSpeed:0,lane:'passing'},
    {residentId:2,position:roadLength-45,desiredSpeed:100,lane:'left'}
  ];
  for(let frame=0;frame<30;frame++){
    const moves=advanceTraffic(vehicles,.1,roadLength);
    vehicles.forEach((car,i)=>car.position=(car.position+moves[i].distance)%roadLength);
    const separation=(vehicles[1].position-vehicles[0].position+roadLength)%roadLength;
    expect(separation).toBeGreaterThanOrEqual(TRAFFIC_MIN_GAP-1e-5);
    expect(moves[2].distance).toBeGreaterThan(0); // independent left lane moves
  }
});

test('initial driving position is on the left of the eastbound road',async({page})=>{
  await page.goto('/');
  const cars = await page.evaluate(()=>(
    window as typeof window & {
      __modelLoopDebug:{trafficSnapshot:()=>Array<{lane:string;laneOffset:number;phase:string}>}
    }
  ).__modelLoopDebug.trafficSnapshot());
  expect(cars.filter(car=>car.phase==='driving')).not.toHaveLength(0);
  for(const car of cars){
    expect(car.lane).toBe('left');
    expect(car.laneOffset).toBeCloseTo(TRAFFIC_LEFT_LANE_OFFSET,2);
  }
});
