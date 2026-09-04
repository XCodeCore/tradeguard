import type { MarketSnapshot, TradeSide } from "../risk-engine";

export type McpToolResponse = unknown;

export interface BinanceMcpGateway {
  spot_tickerPrice(args: { symbol: string }): Promise<McpToolResponse>;
  spot_depth(args: { symbol: string; limit: number }): Promise<McpToolResponse>;
  spot_klines(args: { symbol: string; interval: "5m"; limit: 60; endTime: number }): Promise<McpToolResponse>;
  spot_exchangeInfo(args: { symbol: string }): Promise<McpToolResponse>;
  spot_ticker24hr?(args: { symbol: string; type?: "FULL" | "MINI" }): Promise<McpToolResponse>;
}

export interface SnapshotRequest {
  symbol: string;
  side: TradeSide;
  proposedNotional: number;
  depthLimits?: number[];
}

export type SnapshotResult =
  | { ok: true; snapshot: MarketSnapshot; toolsInvoked: Array<{ name: string; arguments: Record<string, unknown> }> }
  | { ok: false; status: "INVALID_INPUT" | "ASSESSMENT_UNAVAILABLE"; reason: string; toolsInvoked: Array<{ name: string; arguments: Record<string, unknown> }> };
