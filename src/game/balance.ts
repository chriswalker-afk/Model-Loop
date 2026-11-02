/**
 * Vintage era tuning is centralised so pacing can be tested, not inferred from
 * scattered numbers. These are *simulated* seconds, shared by 1x and 2x modes.
 * Balance decisions are documented in docs/DRIVER_BEHAVIOUR_BALANCE.md.
 */
export const VINTAGE_BALANCE = {
  ambientIrritationPerTile: 0.25,
  eastBendIrritation: 0.18,
  westBendIrritation: 0.14,
  behaviourOpportunityChance: 0.38,
  behaviourCooldownSeconds: 52,
  stopPersonalCooldownSeconds: 68,
  stopGlobalCooldownSeconds: 18,
  stopAdmireSeconds: 3.8,
  stopChatSeconds: 4,
  stopHesitateSeconds: 2.8,
  queueIrritationPerLostSecond: 0.36,
  queueIrritationWithHelp: 0.20,
  queueNoticeCooldownSeconds: 30,
  firstWarningIrritation: 45,
  secondWarningIrritation: 72,
  significantActionNoticeSeconds: 4.5
} as const;

/** A run ledger; these are cumulative and never use rolling income as savings. */
export interface RunLedger {
  completedLaps: number;
  coinsEarned: number;
  carePaid: number;
  miniaturePurchases: number;
  helpfulActions: number;
  troublesomeActions: number;
  litterCaught: number;
  overflowingBins: number;
  manualClearances: number;
  manualCollections: number;
  maximumEnvironmentalEffects: number;
  largestQueue: number;
  secondsLostInTraffic: number;
}
export const newRunLedger = (): RunLedger => ({
  completedLaps: 0, coinsEarned: 0, carePaid: 0, miniaturePurchases: 0,
  helpfulActions: 0, troublesomeActions: 0, litterCaught: 0,
  overflowingBins: 0, manualClearances: 0, manualCollections: 0,
  maximumEnvironmentalEffects: 0, largestQueue: 0, secondsLostInTraffic: 0
});

export interface BalancedRunSummary {
  completedLaps: number;
  earnings: number;
  servicing: number;
  purchases: number;
  incidentCount: number;
  helpfulShare: number | null;
  trafficDelaySeconds: number;
  peakQueue: number;
  capturedPackaging: number;
  overflowEvents: number;
  maxEnvironmentalPatches: number;
}
export function summariseRun(ledger: Readonly<RunLedger>): BalancedRunSummary {
  const incidents = ledger.helpfulActions + ledger.troublesomeActions;
  return {
    completedLaps: ledger.completedLaps,
    earnings: ledger.coinsEarned,
    servicing: ledger.carePaid,
    purchases: ledger.miniaturePurchases,
    incidentCount: incidents,
    helpfulShare: incidents ? ledger.helpfulActions / incidents : null,
    trafficDelaySeconds: Math.round(ledger.secondsLostInTraffic * 10) / 10,
    peakQueue: ledger.largestQueue,
    capturedPackaging: ledger.litterCaught,
    overflowEvents: ledger.overflowingBins,
    maxEnvironmentalPatches: ledger.maximumEnvironmentalEffects
  };
}
