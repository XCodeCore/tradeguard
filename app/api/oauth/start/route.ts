import { beginOAuth } from "@/lib/server/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.redirect(await beginOAuth(), 302);
  } catch {
    return Response.redirect(new URL("/?oauth=configuration_error", "https://tradeguard-rust.vercel.app"), 302);
  }
}
