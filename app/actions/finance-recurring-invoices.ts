"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { recurringInvoiceFiltersSchema, recurringInvoiceSchema, type RecurringInvoiceRecord, type RecurringInvoiceSummary } from "@/lib/finance/recurring-invoice";
import { actionResult } from "@/lib/platform/action-result";
import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";

function failure(error: { code?: string; message: string }): never {
  if (["PGRST202", "42P01", "42883"].includes(error.code ?? "")) throw new Error("تحتاج الفواتير الدورية إلى تحديث قاعدة البيانات");
  if (error.code === "40001") throw new Error("تغير الاشتراك افتح النسخة المحفوظة قبل المتابعة");
  throw new Error(/[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر تنفيذ العملية راجع بيانات الاشتراك وإعدادات الفواتير");
}
async function context(slug: string, write = false) {
  const result = await getBrandFinanceContext(slug);
  if (!canFinance(result.cafe.role, write ? "accounting_write" : "reports")) throw new Error("لا تملك صلاحية إدارة الفواتير الدورية");
  return result;
}
export async function readRecurringInvoicesAction(slug: string, filters: unknown = {}) {
  return actionResult(async () => {
    const parsed = recurringInvoiceFiltersSchema.safeParse(filters); if (!parsed.success) throw new Error("راجع خيارات البحث");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_recurring_invoices", { p_cafe_id: cafe.id, p_filters: parsed.data });
    if (error) failure(error); return data as { items: RecurringInvoiceSummary[]; total: number; offset: number; limit: number };
  }, "تعذر تحميل الفواتير الدورية");
}
export async function readRecurringInvoiceAction(id: string, slug: string, historyOffset = 0) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success || !z.number().int().min(0).max(100000).safeParse(historyOffset).success) throw new Error("الاشتراك غير متاح");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_recurring_invoices", { p_cafe_id: cafe.id, p_id: id, p_history_offset: historyOffset });
    if (error) failure(error); if (!data) throw new Error("الاشتراك غير موجود أو غير متاح"); return data as RecurringInvoiceRecord;
  }, "تعذر تحميل الاشتراك");
}
export async function saveRecurringInvoiceAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), payload: recurringInvoiceSchema }).strict().safeParse(input);
    if (!parsed.success) throw new Error("راجع بيانات الاشتراك والبنود قبل الحفظ");
    const { client, cafe } = await context(slug, true);
    const { data, error } = await client.rpc("brand_finance_save_recurring_invoice", { p_cafe_id: cafe.id, p_id: parsed.data.id, p_revision: parsed.data.revision, p_payload: parsed.data.payload });
    if (error) failure(error); invalidateFinanceViews(slug); return data as RecurringInvoiceRecord;
  }, "تعذر حفظ الاشتراك أعد المحاولة بنفس الطلب");
}
export async function transitionRecurringInvoiceAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().positive(), operation: z.enum(["pause", "resume", "delete", "run"]), requestId: z.uuid() }).strict().safeParse(input);
    if (!parsed.success) throw new Error("راجع بيانات عملية الاشتراك");
    const { client, cafe } = await context(slug, true), p = parsed.data;
    const { data, error } = await client.rpc("brand_finance_transition_recurring_invoice", { p_cafe_id: cafe.id, p_id: p.id, p_revision: p.revision, p_operation: p.operation, p_request_id: p.requestId });
    if (error) failure(error); invalidateFinanceViews(slug); return data as { status: string; invoiceId?: string; number?: number; message?: string };
  }, "تعذر تأكيد العملية أعد المحاولة بنفس الطلب");
}
