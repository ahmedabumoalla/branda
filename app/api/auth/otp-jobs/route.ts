import { timingSafeEqual } from "node:crypto";
import { runOtpDeliveryJobs } from "@/lib/auth/otp-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response(null, { status: 401, headers });
  }
  try { return Response.json(await runOtpDeliveryJobs(), { headers }); }
  catch { return Response.json({ error: "otp_queue_unavailable" }, { status: 503, headers }); }
}
