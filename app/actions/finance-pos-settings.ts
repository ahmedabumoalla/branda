"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";

const settingsSchema = z.object({ whatsappInvoiceEnabled: z.boolean() });
async function ownerContext(slug: string) {
  const result = await getBrandFinanceContext(slug);
  if (result.cafe.slug !== "mind-hospital" || result.cafe.role !== "owner") throw new Error("إعدادات نقاط البيع متاحة لمالك MND فقط");
  return result;
}
export async function readFinancePosSettings(slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await ownerContext(slug);
    const { data, error } = await client.rpc("brand_finance_pos_settings_read", { p_cafe: cafe.id });
    if (error) throw new Error("تعذر تحميل إعدادات نقاط البيع أعد المحاولة");
    const result = settingsSchema.safeParse(data);
    if (!result.success) throw new Error("تعذر قراءة إعدادات نقاط البيع");
    return result.data;
  }, "تعذر تحميل إعدادات نقاط البيع");
}
export async function saveFinancePosSettings(slug: string, input: unknown) {
  return actionResult(async () => {
    const { client, cafe } = await ownerContext(slug);
    const parsed = settingsSchema.strict().safeParse(input);
    if (!parsed.success) throw new Error("راجع خيارات نقاط البيع قبل الحفظ");
    const { data, error } = await client.rpc("brand_finance_pos_settings_save", { p_cafe: cafe.id, p_enabled: parsed.data.whatsappInvoiceEnabled });
    if (error) throw new Error("تعذر تأكيد حفظ إعدادات نقاط البيع أعد المحاولة");
    const result = settingsSchema.safeParse(data);
    if (!result.success) throw new Error("تعذر قراءة الإعدادات المحفوظة أعد تحميل الصفحة");
    invalidateFinanceViews(slug);
    return result.data;
  }, "تعذر حفظ إعدادات نقاط البيع");
}
