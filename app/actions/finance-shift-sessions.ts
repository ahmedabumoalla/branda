"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { shiftSessionFiltersSchema, type ShiftSessionList, type ShiftSessionSummary, type ShiftSessionRows, type ShiftSessionActivities } from "@/lib/finance/shift-sessions";

async function read(view: string, shiftId: string | null, filters: unknown, slug?: string) {
  const parsed = shiftSessionFiltersSchema.parse(filters);
  if (shiftId) z.uuid().parse(shiftId);
  const { client, cafe } = await getBrandFinanceContext(slug);
  if (!canFinance(cafe.role, "shifts_read")) throw new Error("لا تملك صلاحية عرض الورديات");
  const { data, error } = await client.rpc("brand_finance_shift_sessions", { p_cafe_id: cafe.id, p_view: view, p_shift_id: shiftId, p_filters: parsed });
  if (error) throw new Error(["PGRST202", "42883"].includes(error.code) ? "عرض الورديات الجديد يحتاج تفعيل تحديث قاعدة البيانات" : "تعذر تحميل بيانات الوردية تحقق من الاتصال والصلاحية ثم أعد المحاولة");
  if (!data) throw new Error("الوردية غير موجودة أو غير متاحة");
  return data;
}
export async function readShiftSessionsAction(filters: unknown, slug?: string) {
  return actionResult(async () => await read("list", null, filters, slug) as ShiftSessionList, "تعذر تحميل الورديات");
}
export async function readShiftSessionSummaryAction(shiftId: string, slug?: string) {
  return actionResult(async () => await read("summary", shiftId, {}, slug) as ShiftSessionSummary, "تعذر تحميل ملخص الوردية");
}
export async function readShiftSessionRowsAction(shiftId: string, view: "movements" | "invoices" | "refunds" | "payments", offset: number, slug?: string) {
  return actionResult(async () => {
    z.enum(["movements", "invoices", "refunds", "payments"]).parse(view);
    return await read(view, shiftId, { offset }, slug) as ShiftSessionRows;
  }, "تعذر تحميل حركات الوردية");
}
export async function readShiftSessionActivityAction(shiftId: string, offset: number, slug?: string) {
  return actionResult(async () => await read("activity", shiftId, { offset }, slug) as ShiftSessionActivities, "تعذر تحميل نشاط الوردية");
}
