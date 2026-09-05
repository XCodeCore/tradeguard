import { ASSESSMENT_SCHEMA_VERSION, type AssessmentEnvelope } from "./types";
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
const REQUIRED_TOOLS = ["spot_exchangeInfo", "spot_tickerPrice", "spot_klines", "spot_depth"];
export function parseAssessmentEnvelope(text: string, now = Date.now()): AssessmentEnvelope {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Assessment JSON is not valid."); }
  if (!record(value) || value.schemaVersion !== ASSESSMENT_SCHEMA_VERSION || value.generatedBy !== "CODEX_HOSTED_TRADEGUARD") throw new Error("This is not a supported TradeGuard assessment envelope.");
  const request = value.request, provenance = value.provenance, market = value.market, assessment = value.assessment;
  if (!record(request) || typeof request.symbol !== "string" || !/^[A-Z0-9]{5,20}$/.test(request.symbol) || (request.side !== "BUY" && request.side !== "SELL") || !finite(request.proposedNotional) || request.proposedNotional <= 0) throw new Error("Assessment request fields are invalid.");
  if (!record(provenance) || provenance.source !== "BINANCE_AGENT_OS_MCP" || !finite(provenance.retrievedAt) || provenance.retrievedAt > now + 5_000 || now - provenance.retrievedAt > 15 * 60_000 || !finite(provenance.orderBookDepthUsed) || provenance.candleInterval !== "5m" || provenance.candleCount !== 60 || !Array.isArray(provenance.toolsInvoked)) throw new Error("Agent OS provenance is invalid or stale.");
  const toolNames = new Set(provenance.toolsInvoked.filter(record).map((tool) => tool.name));
  if (REQUIRED_TOOLS.some((name) => !toolNames.has(name))) throw new Error("Required Agent OS tool provenance is incomplete.");
  if (!record(market) || !finite(market.tickerPrice) || !finite(market.bestBid) || !finite(market.bestAsk) || market.bestBid >= market.bestAsk) throw new Error("Normalized market summary is invalid.");
  if (!record(assessment) || !["PROCEED", "REDUCE_SIZE", "DO_NOT_PROCEED"].includes(String(assessment.status)) || !finite(assessment.score) || assessment.score < 0 || assessment.score > 100 || (assessment.saferAmount !== null && (!finite(assessment.saferAmount) || assessment.saferAmount < 0)) || !record(assessment.coverage) || !Array.isArray(assessment.coverage.assessedComponents) || !finite(assessment.coverage.ratio) || !record(assessment.overrides) || !Array.isArray(assessment.overrides.reasons)) throw new Error("Deterministic assessment fields are invalid.");
  if (!record(assessment.metrics) || !record(assessment.metrics.slippage) || !record(assessment.metrics.liquidity) || !record(assessment.metrics.orderSize) || !record(assessment.metrics.volatility)) throw new Error("Deterministic metric fields are missing.");
  if (!Array.isArray(value.explanation) || value.explanation.some((item) => typeof item !== "string")) throw new Error("Assessment explanation is invalid.");
  return value as unknown as AssessmentEnvelope;
}
