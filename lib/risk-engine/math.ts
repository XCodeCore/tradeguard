import { SCORE_BUCKETS } from "./thresholds";
import type { OrderBookLevel, RiskMetric } from "./types";

export function ascendingRiskScore(value: number, limits: readonly number[]): number {
  const index = limits.findIndex((limit) => value <= limit);
  return SCORE_BUCKETS[index === -1 ? SCORE_BUCKETS.length - 1 : index];
}

export function descendingRiskScore(value: number, limits: readonly number[]): number {
  const index = limits.findIndex((limit) => value >= limit);
  return SCORE_BUCKETS[index === -1 ? SCORE_BUCKETS.length - 1 : index];
}

export function metric(score: number): RiskMetric {
  if (score <= 25) return { score, level: "LOW" };
  if (score <= 50) return { score, level: "MODERATE" };
  if (score <= 75) return { score, level: "HIGH" };
  return { score, level: "VERY_HIGH" };
}

export function quoteDepthWithin(levels: OrderBookLevel[], referencePrice: number, side: "BUY" | "SELL", distancePercent: number): number {
  const boundary = side === "BUY" ? referencePrice * (1 + distancePercent / 100) : referencePrice * (1 - distancePercent / 100);
  return levels.filter((level) => side === "BUY" ? level.price <= boundary : level.price >= boundary)
    .reduce((sum, level) => sum + level.price * level.baseQuantity, 0);
}

export function roundDownUsdt(value: number): number {
  return Math.floor(Math.max(0, value) * 100) / 100;
}
