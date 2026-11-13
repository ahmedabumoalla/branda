"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { invoiceShippingChargeContextSchema, invoiceShippingChargeInputSchema, invoiceShippingChargeSavedSchema, issuedShippingChargeSchema, type InvoiceShippingChargeInput } from "@/lib/finance/invoice-shipping-charge";

async function context(slug: string, write = false) {
  const result = await getBrandFinanceContext(slug);
  if (write ? !canFinance(result.cafe.role, "accounting_write") : !["owner", "manager", "accountant", "auditor"].includes(result.cafe.role)) throw new Error("لا تملك صلاحية إدارة رسوم الشحن");
  return result;
}
function rpcError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "42883") throw new Error("تحديث رسوم الشحن لم يُفعّل في قاعدة البيانات بعد");
  if (error.code === "40001") throw new Error("تغيرت إعدادات الشحن أو المسودة أعد تحميل البيانات قبل الحفظ");
  if (error.code === "42501") throw new Error("لا تملك صلاحية إدارة رسوم الشحن لهذه الفاتورة");
  if (error.code === "22023" && error.message && /[\u0600-\u06ff]/u.test(error.message)) throw new Error(error.message);
  throw new Error("تعذر تأكيد رسوم الشحن أعد المحاولة");
}
export async function getFinanceInvoiceShippingChargeContext(slug: string, draftId: string | null = null) {
  return actionResult(async () => {
    const id = z.uuid().nullable().parse(draftId), { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_invoice_shipping_charge_context", { p_cafe_id: cafe.id, p_draft_id: id });
    rpcError(error); return invoiceShippingChargeContextSchema.parse(data);
  }, "تعذر تحميل خيارات شحن الفاتورة");
}
export async function saveFinanceInvoiceShippingCharge(slug: string, input: InvoiceShippingChargeInput) {
  return actionResult(async () => {
    const parsed = invoiceShippingChargeInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("راجع رسوم الشحن ونسخة المسودة قبل الحفظ");
    const { client, cafe } = await context(slug, true), value = parsed.data;
    const { data, error } = await client.rpc("brand_finance_set_invoice_shipping_charge", { p_cafe_id: cafe.id, p_draft_id: value.draftId, p_draft_revision: value.draftRevision, p_revision: value.revision, p_settings_revision: value.settingsRevision, p_option_revision: value.optionRevision, p_selection: value.selection });
    rpcError(error); return invoiceShippingChargeSavedSchema.parse(data);
  }, "تعذر حفظ رسوم شحن المسودة");
}
export async function getFinanceIssuedShippingCharge(slug: string, documentId: string) {
  return actionResult(async () => {
    const id = z.uuid().parse(documentId), { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_issued_shipping_charge", { p_cafe_id: cafe.id, p_document_id: id });
    rpcError(error); return issuedShippingChargeSchema.parse(data);
  }, "تعذر تحميل رسوم شحن الفاتورة");
}
export async function copyFinanceInvoiceShippingCharge(slug: string, sourceDocumentId: string, draftId: string, draftRevision: number) {
  return actionResult(async () => {
    const value = z.object({ sourceDocumentId: z.uuid(), draftId: z.uuid(), draftRevision: z.number().int().positive().max(2_147_483_647) }).strict().parse({ sourceDocumentId, draftId, draftRevision });
    const { client, cafe } = await context(slug, true);
    const { data, error } = await client.rpc("brand_finance_copy_invoice_shipping_charge", { p_cafe_id: cafe.id, p_source_document_id: value.sourceDocumentId, p_draft_id: value.draftId, p_draft_revision: value.draftRevision });
    rpcError(error); return invoiceShippingChargeSavedSchema.parse(data);
  }, "تعذر نسخ رسوم شحن الفاتورة");
}
