"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { invoiceDraftSchema, type InvoiceDraftPayload, type InvoiceDraftSummary } from "@/lib/finance/invoice-draft";
import { actionResult } from "@/lib/platform/action-result";

async function context(slug: string) {
  const result = await getBrandFinanceContext(slug);
  if (!canFinance(result.cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية إدارة مسودات الفواتير");
  return result;
}

export async function saveInvoiceDraftAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().min(0), payload: invoiceDraftSchema }).safeParse(input);
    if (!parsed.success) throw new Error("راجع بيانات المسودة وأطوال الحقول ثم أعد الحفظ");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_save_invoice_draft", {
      p_cafe_id: cafe.id, p_id: parsed.data.id, p_revision: parsed.data.revision, p_payload: parsed.data.payload,
    });
    if (error?.code === "40001") throw new Error("تغيرت المسودة في جلسة أخرى افتح المسودة المحفوظة قبل تعديلها");
    if (error) throw new Error("تعذر تأكيد حفظ المسودة أعد المحاولة بنفس المسودة");
    return data as { id: string; revision: number };
  }, "تعذر حفظ المسودة أعد المحاولة");
}

export async function listInvoiceDraftsAction(slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_invoice_drafts", { p_cafe_id: cafe.id, p_id: null });
    if (error) throw new Error("تعذر تحميل المسودات أعد المحاولة");
    return data as InvoiceDraftSummary[];
  }, "تعذر تحميل المسودات");
}

export async function openInvoiceDraftAction(id: string, slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_invoice_drafts", { p_cafe_id: cafe.id, p_id: z.uuid().parse(id) });
    if (error || !data) throw new Error("تعذر فتح المسودة أو أنها غير متاحة");
    const record = data as { id: string; revision: number; payload: InvoiceDraftPayload };
    return { ...record, payload: invoiceDraftSchema.parse(record.payload) };
  }, "تعذر فتح المسودة");
}
