import { timingSafeEqual } from "node:crypto";
import { runPagerMessageJobs } from "@/lib/pager/worker";
import { runSalonMessageJobs } from "@/lib/salon/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers });
  try {
    const [pager, salon] = await Promise.all([runPagerMessageJobs(), runSalonMessageJobs(20).catch(() => ({ error: "salon_queue_unavailable" }))]);
    return Response.json({ ...pager, salon }, { headers });
  }
  catch { return Response.json({ error: "pager_queue_unavailable" }, { status: 503, headers }); }
}
