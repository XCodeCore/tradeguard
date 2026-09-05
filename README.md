# TradeGuard

TradeGuard is an explainable pre-trade safety agent built on Binance Agent OS. It evaluates a proposed trade against live market conditions before the user acts:

`User → TradeGuard in Codex → Binance Agent OS MCP → normalized MarketSnapshot → deterministic Risk Engine → Assessment → optional dashboard import`

Codex is the supported Agent OS host. Binance supplies live market data; TradeGuard calculates execution risk deterministically; the dashboard presents completed assessments and session history. TradeGuard does not predict prices or place orders.

## Requirements

- System Node.js 24 and npm 11
- A supported Codex Binance Agent OS connection with `Read agentic account and market data`

No Trade, Transfer, Futures, master-account, withdrawal, or elevated permission is required. Never commit OAuth URLs, tokens, codes, cookies, balances, email addresses, or secrets.

Direct custom-web OAuth was explored with valid client metadata, but Binance rejected the custom agent as unsupported. TradeGuard does not bypass or spoof that restriction.

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
- `.agents/skills/tradeguard-assess`: supported repository-scoped Codex live assessment workflow.
- `scripts/captured-assessment.ts`: deterministic bridge from captured MCP responses to the existing adapter and engine.
- `lib/assessment-bridge`: validates fresh completed assessment envelopes for manual dashboard import.
- `tests/fixtures`: test-only data, never a production fallback.
- `docs/architecture.md`: boundaries and failure semantics.
- `docs/integration-evidence.md`: canonical Binance Agent OS evidence.

Statuses: `PROCEED`, `REDUCE_SIZE`, `DO_NOT_PROCEED`, `ASSESSMENT_UNAVAILABLE`, `INVALID_INPUT`. Data failures are never financial-risk verdicts.
