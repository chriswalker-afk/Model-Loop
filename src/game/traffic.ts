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

// Pure, deterministic traffic lifecycle. Every payout requires a complete
// circuit, followed by a visible trip to the house and a short stay there.
// Returning/departing don't count as road travel or produce further payouts.
export function stepCarCycle(
  car: CarCycle,
  gameSeconds: number,
  travelDistance: number,
  roadLength: number
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
    car.phase = 'departing';
    car.timer = 0;
  } else if (car.phase === 'departing' && car.timer >= HOME_TRAVEL_SECONDS) {
    car.phase = 'driving';
    car.distance = 0;
    car.timer = 0;
  }
  return false;
}
