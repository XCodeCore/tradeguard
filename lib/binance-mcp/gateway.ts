import type { BinanceMcpGateway, McpToolResponse } from "./types";

export type BinanceMcpToolName =
  | "spot_tickerPrice"
  | "spot_depth"
  | "spot_klines"
  | "spot_exchangeInfo"
  | "spot_ticker24hr";

export type McpToolExecutor = (toolName: BinanceMcpToolName, arguments_: Record<string, unknown>) => Promise<McpToolResponse>;

export function createBinanceMcpGateway(execute: McpToolExecutor): BinanceMcpGateway {
  return {
    spot_tickerPrice: (args) => execute("spot_tickerPrice", args),
    spot_depth: (args) => execute("spot_depth", args),
    spot_klines: (args) => execute("spot_klines", args),
    spot_exchangeInfo: (args) => execute("spot_exchangeInfo", args),
    spot_ticker24hr: (args) => execute("spot_ticker24hr", args),
  };
}
