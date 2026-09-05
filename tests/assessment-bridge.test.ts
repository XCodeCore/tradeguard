import { describe, expect, it } from "vitest";
import { parseAssessmentEnvelope } from "../lib/assessment-bridge";
import { assessCapturedMarket, type CapturedMarketInput } from "../scripts/captured-assessment";
import { NOW, rawDepth, rawKlines } from "./fixtures/market";

function wrapper(value: unknown) { return { content: [{ type: "text", text: JSON.stringify(value) }], isError: false }; }
function captured(quantity = 100): CapturedMarketInput {
  return {
    request: { symbol: "BTCUSDT", side: "BUY", amountUsdt: 1_000 }, retrievedAt: NOW,
    responses: {
      exchangeInfo: wrapper({ symbols: [{ symbol: "BTCUSDT", status: "TRADING" }] }),
      tickerPrice: wrapper({ symbol: "BTCUSDT", price: "100" }),
      klines: wrapper(rawKlines()), depth: { "100": wrapper(rawDepth(100, quantity)) },
    },
  };
}

describe("Codex-hosted assessment orchestration", () => {
  it("routes captured MCP responses through the existing adapter and engine", async () => {
    const result = await assessCapturedMarket(captured());
    expect(result).toMatchObject({ schemaVersion: "tradeguard.assessment.v1", generatedBy: "CODEX_HOSTED_TRADEGUARD", provenance: { source: "BINANCE_AGENT_OS_MCP", candleCount: 60, orderBookDepthUsed: 100 }, assessment: { status: "PROCEED" } });
    expect("provenance" in result && result.provenance.toolsInvoked.map((tool) => tool.name)).toEqual(["spot_exchangeInfo", "spot_tickerPrice", "spot_klines", "spot_depth"]);
  });

  it("requests progressive observable depth instead of claiming total liquidity exhaustion", async () => {
    const result = await assessCapturedMarket(captured(0.0001));
    expect(result).toMatchObject({ status: "ASSESSMENT_UNAVAILABLE", nextDepthLimit: 500 });
  });

  it("accepts a fresh complete envelope and rejects stale or incomplete provenance", async () => {
    const result = await assessCapturedMarket(captured());
    expect("schemaVersion" in result && parseAssessmentEnvelope(JSON.stringify(result), NOW)).toMatchObject({ request: { symbol: "BTCUSDT" } });
    if (!("provenance" in result)) throw new Error("Expected assessment envelope.");
    expect(() => parseAssessmentEnvelope(JSON.stringify(result), NOW + 16 * 60_000)).toThrow(/stale/);
    const incomplete = { ...result, provenance: { ...result.provenance, toolsInvoked: result.provenance.toolsInvoked.filter((tool) => tool.name !== "spot_depth") } };
    expect(() => parseAssessmentEnvelope(JSON.stringify(incomplete), NOW)).toThrow(/incomplete/);
  });
});
