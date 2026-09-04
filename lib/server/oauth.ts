import { createHash, randomBytes } from "node:crypto";
import {
  BINANCE_AUTHORIZATION_URL, BINANCE_MCP_URL, BINANCE_TOKEN_URL, CLIENT_METADATA_URL,
  OAUTH_CALLBACK_URL, OAUTH_TRANSACTION_TTL_SECONDS,
} from "./config";
import { getRedis } from "./redis";

export type OAuthTransaction = { state: string; codeVerifier: string; createdAt: number; expiresAt: number };
export type OAuthTokens = {
  accessToken: string; refreshToken?: string; tokenType: string; scope?: string;
  issuedAt: number; expiresAt: number;
};

function randomBase64Url(bytes = 32): string { return randomBytes(bytes).toString("base64url"); }
export function pkceChallenge(verifier: string): string { return createHash("sha256").update(verifier).digest("base64url"); }
export function oauthTransactionKey(state: string): string { return `tg:oauth:${state}`; }

export async function beginOAuth(): Promise<URL> {
  const state = randomBase64Url();
  const codeVerifier = randomBase64Url(48);
  const now = Date.now();
  const transaction: OAuthTransaction = { state, codeVerifier, createdAt: now, expiresAt: now + OAUTH_TRANSACTION_TTL_SECONDS * 1000 };
  await getRedis().set(oauthTransactionKey(state), transaction, { ex: OAUTH_TRANSACTION_TTL_SECONDS });
  const url = new URL(BINANCE_AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_METADATA_URL);
  url.searchParams.set("redirect_uri", OAUTH_CALLBACK_URL);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", BINANCE_MCP_URL);
  return url;
}

export async function consumeOAuthTransaction(state: string): Promise<OAuthTransaction | null> {
  return getRedis().getdel<OAuthTransaction>(oauthTransactionKey(state));
}

type TokenPayload = { access_token?: unknown; refresh_token?: unknown; token_type?: unknown; expires_in?: unknown; scope?: unknown };

function parseTokenPayload(payload: TokenPayload, fallbackRefreshToken?: string): OAuthTokens {
  if (typeof payload.access_token !== "string" || payload.access_token.length < 1) throw new Error("OAuth token response did not contain an access token.");
  const expiresIn = Number(payload.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error("OAuth token response did not contain a valid expiry.");
  const now = Date.now();
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : fallbackRefreshToken,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
    issuedAt: now,
    expiresAt: now + expiresIn * 1000,
  };
}

async function tokenRequest(parameters: URLSearchParams): Promise<TokenPayload> {
  const response = await fetch(BINANCE_TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: parameters, cache: "no-store",
  });
  if (!response.ok) throw new Error("OAuth token exchange was rejected.");
  return response.json() as Promise<TokenPayload>;
}

export async function exchangeAuthorizationCode(code: string, verifier: string): Promise<OAuthTokens> {
  const parameters = new URLSearchParams({
    grant_type: "authorization_code", code, client_id: CLIENT_METADATA_URL,
    redirect_uri: OAUTH_CALLBACK_URL, code_verifier: verifier, resource: BINANCE_MCP_URL,
  });
  return parseTokenPayload(await tokenRequest(parameters));
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const parameters = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: refreshToken,
    client_id: CLIENT_METADATA_URL, resource: BINANCE_MCP_URL,
  });
  return parseTokenPayload(await tokenRequest(parameters), refreshToken);
}
