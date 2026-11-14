"use server";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { getFinanceCashierMaintenance } from "@/lib/data/finance-cashier-maintenance";
import { invoiceSettingsSchema, invoiceSettingsStateSchema, invoiceEditorContextSchema } from "@/lib/finance/invoice-settings";
import { actionResult } from "@/lib/platform/action-result";

async function context(slug: string, write = false, inspectAccess = false) {
  const result = await getBrandFinanceContext(slug);
  const canEdit = canFinance(result.cafe.role, "settings_manage") || ((write || inspectAccess) && !!await getFinanceCashierMaintenance(result.cafe.id));
  if (write ? !canEdit : !["owner", "manager", "accountant", "auditor"].includes(result.cafe.role)) {
    throw new Error("لا تملك صلاحية إدارة إعدادات الفواتير");
  }
  return { ...result, canEdit };
}
function state(value: unknown) {
  const parsed = invoiceSettingsStateSchema.safeParse(value);
  if (!parsed.success) throw new Error("تعذر قراءة إعدادات الفواتير أعد تحميل الصفحة");
  return parsed.data;
}
export async function getFinanceInvoiceSettings(slug: string) {
  return actionResult(async () => {
    const { client, cafe, canEdit } = await context(slug, false, true);
    const { data, error } = await client.rpc("brand_finance_invoice_settings", { p_cafe_id: cafe.id, p_action: "get" });
    if (error) throw new Error("تعذر تحميل إعدادات الفواتير أعد المحاولة");
    return { ...state(data), canEdit };
  }, "تعذر تحميل إعدادات الفواتير");
}
export async function getFinanceInvoiceContext(slug: string, partyId: string, productIds: string[]) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const parsed = z.object({ partyId: z.union([z.uuid(), z.literal("")]), productIds: z.array(z.uuid()).max(100) }).safeParse({ partyId, productIds });
    if (!parsed.success) throw new Error("اختر العميل والبنود لتحميل قواعد الفاتورة");
    const { data, error } = await client.rpc("brand_finance_invoice_context", { p_cafe_id: cafe.id, p_party_id: parsed.data.partyId || null, p_product_ids: [...new Set(parsed.data.productIds)] });
    if (error) throw new Error("تعذر تحميل أسعار البنود ورصيد العميل أعد المحاولة");
    const result = invoiceEditorContextSchema.safeParse(data);
    if (!result.success) throw new Error("تعذر قراءة قواعد الفاتورة حدّث البيانات");
    return result.data;
  }, "تعذر تحميل قواعد الفاتورة");
}
export async function saveFinanceInvoiceSettings(slug: string, settings: unknown, revision: number) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug, true);
    const parsed = z.object({ settings: invoiceSettingsSchema, revision: z.number().int().nonnegative() }).safeParse({ settings, revision });
    if (!parsed.success) throw new Error("راجع خيارات إعدادات الفواتير ثم احفظ مجددًا");
    const { data, error } = await client.rpc("brand_finance_invoice_settings", { p_cafe_id: cafe.id, p_action: "save", p_settings: parsed.data.settings, p_revision: parsed.data.revision });
    if (error?.code === "40001") throw new Error("تغيرت الإعدادات في جلسة أخرى أعد تحميلها قبل الحفظ");
    if (error?.code === "42501") throw new Error("لا تملك صلاحية تعديل إعدادات الفواتير");
    if (error?.code === "22023" && error.message === "Invalid user discount cap") throw new Error("راجع حدود الخصم للمستخدمين اختر مالك المنشأة أو مديرًا أو محاسبًا نشطًا واحذف صف حساب الصيانة إن وجد");
    if (error?.code === "22023" && error.message === "Invoice numbering cannot move backwards") throw new Error("تقدم ترقيم الفواتير منذ فتح الإعدادات حدّث الرقم التالي قبل الحفظ");
    if (error?.code === "22023" && error.message.length < 400 && /[\u0600-\u06ff]/.test(error.message)) throw new Error(error.message);
    if (error) throw new Error("تعذر تأكيد حفظ الإعدادات أعد المحاولة بنفس الخيارات");
    invalidateFinanceViews(slug);
    return state(data);
  }, "تعذر حفظ إعدادات الفواتير");
}
