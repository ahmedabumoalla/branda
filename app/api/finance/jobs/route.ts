import { timingSafeEqual } from "node:crypto";
import { dispatchShiftAlerts } from "@/lib/data/finance-shift-alerts";
import { dispatchFinancePosCustomerMessages } from "@/lib/data/finance-pos-customer-messages";
import { createFinanceCustomerReceiptPdf } from "@/lib/data/finance-customer-receipt";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const headers = { "Cache-Control": "no-store" };
  if (secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers });
  // Private deployment probe: fixed synthetic receipt, no queue, customer lookup or message send.
  if (new URL(request.url).searchParams.get("check") === "receipt") {
    try {
      const pdf = await createFinanceCustomerReceiptPdf({
        brandName: "اختبار الإيصال", number: 1, createdAt: "2026-10-27T12:00:00Z", localReference: null,
        subtotal: 11.5, discount: 0, tax: 1.5, total: 11.5, paid: 11.5,
        vatRate: 15, taxInclusive: true, paymentMethod: "cash", note: "عينة اختبار وليست فاتورة بيع",
        lines: [{ name: "قهوة عربية", quantity: 1, unitPrice: 11.5, net: 10, tax: 1.5 }],
      });
      return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=receipt-check.pdf" } });
    } catch {
      return Response.json({ error: "finance_receipt_renderer_unavailable" }, { status: 503, headers });
    }
  }
  const [shifts, customers] = await Promise.allSettled([dispatchShiftAlerts(), dispatchFinancePosCustomerMessages()]);
  const healthy = shifts.status === "fulfilled" && customers.status === "fulfilled";
  return Response.json({
    ...(shifts.status === "fulfilled" ? shifts.value : { error: "finance_alert_queue_unavailable" }),
    posCustomer: customers.status === "fulfilled" ? customers.value : { error: "finance_customer_queue_unavailable" },
  }, { status: healthy ? 200 : 503, headers });
}
