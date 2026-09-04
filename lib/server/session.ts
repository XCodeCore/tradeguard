import { randomBytes } from "node:crypto";
import { decryptJson, encryptJson } from "./encryption";
import type { OAuthTokens } from "./oauth";
import { getRedis } from "./redis";

const SESSION_PREFIX = "tg:session:";
const CLOCK_SKEW_MS = 30_000;
const REFRESH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function newSessionId(): string { return randomBytes(32).toString("base64url"); }
function sessionKey(sessionId: string): string { return `${SESSION_PREFIX}${sessionId}`; }
export function sessionLifetimeSeconds(tokens: OAuthTokens): number {
  return tokens.refreshToken ? REFRESH_SESSION_TTL_SECONDS : Math.max(60, Math.ceil((tokens.expiresAt - Date.now()) / 1000));
}

export async function saveSession(sessionId: string, tokens: OAuthTokens): Promise<void> {
  await getRedis().set(sessionKey(sessionId), encryptJson(tokens, sessionId), { ex: sessionLifetimeSeconds(tokens) });
}

export async function readSession(sessionId: string): Promise<OAuthTokens | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionId)) return null;
  const encoded = await getRedis().get<string>(sessionKey(sessionId));
  if (typeof encoded !== "string") return null;
  return decryptJson<OAuthTokens>(encoded, sessionId);
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (/^[A-Za-z0-9_-]{43}$/.test(sessionId)) await getRedis().del(sessionKey(sessionId));
}

export function tokenIsUsable(tokens: OAuthTokens): boolean { return tokens.expiresAt - Date.now() > CLOCK_SKEW_MS; }
