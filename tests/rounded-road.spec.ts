import {test,expect} from '@playwright/test';
import {BOARD, ROAD_CELLS, worldPoint} from '../src/game/config';
import {
  ROAD_ROUNDING_MAX_RADIUS, ROUNDED_ROAD_NODES,
  roundedRoadPointAt, roundedRoadTangentAt
} from '../src/game/roadGeometry';
import {
  TRAFFIC_LEFT_LANE_OFFSET, TRAFFIC_PASSING_LANE_OFFSET, roadPoseAt,
  advanceTraffic, type RoadVehicle
} from '../src/game/traffic';

const length=ROAD_CELLS.length*BOARD.tile;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.hypot(a.x-b.x,a.y-b.y);

test('rounded bends leave the underlying playable grid and lap length unchanged',()=>{
  expect(ROUNDED_ROAD_NODES).toHaveLength(ROAD_CELLS.length);
  const originals=ROAD_CELLS.map(worldPoint);
  ROUNDED_ROAD_NODES.forEach((node,i)=>{
    expect(node.vertex).toEqual(originals[i]);
    expect(node.radius).toBeGreaterThanOrEqual(0);
    expect(node.radius).toBeLessThanOrEqual(ROAD_ROUNDING_MAX_RADIUS+.0001);
  });
  const turns=ROUNDED_ROAD_NODES.filter(node=>node.radius>0);
  expect(turns.length).toBeGreaterThan(15);
  expect(turns.length).toBeLessThan(ROAD_CELLS.length);
  expect(Math.max(...turns.map(node=>node.radius))).toBeGreaterThan(29);
  expect(Math.min(...turns.map(node=>node.radius))).toBeGreaterThan(10);
});

test('corner fillets fit every short switchback without swallowing the straight',()=>{
  for(let i=0;i<ROUNDED_ROAD_NODES.length;i++){
    const a=ROUNDED_ROAD_NODES[i],b=ROUNDED_ROAD_NODES[(i+1)%ROUNDED_ROAD_NODES.length];
    expect(a.radius+b.radius).toBeLessThan(BOARD.tile);
    expect(distance(a.exit,b.entry)).toBeGreaterThan(0);
    if(a.radius===0){
      expect(a.entry).toEqual(a.vertex);
      expect(a.exit).toEqual(a.vertex);
    }else{
      expect(distance(a.entry,a.vertex)).toBeCloseTo(a.radius,4);
      expect(distance(a.exit,a.vertex)).toBeCloseTo(a.radius,4);
      const rounded=roundedRoadPointAt(i*BOARD.tile);
      expect(distance(rounded,a.vertex)).toBeGreaterThan(3);
      expect(distance(rounded,a.vertex)).toBeLessThan(BOARD.tile*.39);
    }
  }
});

test('road centreline is seamless and tangent-continuous at grid intervals',()=>{
  expect(distance(roundedRoadPointAt(0),roundedRoadPointAt(length))).toBeLessThan(1e-8);
  for(let i=0;i<ROAD_CELLS.length;i++){
    const d=i*BOARD.tile;
    expect(distance(roundedRoadPointAt(d-.01),
      roundedRoadPointAt(d+.01))).toBeLessThan(.05);
    const before=roundedRoadTangentAt(d-.05),after=roundedRoadTangentAt(d+.05);
    expect(before.x*after.x+before.y*after.y).toBeGreaterThan(.96);
    expect(Math.hypot(...Object.values(roundedRoadTangentAt(d)))).toBeCloseTo(1,5);
    for(let j=0;j<10;j++){
      const t=j/10;
      const sampled=roundedRoadPointAt(d+t*BOARD.tile);
      const start=worldPoint(ROAD_CELLS[i]);
      const end=worldPoint(ROAD_CELLS[(i+1)%ROAD_CELLS.length]);
      const straight={
        x:start.x+(end.x-start.x)*t,
        y:start.y+(end.y-start.y)*t
      };
      expect(distance(sampled,straight)).toBeLessThan(BOARD.tile*.35);
    }
  }
});

test('left and passing car lanes remain inside the rounded road at every bend',()=>{
  for(let i=0;i<ROAD_CELLS.length;i++)for(const t of [0,.2,.5,.8]){
    const d=(i+t)*BOARD.tile;
    const centre=roundedRoadPointAt(d);
    const left=roadPoseAt(d,TRAFFIC_LEFT_LANE_OFFSET);
    const passing=roadPoseAt(d,TRAFFIC_PASSING_LANE_OFFSET);
    expect(distance(left,centre)).toBeCloseTo(11,4);
    expect(distance(passing,centre)).toBeCloseTo(11,4);
    expect(distance(left,passing)).toBeGreaterThan(20);
    expect(Number.isFinite(left.rotation)).toBe(true);
    const tangent=roundedRoadTangentAt(d);
    expect((left.x-centre.x)*tangent.y-(left.y-centre.y)*tangent.x)
      .toBeGreaterThan(10);
  }
});

test('road pose and traffic solver stay consistent around the loop seam',()=>{
  const atStart=roadPoseAt(.01);
  const acrossSeam=roadPoseAt(length+.01);
  expect(distance(atStart,acrossSeam)).toBeLessThan(.00001);
  const cars:RoadVehicle[]=[
    {residentId:0,position:length-70,lane:'left',desiredSpeed:94},
    {residentId:1,position:15,lane:'left',desiredSpeed:0},
    {residentId:2,position:length-60,lane:'passing',desiredSpeed:90}
  ];
  for(let i=0;i<130;i++){
    const moves=advanceTraffic(cars,.1,length);
    cars.forEach((car,j)=>{
      car.position=(car.position+moves[j].distance)%length;
      expect(Number.isFinite(roadPoseAt(car.position,car.lane==='left'?11:-11).rotation))
        .toBe(true);
    });
  }
});

test('real Phaser cars follow rounded rendering without page errors',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?referenceTown=1');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await page.waitForTimeout(350);
  const sample=await page.evaluate(()=>{
    const debug=(window as typeof window&{
      __modelLoopDebug:{trafficSnapshot:()=>Array<{
        residentId:number;phase:string;position:number;laneOffset:number;
        x:number;y:number;rotation:number
      }>}
    }).__modelLoopDebug;
    return debug.trafficSnapshot();
  });
  expect(sample).toHaveLength(6);
  for(const car of sample){
    if(car.phase!=='driving')continue;
    const expected=roadPoseAt(car.position,car.laneOffset);
    expect(Math.hypot(car.x-expected.x,car.y-expected.y)).toBeLessThan(12);
  }
  expect(errors).toEqual([]);
});
