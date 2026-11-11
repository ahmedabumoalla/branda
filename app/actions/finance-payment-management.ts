"use server";

import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { paymentManagementSchema } from "@/lib/finance/payment-management";
import { actionResult } from "@/lib/platform/action-result";

export async function manageInvoicePaymentAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = paymentManagementSchema.safeParse(input);
    if (!parsed.success) throw new Error("راجع مبلغ الدفعة وتاريخها وحساب التحصيل والحقول المطلوبة");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية تعديل دفعات الفواتير");
    const { data, error } = await client.rpc("brand_finance_manage_invoice_payment", { p_cafe_id: cafe.id, p_input: parsed.data });
    if (error?.code === "40001") throw new Error("تغيرت الدفعة في جلسة أخرى أعد تحميل الفاتورة قبل المحاولة");
    if (error?.code === "42501") throw new Error("الدفعة غير متاحة أو لا تملك صلاحية تعديلها");
    if (error) throw new Error(/[\u0600-\u06ff]/.test(error.message) && error.message.length < 400 ? error.message : "تعذر تأكيد التغيير أعد المحاولة بنفس الطلب");
    return data as { id: string; revision: number; duplicate: boolean };
  }, "تعذر تأكيد التغيير أعد المحاولة بنفس الطلب");
}
