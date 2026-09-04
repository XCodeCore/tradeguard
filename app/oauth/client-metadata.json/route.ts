import { BINANCE_OAUTH_CLIENT_METADATA } from "@/lib/server/client-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(BINANCE_OAUTH_CLIENT_METADATA, { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}
