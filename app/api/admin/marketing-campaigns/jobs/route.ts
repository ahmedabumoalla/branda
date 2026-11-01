import { timingSafeEqual } from "node:crypto";
import { runPlatformMarketingJobs } from "@/lib/marketing/platform-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  const headers = { "Cache-Control": "no-store" };
  if (secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers });
  try { return Response.json(await runPlatformMarketingJobs(), { headers }); }
  catch { return Response.json({ error: "platform_campaign_queue_unavailable" }, { status: 503, headers }); }
}
