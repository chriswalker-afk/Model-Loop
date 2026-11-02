import type { ModelId } from './config';
import type { RunLedger } from './balance';

export interface WorkshopMoment {
  milestone: 1 | 2 | 3;
  motif: 'clearing' | 'road' | 'repair' | 'making' | 'absence' | 'coins' | 'ordinary';
  line: string;
}
export interface WorkshopContext {
  milestone: 1 | 2 | 3;
  ledger: Readonly<RunLedger>;
  models: readonly ModelId[];
  closedHomes: number;
  coins: number;
}

/**
 * A reflection on what the *player actually did*, never a diagnosis of the
 * residents or of father/son relationships. One quiet scene per milestone;
 * there are no bonuses for farming damage or repetitive repairs.
 */
export function chooseWorkshopMoment({
  milestone, ledger, models, closedHomes, coins
}: WorkshopContext): WorkshopMoment {
  const motif: WorkshopMoment['motif'] =
    closedHomes >= 2 ? 'absence' :
    ledger.litterCaught + ledger.manualClearances >= 2 ? 'clearing' :
    ledger.secondsLostInTraffic >= 7 ? 'road' :
    ledger.helpfulActions >= 3 && ledger.helpfulActions > ledger.troublesomeActions ? 'repair' :
    models.some(id => id === 'tree' || id === 'bench') ? 'making' :
    ledger.carePaid >= 25 || coins < 0 ? 'coins' : 'ordinary';

  const lines: Record<WorkshopMoment['motif'], readonly [string, string, string]> = {
    clearing: [
      'The boy swept a paper scrap from beside the painted road. His father held the little dustpan.',
      '“That corner looks different,” his father said. The boy found another scrap beneath a model car.',
      'They put the tiny broom in its box. There was still room beside it for another tool.'
    ],
    road: [
      'Two miniature cars stood nose to tail. The boy nudged the first one, and the others followed.',
      'His father watched the cars make their turn. “That one needed a moment,” the boy said.',
      'The road was quiet again. They left a little space between the cars when they packed them away.'
    ],
    repair: [
      'A loose wheel lay beside the model road. The boy fetched the small screwdriver.',
      '“Hold it there,” his father said. The boy steadied the car while the wheel turned freely.',
      'The repaired model made another circuit. Neither of them mentioned the scratch beneath it.'
    ],
    making: [
      'The boy planted a tiny tree by the roadside. His father held the base until the glue set.',
      'They moved the bench twice before it felt right. The painted shadows stayed in the old place.',
      'A bit of green paint remained on the brush. His father offered the lid for a palette.'
    ],
    absence: [
      'There was an empty space where a little house had stood. The boy traced its outline with a finger.',
      'His father brought over a spare roof, then set it gently beside the empty square.',
      'They kept the small nameplate. There was no need to decide where it belonged just yet.'
    ],
    coins: [
      'The boy counted the copper coins into little piles. His father pushed one back across the table.',
      '“Will that be enough for the next piece?” the boy asked. His father measured the gap in the road.',
      'One coin rolled under the model town. They found it together when the workbench was cleared.'
    ],
    ordinary: [
      'The first car rolled along the little road. His father straightened its wooden wheel.',
      '“Do you think it should go here?” the boy asked. His father looked at the empty square.',
      'They watched the cars make another circuit. This time, neither reached for the ruler.'
    ]
  };
  return { milestone, motif, line: lines[motif][milestone - 1] };
}

export function chooseClosingMoment(
  won: boolean, ledger: Readonly<RunLedger>, closedHomes: number
): string {
  if (closedHomes >= 2) {
    return 'The boy left two little spaces on the workbench. His father kept the empty boxes.';
  }
  if (ledger.litterCaught + ledger.manualClearances >= 3) {
    return won
      ? 'They folded the small paper broom into its sleeve and placed it beside the finished road.'
      : 'The boy put the little broom down beside the next unpainted house.';
  }
  if (ledger.secondsLostInTraffic >= 10) {
    return 'The last car had a little trouble turning. They left it facing the road.';
  }
  return won
    ? 'His father handed him the box lid. “Keep that one,” he said, pointing to the first car.'
    : 'They left the road on the table. Tomorrow, the little cars could try again.';
}
