import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requestOriginAllowed, SESSION_COOKIE } from "@/lib/server/config";
import { deleteSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) await deleteSession(sessionId).catch(() => undefined);
  const response = NextResponse.json({ connected: false });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.headers.set("cache-control", "no-store");
  return response;
}
