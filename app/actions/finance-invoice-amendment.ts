"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { invoiceAmendmentContextSchema, invoiceAmendmentInputSchema, unavailableInvoiceAmendmentContext } from "@/lib/finance/invoice-amendment";

export async function readInvoiceAmendmentContext(id: string, slug: string) {
  return actionResult(async () => {
    z.uuid().parse(id);
    const {client, cafe} = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية تعديل الفواتير");
    const {data, error} = await client.rpc("brand_finance_invoice_amendment_context", {p_cafe_id: cafe.id, p_invoice_id: id});
    if (error) {
      if (["PGRST202", "42883"].includes(error.code) && error.message.includes("brand_finance_invoice_amendment_context")) return unavailableInvoiceAmendmentContext(id);
      throw new Error("تعذر التحقق من إمكانية تعديل الفاتورة أعد المحاولة");
    }
    return invoiceAmendmentContextSchema.parse(data);
  }, "تعذر تحميل بيانات تعديل الفاتورة");
}

export async function saveInvoiceAmendment(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = invoiceAmendmentInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("راجع بنود الفاتورة والكميات والأسعار");
    const {client, cafe} = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية تعديل الفواتير");
    const {requestId, ...payload} = parsed.data;
    const {data, error} = await client.rpc("brand_finance_amend_invoice", {p_cafe_id: cafe.id, p_input: payload, p_request_id: requestId});
    if (error) {
      if (["PGRST202", "42883"].includes(error.code) && error.message.includes("brand_finance_amend_invoice")) throw new Error("تعديل بنود الفاتورة غير متاح حتى اكتمال تحديث قاعدة البيانات");
      if (error.code === "40001") throw new Error("تغيرت الفاتورة أعد فتحها قبل حفظ التعديل");
      throw new Error(/[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر حفظ تعديل الفاتورة راجع البنود ثم أعد المحاولة");
    }
    const saved = z.object({invoiceId: z.uuid(), revision: z.number().int().positive()}).parse(data);
    invalidateFinanceViews(slug);
    return saved;
  }, "تعذر حفظ تعديل الفاتورة");
}
