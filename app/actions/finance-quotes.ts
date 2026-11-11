"use server";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { quotePayloadSchema, type QuoteRecord } from "@/lib/finance/quotation";
import { actionResult } from "@/lib/platform/action-result";

async function context(slug: string) {
  const ctx = await getBrandFinanceContext(slug);
  if (!canFinance(ctx.cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية إدارة عروض الأسعار");
  return ctx;
}
function failure(error: { code?: string; message: string }) {
  if (error.code === "40001") throw new Error("تغير عرض السعر في جلسة أخرى افتح النسخة المحفوظة قبل التعديل");
  throw new Error(/[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر تنفيذ الطلب راجع بيانات العرض ثم أعد المحاولة بنفس العرض");
}
function quoteRecord(value: QuoteRecord) {
  const parsed = quotePayloadSchema.safeParse(value?.payload);
  if (!parsed.success) throw new Error("تعذر قراءة بيانات عرض السعر المحفوظة");
  return { ...value, payload: parsed.data };
}
export async function saveQuoteAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), payload: quotePayloadSchema }).safeParse(input);
    if (!parsed.success) throw new Error("راجع بيانات العرض والتواريخ والكميات والأسعار قبل الحفظ");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_save_quote", { p_cafe_id: cafe.id, p_id: parsed.data.id, p_revision: parsed.data.revision, p_payload: parsed.data.payload });
    if (error) failure(error);
    invalidateFinanceViews(slug);
    return quoteRecord(data as QuoteRecord);
  }, "تعذر تأكيد حفظ عرض السعر أعد المحاولة بنفس العرض");
}
export async function readQuotesAction(slug: string, id: string | null = null) {
  return actionResult(async () => {
    if (id !== null && !z.uuid().safeParse(id).success) throw new Error("عرض السعر غير متاح");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_quotes", { p_cafe_id: cafe.id, p_id: id });
    if (error) failure(error);
    if (id && !data) throw new Error("عرض السعر غير موجود أو لم يعد متاحًا");
    return ((id ? [data] : data) as QuoteRecord[]).map(quoteRecord);
  }, "تعذر تحميل عروض الأسعار أعد المحاولة");
}
export async function convertQuoteAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().positive() }).safeParse(input);
    if (!parsed.success) throw new Error("احفظ عرض السعر قبل تحويله إلى فاتورة");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_convert_quote", { p_cafe_id: cafe.id, p_id: parsed.data.id, p_revision: parsed.data.revision });
    if (error) failure(error);
    invalidateFinanceViews(slug);
    return data as { id: string; revision: number };
  }, "تعذر تأكيد التحويل أعد المحاولة بنفس عرض السعر");
}
