import { BOARD, ROAD_CELLS, worldPoint } from './config';

/**
 * The playable roadway remains the exact same grid loop. This is a VISUAL
 * fillet of the line between the existing cell centres: no road tiles, home
 * adjacency, lap distance, lane reservations or traffic headways are changed.
 *
 * Keep the turn radius proportional to the adjacent straight lengths so
 * closely spaced switchbacks never grow overlapping curves. On long runs
 * bends are visibly rounded; on short one-cell zigzags they remain compact.
 */
export interface RoadPoint { x: number; y: number }
export interface RoundedRoadNode {
  vertex: RoadPoint;
  entry: RoadPoint;
  exit: RoadPoint;
  radius: number;
}
export const ROAD_ROUNDING_MAX_RADIUS = BOARD.tile * 0.72;
const MIN_STRAIGHT_FRACTION = 0.12;
const CENTRES: readonly RoadPoint[] = ROAD_CELLS.map(worldPoint);
const count = CENTRES.length;
const tile = BOARD.tile;

function normalise(distance: number): number {
  const total = count * tile;
  return ((distance % total) + total) % total;
}
function mix(a: RoadPoint, b: RoadPoint, t: number): RoadPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function quadratic(a: RoadPoint, control: RoadPoint, b: RoadPoint, t: number): RoadPoint {
  const u = 1 - t;
  return {
    x: u*u*a.x + 2*u*t*control.x + t*t*b.x,
    y: u*u*a.y + 2*u*t*control.y + t*t*b.y
  };
}
function isTurn(index: number): boolean {
  const prev = CENTRES[(index - 1 + count) % count];
  const at = CENTRES[index];
  const next = CENTRES[(index + 1) % count];
  return Math.abs(
    (at.x-prev.x)*(next.y-at.y) -
    (at.y-prev.y)*(next.x-at.x)
  ) > 0.01;
}

/** Closed sequence used by the road outline and sampled lane geometry. */
function createRoundedNodes(): readonly RoundedRoadNode[] {
  const turns = CENTRES.map((_,i) => i).filter(isTurn);
  return CENTRES.map((vertex,index) => {
    if (!isTurn(index) || turns.length < 2) {
      return { vertex, entry: vertex, exit: vertex, radius: 0 };
    }
    const turnIndex = turns.indexOf(index);
    const previousTurn = turns[(turnIndex - 1 + turns.length) % turns.length];
    const followingTurn = turns[(turnIndex + 1) % turns.length];
    const backSteps = (index - previousTurn + count) % count;
    const nextSteps = (followingTurn - index + count) % count;
    // With adjacent turns (one grid interval apart), their radii sum to
    // at most 88% of the interval. There is always a nonzero straight join.
    const cornerFraction = (1 - MIN_STRAIGHT_FRACTION) / 2;
    const radius = Math.min(
      ROAD_ROUNDING_MAX_RADIUS, backSteps * tile * cornerFraction,
      nextSteps * tile * cornerFraction
    );
    const before = CENTRES[(index - 1 + count) % count];
    const after = CENTRES[(index + 1) % count];
    const inX = (vertex.x - before.x) / tile;
    const inY = (vertex.y - before.y) / tile;
    const outX = (after.x - vertex.x) / tile;
    const outY = (after.y - vertex.y) / tile;
    return {
      vertex, radius,
      entry: { x: vertex.x - inX * radius, y: vertex.y - inY * radius },
      exit: { x: vertex.x + outX * radius, y: vertex.y + outY * radius }
    };
  });
}

export const ROUNDED_ROAD_NODES = createRoundedNodes();

/**
 * Sample the exact same rounded road centreline that the Phaser Graphics
 * renderer strokes. The parameter remains the OLD number of tile lengths:
 * a circuit is still ROAD_CELLS.length * BOARD.tile for economics and physics.
 * The quadratic is time-mapped across each corner's two adjoining half-legs,
 * so both position and tangent are continuous, including the loop seam.
 */
export function roundedRoadPointAt(distance: number): RoadPoint {
  const wrapped = normalise(distance);
  const i = Math.floor(wrapped / tile);
  const fraction = wrapped - i * tile;
  const here = ROUNDED_ROAD_NODES[i];
  const next = ROUNDED_ROAD_NODES[(i + 1) % count];

  // Second half of a corner centred on cell i.
  if (here.radius > 0 && fraction < here.radius) {
    const t = (fraction + here.radius) / (2 * here.radius);
    return quadratic(here.entry, here.vertex, here.exit, t);
  }
  // First half of a corner centred on cell i+1.
  if (next.radius > 0 && fraction > tile - next.radius) {
    const t = (fraction - (tile - next.radius)) / (2 * next.radius);
    return quadratic(next.entry, next.vertex, next.exit, t);
  }
  const straight = tile - here.radius - next.radius;
  return mix(here.exit, next.entry,
    straight > 0.01 ? (fraction - here.radius) / straight : 0);
}

/** Tangent shared by road dashes, shoulder details and vehicle lane offsets. */
export function roundedRoadTangentAt(distance: number): RoadPoint {
  const halfWindow = tile * 0.045;
  const a = roundedRoadPointAt(distance - halfWindow);
  const b = roundedRoadPointAt(distance + halfWindow);
  const dx = b.x - a.x, dy = b.y - a.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  return {x: dx / magnitude, y: dy / magnitude};
}
