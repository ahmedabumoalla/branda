import { timingSafeEqual } from "node:crypto";
import { runHospitalNotifications } from "@/lib/commerce/hospital-notifications";
import { runHospitalCustomerMessages } from "@/lib/commerce/hospital-customer-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  const actualBytes = Buffer.from(supplied), expectedBytes = Buffer.from(expected);
  if (!secret || actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { const [orders, customers] = await Promise.all([runHospitalNotifications(), runHospitalCustomerMessages()]); return Response.json({ ...orders, customers }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Hospital notifications unavailable" }, { status: 503 }); }
}
