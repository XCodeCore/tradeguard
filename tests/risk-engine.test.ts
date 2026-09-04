import { describe, expect, it } from "vitest";
import { assessTrade, simulateQuoteNotionalFill, verdictForScore } from "../lib/risk-engine";
import { candles, levels, NOW, snapshot } from "./fixtures/market";

const request = { symbol: "BTCUSDT", side: "BUY" as const, proposedNotional: 1_000, now: NOW };

describe("deterministic risk engine", () => {
  it("allows a normal liquid trade", () => {
    const result = assessTrade(snapshot(), request);
    expect(result.status).toBe("PROCEED");
    expect(result.observableDepthSufficient).toBe(true);
    expect(result.metrics?.slippage.referencePrice).toBe(100.01);
  });

  it("flags thin same-side liquidity", () => {
    const result = assessTrade(snapshot({ asks: levels("asks", { quantity: 0.2 }) }), { ...request, proposedNotional: 100 });
    expect(result.metrics?.liquidity.depthScore).toBe(100);
  });

  it("scores high slippage from a gapped ask book", () => {
    const asks = Array.from({ length: 20 }, (_, index) => ({ price: 100.01 + index, baseQuantity: 1 }));
    const result = assessTrade(snapshot({ asks }), { ...request, proposedNotional: 1_000 });
    expect(result.metrics?.slippage.score).toBe(100);
    expect(result.metrics?.slippage.slippagePercent).toBeGreaterThan(1);
    expect(result.status).toBe("DO_NOT_PROCEED");
    expect(result.overrides.minimumStatus).toBe("DO_NOT_PROCEED");
  });

  it("scores high ATR volatility as the primary volatility metric", () => {
    const result = assessTrade(snapshot({ candles: candles({ volatility: 0.05 }) }), request);
    expect(result.metrics?.volatility.atrPercent).toBeGreaterThan(4);
    expect(result.metrics?.volatility.score).toBe(100);
    expect(result.metrics?.volatility.logReturnStdDevPercent).toBeGreaterThan(0);
    expect(result.metrics?.volatility.recentRangePercent).toBeGreaterThan(0);
    expect(result.status).toBe("DO_NOT_PROCEED");
    expect(result.overrides.reasons).toContain("volatility reached the critical-risk band");
  });

  it("flags an oversized order relative to one-percent observable depth", () => {
    const result = assessTrade(snapshot(), { ...request, proposedNotional: 600_000 });
    expect(result.metrics?.orderSize.orderSizeRatioPercent).toBeGreaterThan(50);
    expect(result.metrics?.orderSize.score).toBe(100);
    expect(result.status).toBe("DO_NOT_PROCEED");
  });

  it("calculates side-aware post-trade concentration when exposure is known", () => {
    const buy = assessTrade(snapshot(), { ...request, proposedNotional: 1_000, portfolioValue: 10_000, existingSymbolExposure: 2_000 });
    const sell = assessTrade(snapshot(), { ...request, side: "SELL", proposedNotional: 1_000, portfolioValue: 10_000, existingSymbolExposure: 2_000 });
    expect(buy.metrics?.concentration).toMatchObject({ basis: "POST_TRADE", proposalPercent: 10, postTradePercent: 30, effect: "INCREASES" });
    expect(sell.metrics?.concentration).toMatchObject({ basis: "POST_TRADE", proposalPercent: 10, postTradePercent: 10, effect: "DECREASES" });
    expect(buy.metrics?.concentration?.score).toBeGreaterThan(sell.metrics?.concentration?.score ?? 0);
  });

  it("reports proposal-only concentration when existing exposure is unknown", () => {
    const result = assessTrade(snapshot(), { ...request, portfolioValue: 5_000 });
    expect(result.metrics?.concentration).toMatchObject({
      basis: "PROPOSAL_ONLY", proposalPercent: 20, postTradePercent: null,
      existingExposureKnown: false, effect: "UNKNOWN",
    });
    expect(result.coverage.notAssessedComponents).toContain("truePostTradeConcentration");
  });

  it("marks concentration Not assessed when portfolio value is absent", () => {
    const result = assessTrade(snapshot(), request);
    expect(result.metrics?.concentration).toBeNull();
    expect(result.coverage.notAssessedComponents).toEqual(["concentration"]);
    expect(result.coverage.applicableComponents).toHaveLength(4);
    expect(result.coverage.ratio).toBe(0.8);
  });

  it("prevents critical observable liquidity from averaging to PROCEED", () => {
    const result = assessTrade(snapshot({ asks: levels("asks", { quantity: 0.2 }) }), { ...request, proposedNotional: 100 });
    expect(result.score).toBeLessThan(25);
    expect(result.status).toBe("DO_NOT_PROCEED");
    expect(result.overrides.reasons).toContain("observable liquidity depth reached the critical-risk band");
  });

  it("forces REDUCE_SIZE when one raw risk reaches 75 despite a low average", () => {
    const result = assessTrade(snapshot({ asks: levels("asks", { quantity: 3 }) }), { ...request, proposedNotional: 100 });
    expect(result.metrics?.liquidity.depthScore).toBe(75);
    expect(result.score).toBeLessThan(25);
    expect(result.status).toBe("REDUCE_SIZE");
    expect(result.overrides.minimumStatus).toBe("REDUCE_SIZE");
  });

  it("does not use high remaining concentration as a critical override against a reducing SELL", () => {
    const result = assessTrade(snapshot(), { ...request, side: "SELL", proposedNotional: 1_000, portfolioValue: 10_000, existingSymbolExposure: 9_000 });
    expect(result.metrics?.concentration?.postTradePercent).toBe(80);
    expect(result.overrides.reasons).not.toContain("concentration reached the critical-risk band");
  });

  it("applies the concentration safer-amount cap to BUY but not a known reducing SELL", () => {
    const buy = assessTrade(snapshot(), { ...request, portfolioValue: 10_000, existingSymbolExposure: 1_500 });
    const sell = assessTrade(snapshot(), { ...request, side: "SELL", portfolioValue: 10_000, existingSymbolExposure: 1_500 });
    expect(buy.saferAmount).toBe(500);
    expect(sell.saferAmount).toBe(1_000);
  });

  it("does not turn insufficient observable depth into a risk verdict", () => {
    const result = assessTrade(snapshot({ asks: [{ price: 100.01, baseQuantity: 0.01 }] }), request);
    expect(result.status).toBe("ASSESSMENT_UNAVAILABLE");
    expect(result.observableDepthSufficient).toBe(false);
    expect(result.score).toBeNull();
  });

  it("does not turn stale or malformed data into a risk verdict", () => {
    expect(assessTrade(snapshot({ observedAt: NOW - 30_001 }), request).status).toBe("ASSESSMENT_UNAVAILABLE");
    expect(assessTrade(snapshot({ tickerPrice: Number.NaN }), request).status).toBe("ASSESSMENT_UNAVAILABLE");
    expect(assessTrade(snapshot({ candles: candles({ count: 59 }) }), request).status).toBe("ASSESSMENT_UNAVAILABLE");
  });

  it("returns INVALID_INPUT for unsupported symbols and invalid amounts", () => {
    expect(assessTrade(snapshot({ symbolValidated: false }), request).status).toBe("INVALID_INPUT");
    expect(assessTrade(snapshot(), { ...request, proposedNotional: 0 }).status).toBe("INVALID_INPUT");
    expect(assessTrade(snapshot(), { ...request, proposedNotional: -1 }).status).toBe("INVALID_INPUT");
  });

  it("uses asks for BUY and bids for SELL", () => {
    const market = snapshot({ bids: [{ price: 99, baseQuantity: 100 }], asks: [{ price: 101, baseQuantity: 100 }] });
    expect(assessTrade(market, { ...request, proposedNotional: 100 }).metrics?.slippage.referencePrice).toBe(101);
    expect(assessTrade(market, { ...request, side: "SELL", proposedNotional: 100 }).metrics?.slippage.referencePrice).toBe(99);
  });

  it("calculates quote-notional VWAP", () => {
    const fill = simulateQuoteNotionalFill([{ price: 100, baseQuantity: 1 }, { price: 110, baseQuantity: 1 }], 200);
    expect(fill.sufficient).toBe(true);
    expect(fill.averageFillPrice).toBe(105);
    expect(fill.filledBaseQuantity).toBe(2);
  });

  it("honors verdict boundaries exactly", () => {
    expect(verdictForScore(24.999)).toBe("PROCEED");
    expect(verdictForScore(25)).toBe("REDUCE_SIZE");
    expect(verdictForScore(49.999)).toBe("REDUCE_SIZE");
    expect(verdictForScore(50)).toBe("DO_NOT_PROCEED");
  });

  it("calculates a deterministic safer amount", () => {
    const result = assessTrade(snapshot(), { ...request, proposedNotional: 600_000, portfolioValue: 1_000_000, existingSymbolExposure: 150_000 });
    expect(result.saferAmount).toBe(50_000);
  });
});
