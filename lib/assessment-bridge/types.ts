import type { Assessment, AssessmentRequest } from "../risk-engine";

export const ASSESSMENT_SCHEMA_VERSION = "tradeguard.assessment.v1" as const;
export interface AssessmentEnvelope {
  schemaVersion: typeof ASSESSMENT_SCHEMA_VERSION;
  generatedBy: "CODEX_HOSTED_TRADEGUARD";
  request: AssessmentRequest;
  provenance: { source: "BINANCE_AGENT_OS_MCP"; retrievedAt: number; orderBookDepthUsed: number; candleInterval: "5m"; candleCount: 60; toolsInvoked: Array<{ name: string; arguments: Record<string, unknown> }> };
  market: { tickerPrice: number; bestBid: number; bestAsk: number };
  assessment: Assessment;
  explanation: string[];
}
