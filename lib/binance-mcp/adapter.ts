import { simulateQuoteNotionalFill, type MarketSnapshot } from "../risk-engine";
import { McpResponseError, parseCompletedKlines, parseDepth, parseSymbolValidation, parseTicker } from "./parsers";
import type { BinanceMcpGateway, SnapshotRequest, SnapshotResult } from "./types";

export const DEFAULT_DEPTH_LIMITS = [100, 500, 1000] as const;
const SUPPORTED_DEPTH_LIMITS = new Set([5, 10, 20, 50, 100, 500, 1000, 5000]);

function invalidRequest(request: SnapshotRequest): string | null {
  if (!/^[A-Z0-9]{5,20}$/.test(request.symbol)) return "Symbol format is invalid.";
  if (request.side !== "BUY" && request.side !== "SELL") return "Side must be BUY or SELL.";
  if (!Number.isFinite(request.proposedNotional) || request.proposedNotional <= 0) return "Proposed USDT notional must be greater than zero.";
  const limits = request.depthLimits ?? [...DEFAULT_DEPTH_LIMITS];
  if (limits.length === 0 || limits.some((limit) => !SUPPORTED_DEPTH_LIMITS.has(limit))) return "Depth limits contain an unsupported value.";
  if (limits.some((limit, index) => index > 0 && limit <= limits[index - 1])) return "Depth limits must be strictly increasing.";
  return null;
}

export async function fetchMarketSnapshot(
  gateway: BinanceMcpGateway,
  request: SnapshotRequest,
  clock: () => number = Date.now,
): Promise<SnapshotResult> {
  const toolsInvoked: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const validationError = invalidRequest(request);
  if (validationError) return { ok: false, status: "INVALID_INPUT", reason: validationError, toolsInvoked };

  const record = <T>(name: string, args: Record<string, unknown>, call: Promise<T>) => {
    toolsInvoked.push({ name, arguments: args });
    return call;
  };

  try {
    const requestTime = clock();
    const completedThrough = Math.floor(requestTime / 300_000) * 300_000 - 1;
    const exchangeArgs = { symbol: request.symbol };
    const exchangeResponse = await record("spot_exchangeInfo", exchangeArgs, gateway.spot_exchangeInfo(exchangeArgs));
    const symbolValidated = parseSymbolValidation(exchangeResponse, request.symbol);
    if (!symbolValidated) return { ok: false, status: "INVALID_INPUT", reason: `${request.symbol} is not a supported TRADING symbol.`, toolsInvoked };

    const tickerArgs = { symbol: request.symbol };
    const klineArgs = { symbol: request.symbol, interval: "5m" as const, limit: 60 as const, endTime: completedThrough };
    const [tickerResponse, klineResponse] = await Promise.all([
      record("spot_tickerPrice", tickerArgs, gateway.spot_tickerPrice(tickerArgs)),
      record("spot_klines", klineArgs, gateway.spot_klines(klineArgs)),
    ]);
    const ticker = parseTicker(tickerResponse, request.symbol);
    const candles = parseCompletedKlines(klineResponse, completedThrough, 60);

    const limits = request.depthLimits ?? [...DEFAULT_DEPTH_LIMITS];
    for (const limit of limits) {
      const depthArgs = { symbol: request.symbol, limit };
      const depthResponse = await record("spot_depth", depthArgs, gateway.spot_depth(depthArgs));
      const depth = parseDepth(depthResponse);
      const sameSide = request.side === "BUY" ? depth.asks : depth.bids;
      if (!simulateQuoteNotionalFill(sameSide, request.proposedNotional).sufficient) continue;
      const snapshot: MarketSnapshot = {
        symbol: request.symbol,
        observedAt: clock(),
        tickerPrice: ticker.price,
        bids: depth.bids,
        asks: depth.asks,
        candles,
        orderBookDepthLimit: limit,
        lastUpdateId: depth.lastUpdateId,
        symbolValidated,
        source: "BINANCE_AGENT_OS_MCP",
      };
      return { ok: true, snapshot, toolsInvoked };
    }
    return { ok: false, status: "ASSESSMENT_UNAVAILABLE", reason: "Observable depth was insufficient after configured depth retries; this does not claim total market liquidity is exhausted.", toolsInvoked };
  } catch (error) {
    const detail = error instanceof McpResponseError ? error.message : "Binance MCP request failed.";
    return { ok: false, status: "ASSESSMENT_UNAVAILABLE", reason: detail, toolsInvoked };
  }
}
