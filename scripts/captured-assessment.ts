import { assessTrade, type AssessmentRequest } from "../lib/risk-engine";
import { createBinanceMcpGateway, fetchMarketSnapshot } from "../lib/binance-mcp";
import { ASSESSMENT_SCHEMA_VERSION, type AssessmentEnvelope } from "../lib/assessment-bridge";

export interface CapturedMarketInput {
  request: { symbol: string; side: "BUY" | "SELL"; amountUsdt: number; portfolioValueUsdt?: number; existingExposureUsdt?: number };
  retrievedAt: number;
  responses: { exchangeInfo: unknown; tickerPrice: unknown; klines: unknown; depth: Record<string, unknown> };
}
function explanations(envelope: Omit<AssessmentEnvelope, "explanation">): string[] {
  const assessment = envelope.assessment;
  const result = [assessment.reason];
  if (assessment.metrics) {
    result.push(`${envelope.request.side} simulated slippage is ${assessment.metrics.slippage.slippagePercent.toFixed(4)}% against the relevant best price.`);
    result.push(`Same-side quote depth within 0.5% is ${assessment.metrics.liquidity.sameSideQuoteDepthWithinHalfPercent.toFixed(2)} USDT; ATR is ${assessment.metrics.volatility.atrPercent.toFixed(4)}%.`);
  }
  if (assessment.saferAmount !== null && assessment.saferAmount < envelope.request.proposedNotional) result.push(`The deterministic safer amount is ${assessment.saferAmount.toFixed(2)} USDT.`);
  return result;
}
export async function assessCapturedMarket(input: CapturedMarketInput): Promise<AssessmentEnvelope | { status: string; reason: string; nextDepthLimit?: number }> {
  const request: AssessmentRequest = { symbol: input.request.symbol.trim().toUpperCase(), side: input.request.side, proposedNotional: input.request.amountUsdt, portfolioValue: input.request.portfolioValueUsdt, existingSymbolExposure: input.request.existingExposureUsdt, now: input.retrievedAt };
  const depthLimits = Object.keys(input.responses.depth).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const gateway = createBinanceMcpGateway(async (name, args) => {
    if (name === "spot_exchangeInfo") return input.responses.exchangeInfo;
    if (name === "spot_tickerPrice") return input.responses.tickerPrice;
    if (name === "spot_klines") return input.responses.klines;
    if (name === "spot_depth") { const response = input.responses.depth[String(args.limit)]; if (response === undefined) throw new Error(`Missing captured depth ${String(args.limit)}.`); return response; }
    throw new Error(`Unsupported MCP tool ${name}.`);
  });
  const snapshotResult = await fetchMarketSnapshot(gateway, { symbol: request.symbol, side: request.side, proposedNotional: request.proposedNotional, depthLimits: depthLimits.length > 0 ? depthLimits : [100] }, () => input.retrievedAt);
  if (!snapshotResult.ok) {
    const deepest = depthLimits.at(-1) ?? 0;
    const nextDepthLimit = snapshotResult.reason.startsWith("Observable depth") ? (deepest < 500 ? 500 : deepest < 1000 ? 1000 : undefined) : undefined;
    return { status: snapshotResult.status, reason: snapshotResult.reason, ...(nextDepthLimit ? { nextDepthLimit } : {}) };
  }
  const assessment = assessTrade(snapshotResult.snapshot, request);
  if (assessment.status === "ASSESSMENT_UNAVAILABLE" || assessment.status === "INVALID_INPUT" || assessment.score === null) return { status: assessment.status, reason: assessment.reason };
  const envelope: Omit<AssessmentEnvelope, "explanation"> = { schemaVersion: ASSESSMENT_SCHEMA_VERSION, generatedBy: "CODEX_HOSTED_TRADEGUARD", request, provenance: { source: "BINANCE_AGENT_OS_MCP", retrievedAt: snapshotResult.snapshot.observedAt, orderBookDepthUsed: snapshotResult.snapshot.orderBookDepthLimit, candleInterval: "5m", candleCount: 60, toolsInvoked: snapshotResult.toolsInvoked }, market: { tickerPrice: snapshotResult.snapshot.tickerPrice, bestBid: snapshotResult.snapshot.bids[0].price, bestAsk: snapshotResult.snapshot.asks[0].price }, assessment };
  return { ...envelope, explanation: explanations(envelope) };
}
