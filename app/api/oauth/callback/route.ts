import { NextResponse } from "next/server";
import { SESSION_COOKIE, TRADEGUARD_ORIGIN } from "@/lib/server/config";
import { consumeOAuthTransaction, exchangeAuthorizationCode } from "@/lib/server/oauth";
import { newSessionId, saveSession, sessionLifetimeSeconds } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function outcome(name: string) { return new URL(`/?oauth=${name}`, TRADEGUARD_ORIGIN); }

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const state = query.get("state");
  if (!state) return NextResponse.redirect(outcome("invalid_state"));
  let transaction;
  try { transaction = await consumeOAuthTransaction(state); }
  catch { return NextResponse.redirect(outcome("storage_error")); }
  if (!transaction || transaction.state !== state || transaction.expiresAt <= Date.now()) return NextResponse.redirect(outcome("invalid_state"));
  if (query.has("error")) return NextResponse.redirect(outcome("authorization_denied"));
  const code = query.get("code");
  if (!code) return NextResponse.redirect(outcome("missing_code"));
  const issuer = query.get("iss");
  if (issuer && issuer !== "https://agent.binance.com") return NextResponse.redirect(outcome("issuer_mismatch"));
  try {
    const tokens = await exchangeAuthorizationCode(code, transaction.codeVerifier);
    const sessionId = newSessionId();
    await saveSession(sessionId, tokens);
    const response = NextResponse.redirect(outcome("connected"));
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/",
      maxAge: sessionLifetimeSeconds(tokens),
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(outcome("token_exchange_failed"));
  }
}
