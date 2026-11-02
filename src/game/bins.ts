import type { Cell } from './config';
import type { CareLevel } from './economy';

export const BIN_CAPACITY = 6;
export const BIN_CATCH_RADIUS = 3; // Manhattan grid tiles from the roadside model
export const BIN_COLLECTION_FULL_SECONDS = 60;
export const BIN_COLLECTION_ECONOMY_SECONDS = 120;
export const LITTER_CLEANUP_COST = 6;

export interface BinServiceState {
  fill: number;
  overflowed: boolean;
  nextCollectionAt?: number;
}

export function binCollectionInterval(care: CareLevel): number | null {
  if (care === 'full') return BIN_COLLECTION_FULL_SECONDS;
  if (care === 'economy') return BIN_COLLECTION_ECONOMY_SECONDS;
  return null;
}

export function binCatchChance(care: CareLevel): number {
  return care === 'full' ? 1 : care === 'economy' ? 0.7 : 0.25;
}

export function collectionCost(fill: number, overflowed: boolean): number {
  const count = Math.max(0, Math.min(BIN_CAPACITY, Math.floor(fill)));
  if (count === 0 && !overflowed) return 0;
  return 4 + 2 * count + (count >= BIN_CAPACITY || overflowed ? 8 : 0);
}

export function withinBinCatchment(model: Cell, road: Cell): boolean {
  return Math.abs(model.x - road.x) + Math.abs(model.y - road.y) <= BIN_CATCH_RADIUS;
}

export function binCareDescription(care: CareLevel): string {
  if (care === 'full') return 'Reliable catch; collection every 60s, charged for what is emptied.';
  if (care === 'economy') return '70% catch; collection every 120s. May fill or overflow.';
  return '25% catch; no automatic collection. Empty it yourself.';
}
