# TradeGuard submission checklist

## Milestone 2

- [x] Independent Next.js/TypeScript/Tailwind/App Router/ESLint baseline
- [x] Verified read-only Binance MCP gateway
- [x] OAuth/read permission distinction documented
- [x] MCP parsing isolated from deterministic calculations
- [x] Normalized snapshot, 60 five-minute candles, configurable depth retries
- [x] BUY/SELL VWAP, spread/depth, order-size, volatility, concentration
- [x] Side-aware known-exposure concentration and proposal-only unknown-exposure semantics
- [x] Severe/critical non-dilution override rules
- [x] Four-pair live threshold calibration
- [x] Normalized scoring, deterministic safer amount, failure statuses
- [x] Required automated coverage
- [x] Polished responsive dashboard shell
- [x] Public Agent OS OAuth client metadata and S256 PKCE flow
- [x] Encrypted durable Redis session architecture
- [x] Official MCP Streamable HTTP client wired to normalized adapter
- [ ] Deployed OAuth consent flow validated
- [ ] Live production BTCUSDT and ETHUSDT assessment validated
- [ ] Real order execution — prohibited

## Security

- [x] No REST or production-fixture fallback
- [x] No execution method
- [x] No OAuth URLs, tokens, codes, cookies, balances, emails, or secrets
