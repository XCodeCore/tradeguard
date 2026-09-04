import { deleteSession, readSession, saveSession, tokenIsUsable } from "./session";
import { refreshAccessToken } from "./oauth";

export type AccessResult =
  | { ok: true; accessToken: string; expiresAt: number }
  | { ok: false; category: "NOT_CONNECTED" | "RECONNECT_REQUIRED" };

export async function resolveAccess(sessionId: string | undefined): Promise<AccessResult> {
  if (!sessionId) return { ok: false, category: "NOT_CONNECTED" };
  const tokens = await readSession(sessionId);
  if (!tokens) return { ok: false, category: "NOT_CONNECTED" };
  if (tokenIsUsable(tokens)) return { ok: true, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt };
  if (!tokens.refreshToken) {
    await deleteSession(sessionId);
    return { ok: false, category: "RECONNECT_REQUIRED" };
  }
  try {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    await saveSession(sessionId, refreshed);
    return { ok: true, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
  } catch {
    await deleteSession(sessionId);
    return { ok: false, category: "RECONNECT_REQUIRED" };
  }
}
