import { timingSafeEqual } from "node:crypto";
import { runMeramRejections } from "@/lib/commerce/meram-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const headers = { "Cache-Control": "no-store" };
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers });
  try { return Response.json(await runMeramRejections(), { headers }); }
  catch { return Response.json({ error: "order_notifications_unavailable" }, { status: 503, headers }); }
}
