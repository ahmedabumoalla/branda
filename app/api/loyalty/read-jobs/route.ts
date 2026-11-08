import { timingSafeEqual } from "node:crypto";
import { processLoyaltyReads } from "@/lib/data/loyalty-read-operations";
import { dispatchStampCardLinks } from "@/lib/loyalty/read-card-links";
import { retryWalletNotificationJobs } from "@/lib/wallet";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(secret ? `Bearer ${secret}` : ""), supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const operations = await processLoyaltyReads({ limit: 50 });
    const deliveries = await Promise.allSettled([retryWalletNotificationJobs(5, operations.cardIds), dispatchStampCardLinks(3)]);
    const wallet = deliveries[0].status === "fulfilled" ? deliveries[0].value : { deferred: true };
    const links = deliveries[1].status === "fulfilled" ? deliveries[1].value : { deferred: true };
    return Response.json({ operations, wallet, links }, { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "loyalty_read_queue_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
