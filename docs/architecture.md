# TradeGuard architecture

## Production authorization and assessment path

`Browser → TradeGuard OAuth routes → Binance Agent OS OAuth → encrypted Upstash Redis session → MCP Streamable HTTP → MarketSnapshot → risk engine → Assessment`

The public client identifier is `https://tradeguard-rust.vercel.app/oauth/client-metadata.json`; it declares a public authorization-code client with S256 PKCE and no client secret. OAuth transactions are random, single-use Redis records with a 10-minute TTL. The callback atomically consumes the transaction before exchanging the code.

The browser receives only a 256-bit opaque session ID in an `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` cookie. OAuth token payloads are encrypted with AES-256-GCM, bound to that session ID as authenticated additional data, and stored only in Redis. A refresh token is neither assumed nor requested; if Binance returns one, the session may use the standard refresh grant. Otherwise expiry deletes the session and requires reconnection.

`POST /api/assess` verifies same-origin browser submission, resolves the server-side token, creates an official MCP Streamable HTTP client, and invokes the dependency-injected adapter. It has no Binance REST or fixture fallback. The response separates provenance, compact normalized market measurements, and the deterministic assessment.

## Data flow

`Binance Agent OS/MCP → parser/adapter → MarketSnapshot → risk engine → Assessment`

The MCP boundary is dependency-injected through `BinanceMcpGateway`. A host maps its methods to exact Binance MCP tools. There is no REST client, fallback, order placement, or production fixture path.

`lib/binance-mcp/` owns MCP orchestration, envelope parsing, validation, 60 completed 5-minute candle retrieval, and depth retries. It bounds `spot_klines` with `endTime = floor(requestTime / 5 minutes) × 5 minutes − 1 ms`; any later/open row is ignored. It produces a normalized `MarketSnapshot` or non-financial `INVALID_INPUT`/`ASSESSMENT_UNAVAILABLE` result.

`lib/risk-engine/` is pure TypeScript with no MCP, network, filesystem, AI, or side-effect dependency. Its numerical output is authoritative; future prose may explain verified fields but never change them.

## Failure boundary

- Invalid symbols, sides, amounts, portfolio values, and depth configurations: `INVALID_INPUT`.
- MCP errors, malformed/stale data, missing candles, and insufficient observable depth: `ASSESSMENT_UNAVAILABLE`.
- Failures never become financial-risk verdicts.
- Insufficient observable depth describes the fetched snapshot, not total Binance liquidity.

## Depth and coverage

Depth starts at 100 and retries at 500/1000 only if simulation cannot fill. A caller may supply a strictly increasing supported configuration. It never requests 5000 automatically.

Slippage, liquidity, order size, and volatility are always applicable. Concentration is applicable only with portfolio value. The final score is the arithmetic mean of applicable scores, so omitted concentration inserts no zero and is listed as `Not assessed`. Coverage is `0.8` without concentration and `1.0` with it. If portfolio value exists but current symbol exposure does not, proposal concentration is assessed while `truePostTradeConcentration` is explicitly `Not assessed`.

## Deterministic formulas and thresholds

Each metric maps to scores `0, 25, 50, 75, 100` at the following inclusive boundaries:

- Slippage: `≤0.10%, ≤0.25%, ≤0.50%, ≤1.00%, >1.00%`.
- Spread: `≤0.02%, ≤0.05%, ≤0.10%, ≤0.20%, >0.20%`.
- Same-side quote depth within 0.5%: `≥1,000,000, ≥250,000, ≥50,000, ≥10,000, <10,000 USDT` (risk order is reversed).
- Order size ratio: `≤5%, ≤10%, ≤25%, ≤50%, >50%`.
- ATR%: `≤0.50%, ≤1.00%, ≤2.00%, ≤4.00%, >4.00%`.
- Concentration: `≤10%, ≤20%, ≤35%, ≤50%, >50%`.

Formulas:

- Target base quantity = proposed USDT notional / relevant best price.
- VWAP = total quote value filled / total base quantity filled.
- BUY slippage% = `(VWAP / best ask − 1) × 100`; SELL = `(1 − VWAP / best bid) × 100`.
- Spread% = `(best ask − best bid) / ((best ask + best bid) / 2) × 100`.
- Same-side quote depth = `Σ(price × base quantity)` inside the 0.5% or 1% boundary; BUY uses asks, SELL uses bids.
- Liquidity score = `(spread score + 0.5%-depth score) / 2`.
- Order size ratio% = `proposed notional / same-side quote depth within 1% × 100`.
- True range = `max(high−low, |high−previous close|, |low−previous close|)`; ATR% = mean of the latest 14 true ranges / latest close × 100.
- Log-return standard deviation uses population variance across `ln(close[t]/close[t−1])` for the 60-candle window.
- Recent range% = `(highest high − lowest low) / lowest low × 100`.
- Proposal concentration% = `proposed notional / portfolio value × 100`.
- Known-exposure BUY post-trade concentration% = `(existing symbol exposure + proposed notional) / portfolio value × 100`.
- Known-exposure SELL post-trade concentration% = `max(0, existing symbol exposure − proposed notional) / portfolio value × 100`.
- With known exposure, concentration is scored from side-aware post-trade concentration. With unknown exposure, it is scored from proposal concentration and true post-trade concentration remains unknown.
- Overall score = arithmetic mean of applicable component scores. ATR% alone determines the volatility component score; other volatility values are diagnostic.

Verdicts: score `<25` is `PROCEED`; `25 ≤ score < 50` is `REDUCE_SIZE`; score `≥50` is `DO_NOT_PROCEED`.

Critical-risk overrides are authoritative after averaging:

- Any raw slippage, spread, observable-depth, order-size, or volatility score of `100` forces `DO_NOT_PROCEED`.
- Any such raw score of `75` forces at least `REDUCE_SIZE`.
- Concentration uses the same override rule for BUY with known exposure and for proposal-only assessments. A known-exposure SELL is concentration-reducing, so remaining concentration is reported/scored but cannot independently trigger the override.

Safer amount is the USDT-cent-rounded-down minimum of: proposed amount, 10% of same-side 1% quote depth, and notional visible inside 0.25% slippage. Concentration adds `20% × portfolio − existing exposure` for known BUY, `20% × portfolio` when exposure is unknown, and no concentration cap for a known concentration-reducing SELL.

## Four-pair threshold calibration

Fresh 100-level books and 60 completed candles were sampled at completed-candle cutoff `1788542399999`. A common 1,000 USDT BUY/SELL proposal was used so pair liquidity—not changing order size—drove comparison.

| Pair | Role | Spread | 0.5% ask/bid depth | ATR% | 1,000 USDT BUY/SELL slippage | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| BTCUSDT | benchmark | 0.000013% | 1.185M / 1.823M | 0.1375% | 0% / 0% | PROCEED / PROCEED |
| ETHUSDT | benchmark | 0.000408% | 759k / 884k | 0.1550% | 0% / 0% | PROCEED / PROCEED |
| LINKUSDT | medium | 0.008603% | 213k / 205k | 0.2537% | 0% / 0% | PROCEED / PROCEED |
| LQTYUSDT | materially thinner | 0.089246% | 11.4k / 10.2k | 0.2616% | 0.0549% / 0.0869% | REDUCE_SIZE / REDUCE_SIZE override |

The base thresholds were retained: they separate BTC, ETH, LINK, and LQTY into progressively higher depth/spread bands without declaring a small fill impossible. The new severity override is the calibration-driven correction: LQTY’s raw depth score of 75 now prevents its low average from producing `PROCEED`. The `<10k` depth, `>0.20%` spread, `>1%` slippage, `>50%` order ratio, and `>4%` ATR bands remain critical and force `DO_NOT_PROCEED`.
