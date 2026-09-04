# TradeGuard

TradeGuard is a deterministic pre-trade risk assessor for Binance spot proposals. Milestone 2 implements:

`Binance Agent OS/MCP → normalized MarketSnapshot → deterministic Risk Engine → Assessment`

It does not place orders and does not include the polished dashboard yet.

## Requirements

- System Node.js 24 and npm 11
- Binance Agent OS OAuth with `Read agentic account and market data`

No Trade, Transfer, Futures, master-account, withdrawal, or elevated permission is required. Never commit OAuth URLs, tokens, codes, cookies, balances, email addresses, or secrets.

## Commands

```bash
npm test
npm run lint
npm run build
```

Run the production build only when `df -h /` shows at least 1 GB free.

## Structure

- `lib/binance-mcp`: verified MCP parsing/normalization; 60 completed `5m` candles using a completed-boundary `endTime`; depth 100 then 500/1000 only when necessary.
- `lib/risk-engine`: pure deterministic TypeScript with no network calls.
- `tests/fixtures`: test-only data, never a production fallback.
- `docs/architecture.md`: boundaries and failure semantics.
- `docs/integration-evidence.md`: canonical Binance Agent OS evidence.

Statuses: `PROCEED`, `REDUCE_SIZE`, `DO_NOT_PROCEED`, `ASSESSMENT_UNAVAILABLE`, `INVALID_INPUT`. Data failures are never financial-risk verdicts.
