# TradeGuard

TradeGuard is a deterministic pre-trade risk assessor for Binance spot proposals. Its production path is:

`Browser → OAuth → encrypted Redis session → Binance Agent OS/MCP → normalized MarketSnapshot → deterministic Risk Engine → Assessment`

It analyzes proposals only and cannot place orders.

## Requirements

- System Node.js 24 and npm 11
- Binance Agent OS OAuth with `Read agentic account and market data`

No Trade, Transfer, Futures, master-account, withdrawal, or elevated permission is required. Never commit OAuth URLs, tokens, codes, cookies, balances, email addresses, or secrets.

Production requires `UPSTASH_REDIS_REST_KV_REST_API_URL`, `UPSTASH_REDIS_REST_KV_REST_API_TOKEN`, and `TRADEGUARD_TOKEN_ENCRYPTION_KEY`. Values are server-only and must never use a `NEXT_PUBLIC_` prefix.

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
- `lib/server`: Agent OS OAuth, AES-256-GCM token protection, durable Redis sessions, and the official MCP Streamable HTTP client.
- `app/api/assess`: authenticated live assessment endpoint; operational failures return `ASSESSMENT_UNAVAILABLE` rather than a risk verdict.
- `tests/fixtures`: test-only data, never a production fallback.
- `docs/architecture.md`: boundaries and failure semantics.
- `docs/integration-evidence.md`: canonical Binance Agent OS evidence.

Statuses: `PROCEED`, `REDUCE_SIZE`, `DO_NOT_PROCEED`, `ASSESSMENT_UNAVAILABLE`, `INVALID_INPUT`. Data failures are never financial-risk verdicts.
