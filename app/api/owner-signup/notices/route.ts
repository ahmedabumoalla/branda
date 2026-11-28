import { timingSafeEqual } from "node:crypto";
import { deliverSignupTeamNotice } from "@/lib/whatsapp/signup-team-notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from("Bearer " + secret);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return new Response(null, { status: 401, headers });
  try {
    const until = Date.now() + 60_000;
    let processed = 0;
    while (processed < 10 && Date.now() < until && await deliverSignupTeamNotice()) processed++;
    return Response.json({ processed }, { headers });
  } catch {
    return Response.json({ error: "signup_notice_queue_unavailable" }, { status: 503, headers });
  }
}
