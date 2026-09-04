export const THRESHOLDS = {
  maximumSnapshotAgeMs: 30_000,
  requiredCandles: 60,
  atrPeriod: 14,
  slippagePercent: [0.1, 0.25, 0.5, 1],
  spreadPercent: [0.02, 0.05, 0.1, 0.2],
  halfPercentDepthUsdt: [1_000_000, 250_000, 50_000, 10_000],
  orderSizeRatioPercent: [5, 10, 25, 50],
  atrPercent: [0.5, 1, 2, 4],
  concentrationPercent: [10, 20, 35, 50],
  proceedScoreExclusive: 25,
  reduceSizeScoreExclusive: 50,
  saferOrderSizeRatioPercent: 10,
  saferSlippagePercent: 0.25,
  saferConcentrationPercent: 20,
  reduceOverrideScore: 75,
  doNotProceedOverrideScore: 100,
} as const;

export const SCORE_BUCKETS = [0, 25, 50, 75, 100] as const;
