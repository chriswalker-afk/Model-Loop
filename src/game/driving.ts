import { BOARD, HOMES, ROAD_CELLS, manhattanDistance } from './config';

/**
 * Pass 6A: a family's reason for driving is reflected in the way it actually
 * moves. Distances and velocities are WORLD pixels, not real-world mph.
 *
 * These are preferences within a shared safety model, not permissions to
 * collide. Every family still follows the same hard bumper gap, lane-change
 * reservations and clear-passing-lane checks in traffic.ts.
 */
export interface DrivingProfile {
  residentId: number;
  /** Unobstructed cruising speed before speed signs and bends. */
  cruiseSpeed: number;
  /** Multiplier applied while approaching a turn (0..1). */
  bendSpeedFactor: number;
  /** Time headway ABOVE the hard collision gap. */
  headwaySeconds: number;
  /** How much faster the driver must be than the car ahead to pass. */
  passingSpeedAdvantage: number;
  /** Passing is only considered for traffic within this distance. */
  passingLookahead: number;
  /** Clearance in front of and behind a car when changing lanes. */
  passingFrontGap: number;
  passingRearGap: number;
  /** The ordinary behaviour described to players, not a moral label. */
  roadHabit: string;
}

export const DRIVING_PROFILES: readonly DrivingProfile[] = [
  {
    residentId: 0, cruiseSpeed: 106, bendSpeedFactor: .94,
    headwaySeconds: .48, passingSpeedAdvantage: 7, passingLookahead: 165,
    passingFrontGap: 82, passingRearGap: 76,
    roadHabit: 'Prefer a lively pace, spot openings early and take bends confidently.'
  },
  {
    residentId: 1, cruiseSpeed: 82, bendSpeedFactor: .74,
    headwaySeconds: .78, passingSpeedAdvantage: 22, passingLookahead: 112,
    passingFrontGap: 117, passingRearGap: 108,
    roadHabit: 'Travel unhurriedly, notice the scenery and rarely feel a need to pass.'
  },
  {
    residentId: 2, cruiseSpeed: 101, bendSpeedFactor: .86,
    headwaySeconds: .53, passingSpeedAdvantage: 8, passingLookahead: 165,
    passingFrontGap: 88, passingRearGap: 80,
    roadHabit: 'Keep a purposeful pace and look for safe ways around slow deliveries.'
  },
  {
    residentId: 3, cruiseSpeed: 89, bendSpeedFactor: .82,
    headwaySeconds: .68, passingSpeedAdvantage: 16, passingLookahead: 125,
    passingFrontGap: 105, passingRearGap: 98,
    roadHabit: 'Take an easy pace through familiar streets, ready to greet neighbours.'
  },
  {
    residentId: 4, cruiseSpeed: 86, bendSpeedFactor: .77,
    headwaySeconds: .74, passingSpeedAdvantage: 20, passingLookahead: 115,
    passingFrontGap: 113, passingRearGap: 105,
    roadHabit: 'Keep to a steady, familiar route and leave room around old landmarks.'
  },
  {
    residentId: 5, cruiseSpeed: 80, bendSpeedFactor: .68,
    headwaySeconds: .89, passingSpeedAdvantage: 27, passingLookahead: 108,
    passingFrontGap: 138, passingRearGap: 125,
    roadHabit: 'Slow early for bends, leave a generous gap and pass only when very clear.'
  }
];

export function drivingProfile(id: number): DrivingProfile {
  const profile = DRIVING_PROFILES[id];
  if (!profile || profile.residentId !== id) throw new Error('Unknown driving profile: ' + id);
  return profile;
}

const roadIndex = (distance: number): number => {
  const length = ROAD_CELLS.length * BOARD.tile;
  return Math.floor((((distance % length) + length) % length) / BOARD.tile);
};

/** True when the direction changes immediately AFTER the current road tile. */
export function isBendApproach(index: number): boolean {
  const length = ROAD_CELLS.length;
  if (!length) return false;
  const i = ((index % length) + length) % length;
  const here = ROAD_CELLS[i];
  const next = ROAD_CELLS[(i + 1) % length];
  const after = ROAD_CELLS[(i + 2) % length];
  return next.x - here.x !== after.x - next.x ||
    next.y - here.y !== after.y - next.y;
}

/** Slow down before a turn, rather than snapping the car at the bend. */
export function bendSpeedMultiplier(distance: number, profile: DrivingProfile): number {
  return isBendApproach(roadIndex(distance)) ? profile.bendSpeedFactor : 1;
}

/**
 * For the Finches and Wards, their corner-based habits occur at real bends.
 * Offsets are relative to each home driveway, matching the existing lap
 * opportunity system. Keep a little breathing room at either end of a lap.
 */
export function bendOpportunityOffsets(residentId: number): number[] {
  const home = HOMES[residentId];
  if (!home) return [];
  const length = ROAD_CELLS.length;
  const startIndex = ROAD_CELLS.findIndex(cell => manhattanDistance(cell, home) === 1);
  if (startIndex < 0) return [];
  return ROAD_CELLS.flatMap((_, index) =>
    isBendApproach(index) ? [(index - startIndex + length) % length] : []
  ).filter(offset => offset >= 5 && offset < length - 10);
}
