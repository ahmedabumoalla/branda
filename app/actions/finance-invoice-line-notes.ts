"use server";

import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { z } from "zod";
import { invoiceLineNoteContextSchema, invoiceLineNoteOptionsSchema, invoiceLineNoteSelectionInputSchema, invoiceLineNoteSelectionSavedSchema, invoiceLineNoteStateSchema, issuedInvoiceLineNotesSchema, type InvoiceLineNoteSelectionInput, type InvoiceLineNoteSettings } from "@/lib/finance/invoice-line-notes";

async function context(slug: string, write = false) {
  const result = await getBrandFinanceContext(slug);
  if (write ? !canFinance(result.cafe.role, "settings_manage") : !["owner", "manager", "accountant", "auditor"].includes(result.cafe.role)) throw new Error("لا تملك صلاحية إدارة ملاحظات بنود الفواتير");
  return result;
}
function rpcError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "42883") throw new Error("تحديث ملاحظات بنود الفواتير لم يُفعّل في قاعدة البيانات بعد");
  if (error.code === "40001") throw new Error("تغيرت الملاحظات في جلسة أخرى أعد تحميل البيانات قبل الحفظ");
  if (error.code === "42501") throw new Error("لا تملك صلاحية تعديل ملاحظات بنود الفواتير");
  if (error.code === "22023" && error.message && /[\u0600-\u06ff]/u.test(error.message)) throw new Error(error.message);
  throw new Error("تعذر تأكيد ملاحظات بنود الفواتير أعد المحاولة");
}
export async function getFinanceInvoiceLineNotes(slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_invoice_line_notes", { p_cafe_id: cafe.id, p_action: "get" });
    rpcError(error);
    return invoiceLineNoteStateSchema.parse(data);
  }, "تعذر تحميل ملاحظات بنود الفواتير");
}
export async function getFinanceInvoiceLineNoteOptions(slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_invoice_line_notes", { p_cafe_id: cafe.id, p_action: "options" });
    rpcError(error);
    return invoiceLineNoteOptionsSchema.parse(data);
  }, "تعذر تحميل الملاحظات الجاهزة");
}
export async function saveFinanceInvoiceLineNotes(slug: string, settings: InvoiceLineNoteSettings, revision: number) {
  return actionResult(async () => {
    const parsed = invoiceLineNoteStateSchema.safeParse({ settings, revision });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "راجع نصوص الملاحظات وأطوالها");
    const { client, cafe } = await context(slug, true);
    const { data, error } = await client.rpc("brand_finance_invoice_line_notes", { p_cafe_id: cafe.id, p_action: "save", p_settings: parsed.data.settings, p_revision: parsed.data.revision });
    rpcError(error);
    return invoiceLineNoteStateSchema.parse(data);
  }, "تعذر حفظ ملاحظات بنود الفواتير");
}

export async function getFinanceInvoiceLineNoteContext(slug: string, draftId: string | null = null) {
  return actionResult(async () => {
    const id = z.uuid().nullable().parse(draftId);
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_invoice_line_note_context", { p_cafe_id: cafe.id, p_draft_id: id });
    rpcError(error);
    return invoiceLineNoteContextSchema.parse(data);
  }, "تعذر تحميل ملاحظات بنود المسودة");
}
export async function saveFinanceInvoiceLineNoteSelection(slug: string, input: InvoiceLineNoteSelectionInput) {
  return actionResult(async () => {
    const parsed = invoiceLineNoteSelectionInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("راجع ملاحظات البنود ونسخة المسودة قبل الحفظ");
    const { client, cafe } = await context(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية تعديل ملاحظات الفاتورة");
    const { data, error } = await client.rpc("brand_finance_set_invoice_line_notes", { p_cafe_id: cafe.id, p_draft_id: parsed.data.draftId, p_draft_revision: parsed.data.draftRevision, p_revision: parsed.data.revision, p_lines: parsed.data.lines });
    rpcError(error);
    return invoiceLineNoteSelectionSavedSchema.parse(data);
  }, "تعذر حفظ ملاحظات بنود المسودة");
}
export async function getFinanceIssuedLineNotes(slug: string, documentId: string) {
  return actionResult(async () => {
    const id = z.uuid().parse(documentId);
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_issued_line_notes", { p_cafe_id: cafe.id, p_document_id: id });
    rpcError(error);
    return issuedInvoiceLineNotesSchema.parse(data);
  }, "تعذر تحميل ملاحظات بنود الفاتورة");
}
export async function saveFinanceInvoiceCustomLineNotes(slug: string, texts: string[], revision: number) {
  return actionResult(async () => {
    const input = z.object({ texts: z.array(z.string().min(1).max(50).refine(value => value.trim().length > 0)).min(1).max(10), revision: z.number().int().min(0).max(2_147_483_647) }).strict().safeParse({ texts, revision });
    if (!input.success) throw new Error("راجع الملاحظات والحد الأقصى ٥٠ حرفًا للملاحظة");
    const { client, cafe } = await context(slug, true);
    const { data, error } = await client.rpc("brand_finance_add_invoice_line_notes", { p_cafe_id: cafe.id, p_texts: input.data.texts, p_revision: input.data.revision });
    rpcError(error);
    return invoiceLineNoteStateSchema.parse(data);
  }, "تعذر حفظ الملاحظات في القائمة");
}

export async function copyFinanceInvoiceLineNotes(slug: string, sourceDocumentId: string, draftId: string, draftRevision: number) {
  return actionResult(async () => {
    const parsed = z.object({ sourceDocumentId: z.uuid(), draftId: z.uuid(), draftRevision: z.number().int().positive().max(2_147_483_647) }).strict().safeParse({ sourceDocumentId, draftId, draftRevision });
    if (!parsed.success) throw new Error("راجع الفاتورة الأصلية ومسودة النسخة");
    const { client, cafe } = await context(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية نسخ ملاحظات الفاتورة");
    const { data, error } = await client.rpc("brand_finance_copy_invoice_line_notes", { p_cafe_id: cafe.id, p_source_document_id: parsed.data.sourceDocumentId, p_draft_id: parsed.data.draftId, p_draft_revision: parsed.data.draftRevision });
    rpcError(error);
    return invoiceLineNoteSelectionSavedSchema.parse(data);
  }, "تعذر نسخ ملاحظات بنود الفاتورة");
}
