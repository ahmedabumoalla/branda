"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { customerPaymentFiltersSchema, normalizeCustomerPaymentNumber, type CustomerPaymentDetail, type CustomerPaymentRow } from "@/lib/finance/customer-payment";
import { actionResult } from "@/lib/platform/action-result";

function failure(error: { code?: string; message: string }): never {
  if (["PGRST202", "42P01", "42883"].includes(error.code ?? "")) throw new Error("تحتاج مدفوعات العملاء إلى تحديث قاعدة البيانات");
  throw new Error(/[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر تحميل مدفوعات العملاء أعد المحاولة");
}
async function context(slug: string) { const result = await getBrandFinanceContext(slug); if (!canFinance(result.cafe.role, "reports")) throw new Error("لا تملك صلاحية عرض مدفوعات العملاء"); return result; }
export async function readCustomerPaymentsAction(slug: string, filters: unknown = {}) {
  return actionResult(async () => {
    const normalized = typeof filters === "object" && filters !== null && !Array.isArray(filters) ? Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, typeof value === "string" && ["query", "invoiceNumber", "paymentNumber"].includes(key) ? normalizeCustomerPaymentNumber(value) : value])) : filters;
    const parsed = customerPaymentFiltersSchema.safeParse(normalized); if (!parsed.success) throw new Error("راجع خيارات البحث والفترة المحددة");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_customer_payments", { p_cafe_id: cafe.id, p_filters: parsed.data });
    if (error) failure(error); return data as { items: CustomerPaymentRow[]; total: number; offset: number; limit: number };
  }, "تعذر تحميل مدفوعات العملاء");
}
export async function readCustomerPaymentAction(id: string, slug: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success) throw new Error("الدفعة غير متاحة");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_customer_payments", { p_cafe_id: cafe.id, p_id: id });
    if (error) failure(error); if (!data) throw new Error("الدفعة غير موجودة أو غير متاحة"); return data as CustomerPaymentDetail;
  }, "تعذر تحميل تفاصيل الدفعة");
}
