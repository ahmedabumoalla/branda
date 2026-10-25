import { timingSafeEqual } from "node:crypto";
import { dispatchShiftAlerts } from "@/lib/data/finance-shift-alerts";
import { dispatchFinancePosCustomerMessages } from "@/lib/data/finance-pos-customer-messages";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const headers = { "Cache-Control": "no-store" };
  if (secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers });
  const [shifts, customers] = await Promise.allSettled([dispatchShiftAlerts(), dispatchFinancePosCustomerMessages()]);
  const healthy = shifts.status === "fulfilled" && customers.status === "fulfilled";
  return Response.json({
    ...(shifts.status === "fulfilled" ? shifts.value : { error: "finance_alert_queue_unavailable" }),
    posCustomer: customers.status === "fulfilled" ? customers.value : { error: "finance_customer_queue_unavailable" },
  }, { status: healthy ? 200 : 503, headers });
}
