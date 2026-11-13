"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { defaultShippingActivityQuery, shippingActivityQuerySchema, shippingActivitySchema, shippingContextSchema, shippingListQuerySchema, shippingListSchema, shippingOptionInputSchema, shippingOptionSchema, shippingSettingsSchema, type ShippingActivityQuery, type ShippingListQuery, type ShippingOptionInput, type ShippingSettings } from "@/lib/finance/shipping";

async function context(slug: string, write = false) {
  const result = await getBrandFinanceContext(slug);
  if (write ? !canFinance(result.cafe.role, "settings_manage") : !["owner", "manager", "accountant", "auditor"].includes(result.cafe.role)) throw new Error("لا تملك صلاحية إدارة خيارات الشحن");
  return result;
}
function rpcError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "42883") throw new Error("تحديث خيارات الشحن لم يُفعّل في قاعدة البيانات بعد");
  if (error.code === "40001") throw new Error("تغيرت بيانات الشحن في جلسة أخرى أعد تحميلها قبل الحفظ");
  if (error.code === "42501") throw new Error("لا تملك صلاحية تنفيذ هذه العملية على خيارات الشحن");
  if (error.code === "23505") throw new Error("يوجد خيار شحن بالاسم نفسه اختر اسمًا مختلفًا");
  if (error.code === "22023" && error.message && /[\u0600-\u06ff]/u.test(error.message)) throw new Error(error.message);
  throw new Error("تعذر تأكيد بيانات الشحن أعد المحاولة");
}
export async function getFinanceShippingSettings(slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_shipping_settings", { p_cafe_id: cafe.id, p_action: "get" });
    rpcError(error);return shippingContextSchema.parse(data);
  }, "تعذر تحميل إعدادات الشحن");
}
export async function saveFinanceShippingSettings(slug: string, settings: ShippingSettings, revision: number) {
  return actionResult(async () => {
    const parsed = z.object({ settings: shippingSettingsSchema, revision: z.number().int().min(0).max(2_147_483_647) }).strict().safeParse({ settings, revision });
    if (!parsed.success) throw new Error("راجع إعدادات الشحن وخدمة الدفع عند الاستلام");
    const { client, cafe } = await context(slug, true);
    const { data, error } = await client.rpc("brand_finance_shipping_settings", { p_cafe_id: cafe.id, p_action: "save", p_settings: parsed.data.settings, p_revision: parsed.data.revision });
    rpcError(error);return shippingContextSchema.parse(data);
  }, "تعذر حفظ إعدادات الشحن");
}
export async function listFinanceShippingOptions(slug: string, query: ShippingListQuery) {
  return actionResult(async () => {
    const parsed = shippingListQuerySchema.safeParse(query);if (!parsed.success) throw new Error("راجع فلاتر خيارات الشحن");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_shipping_options", { p_cafe_id: cafe.id, p_query: parsed.data });
    rpcError(error);return shippingListSchema.parse(data);
  }, "تعذر تحميل خيارات الشحن");
}
export async function getFinanceShippingOption(slug: string, id: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_shipping_option", { p_cafe_id: cafe.id, p_id: z.uuid().parse(id) });
    rpcError(error);return shippingOptionSchema.parse(data);
  }, "تعذر تحميل خيار الشحن");
}
export async function saveFinanceShippingOption(slug: string, id: string, option: ShippingOptionInput, revision: number) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), option: shippingOptionInputSchema, revision: z.number().int().min(0).max(2_147_483_647) }).strict().safeParse({ id, option, revision });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "راجع بيانات خيار الشحن");
    const { client, cafe } = await context(slug, true);
    const { data, error } = await client.rpc("brand_finance_save_shipping_option", { p_cafe_id: cafe.id, p_id: parsed.data.id, p_option: parsed.data.option, p_revision: parsed.data.revision });
    rpcError(error);return shippingOptionSchema.parse(data);
  }, "تعذر حفظ خيار الشحن");
}
export async function deleteFinanceShippingOption(slug: string, id: string, revision: number) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().positive().max(2_147_483_647) }).strict().parse({ id, revision });
    const { client, cafe } = await context(slug, true);
    const { data, error } = await client.rpc("brand_finance_delete_shipping_option", { p_cafe_id: cafe.id, p_id: parsed.id, p_revision: parsed.revision });
    rpcError(error);return z.object({ id: z.uuid(), deleted: z.literal(true), revision: z.number().int().positive() }).strict().parse(data);
  }, "تعذر حذف خيار الشحن");
}
export async function getFinanceShippingActivity(slug: string, id: string, query: ShippingActivityQuery = defaultShippingActivityQuery) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), query: shippingActivityQuerySchema }).strict().safeParse({ id, query });
    if (!parsed.success) throw new Error("راجع فلاتر سجل النشاطات والفترة الزمنية");
    const { client, cafe } = await context(slug);
    const { data, error } = await client.rpc("brand_finance_shipping_activity", { p_cafe_id: cafe.id, p_id: parsed.data.id, p_query: parsed.data.query });
    rpcError(error);return shippingActivitySchema.parse(data);
  }, "تعذر تحميل سجل نشاط خيار الشحن");
}
