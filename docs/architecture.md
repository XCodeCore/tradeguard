# TradeGuard architecture

## Supported Agent OS path

`User → TradeGuard workflow in Codex → Binance Agent OS MCP → captured public responses → MarketSnapshot → risk engine → Assessment`

Codex is the supported authenticated host. The repository-scoped `tradeguard-assess` skill calls only `spot_exchangeInfo`, `spot_tickerPrice`, `spot_klines`, and progressively sized `spot_depth`. Public responses are kept in an ephemeral `/tmp` capture and passed to `scripts/run-tradeguard-assessment.mjs`; the helper invokes the existing adapter and risk engine rather than reproducing calculations in prose.

The dashboard is a presentation and session-history layer. It accepts a manually pasted `tradeguard.assessment.v1` envelope containing only completed assessment data—never OAuth tokens or MCP credentials. The import parser requires all four tool-provenance entries, exactly 60 five-minute candles, valid normalized market fields, a deterministic risk verdict, and a retrieval time no older than 15 minutes. Imported data is labeled `IMPORTED MCP`, not independently claimed as a direct live connection.

## Unsupported custom-web experiment

The standards-based web OAuth prototype reached Binance Agentic authorization with a valid URL client metadata document. Binance then rejected TradeGuard with: “The AI Agent you are using is not currently supported. Please connect using a supported Agent to continue.” The implementation remains in Git history at `ad32a54`; it is removed from the active application. TradeGuard does not spoof a supported client or reuse its credentials.

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
