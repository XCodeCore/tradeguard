import { assessTrade, type Assessment, type AssessmentRequest } from "../risk-engine";
import { fetchMarketSnapshot } from "./adapter";
import type { BinanceMcpGateway } from "./types";

export async function assessWithBinanceMcp(gateway: BinanceMcpGateway, request: AssessmentRequest): Promise<Assessment> {
  const result = await fetchMarketSnapshot(gateway, { symbol: request.symbol, side: request.side, proposedNotional: request.proposedNotional });
  if (!result.ok) return {
    status: result.status, reason: result.reason, score: null, saferAmount: null,
      observableDepthSufficient: result.status === "ASSESSMENT_UNAVAILABLE" && result.reason.startsWith("Observable") ? false : null,
      overrides: { minimumStatus: null, reasons: [] },
    coverage: { applicableComponents: ["slippage", "liquidity", "orderSize", "volatility"], assessedComponents: [], notAssessedComponents: ["slippage", "liquidity", "orderSize", "volatility", "concentration"], ratio: 0 },
  };
  return assessTrade(result.snapshot, request);
}
