export type TradeSide = "BUY" | "SELL";

export type AssessmentStatus =
  | "PROCEED"
  | "REDUCE_SIZE"
  | "DO_NOT_PROCEED"
  | "ASSESSMENT_UNAVAILABLE"
  | "INVALID_INPUT";

export interface OrderBookLevel { price: number; baseQuantity: number }

export interface Candle {
  openTime: number; open: number; high: number; low: number; close: number;
  baseVolume: number; closeTime: number; quoteVolume: number; tradeCount: number;
  takerBuyBaseVolume: number; takerBuyQuoteVolume: number;
}

export interface MarketSnapshot {
  symbol: string;
  observedAt: number;
  tickerPrice: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  candles: Candle[];
  orderBookDepthLimit: number;
  lastUpdateId?: number;
  symbolValidated: boolean;
  source: "BINANCE_AGENT_OS_MCP";
}

export interface AssessmentRequest {
  symbol: string;
  side: TradeSide;
  proposedNotional: number;
  portfolioValue?: number;
  existingSymbolExposure?: number;
  now?: number;
}

export interface RiskMetric { score: number; level: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" }
export interface AssessmentCoverage {
  applicableComponents: string[]; assessedComponents: string[];
  notAssessedComponents: string[]; ratio: number;
}

export interface Assessment {
  status: AssessmentStatus;
  reason: string;
  score: number | null;
  saferAmount: number | null;
  observableDepthSufficient: boolean | null;
  overrides: { minimumStatus: "REDUCE_SIZE" | "DO_NOT_PROCEED" | null; reasons: string[] };
  coverage: AssessmentCoverage;
  metrics?: {
    slippage: RiskMetric & { referencePrice: number; averageFillPrice: number; slippagePercent: number; filledBaseQuantity: number };
    liquidity: RiskMetric & { spreadPercent: number; sameSideQuoteDepthWithinHalfPercent: number; spreadScore: number; depthScore: number };
    orderSize: RiskMetric & { sameSideQuoteDepthWithinOnePercent: number; orderSizeRatioPercent: number };
    volatility: RiskMetric & { atrPercent: number; logReturnStdDevPercent: number; recentRangePercent: number };
    concentration: (RiskMetric & {
      basis: "PROPOSAL_ONLY" | "POST_TRADE";
      proposalPercent: number;
      postTradePercent: number | null;
      existingExposureKnown: boolean;
      effect: "INCREASES" | "DECREASES" | "UNKNOWN";
    }) | null;
  };
}
