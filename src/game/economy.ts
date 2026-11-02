import { MODELS, type ModelId } from './config';

export type CareLevel = 'full' | 'economy' | 'bare';
export const UPKEEP_INTERVAL_SECONDS = 20;
export const FLOW_WINDOW_SECONDS = 60;
export const CARE_LEVELS: readonly CareLevel[] = ['full', 'economy', 'bare'];

export interface ModelEffects {
  beauty: number;
  noise: number;
  crime: number;
  comfort: number;
  upkeep: number;
  speedMultiplier: number;
}

export interface Cashflow {
  gross: number;
  upkeep: number;
  net: number;
  nextUpkeep: number;
  maintainedModels: number;
}

export interface CashflowEvent {
  at: number;
  amount: number;
  category: 'lap' | 'upkeep';
}

const PENALTIES: Record<CareLevel, {
  beauty: number; noise: number; crime: number; comfort: number; preferenceScale: number;
}> = {
  full: { beauty: 0, noise: 0, crime: 0, comfort: 0, preferenceScale: 1 },
  economy: { beauty: -1, noise: 1, crime: 1, comfort: 0.22, preferenceScale: 0.6 },
  bare: { beauty: -2, noise: 2, crime: 2, comfort: 0.62, preferenceScale: 0.2 }
};

export function normalizedCare(level?: CareLevel): CareLevel {
  return level === 'economy' || level === 'bare' ? level : 'full';
}

export function careName(level: CareLevel): string {
  return level === 'full' ? 'Well cared for' :
    level === 'economy' ? 'Economy care' : 'Minimal care';
}

export function careDescription(level: CareLevel): string {
  if (level === 'full') return 'Everything kept in working order.';
  if (level === 'economy') return 'Lower bills, some wear and weaker benefits.';
  return 'No regular upkeep, but visible neglect and reduced protection.';
}

export function carePreferenceScale(level: CareLevel): number {
  return PENALTIES[level].preferenceScale;
}

export function modelEffects(id: ModelId, level: CareLevel = 'full'): ModelEffects {
  const base = MODELS.find(item => item.id === id);
  if (!base) throw new Error('Unknown model: ' + id);
  const care = normalizedCare(level);
  const loss = PENALTIES[care];
  return {
    beauty: base.beauty + loss.beauty,
    noise: base.noise + loss.noise,
    crime: base.crime + loss.crime,
    comfort: base.comfort + loss.comfort,
    upkeep: care === 'full' ? base.upkeep :
      care === 'economy' ? Math.ceil(base.upkeep / 2) : 0,
    // The driver obeys a clearly maintained sign. Faded signs are less effective.
    speedMultiplier: id === 'limit'
      ? care === 'full' ? 0.58 : care === 'economy' ? 0.76 : 0.95
      : 1
  };
}

export function summarizeFlow(events: readonly CashflowEvent[], now: number, nextUpkeep: number, maintainedModels: number): Cashflow {
  const recent = events.filter(event => event.at > now - FLOW_WINDOW_SECONDS);
  const gross = recent.filter(event => event.category === 'lap')
    .reduce((sum, event) => sum + event.amount, 0);
  const upkeep = recent.filter(event => event.category === 'upkeep')
    .reduce((sum, event) => sum - event.amount, 0);
  return { gross, upkeep, net: gross - upkeep, nextUpkeep, maintainedModels };
}
