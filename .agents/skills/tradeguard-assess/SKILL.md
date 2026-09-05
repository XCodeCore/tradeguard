---
name: tradeguard-assess
description: Assess a proposed Binance Spot trade with live Binance Agent OS MCP market data and TradeGuard's deterministic engine. Use for pre-trade safety checks, safer-size reassessments, or TradeGuard demo scenarios; never use it to place orders.
---

# TradeGuard assessment

Accept `symbol`, `side` (`BUY` or `SELL`), `amountUsdt`, and optional `portfolioValueUsdt` and `existingExposureUsdt`. Ask only for a missing required value.

Use only the configured `binance-mcp-server`. Never call REST, trading, transfer, account, Futures, margin, or withdrawal tools. Do not inspect, print, or persist OAuth credentials.

1. Record a fresh Unix timestamp in milliseconds and compute `completedThrough = floor(timestamp / 300000) * 300000 - 1`.
2. Call `spot_exchangeInfo` with the uppercase symbol, `spot_tickerPrice` with the symbol, `spot_klines` with `{ symbol, interval: "5m", limit: 60, endTime: completedThrough }`, and `spot_depth` with `{ symbol, limit: 100 }`.
3. Put the request, timestamp, and exact raw public responses in `/tmp/tradeguard-market.json` using the schema expected by `scripts/captured-assessment.ts`. Store depth under `responses.depth["100"]`. This is ephemeral public market data, never a repository fixture.
4. From the TradeGuard project root run `node scripts/run-tradeguard-assessment.mjs /tmp/tradeguard-market.json`.
5. If the deterministic output requests `nextDepthLimit`, fetch that exact depth through `spot_depth`, add it to the temporary input, and rerun. Stop after 1000. Do not automatically fetch deeper levels.
6. If the output is an assessment envelope, return its verified values concisely and include the complete JSON in a fenced block for optional dashboard import. Never revise its score, safer amount, or verdict. If it is unavailable or invalid, report that operational status and never label it live.

Use `Source: Binance Agent OS` only after all MCP calls and deterministic processing succeed. The explanation may clarify envelope fields but must not introduce unverified market claims.
