import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/server/config";
import { resolveAccess } from "@/lib/server/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
    const access = await resolveAccess(sessionId);
    return Response.json({ connected: access.ok, category: access.ok ? null : access.category }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ connected: false, category: "SERVICE_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
