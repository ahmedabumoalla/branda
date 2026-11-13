"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { priceListActivityPageSchema } from "@/lib/finance/price-list-activity";

export async function getFinancePriceListActivity(slug: string, listId: string, beforeRevision: number | null = null) {
  return actionResult(async () => {
    const input = z.object({ listId: z.uuid(), beforeRevision: z.number().int().positive().max(2_147_483_647).nullable() }).strict().safeParse({ listId, beforeRevision });
    if (!input.success) throw new Error("راجع قائمة الأسعار وصفحة سجل النشاطات");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!["owner", "manager", "accountant", "auditor"].includes(cafe.role)) throw new Error("لا تملك صلاحية عرض سجل نشاط قوائم الأسعار");
    const { data, error } = await client.rpc("brand_finance_price_list_activity", { p_cafe_id: cafe.id, p_list_id: input.data.listId, p_before_revision: input.data.beforeRevision, p_limit: 20 });
    if (error?.code === "PGRST202" || error?.code === "42883") throw new Error("تحديث سجل نشاط قوائم الأسعار لم يُفعّل في قاعدة البيانات بعد");
    if (error) throw new Error("تعذر تحميل سجل نشاط قائمة الأسعار أعد المحاولة");
    const parsed = priceListActivityPageSchema.safeParse(data);
    if (!parsed.success) throw new Error("تعذر قراءة سجل نشاط القائمة أعد تحميل البيانات");
    return parsed.data;
  }, "تعذر تحميل سجل نشاط قائمة الأسعار");
}
