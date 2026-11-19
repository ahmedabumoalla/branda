import { timingSafeEqual } from "node:crypto";
import { runOwnerCompanionGuides } from "@/lib/whatsapp/owner-guide-delivery";
import { sendGreenApiOwnerCompanionGuide } from "@/lib/whatsapp/green-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers });
  try { return Response.json(await runOwnerCompanionGuides(sendGreenApiOwnerCompanionGuide), { headers }); }
  catch { return Response.json({ error: "owner_guide_queue_unavailable" }, { status: 503, headers }); }
}
