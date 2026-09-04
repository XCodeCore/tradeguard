import { ascendingRiskScore, descendingRiskScore, metric, quoteDepthWithin, roundDownUsdt } from "./math";
import { THRESHOLDS } from "./thresholds";
import type { Assessment, AssessmentCoverage, AssessmentRequest, AssessmentStatus, Candle, MarketSnapshot, OrderBookLevel, TradeSide } from "./types";

const CORE_COMPONENTS = ["slippage", "liquidity", "orderSize", "volatility"];

function unavailable(status: "INVALID_INPUT" | "ASSESSMENT_UNAVAILABLE", reason: string): Assessment {
  return { status, reason, score: null, saferAmount: null, observableDepthSufficient: null, overrides: { minimumStatus: null, reasons: [] },
    coverage: { applicableComponents: CORE_COMPONENTS, assessedComponents: [], notAssessedComponents: CORE_COMPONENTS, ratio: 0 } };
}

function validateRequest(request: AssessmentRequest): string | null {
  if (!/^[A-Z0-9]{5,20}$/.test(request.symbol)) return "Symbol format is invalid.";
  if (request.side !== "BUY" && request.side !== "SELL") return "Trade side must be BUY or SELL.";
  if (!Number.isFinite(request.proposedNotional) || request.proposedNotional <= 0) return "Proposed USDT notional must be greater than zero.";
  if (request.portfolioValue !== undefined && (!Number.isFinite(request.portfolioValue) || request.portfolioValue <= 0)) return "Portfolio value must be greater than zero when supplied.";
  if (request.existingSymbolExposure !== undefined && (!Number.isFinite(request.existingSymbolExposure) || request.existingSymbolExposure < 0)) return "Existing symbol exposure cannot be negative.";
  return null;
}

function validateSnapshot(snapshot: MarketSnapshot, request: AssessmentRequest): string | null {
  const now = request.now ?? Date.now();
  if (snapshot.symbol !== request.symbol || !snapshot.symbolValidated) return "Symbol is unsupported or was not validated.";
  if (!Number.isFinite(snapshot.observedAt) || snapshot.observedAt > now + 5_000 || now - snapshot.observedAt > THRESHOLDS.maximumSnapshotAgeMs) return "Market snapshot is stale.";
  if (!Number.isFinite(snapshot.tickerPrice) || snapshot.tickerPrice <= 0) return "Ticker price is malformed.";
  if (snapshot.bids.length === 0 || snapshot.asks.length === 0) return "Order book is empty.";
  if (snapshot.candles.length < THRESHOLDS.requiredCandles) return `At least ${THRESHOLDS.requiredCandles} candles are required.`;
  const malformedLevel = [...snapshot.bids, ...snapshot.asks].some((level) => !Number.isFinite(level.price) || level.price <= 0 || !Number.isFinite(level.baseQuantity) || level.baseQuantity <= 0);
  const malformedCandle = snapshot.candles.some((candle) => [candle.open, candle.high, candle.low, candle.close].some((value) => !Number.isFinite(value) || value <= 0) || candle.high < candle.low);
  if (malformedLevel || malformedCandle) return "Market snapshot contains malformed values.";
  const lastCandle = snapshot.candles.at(-1)!;
  if (lastCandle.closeTime > now + 300_000 || now - lastCandle.closeTime > 600_000) return "Candlestick data is stale.";
  if (snapshot.candles.some((candle, index, all) => index > 0 && candle.openTime <= all[index - 1].openTime)) return "Candlesticks are not chronological.";
  if (snapshot.bids.some((level, index, all) => index > 0 && level.price > all[index - 1].price)) return "Bid levels are not sorted best-first.";
  if (snapshot.asks.some((level, index, all) => index > 0 && level.price < all[index - 1].price)) return "Ask levels are not sorted best-first.";
  if (snapshot.bids[0].price >= snapshot.asks[0].price) return "Order book is crossed.";
  return null;
}

export interface FillSimulation { sufficient: boolean; averageFillPrice: number; filledBaseQuantity: number; quoteFilled: number }

export function simulateQuoteNotionalFill(levels: OrderBookLevel[], proposedNotional: number): FillSimulation {
  if (levels.length === 0) return { sufficient: false, averageFillPrice: 0, filledBaseQuantity: 0, quoteFilled: 0 };
  const targetBaseQuantity = proposedNotional / levels[0].price;
  let baseRemaining = targetBaseQuantity, quoteFilled = 0, baseFilled = 0;
  for (const level of levels) {
    const consumedBase = Math.min(baseRemaining, level.baseQuantity);
    quoteFilled += consumedBase * level.price; baseFilled += consumedBase; baseRemaining -= consumedBase;
    if (baseRemaining <= 1e-12) break;
  }
  return { sufficient: baseRemaining <= 1e-12, averageFillPrice: baseFilled > 0 ? quoteFilled / baseFilled : 0, filledBaseQuantity: baseFilled, quoteFilled };
}

function calculateVolatility(candles: Candle[]) {
  const recent = candles.slice(-THRESHOLDS.requiredCandles);
  const trueRanges = recent.slice(1).map((candle, index) => {
    const previousClose = recent[index].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
  const atrRanges = trueRanges.slice(-THRESHOLDS.atrPeriod);
  const atr = atrRanges.reduce((sum, value) => sum + value, 0) / atrRanges.length;
  const atrPercent = atr / recent.at(-1)!.close * 100;
  const returns = recent.slice(1).map((candle, index) => Math.log(candle.close / recent[index].close));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  const high = Math.max(...recent.map((candle) => candle.high)), low = Math.min(...recent.map((candle) => candle.low));
  return { atrPercent, logReturnStdDevPercent: Math.sqrt(variance) * 100, recentRangePercent: (high - low) / low * 100 };
}

function notionalAtSlippage(levels: OrderBookLevel[], reference: number, side: TradeSide): number {
  const distance = THRESHOLDS.saferSlippagePercent;
  const boundary = side === "BUY" ? reference * (1 + distance / 100) : reference * (1 - distance / 100);
  return levels.filter((level) => side === "BUY" ? level.price <= boundary : level.price >= boundary)
    .reduce((sum, level) => sum + level.price * level.baseQuantity, 0);
}

export function verdictForScore(score: number): AssessmentStatus {
  if (score < THRESHOLDS.proceedScoreExclusive) return "PROCEED";
  if (score < THRESHOLDS.reduceSizeScoreExclusive) return "REDUCE_SIZE";
  return "DO_NOT_PROCEED";
}

function applyCriticalOverrides(
  baseline: AssessmentStatus,
  scores: { slippage: number; spread: number; depth: number; orderSize: number; volatility: number; concentration: number | null },
  concentrationCanOverride: boolean,
): { status: AssessmentStatus; minimumStatus: "REDUCE_SIZE" | "DO_NOT_PROCEED" | null; reasons: string[] } {
  const candidates = [
    ["slippage", scores.slippage], ["spread", scores.spread], ["observable liquidity depth", scores.depth],
    ["order size", scores.orderSize], ["volatility", scores.volatility],
    ...(concentrationCanOverride && scores.concentration !== null ? [["concentration", scores.concentration] as [string, number]] : []),
  ] as Array<[string, number]>;
  const critical = candidates.filter(([, score]) => score >= THRESHOLDS.doNotProceedOverrideScore).map(([name]) => `${name} reached the critical-risk band`);
  if (critical.length > 0) return { status: "DO_NOT_PROCEED", minimumStatus: "DO_NOT_PROCEED", reasons: critical };
  const severe = candidates.filter(([, score]) => score >= THRESHOLDS.reduceOverrideScore).map(([name]) => `${name} reached the severe-risk band`);
  if (severe.length > 0 && baseline === "PROCEED") return { status: "REDUCE_SIZE", minimumStatus: "REDUCE_SIZE", reasons: severe };
  return { status: baseline, minimumStatus: null, reasons: [] };
}

export function assessTrade(snapshot: MarketSnapshot, request: AssessmentRequest): Assessment {
  const requestError = validateRequest(request);
  if (requestError) return unavailable("INVALID_INPUT", requestError);
  const snapshotError = validateSnapshot(snapshot, request);
  if (snapshotError) return unavailable(snapshotError.includes("unsupported") ? "INVALID_INPUT" : "ASSESSMENT_UNAVAILABLE", snapshotError);
  const levels = request.side === "BUY" ? snapshot.asks : snapshot.bids;
  const referencePrice = levels[0].price;
  const fill = simulateQuoteNotionalFill(levels, request.proposedNotional);
  if (!fill.sufficient) return { ...unavailable("ASSESSMENT_UNAVAILABLE", "Observable order-book depth is insufficient to simulate the proposed order."), observableDepthSufficient: false };
  const signedMove = request.side === "BUY" ? fill.averageFillPrice / referencePrice - 1 : 1 - fill.averageFillPrice / referencePrice;
  const slippagePercent = Math.max(0, signedMove * 100);
  const slippageScore = ascendingRiskScore(slippagePercent, THRESHOLDS.slippagePercent);
  const bestBid = snapshot.bids[0].price, bestAsk = snapshot.asks[0].price;
  const spreadPercent = (bestAsk - bestBid) / ((bestAsk + bestBid) / 2) * 100;
  const spreadScore = ascendingRiskScore(spreadPercent, THRESHOLDS.spreadPercent);
  const halfPercentDepth = quoteDepthWithin(levels, referencePrice, request.side, 0.5);
  const depthScore = descendingRiskScore(halfPercentDepth, THRESHOLDS.halfPercentDepthUsdt);
  const liquidityScore = (spreadScore + depthScore) / 2;
  const onePercentDepth = quoteDepthWithin(levels, referencePrice, request.side, 1);
  const orderSizeRatioPercent = request.proposedNotional / onePercentDepth * 100;
  const orderSizeScore = ascendingRiskScore(orderSizeRatioPercent, THRESHOLDS.orderSizeRatioPercent);
  const volatility = calculateVolatility(snapshot.candles);
  const volatilityScore = ascendingRiskScore(volatility.atrPercent, THRESHOLDS.atrPercent);
  const scores = [slippageScore, liquidityScore, orderSizeScore, volatilityScore];
  const applicableComponents = [...CORE_COMPONENTS];
  let concentration = null, concentrationCap = Number.POSITIVE_INFINITY;
  let concentrationScore: number | null = null;
  let concentrationCanOverride = false;
  if (request.portfolioValue !== undefined) {
    const proposalPercent = request.proposedNotional / request.portfolioValue * 100;
    const existingKnown = request.existingSymbolExposure !== undefined;
    const postTradePercent = existingKnown
      ? (request.side === "BUY"
          ? request.existingSymbolExposure! + request.proposedNotional
          : Math.max(0, request.existingSymbolExposure! - request.proposedNotional)) / request.portfolioValue * 100
      : null;
    const scoredPercent = postTradePercent ?? proposalPercent;
    concentrationScore = ascendingRiskScore(scoredPercent, THRESHOLDS.concentrationPercent);
    concentration = {
      ...metric(concentrationScore),
      basis: existingKnown ? "POST_TRADE" as const : "PROPOSAL_ONLY" as const,
      proposalPercent,
      postTradePercent,
      existingExposureKnown: existingKnown,
      effect: existingKnown ? (request.side === "BUY" ? "INCREASES" as const : "DECREASES" as const) : "UNKNOWN" as const,
    };
    concentrationCanOverride = !existingKnown || request.side === "BUY";
    concentrationCap = !existingKnown
      ? request.portfolioValue * THRESHOLDS.saferConcentrationPercent / 100
      : request.side === "BUY"
        ? request.portfolioValue * THRESHOLDS.saferConcentrationPercent / 100 - request.existingSymbolExposure!
        : Number.POSITIVE_INFINITY;
    scores.push(concentrationScore); applicableComponents.push("concentration");
  }
  const normalizedScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const saferAmount = roundDownUsdt(Math.min(request.proposedNotional, onePercentDepth * THRESHOLDS.saferOrderSizeRatioPercent / 100, notionalAtSlippage(levels, referencePrice, request.side), concentrationCap));
  const coverage: AssessmentCoverage = {
    applicableComponents,
    assessedComponents: applicableComponents,
    notAssessedComponents: request.portfolioValue === undefined
      ? ["concentration"]
      : request.existingSymbolExposure === undefined
        ? ["truePostTradeConcentration"]
        : [],
    ratio: applicableComponents.length / 5,
  };
  const override = applyCriticalOverrides(verdictForScore(normalizedScore), {
    slippage: slippageScore, spread: spreadScore, depth: depthScore, orderSize: orderSizeScore,
    volatility: volatilityScore, concentration: concentrationScore,
  }, concentrationCanOverride);
  return {
    status: override.status,
    reason: override.reasons.length > 0
      ? `Deterministic score ${normalizedScore.toFixed(2)}; override applied: ${override.reasons.join("; ")}.`
      : `Deterministic score ${normalizedScore.toFixed(2)} across ${scores.length} applicable components.`,
    score: normalizedScore, saferAmount, observableDepthSufficient: true,
    overrides: { minimumStatus: override.minimumStatus, reasons: override.reasons }, coverage,
    metrics: {
      slippage: { ...metric(slippageScore), referencePrice, averageFillPrice: fill.averageFillPrice, slippagePercent, filledBaseQuantity: fill.filledBaseQuantity },
      liquidity: { ...metric(liquidityScore), spreadPercent, sameSideQuoteDepthWithinHalfPercent: halfPercentDepth, spreadScore, depthScore },
      orderSize: { ...metric(orderSizeScore), sameSideQuoteDepthWithinOnePercent: onePercentDepth, orderSizeRatioPercent },
      volatility: { ...metric(volatilityScore), ...volatility }, concentration,
    },
  };
}
