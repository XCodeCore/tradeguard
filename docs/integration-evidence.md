# Binance Agent OS integration evidence

## Canonical Milestone 1B–1F discovery

Independent live discovery against `binance-mcp-server` established public BTCUSDT spot access through Binance Agent OS/MCP.

Authorization required Binance OAuth and `Read agentic account and market data`. No Trade, Transfer, Futures, master-account, withdrawal, or other elevated permission was enabled or required. OAuth URLs, tokens, authorization codes, cookies, account balances, email addresses, and sensitive material are excluded.

| Tool | Important arguments | Verified response |
| --- | --- | --- |
| `spot_tickerPrice` | `{ symbol: "BTCUSDT" }` | `symbol`, decimal-string `price`; no timestamp |
| `spot_depth` | `{ symbol: "BTCUSDT", limit: 100 }` | `lastUpdateId`, bids/asks as `[price, quantity]`; no timestamp |
| `spot_klines` | `{ symbol, interval: "5m", limit: 60, endTime: completedBoundary }` | 60 completed arrays with times, OHLCV, trade count, taker-buy volumes |
| `spot_ticker24hr` | symbol, optional `FULL`/`MINI` | available, not required |
| `spot_exchangeInfo` | `{ symbol: "BTCUSDT" }` | symbol/trading-status validation |

The depth schema has configurable limit and documents a maximum 5000 entries. TradeGuard starts at 100 and retries 500/1000 only when needed. Five-minute klines are supported and exactly 60 are required.

The accepted live discovery returned ticker data, 100 bids and asks with best prices and `lastUpdateId`, and recent five-minute OHLCV klines. These observations are evidence, never cached production inputs.

## Initial Milestone 2 live calibration

At observation time `1788539524425` ms, fresh MCP calls succeeded for `spot_exchangeInfo`, `spot_tickerPrice`, `spot_klines` (`5m`, 60), and `spot_depth` (100). BTCUSDT status was `TRADING`; 100 bid levels, 100 ask levels, and 60 candles were normalized. A deterministic 10,000 USDT calibration produced:

- BUY: observable depth sufficient, 0% simulated slippage at that snapshot, 752,458.84 USDT same-side depth within 1%, ATR 0.11935%, normalized score 3.125, `PROCEED`.
- SELL: observable depth sufficient, 0% simulated slippage at that snapshot, 2,606,595.33 USDT same-side depth within 1%, ATR 0.11935%, normalized score 0, `PROCEED`.

These time-specific observations are audit evidence only. They are not shipped as fixtures and are never used by production assessments.

## Corrected four-pair calibration

Fresh MCP data was retrieved for BTCUSDT, ETHUSDT, LINKUSDT (medium liquidity), and LQTYUSDT (materially thinner). Every request used `spot_tickerPrice`, `spot_depth` with 100 levels, and `spot_klines` with `interval: "5m"`, `limit: 60`, and `endTime: 1788542399999`. All calls succeeded; every last candle closed exactly at the requested completed boundary.

At a common 1,000 USDT size, observable depth was sufficient for both sides on all four pairs. BTC/ETH showed deep books and negligible spread, LINK occupied the middle liquidity band, and LQTY had roughly 10–11k USDT depth within 0.5%, 0.0892% spread, and 0.0549%/0.0869% BUY/SELL slippage. This evidence supports retaining the existing graduated thresholds while adding non-dilutable severe/critical overrides. Full figures and reasoning are recorded in `architecture.md`.

## Security constraints

- No REST fallback or order-execution tool.
- Fixtures are Vitest-only.
- No OAuth or account secrets stored.

## Custom-web OAuth experiment and supported-host pivot

The custom web prototype used the Agent OS authorization server, authorization-code flow, S256 PKCE, and Binance's advertised URL-based Client ID Metadata Document support. The deployed metadata was technically valid and Binance's Agentic authorization UI was reached. Binance then returned: “The AI Agent you are using is not currently supported. Please connect using a supported Agent to continue.”

That is an application-level supported-agent restriction, not a metadata or PKCE failure. The direct OAuth UI and token/session implementation have been removed from the active product and preserved in Git history. No bypass, client spoofing, hidden credential reuse, or generic Binance Login OAuth is used.

The final supported path runs TradeGuard inside Codex, where the configured Binance Agent OS MCP connection is already authorized for read-agentic/market-data access. Codex collects live public market responses; the repository helper passes them through the existing normalized adapter and deterministic engine. The optional dashboard receives only a fresh completed assessment envelope.

### Supported-path forward test

At retrieval time `1788568311028`, the Codex-hosted workflow assessed a 1,000 USDT `LQTYUSDT` BUY using successful calls to `spot_exchangeInfo`, `spot_tickerPrice`, `spot_klines` with `{ interval: "5m", limit: 60, endTime: 1788568199999 }`, and `spot_depth` with `{ limit: 100 }`. The normalized snapshot contained exactly 60 completed candles and sufficient observable depth.

The unchanged deterministic engine returned score `28.125`, `REDUCE_SIZE`, expected slippage `0.252554%`, same-side 0.5% depth `11,254.69 USDT`, ATR `0.067265%`, and safer amount `318.98 USDT`. This time-specific observation proves the Codex-hosted capture → adapter → engine → envelope path; it is evidence only and is not committed as production data or a fixture.
