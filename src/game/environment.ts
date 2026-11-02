import {
  HOMES, isOnBoard, isRoad, isScenery, manhattanDistance,
  type Cell
} from './config';

/** Persistent visual consequences, with a litter interception hook for collection. */
export type EnvironmentKind =
  | 'litter' | 'flowers' | 'skid' | 'courtesy' | 'mended'
  | 'tidied' | 'heritage' | 'display' | 'guidance' | 'sketch';
export type EnvironmentTone = 'helpful' | 'troublesome';

export interface EnvironmentalEffect {
  id: number;
  kind: EnvironmentKind;
  cell: Cell;
  residentId: number;
  createdAt: number;
  expiresAt: number;
}
export interface EnvironmentalEvent {
  effectId: number;
  kind: EnvironmentKind;
  tone: EnvironmentTone;
  residentId: number;
  cell: Cell;
  time: number;
  message: string;
  /** A captured wrapper never creates a roadside effect; a full bin does. */
  outcome?: 'captured' | 'overflow';
  bin?: Cell;
}
export interface LitterDiversion {
  status: 'captured' | 'overflow';
  bin: Cell;
}
export type LitterInterceptor = (
  roadCell: Cell, residentId: number, now: number
) => LitterDiversion | null;
interface ActionRule {
  residentId: number;
  kind: EnvironmentKind;
  tone: EnvironmentTone;
  cooldownSeconds: number;
}
const ACTIONS: readonly ActionRule[] = [
  { residentId: 0, kind: 'skid', tone: 'troublesome', cooldownSeconds: 45 },
  { residentId: 1, kind: 'flowers', tone: 'helpful', cooldownSeconds: 45 },
  { residentId: 2, kind: 'litter', tone: 'troublesome', cooldownSeconds: 45 }
];

// The original Pass 1 direct environment-attempt API remains for older tests;
// gameplay uses the unified 12-action HouseholdBehaviourEngine in Pass 4.
export const EFFECT_LIFETIME: Readonly<Record<EnvironmentKind, number>> = {
  litter: 100, flowers: 75, skid: 55, courtesy: 38, mended: 90,
  tidied: 70, heritage: 95, display: 65, guidance: 42, sketch: 75
};
export const MAX_ENVIRONMENT_EFFECTS = 16;
export const MAX_EFFECTS_PER_CELL = 2;
export const MAX_EFFECTS_BY_KIND: Readonly<Record<EnvironmentKind, number>> = {
  litter: 6, flowers: 6, skid: 3, courtesy: 3, mended: 3,
  tidied: 4, heritage: 4, display: 3, guidance: 3, sketch: 3
};
export const ENVIRONMENT_EVENT_CHANCE = 0.35;
const MAX_HISTORY = 8;

const noteFor = (kind: EnvironmentKind, residentId: number): string => {
  const family = HOMES.find(home => home.id === residentId)?.name ?? 'A resident';
  const descriptions: Record<EnvironmentKind,string> = {
    litter: 'left some packaging by the road.',
    flowers: 'added flowers to a roadside corner.',
    skid: 'left tyre marks after taking a bend rather sharply.',
    courtesy: 'found a clearer line through the bend.',
    mended: 'smoothed a worn piece of road.',
    tidied: 'tidied the verge.',
    heritage: 'restored an old roadside detail.',
    display: 'put out a small display beside the road.',
    guidance: 'helped the cars through a difficult corner.',
    sketch: 'left a little framed drawing for their neighbours.'
  };
  return family + ' ' + descriptions[kind];
};

const EFFECT_LABELS: Readonly<Record<EnvironmentKind,string>> = {
  litter:'Discarded packaging', flowers:'Roadside flowers', skid:'Tyre scuffs',
  courtesy:'A clearer route', mended:'A mended road', tidied:'Freshly tidied verge',
  heritage:'Restored roadside detail', display:'Roadside display', guidance:'Helpful directions',
  sketch:'A little streetside sketch'
};
const HELPFUL_EFFECTS: readonly EnvironmentKind[] =
  ['flowers','courtesy','mended','tidied','heritage','guidance','sketch'];
const ROAD_EFFECTS: readonly EnvironmentKind[] =
  ['skid','courtesy','mended','guidance'];
export const environmentLabel = (kind: EnvironmentKind): string => EFFECT_LABELS[kind];

/** Small seedable generator. Never uses per-render Math.random(). */
export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = (Number.isFinite(seed) ? seed : 1) >>> 0;
    if (!this.state) this.state = 0x6d2b79f5;
  }
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  int(max: number): number {
    return Math.floor(this.next() * Math.max(1, max));
  }
}

export interface EnvironmentalModifiers {
  beauty: number;
  noise: number;
  irritation: number;
}

/** The independent, serialisable in-run environment engine. */
export class LivingEnvironment {
  readonly rng: SeededRandom;
  readonly effects: EnvironmentalEffect[] = [];
  readonly history: EnvironmentalEvent[] = [];
  private nextId = 1;
  private lastActionAt = new Map<number, number>();
  revision = 0;

  constructor(readonly seed: number) {
    this.rng = new SeededRandom(seed);
  }

  /** One reproducible opportunity location per household circuit. */
  opportunityOffset(roadLength: number): number {
    return 5 + this.rng.int(Math.max(1, roadLength - 10));
  }

  tick(now: number): boolean {
    const oldLength = this.effects.length;
    for (let index = this.effects.length - 1; index >= 0; index--) {
      if (this.effects[index].expiresAt <= now) this.effects.splice(index, 1);
    }
    if (oldLength !== this.effects.length) this.revision++;
    return oldLength !== this.effects.length;
  }

  /** Removes one physical roadside patch without erasing its history. */
  removeEffect(id: number, kind: EnvironmentKind): boolean {
    const index = this.effects.findIndex(effect => effect.id === id && effect.kind === kind);
    if (index < 0) return false;
    this.effects.splice(index, 1);
    this.revision++;
    return true;
  }

  /** Deterministic, single-item cleaning or repair, only after a helpful act succeeds. */
  removeNearby(kind:EnvironmentKind,cell:Cell,radius=2):EnvironmentalEffect|null {
    const candidate=this.effects
      .filter(effect=>effect.kind===kind && manhattanDistance(effect.cell,cell)<=radius)
      .sort((a,b)=>manhattanDistance(a.cell,cell)-manhattanDistance(b.cell,cell) ||
        a.id-b.id)[0];
    if(!candidate)return null;
    this.removeEffect(candidate.id,kind);
    return candidate;
  }

  at(cell: Cell, radius = 1): EnvironmentalEffect[] {
    return this.effects.filter(effect => manhattanDistance(effect.cell, cell) <= radius);
  }

  modifiersAt(cell: Cell): EnvironmentalModifiers {
    const result: EnvironmentalModifiers = { beauty: 0, noise: 0, irritation: 0 };
    for (const effect of this.at(cell)) {
      if (effect.kind === 'litter') {
        result.beauty -= 1;
        result.irritation += 0.1;
      } else if (effect.kind === 'flowers') {
        result.beauty += 2;
        result.irritation -= 0.08;
      } else if (effect.kind === 'skid' && isRoad(cell.x, cell.y)) {
        result.noise += 1;
        result.irritation += 0.2;
      } else if (effect.kind === 'courtesy') {
        result.irritation -= 0.12;
      } else if (effect.kind === 'mended') {
        result.noise -= 1;
        result.irritation -= 0.12;
      } else if (effect.kind === 'tidied') {
        result.beauty += 1;
        result.irritation -= 0.08;
      } else if (effect.kind === 'heritage') {
        result.beauty += 2;
        result.irritation -= 0.07;
      } else if (effect.kind === 'sketch') {
        result.beauty += 1;
        result.irritation -= 0.06;
      } else if (effect.kind === 'display') {
        result.noise += 1;
        result.irritation += 0.14;
      } else if (effect.kind === 'guidance') {
        result.noise -= 1;
        result.irritation -= 0.16;
      }
    }
    return result;
  }

  /** This metric is based on physical hazards, never resident irritation. */
  /** Hales' displays can slow real cars and create genuine queues. */
  slowdownAt(roadCell:Cell):number {
    return this.effects.some(effect=>effect.kind==='display'
      && manhattanDistance(effect.cell,roadCell)<=2)?0.70:1;
  }

  get hazardPenalty(): number {
    return this.effects.reduce((sum, effect) => sum +
      (effect.kind === 'skid' ? 12 :
        effect.kind === 'mended' || effect.kind === 'guidance' ? -3 : 0), 0);
  }

  /**
   * A caller ensures this is used no more than once per household circuit.
   * Mood changes the weight without guaranteeing that happy drivers are perfect.
   */
  attempt(
    residentId: number, irritation: number, roadCell: Cell, now: number,
    blocked: readonly Cell[], intercept?: LitterInterceptor
  ): EnvironmentalEvent | null {
    // Small incidental rubbish events are possible for any household, while
    // the Millers remain the specialists. Full positive/negative pairs await Pass 4.
    const usual = ACTIONS.find(action => action.residentId === residentId);
    const incidentalLitter = residentId !== 2 && this.rng.next() < 0.12;
    const rule: ActionRule | undefined = incidentalLitter
      ? { residentId, kind: 'litter', tone: 'troublesome', cooldownSeconds: 45 }
      : usual;
    if (!rule || !isRoad(roadCell.x, roadCell.y)) return null;
    const since = now - (this.lastActionAt.get(residentId) ?? -Infinity);
    if (since < rule.cooldownSeconds) return null;
    const moodScale = rule.tone === 'helpful'
      ? (irritation < 45 ? 1.15 : irritation >= 72 ? 0.65 : 1)
      : (irritation < 45 ? 0.8 : irritation >= 72 ? 1.5 : 1);
    if (this.rng.next() >= Math.min(0.8, ENVIRONMENT_EVENT_CHANCE * moodScale)) return null;
    return this.spawn(rule.kind, residentId, roadCell, now, blocked, intercept);
  }

  /** Explicit, reproducible trigger for automated tests and DEV-only tools. */
  force(kind: EnvironmentKind, residentId: number, roadCell: Cell, now: number,
    blocked: readonly Cell[] = [], intercept?: LitterInterceptor,
    preferredCell?: Cell): EnvironmentalEvent | null {
    return this.spawn(kind, residentId, roadCell, now, blocked, intercept, preferredCell);
  }

  private noteLitter(
    residentId: number, now: number, diversion: LitterDiversion
  ): EnvironmentalEvent {
    const family = HOMES.find(home => home.id === residentId)!.name;
    const event: EnvironmentalEvent = {
      effectId: this.nextId++,
      kind: 'litter', residentId, cell: { ...diversion.bin },
      bin: { ...diversion.bin }, time: now,
      tone: diversion.status === 'captured' ? 'helpful' : 'troublesome',
      outcome: diversion.status,
      message: diversion.status === 'captured'
        ? family + ' put packaging into a roadside rubbish bin.'
        : 'The rubbish bin is overflowing; ' + family + ' left packaging nearby.'
    };
    this.lastActionAt.set(residentId, now);
    this.history.unshift(event);
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
    return event;
  }

  private spawn(kind: EnvironmentKind, residentId: number, roadCell: Cell, now: number,
    blocked: readonly Cell[], intercept?: LitterInterceptor,
    preferredCell?: Cell): EnvironmentalEvent | null {
    if (!HOMES.some(home => home.id === residentId) || !isRoad(roadCell.x, roadCell.y)) return null;
    const diversion = kind === 'litter' ? intercept?.(roadCell, residentId, now) : null;
    if (diversion?.status === 'captured') return this.noteLitter(residentId, now, diversion);

    if (this.effects.length >= MAX_ENVIRONMENT_EFFECTS
      || this.effects.filter(effect => effect.kind === kind).length >= MAX_EFFECTS_BY_KIND[kind]) {
      // Even at the sprite cap, overflow is recorded and stays visible on the bin.
      return diversion?.status === 'overflow'
        ? this.noteLitter(residentId, now, diversion) : null;
    }

    let cell = roadCell;
    if (!ROAD_EFFECTS.includes(kind)) {
      const neighbours: Cell[] = [
        { x: roadCell.x - 1, y: roadCell.y }, { x: roadCell.x + 1, y: roadCell.y },
        { x: roadCell.x, y: roadCell.y - 1 }, { x: roadCell.x, y: roadCell.y + 1 }
      ];
      const available = neighbours.filter(candidate =>
        isOnBoard(candidate.x, candidate.y) && !isRoad(candidate.x, candidate.y)
        && !isScenery(candidate.x, candidate.y)
        && !HOMES.some(home => home.x === candidate.x && home.y === candidate.y)
        && !blocked.some(model => model.x === candidate.x && model.y === candidate.y)
        && this.effects.filter(effect =>
          effect.cell.x === candidate.x && effect.cell.y === candidate.y).length < MAX_EFFECTS_PER_CELL
        && !this.effects.some(effect => effect.kind === kind &&
          effect.cell.x === candidate.x && effect.cell.y === candidate.y)
      );
      if (available.length === 0) return diversion?.status === 'overflow'
        ? this.noteLitter(residentId, now, diversion) : null;
      const preferred = preferredCell && available.find(candidate =>
        candidate.x === preferredCell.x && candidate.y === preferredCell.y);
      cell = preferred ?? available[this.rng.int(available.length)];
    } else if (this.effects.some(effect => effect.kind === kind
      && effect.cell.x === cell.x && effect.cell.y === cell.y)) {
      return null;
    }

    const effect: EnvironmentalEffect = {
      id: this.nextId++, kind, cell: { ...cell }, residentId,
      createdAt: now, expiresAt: now + EFFECT_LIFETIME[kind]
    };
    this.effects.push(effect);
    this.revision++;
    this.lastActionAt.set(residentId, now);

    const event: EnvironmentalEvent = {
      effectId: effect.id, kind, residentId, cell: { ...cell }, time: now,
      tone: HELPFUL_EFFECTS.includes(kind) ? 'helpful' : 'troublesome',
      message: diversion?.status === 'overflow'
        ? 'A full rubbish bin has overflowed. ' + noteFor(kind, residentId)
        : noteFor(kind, residentId),
      ...(diversion?.status === 'overflow' ? {
        outcome: 'overflow' as const, bin: { ...diversion.bin }
      } : {})
    };
    this.history.unshift(event);
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
    return event;
  }
}
