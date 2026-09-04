import type { Candle, MarketSnapshot, OrderBookLevel } from "../../lib/risk-engine";

export const NOW = 1_800_000_000_000;

export function candles(options: { volatility?: number; count?: number } = {}): Candle[] {
  const volatility = options.volatility ?? 0.001;
  const count = options.count ?? 60;
  let previous = 100;
  return Array.from({ length: count }, (_, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    const close = previous * (1 + direction * volatility / 2);
    const high = Math.max(previous, close) * (1 + volatility);
    const low = Math.min(previous, close) * (1 - volatility);
    const openTime = NOW - (count - index) * 300_000;
    const candle = {
      openTime, open: previous, high, low, close, baseVolume: 10,
      closeTime: openTime + 299_999, quoteVolume: 1_000, tradeCount: 100,
      takerBuyBaseVolume: 5, takerBuyQuoteVolume: 500,
    };
    previous = close;
    return candle;
  });
}

export function levels(side: "bids" | "asks", options: { count?: number; quantity?: number; step?: number } = {}): OrderBookLevel[] {
  const count = options.count ?? 100;
  const quantity = options.quantity ?? 100;
  const step = options.step ?? 0.01;
  return Array.from({ length: count }, (_, index) => ({
    price: side === "asks" ? 100.01 + index * step : 100 - index * step,
    baseQuantity: quantity,
  }));
}

export function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbol: "BTCUSDT", observedAt: NOW, tickerPrice: 100,
    bids: levels("bids"), asks: levels("asks"), candles: candles(),
    orderBookDepthLimit: 100, lastUpdateId: 123, symbolValidated: true,
    source: "BINANCE_AGENT_OS_MCP", ...overrides,
  };
}

export function rawKlines(count = 60): unknown[] {
  return candles({ count }).map((candle) => [
    candle.openTime, String(candle.open), String(candle.high), String(candle.low), String(candle.close),
    String(candle.baseVolume), candle.closeTime, String(candle.quoteVolume), candle.tradeCount,
    String(candle.takerBuyBaseVolume), String(candle.takerBuyQuoteVolume), "0",
  ]);
}

export function rawDepth(count: number, quantity = 100) {
  return {
    lastUpdateId: 123,
    bids: levels("bids", { count, quantity }).map((level) => [String(level.price), String(level.baseQuantity)]),
    asks: levels("asks", { count, quantity }).map((level) => [String(level.price), String(level.baseQuantity)]),
  };
}
