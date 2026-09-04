import { describe, expect, it, vi } from "vitest";
import { createBinanceMcpGateway, fetchMarketSnapshot, parseCompletedKlines, parseDepth, parseKlines, parseTicker } from "../lib/binance-mcp";
import type { BinanceMcpGateway } from "../lib/binance-mcp";
import { NOW, rawDepth, rawKlines } from "./fixtures/market";

function wrapper(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError: false };
}

function gateway(depth: (limit: number) => unknown = (limit) => rawDepth(limit)): BinanceMcpGateway {
  return {
    spot_tickerPrice: vi.fn(async () => ({ structuredContent: { symbol: "BTCUSDT", price: "100.00" }, isError: false })),
    spot_depth: vi.fn(async ({ limit }) => wrapper(depth(limit))),
    spot_klines: vi.fn(async () => wrapper(rawKlines())),
    spot_exchangeInfo: vi.fn(async () => wrapper({ symbols: [{ symbol: "BTCUSDT", status: "TRADING" }] })),
  };
}

describe("Binance MCP response parsing", () => {
  it("maps gateway methods to the exact verified MCP tool names", async () => {
    const execute = vi.fn(async () => wrapper({ symbol: "BTCUSDT", price: "100" }));
    const client = createBinanceMcpGateway(execute);
    await client.spot_tickerPrice({ symbol: "BTCUSDT" });
    expect(execute).toHaveBeenCalledWith("spot_tickerPrice", { symbol: "BTCUSDT" });
  });

  it("normalizes ticker, order book and exactly 60 klines", () => {
    expect(parseTicker(wrapper({ symbol: "BTCUSDT", price: "100.50" }), "BTCUSDT").price).toBe(100.5);
    expect(parseDepth(wrapper(rawDepth(100))).asks).toHaveLength(100);
    expect(parseKlines(wrapper(rawKlines()))).toHaveLength(60);
  });

  it("rejects malformed MCP data", () => {
    expect(() => parseTicker(wrapper({ symbol: "BTCUSDT", price: "bad" }), "BTCUSDT")).toThrow();
    expect(() => parseDepth(wrapper({ bids: [], asks: [] }))).toThrow();
    expect(() => parseKlines(wrapper(rawKlines(59)))).toThrow();
  });

  it("ignores a still-open candle and keeps 60 completed candles", () => {
    const open = [...rawKlines(1)[0] as unknown[]];
    open[0] = NOW;
    open[6] = NOW + 299_999;
    const result = parseCompletedKlines(wrapper([...rawKlines(), open]), NOW - 1, 60);
    expect(result).toHaveLength(60);
    expect(result.at(-1)?.closeTime).toBe(NOW - 1);
  });
});

describe("normalized Binance MCP adapter", () => {
  it("uses verified tools and starts at depth 100", async () => {
    const client = gateway();
    const result = await fetchMarketSnapshot(client, { symbol: "BTCUSDT", side: "BUY", proposedNotional: 1_000 }, () => NOW);
    expect(result.ok).toBe(true);
    expect(result.toolsInvoked).toEqual([
      { name: "spot_exchangeInfo", arguments: { symbol: "BTCUSDT" } },
      { name: "spot_tickerPrice", arguments: { symbol: "BTCUSDT" } },
      { name: "spot_klines", arguments: { symbol: "BTCUSDT", interval: "5m", limit: 60, endTime: NOW - 1 } },
      { name: "spot_depth", arguments: { symbol: "BTCUSDT", limit: 100 } },
    ]);
    if (result.ok) {
      expect(result.snapshot.orderBookDepthLimit).toBe(100);
      expect(result.snapshot.candles.at(-1)?.closeTime).toBeLessThanOrEqual(NOW - 1);
    }
  });

  it("progressively retries 100, 500 and 1000 levels", async () => {
    const client = gateway((limit) => rawDepth(limit, limit < 1000 ? 0.001 : 1));
    const result = await fetchMarketSnapshot(client, { symbol: "BTCUSDT", side: "BUY", proposedNotional: 50_000 }, () => NOW);
    expect(result.ok).toBe(true);
    expect(client.spot_depth).toHaveBeenCalledTimes(3);
    if (result.ok) expect(result.snapshot.orderBookDepthLimit).toBe(1000);
  });

  it("returns unavailable after configured depth is still insufficient", async () => {
    const client = gateway((limit) => rawDepth(limit, 0.0001));
    const result = await fetchMarketSnapshot(client, { symbol: "BTCUSDT", side: "SELL", proposedNotional: 1_000 }, () => NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("ASSESSMENT_UNAVAILABLE");
      expect(result.reason).toContain("does not claim total market liquidity");
    }
  });

  it("returns INVALID_INPUT for an unsupported symbol", async () => {
    const client = gateway();
    client.spot_exchangeInfo = vi.fn(async () => wrapper({ symbols: [] }));
    const result = await fetchMarketSnapshot(client, { symbol: "NOPEUSDT", side: "BUY", proposedNotional: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("INVALID_INPUT");
  });

  it("maps network and MCP failures to unavailable, never a risk verdict", async () => {
    const client = gateway();
    client.spot_tickerPrice = vi.fn(async () => { throw new Error("network down"); });
    const result = await fetchMarketSnapshot(client, { symbol: "BTCUSDT", side: "BUY", proposedNotional: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("ASSESSMENT_UNAVAILABLE");
  });

  it("validates amounts and custom depth configuration before MCP calls", async () => {
    const client = gateway();
    const badAmount = await fetchMarketSnapshot(client, { symbol: "BTCUSDT", side: "BUY", proposedNotional: 0 });
    const badDepth = await fetchMarketSnapshot(client, { symbol: "BTCUSDT", side: "BUY", proposedNotional: 1, depthLimits: [500, 100] });
    expect(!badAmount.ok && badAmount.status).toBe("INVALID_INPUT");
    expect(!badDepth.ok && badDepth.status).toBe("INVALID_INPUT");
    expect(client.spot_exchangeInfo).not.toHaveBeenCalled();
  });
});
