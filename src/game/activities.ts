import {
  HOMES, isOnBoard, isRoad, isScenery, manhattanDistance, type Cell, type ModelId
} from './config';
import { SeededRandom, type EnvironmentKind } from './environment';

export type ActivityKind =
  | 'explore' | 'sketch' | 'delivery' | 'working-lunch'
  | 'picnic' | 'gathering' | 'heritage-visit' | 'safety-round';
export type ActivityPhase = 'setting-up' | 'underway' | 'packing-up';
export type ActivityOutcome = 'clean' | 'litter' | 'captured' | 'overflow' | 'none';

export interface ActivityDefinition {
  kind: ActivityKind;
  residentId: number;
  tone: 'helpful' | 'troublesome';
  title: string;
  description: string;
  started: string;
  finished: string;
  duration: number;
  /** Real discarded scraps are only possible after food or packaging. */
  litterChance: number;
  cleanEffect?: EnvironmentKind;
}
export interface ActiveActivity {
  id: number;
  kind: ActivityKind;
  residentId: number;
  roadCell: Cell;
  cell: Cell;
  phase: ActivityPhase;
  startedAt: number;
  endsAt: number;
  litterChance: number;
}
export interface ActivityCompletion {
  activity: ActiveActivity;
  leavesLitter: boolean;
}
export interface ActivityLog {
  id: number;
  kind: ActivityKind;
  residentId: number;
  cell: Cell;
  roadCell: Cell;
  time: number;
  stage: 'started' | 'finished';
  outcome?: ActivityOutcome;
  message: string;
}

export const MAX_ACTIVE_ACTIVITIES = 3;
export const ACTIVITY_COOLDOWN_SECONDS = 42;
export const ACTIVITY_HISTORY_LIMIT = 12;
export const ACTIVITY_SELECTION_CHANCE = 0.40;

/**
 * These are activities, not free rewards. Each starts next to the road,
 * lasts for several simulated seconds, and has a visible setup/ongoing/
 * packing phase. Only picnics, meals and deliveries can leave litter.
 */
export const ACTIVITY_DEFINITIONS: readonly ActivityDefinition[] = [
  {
    kind: 'explore', residentId: 0, tone: 'helpful',
    title: 'A roadside exploration',
    description: 'The Finches stop to explore a new corner of the loop.',
    started: 'The Finches have pulled over to look for an interesting route.',
    finished: 'The Finches have found a little-known way through the bend.',
    duration: 8, litterChance: 0, cleanEffect: 'courtesy'
  },
  {
    kind: 'sketch', residentId: 1, tone: 'helpful',
    title: 'Sketching the scenery',
    description: 'The Bells unfold a small easel and sketch the street.',
    started: 'The Bells have set up a little easel to sketch the street.',
    finished: 'The Bells leave a little framed sketch beside the road.',
    duration: 11, litterChance: 0, cleanEffect: 'sketch'
  },
  {
    kind: 'delivery', residentId: 2, tone: 'helpful',
    title: 'A local delivery',
    description: 'The Millers unload a few parcels and take away the wrapping.',
    started: 'The Millers have pulled over to unload a few parcels.',
    finished: 'The Millers have finished the delivery and packed up.',
    duration: 9, litterChance: .18
  },
  {
    kind: 'working-lunch', residentId: 2, tone: 'troublesome',
    title: 'A hurried working lunch',
    description: 'The Millers break for lunch between deliveries; wrappers may be forgotten.',
    started: 'The Millers have stopped for a quick lunch between deliveries.',
    finished: 'The Millers have finished their lunch and packed up.',
    duration: 8, litterChance: .42
  },
  {
    kind: 'picnic', residentId: 3, tone: 'helpful',
    title: 'A Sunday picnic',
    description: 'The Marshes spread a blanket and share food beside the road.',
    started: 'The Marshes have laid out a blanket for a Sunday picnic.',
    finished: 'The Marshes have packed away the picnic and tidied the grass.',
    duration: 13, litterChance: .20, cleanEffect: 'tidied'
  },
  {
    kind: 'gathering', residentId: 3, tone: 'troublesome',
    title: 'A neighbourhood gathering',
    description: 'The Marshes gather friends for a roadside conversation.',
    started: 'The Marshes have invited neighbours over for a little gathering.',
    finished: 'The neighbours have gone on their way; the Marshes tidied up.',
    duration: 11, litterChance: .12, cleanEffect: 'tidied'
  },
  {
    kind: 'heritage-visit', residentId: 4, tone: 'helpful',
    title: 'Caring for an old landmark',
    description: 'The Hales pause to clean and tend a familiar detail.',
    started: 'The Hales have stopped to tend a familiar little landmark.',
    finished: 'The Hales have carefully restored an old roadside detail.',
    duration: 10, litterChance: 0, cleanEffect: 'heritage'
  },
  {
    kind: 'safety-round', residentId: 5, tone: 'helpful',
    title: 'Checking a difficult corner',
    description: 'The Wards inspect visibility and mark a safer way through.',
    started: 'The Wards have stepped out to inspect the sightline at a corner.',
    finished: 'The Wards have marked a safer way through the corner.',
    duration: 8, litterChance: 0, cleanEffect: 'guidance'
  }
];
export const activityDefinition = (kind: ActivityKind): ActivityDefinition => {
  const definition = ACTIVITY_DEFINITIONS.find(activity => activity.kind === kind);
  if (!definition) throw new Error('Unknown activity: ' + kind);
  return definition;
};
export const activityOptionsFor = (residentId: number): readonly ActivityDefinition[] =>
  ACTIVITY_DEFINITIONS.filter(activity => activity.residentId === residentId);

const neighbourCells = (road: Cell): Cell[] => [
  { x: road.x - 1, y: road.y }, { x: road.x + 1, y: road.y },
  { x: road.x, y: road.y - 1 }, { x: road.x, y: road.y + 1 }
];
const overlaps = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

/**
 * Independent seed means activities and their cleanup decisions are
 * reproducible without altering the existing environment RNG sequence.
 * This engine intentionally does not award coins or generate random effects
 * on its own: GameStore performs all real effects via LivingEnvironment.
 */
export class ActivityEngine {
  readonly rng: SeededRandom;
  readonly active: ActiveActivity[] = [];
  readonly history: ActivityLog[] = [];
  revision = 0;
  private nextId = 1;
  private lastStartedAt = new Map<number, number>();

  constructor(seed: number) {
    this.rng = new SeededRandom((seed ^ 0x41435456) >>> 0);
  }
  forResident(residentId: number): ActiveActivity | null {
    return this.active.find(activity => activity.residentId === residentId) ?? null;
  }
  at(cell: Cell): ActiveActivity[] {
    return this.active.filter(activity => overlaps(activity.cell, cell));
  }
  nearby(cell: Cell, radius = 1): ActiveActivity[] {
    return this.active.filter(activity => manhattanDistance(activity.cell, cell) <= radius);
  }
  isOccupied(cell: Cell): boolean {
    return this.at(cell).length > 0;
  }
  /** Prefer benches/trees for social visits; leave actual occupied squares clear. */
  private siteFor(
    kind: ActivityKind, road: Cell, blocked: readonly Cell[],
    models: readonly (Cell & {id: ModelId})[]
  ): Cell | null {
    const candidates = neighbourCells(road).filter(cell =>
      isOnBoard(cell.x, cell.y) && !isRoad(cell.x, cell.y) &&
      !isScenery(cell.x, cell.y) &&
      !HOMES.some(home => overlaps(home, cell)) &&
      !blocked.some(item => overlaps(item, cell)) &&
      !this.active.some(other => manhattanDistance(other.cell, cell) < 2)
    );
    if (!candidates.length) return null;
    const prefersSeat = kind === 'picnic' || kind === 'gathering' || kind === 'sketch';
    const prefersHeritage = kind === 'heritage-visit';
    const score = (cell: Cell): number => models.reduce((total, item) => {
      if (manhattanDistance(cell, item) > 2) return total;
      if (prefersSeat && (item.id === 'bench' || item.id === 'tree')) return total + 2;
      if (prefersHeritage && (item.id === 'lamp' || item.id === 'bench')) return total + 2;
      return total;
    }, 0);
    const best = Math.max(...candidates.map(score));
    const eligible = candidates.filter(cell => score(cell) === best);
    return { ...eligible[this.rng.int(eligible.length)] };
  }
  start(
    kind: ActivityKind, residentId: number, road: Cell, now: number,
    blocked: readonly Cell[], models: readonly (Cell & {id: ModelId})[],
    litterChance?: number
  ): ActiveActivity | null {
    const definition = activityDefinition(kind);
    if (!Number.isFinite(now) || !isRoad(road.x, road.y) ||
      definition.residentId !== residentId || this.active.length >= MAX_ACTIVE_ACTIVITIES ||
      this.forResident(residentId) ||
      now - (this.lastStartedAt.get(residentId) ?? -Infinity) < ACTIVITY_COOLDOWN_SECONDS) {
      return null;
    }
    const cell = this.siteFor(kind, road, blocked, models);
    if (!cell) return null;
    const activity: ActiveActivity = {
      id: this.nextId++, kind, residentId, roadCell: { ...road },
      cell, phase: 'setting-up', startedAt: now,
      endsAt: now + definition.duration,
      litterChance: Math.max(0, Math.min(1, litterChance ?? definition.litterChance))
    };
    this.active.push(activity);
    this.lastStartedAt.set(residentId, now);
    this.history.unshift({
      id: activity.id, kind, residentId, cell: { ...cell }, roadCell: { ...road },
      time: now, stage: 'started', message: definition.started
    });
    if (this.history.length > ACTIVITY_HISTORY_LIMIT) this.history.length = ACTIVITY_HISTORY_LIMIT;
    this.revision++;
    return activity;
  }
  tick(now: number): { changed: boolean; completed: ActivityCompletion[] } {
    let changed = false;
    const completed: ActivityCompletion[] = [];
    for (let i = this.active.length - 1; i >= 0; i--) {
      const activity = this.active[i];
      const definition = activityDefinition(activity.kind);
      if (now >= activity.endsAt) {
        completed.push({
          activity: { ...activity },
          leavesLitter: this.rng.next() < activity.litterChance
        });
        this.active.splice(i, 1);
        changed = true;
        continue;
      }
      const progress = (now - activity.startedAt) / definition.duration;
      const phase: ActivityPhase =
        progress < .2 ? 'setting-up' : progress < .8 ? 'underway' : 'packing-up';
      if (activity.phase !== phase) {
        activity.phase = phase;
        changed = true;
      }
    }
    if (changed) this.revision++;
    return { changed, completed: completed.reverse() };
  }
  recordCompletion(activity: ActiveActivity, time: number, outcome: ActivityOutcome,
    message: string): void {
    this.history.unshift({
      id: activity.id, kind: activity.kind, residentId: activity.residentId,
      cell: { ...activity.cell }, roadCell: { ...activity.roadCell },
      time, stage: 'finished', outcome, message
    });
    if (this.history.length > ACTIVITY_HISTORY_LIMIT) this.history.length = ACTIVITY_HISTORY_LIMIT;
    this.revision++;
  }
  cancelResident(residentId: number): void {
    const index = this.active.findIndex(activity => activity.residentId === residentId);
    if (index < 0) return;
    this.active.splice(index, 1);
    this.revision++;
  }
  cancelAll(): void {
    if (!this.active.length) return;
    this.active.length = 0;
    this.revision++;
  }
  modifiersAt(cell: Cell): { beauty: number; noise: number; irritation: number } {
    const modifiers = { beauty: 0, noise: 0, irritation: 0 };
    for (const activity of this.nearby(cell, 2)) {
      if (activity.kind === 'picnic' || activity.kind === 'gathering') {
        modifiers.beauty += 1;
        modifiers.noise += activity.kind === 'gathering' ? 1 : 0;
        modifiers.irritation -= .07;
      } else if (activity.kind === 'sketch' || activity.kind === 'heritage-visit') {
        modifiers.beauty += 1; modifiers.irritation -= .04;
      } else if (activity.kind === 'delivery') {
        modifiers.noise += 1; modifiers.irritation += .04;
      } else if (activity.kind === 'working-lunch') {
        modifiers.irritation += .02;
      } else if (activity.kind === 'safety-round') {
        modifiers.irritation -= .05;
      }
    }
    return modifiers;
  }
  slowdownAt(cell: Cell): number {
    return this.active.some(activity =>
      (activity.kind === 'delivery' || activity.kind === 'gathering') &&
      manhattanDistance(activity.roadCell, cell) <= 1) ? .82 : 1;
  }
}
