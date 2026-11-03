import { manhattanDistance, type Cell } from './config';
import { SeededRandom } from './environment';
import { moodNeighbourHelpChance } from './mood';

/**
 * Pass 6D: a little shared history, never an extra reward generator.
 *
 * Requests originate only from actual incidents or activities. A family can
 * respond when its car later DRIVES PAST the site, not by teleporting across
 * the board. The store checks the physical target before applying anything.
 */
export type NeighbourStoryKind = 'accident' | 'litter' | 'sketch';
export type NeighbourResponseKind =
  | 'ward-visit' | 'hale-restore' | 'marsh-clean' | 'marsh-admire';
export type NeighbourNoteKind = NeighbourStoryKind | NeighbourResponseKind;

export interface NeighbourNote {
  id: number;
  storyId: number;
  kind: NeighbourNoteKind;
  sourceResidentId: number;
  actorId: number;
  cell: Cell;
  time: number;
  message: string;
}
export interface NeighbourRequest {
  id: number;
  storyId: number;
  kind: NeighbourResponseKind;
  sourceResidentId: number;
  actorId: number;
  roadCell: Cell;
  target: Cell;
  incidentId?: number;
  effectId?: number;
  createdAt: number;
  expiresAt: number;
}
export const MAX_NEIGHBOUR_NOTES = 18;
export const MAX_NEIGHBOUR_REQUESTS = 9;
export const NEIGHBOUR_RESPONSE_COOLDOWN = 64;
export const NEIGHBOUR_RESPONSE_DISTANCE = 1;
export const NEIGHBOUR_MIN_REACTION_SECONDS = 2;
export const NEIGHBOUR_HELP_PROBABILITIES: Readonly<Record<NeighbourResponseKind,number>> = {
  'ward-visit': .46,
  'hale-restore': .19,
  'marsh-clean': .28,
  'marsh-admire': .32
};
const lifetimes: Readonly<Record<NeighbourResponseKind,number>> = {
  'ward-visit': 54,
  'hale-restore': 150,
  'marsh-clean': 130,
  'marsh-admire': 110
};
const same = (a: Cell,b:Cell):boolean=>a.x===b.x&&a.y===b.y;
const copy = (cell: Cell):Cell=>({x:cell.x,y:cell.y});

export class NeighbourhoodStories {
  readonly rng: SeededRandom;
  readonly pending: NeighbourRequest[] = [];
  readonly history: NeighbourNote[] = [];
  revision = 0;
  private nextId = 1;
  private nextStoryId = 1;
  private nextNoteId = 1;
  private lastResponseByActor = new Map<number,number>();

  constructor(seed: number) {
    this.rng = new SeededRandom((seed ^ 0x534f4349) >>> 0);
  }

  begin(kind: NeighbourStoryKind, sourceResidentId:number,
    cell:Cell, now:number, message:string):number {
    const storyId = this.nextStoryId++;
    this.note(storyId,kind,sourceResidentId,sourceResidentId,cell,now,message);
    return storyId;
  }

  request(storyId:number, kind:NeighbourResponseKind, sourceResidentId:number,
    roadCell:Cell, target:Cell, now:number,
    reference: {incidentId?:number;effectId?:number} = {}):NeighbourRequest|null {
    if(this.pending.length>=MAX_NEIGHBOUR_REQUESTS ||
      this.pending.some(request=>request.kind===kind && same(request.target,target)))
      return null;
    const actorId = kind==='ward-visit'?5:kind==='hale-restore'?4:3;
    const request:NeighbourRequest={
      id:this.nextId++,storyId,kind,sourceResidentId,actorId,
      roadCell:copy(roadCell),target:copy(target),
      incidentId:reference.incidentId,effectId:reference.effectId,
      createdAt:now,expiresAt:now+lifetimes[kind]
    };
    this.pending.push(request);
    this.revision++;
    return request;
  }

  /** Return at most one possible response per actual passing road tile.
   * This does not mutate an intent; its physical target is verified by
   * GameStore before completing it. */
  candidate(
    residentId:number,roadCell:Cell,now:number,actorIrritation=50
  ):NeighbourRequest|null {
    if(now-(this.lastResponseByActor.get(residentId)??-Infinity) <
       NEIGHBOUR_RESPONSE_COOLDOWN)return null;
    const options=this.pending.filter(task=>task.actorId===residentId &&
      task.expiresAt>now &&
      now-task.createdAt>=NEIGHBOUR_MIN_REACTION_SECONDS &&
      manhattanDistance(task.roadCell,roadCell)<=NEIGHBOUR_RESPONSE_DISTANCE);
    if(!options.length)return null;
    options.sort((a,b)=>a.createdAt-b.createdAt||a.id-b.id);
    const target=options[0];
    // A calm neighbour is more willing to stop and lend a hand; a
    // frustrated one may pass by. Neither receives an extra event roll,
    // and even a very irritated resident still sometimes helps.
    const chance=moodNeighbourHelpChance(
      NEIGHBOUR_HELP_PROBABILITIES[target.kind],actorIrritation);
    return this.rng.next()<chance ? target:null;
  }

  complete(task:NeighbourRequest, now:number, message:string):NeighbourNote|null {
    const index=this.pending.findIndex(row=>row.id===task.id);
    if(index<0)return null;
    this.pending.splice(index,1);
    this.lastResponseByActor.set(task.actorId,now);
    return this.note(task.storyId,task.kind,task.sourceResidentId,
      task.actorId,task.target,now,message);
  }

  /** An ordinary scheduled family activity may fulfil the same real need.
   * It records the link without granting an additional game action. */
  completeMatching(kind:NeighbourResponseKind,cell:Cell,now:number,
    message:string):NeighbourNote|null {
    const task=this.pending.find(item=>item.kind===kind&&same(item.target,cell));
    return task ? this.complete(task,now,message):null;
  }

  /** A bought repair or paid cleanup can make a pending visit unnecessary. */
  cancel(kind:NeighbourResponseKind, cell:Cell):boolean {
    const before=this.pending.length;
    for(let index=this.pending.length-1;index>=0;index--){
      if(this.pending[index].kind===kind&&same(this.pending[index].target,cell))
        this.pending.splice(index,1);
    }
    if(before!==this.pending.length)this.revision++;
    return before!==this.pending.length;
  }

  discard(id:number):void {
    const index=this.pending.findIndex(row=>row.id===id);
    if(index>=0){this.pending.splice(index,1);this.revision++;}
  }
  tick(now:number):boolean {
    const before=this.pending.length;
    for(let index=this.pending.length-1;index>=0;index--){
      if(this.pending[index].expiresAt<=now)this.pending.splice(index,1);
    }
    if(before!==this.pending.length)this.revision++;
    return before!==this.pending.length;
  }
  clearPending():void {
    if(!this.pending.length)return;
    this.pending.length=0;this.revision++;
  }

  /** Notes are capped and belong only to the present generation. */
  private note(storyId:number,kind:NeighbourNoteKind,sourceResidentId:number,
    actorId:number,cell:Cell,now:number,message:string):NeighbourNote {
    const note:NeighbourNote={
      id:this.nextNoteId++,storyId,kind,sourceResidentId,actorId,
      cell:copy(cell),time:now,message
    };
    this.history.unshift(note);
    if(this.history.length>MAX_NEIGHBOUR_NOTES)
      this.history.length=MAX_NEIGHBOUR_NOTES;
    this.revision++;
    return note;
  }
  notesForResident(residentId:number):NeighbourNote[] {
    return this.history.filter(note=>
      note.sourceResidentId===residentId||note.actorId===residentId);
  }
  notesNear(cell:Cell):NeighbourNote[] {
    return this.history.filter(note=>manhattanDistance(note.cell,cell)<=2);
  }
}
