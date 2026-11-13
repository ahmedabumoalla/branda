import { timingSafeEqual } from "node:crypto";
import { runSubscriptionRenewalReminders } from "@/lib/subscriptions/renewal-reminders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(secret ? `Bearer ${secret}` : ""), supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return new Response(null,{ status:401,headers });
  try { return Response.json(await runSubscriptionRenewalReminders(),{headers}); }
  catch { return Response.json({error:"subscription_reminders_unavailable"},{status:503,headers}); }
}
