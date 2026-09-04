import { cookies } from "next/headers";
import { assessTrade, type AssessmentRequest, type TradeSide } from "@/lib/risk-engine";
import { fetchMarketSnapshot } from "@/lib/binance-mcp";
import { resolveAccess } from "@/lib/server/access";
import { withBinanceGateway } from "@/lib/server/binance-client";
import { requestOriginAllowed, SESSION_COOKIE } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Body = { symbol?: unknown; side?: unknown; amountUsdt?: unknown; portfolioValueUsdt?: unknown; existingSymbolExposureUsdt?: unknown };
function optionalNumber(value: unknown): number | undefined { return value === undefined || value === null || value === "" ? undefined : Number(value); }

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) return Response.json({ status: "ASSESSMENT_UNAVAILABLE", category: "ORIGIN_REJECTED" }, { status: 403 });
  let body: Body;
  try { body = await request.json() as Body; }
  catch { return Response.json({ status: "INVALID_INPUT", category: "MALFORMED_JSON" }, { status: 400 }); }
  const assessmentRequest: AssessmentRequest = {
    symbol: typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "",
    side: body.side as TradeSide,
    proposedNotional: Number(body.amountUsdt),
    portfolioValue: optionalNumber(body.portfolioValueUsdt),
    existingSymbolExposure: optionalNumber(body.existingSymbolExposureUsdt),
  };
  const inputError = !/^[A-Z0-9]{5,20}$/.test(assessmentRequest.symbol)
    || (assessmentRequest.side !== "BUY" && assessmentRequest.side !== "SELL")
    || !Number.isFinite(assessmentRequest.proposedNotional) || assessmentRequest.proposedNotional <= 0
    || (assessmentRequest.portfolioValue !== undefined && (!Number.isFinite(assessmentRequest.portfolioValue) || assessmentRequest.portfolioValue <= 0))
    || (assessmentRequest.existingSymbolExposure !== undefined && (!Number.isFinite(assessmentRequest.existingSymbolExposure) || assessmentRequest.existingSymbolExposure < 0));
  if (inputError) return Response.json({ status: "INVALID_INPUT", category: "INVALID_ASSESSMENT_REQUEST" }, { status: 400 });
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  let access;
  try { access = await resolveAccess(sessionId); }
  catch { return Response.json({ status: "ASSESSMENT_UNAVAILABLE", category: "SESSION_SERVICE_UNAVAILABLE" }, { status: 503 }); }
  if (!access.ok) return Response.json({ status: "ASSESSMENT_UNAVAILABLE", category: access.category }, { status: 401 });

  try {
    const result = await withBinanceGateway(access.accessToken, async (gateway) => {
      const snapshotResult = await fetchMarketSnapshot(gateway, {
        symbol: assessmentRequest.symbol, side: assessmentRequest.side,
        proposedNotional: assessmentRequest.proposedNotional,
      });
      if (!snapshotResult.ok) return { snapshotResult };
      return { snapshotResult, assessment: assessTrade(snapshotResult.snapshot, assessmentRequest) };
    });
    if (!result.snapshotResult.ok) {
      return Response.json({
        status: result.snapshotResult.status, category: "MARKET_DATA_UNAVAILABLE",
        reason: result.snapshotResult.reason, toolsInvoked: result.snapshotResult.toolsInvoked,
      }, { status: result.snapshotResult.status === "INVALID_INPUT" ? 400 : 503 });
    }
    const snapshot = result.snapshotResult.snapshot;
    const assessment = result.assessment;
    if (!assessment) throw new Error("Assessment was not produced.");
    return Response.json({
      status: assessment.status,
      provenance: {
        source: snapshot.source, symbol: snapshot.symbol, retrievedAt: snapshot.observedAt,
        orderBookDepthUsed: snapshot.orderBookDepthLimit, candleInterval: "5m",
        candleCount: snapshot.candles.length, toolsInvoked: result.snapshotResult.toolsInvoked,
      },
      market: { tickerPrice: snapshot.tickerPrice, bestBid: snapshot.bids[0]?.price, bestAsk: snapshot.asks[0]?.price },
      assessment,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "ASSESSMENT_UNAVAILABLE", category: "MCP_CONNECTION_FAILED" }, { status: 503 });
  }
}
