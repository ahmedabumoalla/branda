"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance, type FinanceCapability } from "@/lib/finance/permissions";
import { creditNoteFiltersSchema, creditNotePayloadSchema, type CreditNoteRecord } from "@/lib/finance/credit-note";
import { actionResult } from "@/lib/platform/action-result";
import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";

async function context(slug: string, capability: FinanceCapability) {
  const ctx = await getBrandFinanceContext(slug);
  if (!canFinance(ctx.cafe.role, capability)) throw new Error("لا تملك صلاحية تنفيذ هذه العملية على الإشعارات الدائنة");
  return ctx;
}
function failure(error: { code?: string; message: string }): never {
  if (["PGRST202", "42P01", "42883"].includes(error.code ?? "")) throw new Error("الإشعارات الدائنة جاهزة في الواجهة وتحتاج تفعيل تحديث قاعدة البيانات قبل الحفظ");
  if (error.code === "40001") throw new Error("تغير الإشعار في جلسة أخرى افتح النسخة المحفوظة قبل المتابعة");
  throw new Error(/[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر تنفيذ العملية راجع البيانات ثم أعد المحاولة");
}
function record(value: CreditNoteRecord) {
  const payload = creditNotePayloadSchema.safeParse(value?.payload);
  if (!payload.success || !z.uuid().safeParse(value?.id).success) throw new Error("تعذر قراءة بيانات الإشعار المحفوظة");
  return { ...value, payload: payload.data };
}
export async function readCreditNotesAction(slug: string, filters: unknown = {}) {
  return actionResult(async () => {
    const parsed = creditNoteFiltersSchema.safeParse(filters);
    if (!parsed.success) throw new Error("راجع خيارات البحث");
    const { client, cafe } = await context(slug, "inventory_read");
    const { data, error } = await client.rpc("brand_finance_credit_notes", { p_cafe_id: cafe.id, p_filters: parsed.data });
    if (error) failure(error);
    const page = data as { items: CreditNoteRecord[]; total: number; offset: number; limit: number };
    return { ...page, items: page.items.map(record) };
  }, "تعذر تحميل الإشعارات الدائنة");
}
export async function readCreditNoteAction(id: string, slug: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success) throw new Error("الإشعار غير متاح");
    const { client, cafe } = await context(slug, "inventory_read");
    const { data, error } = await client.rpc("brand_finance_credit_notes", { p_cafe_id: cafe.id, p_id: id });
    if (error) failure(error);
    if (!data) throw new Error("الإشعار غير موجود أو لم يعد متاحًا");
    return record(data as CreditNoteRecord);
  }, "تعذر تحميل الإشعار الدائن");
}
export async function saveCreditNoteAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), payload: creditNotePayloadSchema }).strict().safeParse(input);
    if (!parsed.success) throw new Error("راجع بيانات الإشعار والتواريخ والكميات والأسعار");
    const { client, cafe } = await context(slug, "accounting_write");
    const { data, error } = await client.rpc("brand_finance_save_credit_note", { p_cafe_id: cafe.id, p_id: parsed.data.id, p_revision: parsed.data.revision, p_payload: parsed.data.payload });
    if (error) failure(error);
    invalidateFinanceViews(slug);
    return record(data as CreditNoteRecord);
  }, "تعذر تأكيد الحفظ أعد المحاولة بنفس الإشعار");
}
export async function transitionCreditNoteAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().positive(), operation: z.enum(["issue", "receive", "reject", "delete"]), requestId: z.uuid(), note: z.string().max(500).default("") }).strict().safeParse(input);
    if (!parsed.success) throw new Error("راجع العملية المطلوبة");
    const p = parsed.data;
    const { client, cafe } = await context(slug, ["receive", "reject"].includes(p.operation) ? "inventory_write" : "accounting_write");
    const { data, error } = await client.rpc("brand_finance_transition_credit_note", { p_cafe_id: cafe.id, p_id: p.id, p_revision: p.revision, p_operation: p.operation, p_request_id: p.requestId, p_note: p.note });
    if (error) failure(error);
    invalidateFinanceViews(slug);
    return record(data as CreditNoteRecord);
  }, "تعذر تأكيد العملية أعد المحاولة بنفس الطلب");
}
