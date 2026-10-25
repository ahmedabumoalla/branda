import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { isGreenApiConfigured, sendGreenApiFinanceShiftAlert } from "@/lib/whatsapp/green-api";

type ShiftAlert = { id: string; leaseToken: string; phase: "opening" | "closing"; shiftNumber: number; difference: number; ownerPhone: string | null; brandName: string | null; drawerName: string | null; employeeName: string | null; previousEmployeeName: string | null; createdAt: string };
export function financeShiftAlertMessage(alert: ShiftAlert) {
  if (!Number.isSafeInteger(Number(alert.shiftNumber)) || Number(alert.shiftNumber) < 1 || !Number.isFinite(Number(alert.difference)) || Math.abs(Number(alert.difference)) < .005) throw new Error("INVALID_CASH_DIFFERENCE_ALERT");
  const amount = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  return [
    `تم رصد فرق في مبلغ صندوق الوردية رقم ${alert.shiftNumber}`,
    `وقت الرصد: ${alert.phase === "opening" ? "بداية الوردية" : "إغلاق الوردية"}`,
    `العلامة: ${alert.brandName ?? "العلامة التجارية"}`,
    `الصندوق: ${alert.drawerName ?? "صندوق الوردية"}`,
    `آخر موظف على الصندوق: ${alert.previousEmployeeName ?? "لا توجد وردية سابقة على هذا الصندوق"}`,
    `الموظف الذي بدأ الوردية: ${alert.employeeName ?? "موظف الوردية"}`,
    `${Number(alert.difference) < 0 ? "العجز" : "الزيادة"}: ${amount(Math.abs(Number(alert.difference)))} ر س`,
    "تم تسجيل الفرق دون منع الوردية ويمكنك مراجعة التفاصيل وتسويته من لوحة التحكم",
    "https://barndaksa.com/dashboard/finance?section=shifts",
  ].join("\n");
}

/** Call only after a committed shift operation, or from the authenticated cron */
export async function dispatchShiftAlerts(cafeId?: string, shiftId?: string) {
  if (cafeId) z.uuid().parse(cafeId);
  if (shiftId) z.uuid().parse(shiftId);
  if (!isGreenApiConfigured()) return { configured: false, claimed: 0, queued: 0, needsReview: 0 };
  const client = createAdminClient();
  const { data, error } = await client.rpc("brand_finance_claim_cash_alerts", { p_cafe_id: cafeId ?? null, p_shift_id: shiftId ?? null, p_limit: 5 });
  if (error) throw new Error("FINANCE_ALERT_QUEUE_UNAVAILABLE");
  const alerts = (data ?? []) as ShiftAlert[];
  let queued = 0; let needsReview = 0;
  for (const alert of alerts) {
    const phone = normalizeSaudiPhone(alert.ownerPhone ?? "");
    let status: "queued" | "rejected" | "unknown" | "missing_owner" = "missing_owner";
    let messageId: string | undefined;
    let message: string | undefined;
    try { message = financeShiftAlertMessage(alert); } catch { status = "rejected"; }
    if (phone && message) {
      try {
        const outcome = await sendGreenApiFinanceShiftAlert({ phone, message });
        status = outcome.status; messageId = outcome.providerMessageId;
      } catch { status = "unknown"; }
    }
    const { data: completed, error: completeError } = await client.rpc("brand_finance_complete_cash_alert", {
      p_alert_id: alert.id, p_lease_token: alert.leaseToken, p_status: status,
      p_provider_message_id: messageId ?? null, p_error_code: status === "queued" ? null : `alert_${status}`,
    });
    // A failed completion is not retried by sending again: lease expiry becomes unknown
    if (completeError || !completed || status !== "queued") needsReview++;
    else queued++;
  }
  return { configured: true, claimed: alerts.length, queued, needsReview };
}
