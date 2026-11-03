import { timingSafeEqual } from "node:crypto";
import { retryWalletNotificationJobs } from "@/lib/wallet";
import { dispatchWalletWelcomes } from "@/lib/wallet/welcome";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const [notifications, welcomes] = await Promise.all([retryWalletNotificationJobs(10), dispatchWalletWelcomes(undefined, 5)]);
    return Response.json({ ...notifications, welcomes }, { headers: { "cache-control": "no-store" } });
  }
  catch { return Response.json({ error: "wallet_queue_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
