import { test, expect } from '@playwright/test';
import { BOARD, HOMES, ROAD_CELLS, manhattanDistance } from '../src/game/config';
import {
  DRIVING_PROFILES, bendOpportunityOffsets, bendSpeedMultiplier,
  drivingProfile, isBendApproach
} from '../src/game/driving';
import { HOUSEHOLD_ACTIONS, HouseholdBehaviourEngine } from '../src/game/behaviors';
import { TRAFFIC_MIN_GAP, advanceTraffic, planLaneChanges, type RoadVehicle } from '../src/game/traffic';

const length=ROAD_CELLS.length*BOARD.tile;
const start=ROAD_CELLS.findIndex(cell=>cell.x===7 && cell.y===2)*BOARD.tile;

test('six distinct driving profiles match the residents rather than alphabetical speed',()=>{
  expect(DRIVING_PROFILES).toHaveLength(6);
  expect(DRIVING_PROFILES.map(profile=>profile.residentId)).toEqual([0,1,2,3,4,5]);
  const speeds=DRIVING_PROFILES.map(profile=>profile.cruiseSpeed);
  expect(new Set(speeds).size).toBe(6);
  expect(drivingProfile(0).cruiseSpeed).toBeGreaterThan(drivingProfile(2).cruiseSpeed);
  expect(drivingProfile(2).cruiseSpeed).toBeGreaterThan(drivingProfile(3).cruiseSpeed);
  expect(drivingProfile(5).cruiseSpeed).toBeLessThan(drivingProfile(1).cruiseSpeed);
  expect(drivingProfile(0).headwaySeconds).toBeLessThan(drivingProfile(5).headwaySeconds);
  expect(drivingProfile(0).passingSpeedAdvantage).toBeLessThan(drivingProfile(5).passingSpeedAdvantage);
  for(const p of DRIVING_PROFILES){
    expect(drivingProfile(p.residentId)).toBe(p);
    expect(p.roadHabit.length).toBeGreaterThan(35);
    expect(p.cruiseSpeed).toBeGreaterThan(60);
    expect(p.cruiseSpeed).toBeLessThan(115);
    expect(p.bendSpeedFactor).toBeGreaterThan(0.6);
    expect(p.bendSpeedFactor).toBeLessThanOrEqual(1);
    expect(p.headwaySeconds).toBeGreaterThanOrEqual(.4);
    expect(p.passingFrontGap).toBeGreaterThan(TRAFFIC_MIN_GAP+30);
    expect(p.passingRearGap).toBeGreaterThan(TRAFFIC_MIN_GAP+30);
  }
});

test('Finches and Wards approach turns at different speeds; straights remain unrestricted',()=>{
  const turn=ROAD_CELLS.findIndex((_,i)=>isBendApproach(i));
  const straight=ROAD_CELLS.findIndex((_,i)=>!isBendApproach(i));
  expect(turn).toBeGreaterThanOrEqual(0);
  expect(straight).toBeGreaterThanOrEqual(0);
  const atTurn=(turn+.5)*BOARD.tile;
  const atStraight=(straight+.5)*BOARD.tile;
  expect(bendSpeedMultiplier(atTurn,drivingProfile(0))).toBeCloseTo(.94);
  expect(bendSpeedMultiplier(atTurn,drivingProfile(5))).toBeCloseTo(.68);
  expect(bendSpeedMultiplier(atStraight,drivingProfile(5))).toBe(1);
  expect(bendSpeedMultiplier(atTurn+length,drivingProfile(0))).toBeCloseTo(.94);
});

test('corner-based family habits are scheduled at actual bends, reproducibly',()=>{
  const first=new HouseholdBehaviourEngine(2401);
  const second=new HouseholdBehaviourEngine(2401);
  for(const residentId of [0,5]){
    const home=HOMES[residentId];
    const driveway=ROAD_CELLS.findIndex(cell=>manhattanDistance(cell,home)===1);
    const bends=bendOpportunityOffsets(residentId);
    expect(bends.length).toBeGreaterThan(1);
    for(const offset of bends){
      const index=(driveway+offset)%ROAD_CELLS.length;
      expect(isBendApproach(index)).toBe(true);
    }
    for(let attempt=0;attempt<8;attempt++){
      const offset=first.opportunityOffset(ROAD_CELLS.length,residentId);
      expect(bends).toContain(offset);
    }
  }
  // The same stream of household decisions always chooses the same corners.
  for(const residentId of [0,5]){
    const a=new HouseholdBehaviourEngine(177);
    const b=new HouseholdBehaviourEngine(177);
    expect(Array.from({length:12},()=>a.opportunityOffset(ROAD_CELLS.length,residentId)))
      .toEqual(Array.from({length:12},()=>b.opportunityOffset(ROAD_CELLS.length,residentId)));
  }
});

test('Finches and Millers seek open overtakes, Wards wait without sufficient advantage',()=>{
  expect(start).toBeGreaterThan(0);
  const slow:RoadVehicle={residentId:1,position:start+125,desiredSpeed:73,lane:'left',
    driver:drivingProfile(1)};
  const finch:RoadVehicle={residentId:0,position:start,desiredSpeed:106,lane:'left',
    driver:drivingProfile(0)};
  const miller:RoadVehicle={residentId:2,position:start,desiredSpeed:101,lane:'left',
    driver:drivingProfile(2)};
  const ward:RoadVehicle={residentId:5,position:start,desiredSpeed:80,lane:'left',
    driver:drivingProfile(5)};
  expect(planLaneChanges([finch,slow],length).get(0)).toBe('passing');
  expect(planLaneChanges([miller,slow],length).get(2)).toBe('passing');
  expect(planLaneChanges([ward,slow],length).has(5)).toBe(false);
});

test('larger Ward clearances can veto a pass the Finches can make',()=>{
  const slow:RoadVehicle={residentId:1,position:start+145,desiredSpeed:0,lane:'left'};
  const blocker:RoadVehicle={residentId:2,position:start+104,desiredSpeed:90,lane:'passing'};
  const finch:RoadVehicle={residentId:0,position:start,desiredSpeed:106,lane:'left',
    driver:drivingProfile(0)};
  const ward:RoadVehicle={residentId:5,position:start,desiredSpeed:80,lane:'left',
    driver:drivingProfile(5)};
  expect(planLaneChanges([finch,slow,blocker],length).get(0)).toBe('passing');
  expect(planLaneChanges([ward,slow,blocker],length).has(5)).toBe(false);
});

test('individual following headways do not weaken the universal physical collision gap',()=>{
  const leader:RoadVehicle={residentId:1,position:160,desiredSpeed:0,lane:'left'};
  const make=(id:number):RoadVehicle=>({residentId:id,position:105,desiredSpeed:106,
    lane:'left',driver:drivingProfile(id)});
  const quick=advanceTraffic([make(0),leader],.1,length)[0];
  const cautious=advanceTraffic([make(5),leader],.1,length)[0];
  expect(quick.distance).toBeGreaterThan(cautious.distance);
  expect(160-105-quick.distance).toBeGreaterThanOrEqual(TRAFFIC_MIN_GAP);
  expect(160-105-cautious.distance).toBeGreaterThanOrEqual(TRAFFIC_MIN_GAP);
});

test('every household action has a distinct personal reason and response',()=>{
  expect(HOUSEHOLD_ACTIONS).toHaveLength(6);
  const remarks=HOUSEHOLD_ACTIONS.flatMap(pair=>[
    pair.helpful.afterRemark,pair.troublesome.afterRemark
  ]);
  expect(new Set(remarks).size).toBe(12);
  expect(HOUSEHOLD_ACTIONS[0].helpful.id).toBe('scout');
  expect(HOUSEHOLD_ACTIONS[0].troublesome.id).toBe('skid');
  expect(HOUSEHOLD_ACTIONS[2].troublesome.label).toContain('delivery');
  expect(HOUSEHOLD_ACTIONS[4].helpful.id).toBe('restore');
  expect(HOUSEHOLD_ACTIONS[5].troublesome.id).toBe('hesitate');
});

test('household notebook explains real driving habit without adding a permanent HUD',async({page})=>{
  await page.goto('/');
  await page.locator('[data-resident="0"]').first().click();
  await expect(page.locator('#household-detail')).toContainText('Behind the wheel');
  await expect(page.locator('#household-detail')).toContainText('Prefer a lively pace');
  await expect(page.locator('#household-detail')).toContainText('Finds a clear line through');
  await page.locator('[data-resident="5"]').first().click();
  await expect(page.locator('#household-detail')).toContainText('Slow early for bends');
  await expect(page.locator('#household-detail')).toContainText('Stops to check the road');
});
