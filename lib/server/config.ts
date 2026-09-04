export const BINANCE_MCP_URL = "https://agent.binance.com/mcp/agentic";
export const BINANCE_AUTHORIZATION_URL = "https://accounts.binance.com/agentic-oauth/authorize";
export const BINANCE_TOKEN_URL = "https://accounts.binance.com/oauth-agentic/token";
export const TRADEGUARD_ORIGIN = "https://tradeguard-rust.vercel.app";
export const CLIENT_METADATA_URL = `${TRADEGUARD_ORIGIN}/oauth/client-metadata.json`;
export const OAUTH_CALLBACK_URL = `${TRADEGUARD_ORIGIN}/api/oauth/callback`;
export const SESSION_COOKIE = "tradeguard_session";
export const OAUTH_TRANSACTION_TTL_SECONDS = 600;

export function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === TRADEGUARD_ORIGIN) return true;
  return process.env.NODE_ENV === "development" && (origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000");
}

export function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}
