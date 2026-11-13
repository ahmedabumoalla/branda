"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { invoiceOrderSourceInputSchema, invoiceOrderSourceSavedSchema, issuedOrderSourceSchema, orderSourceContextSchema, orderSourceStateSchema, type InvoiceOrderSourceInput, type OrderSourceSettings } from "@/lib/finance/order-sources";

async function context(slug: string, write: "settings" | "invoice" | null = null) {
  const result = await getBrandFinanceContext(slug);
  const allowed = write ? canFinance(result.cafe.role, write === "settings" ? "settings_manage" : "accounting_write") : ["owner", "manager", "accountant", "auditor"].includes(result.cafe.role);
  if (!allowed) throw new Error("لا تملك صلاحية إدارة مصادر الطلب");
  return result;
}

function rpcError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "42883") throw new Error("تحديث مصادر الطلب لم يُفعّل في قاعدة البيانات بعد");
  if (error.code === "40001") throw new Error("تغيرت بيانات مصدر الطلب في جلسة أخرى أعد تحميل البيانات قبل الحفظ");
  if (error.code === "42501") throw new Error("لا تملك صلاحية تنفيذ هذه العملية على مصدر الطلب");
  if (error.code === "22023" && error.message && /[\u0600-\u06ff]/u.test(error.message)) throw new Error(error.message);
  throw new Error("تعذر تأكيد بيانات مصادر الطلب أعد المحاولة");
}

export async function getFinanceOrderSources(slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_order_sources", { p_cafe_id: cafe.id, p_action: "get" });
    rpcError(error);
    return orderSourceStateSchema.parse(data);
  }, "تعذر تحميل مصادر الطلب");
}

export async function saveFinanceOrderSources(slug: string, settings: OrderSourceSettings, revision: number) {
  return actionResult(async () => {
    const input = orderSourceStateSchema.safeParse({ settings, revision });
    if (!input.success) throw new Error(input.error.issues[0]?.message ?? "راجع بيانات مصادر الطلب");
    const { client, cafe } = await context(slug, "settings");
    const { data, error } = await client.rpc("brand_finance_order_sources", { p_cafe_id: cafe.id, p_action: "save", p_settings: input.data.settings, p_revision: input.data.revision });
    rpcError(error);
    return orderSourceStateSchema.parse(data);
  }, "تعذر حفظ مصادر الطلب");
}

export async function getFinanceOrderSourceContext(slug: string, draftId: string | null = null) {
  return actionResult(async () => {
    const id = z.uuid().nullable().parse(draftId);
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_invoice_order_source_context", { p_cafe_id: cafe.id, p_draft_id: id });
    rpcError(error);
    return orderSourceContextSchema.parse(data);
  }, "تعذر تحميل مصدر طلب الفاتورة");
}

export async function saveFinanceInvoiceOrderSource(slug: string, input: InvoiceOrderSourceInput) {
  return actionResult(async () => {
    const parsed = invoiceOrderSourceInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("راجع مصدر الطلب ونسخة المسودة قبل الحفظ");
    const { client, cafe } = await context(slug, "invoice");
    const { data, error } = await client.rpc("brand_finance_set_invoice_order_source", { p_cafe_id: cafe.id, p_draft_id: parsed.data.draftId, p_draft_revision: parsed.data.draftRevision, p_source_id: parsed.data.sourceId, p_revision: parsed.data.revision });
    rpcError(error);
    return invoiceOrderSourceSavedSchema.parse(data);
  }, "تعذر حفظ مصدر طلب الفاتورة");
}

export async function getFinanceIssuedOrderSource(slug: string, documentId: string) {
  return actionResult(async () => {
    const id = z.uuid().parse(documentId);
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_invoice_order_source", { p_cafe_id: cafe.id, p_document_id: id });
    rpcError(error);
    return issuedOrderSourceSchema.parse(data);
  }, "تعذر تحميل مصدر طلب الفاتورة");
}
