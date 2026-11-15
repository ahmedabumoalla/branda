"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { actionResult } from "@/lib/platform/action-result";

const settingsSchema = z.object({
  creditEarnsStamp: z.boolean(),
  minimumInvoiceAmount: z.number().finite().min(0).max(100000000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001),
});

async function ownerContext(slug?: string) {
  if (slug) {
    const context = await getBrandFinanceContext(slug);
    if (context.cafe.role !== "owner" && !context.cafe.employeePermissions?.["loyalty.settings"]?.enabled) throw new Error("لا تملك صلاحية إدارة إعدادات الولاء");
    const features = await getCafeFeatureCodes(context.cafe.id);
    if (!featureCodesAllow(features, "finance") || !featureCodesAllow(features, "loyalty")) throw new Error("يلزم تفعيل خدمات المالية والولاء لإدارة هذه الإعدادات");
    return context;
  }
  const ownerCafe = await requireOwnerCafeContext();
  if (ownerCafe.role !== "owner" && ownerCafe.role !== "platform_admin") throw new Error("إعدادات الولاء متاحة لمالك العلامة فقط");
  const features = await getCafeFeatureCodes(ownerCafe.id);
  if (!featureCodesAllow(features, "finance") || !featureCodesAllow(features, "loyalty")) throw new Error("يلزم تفعيل خدمات المالية والولاء لإدارة هذه الإعدادات");
  const context = await getBrandFinanceContext(ownerCafe.slug);
  if (context.cafe.id !== ownerCafe.id || context.cafe.role !== "owner") throw new Error("إعدادات الولاء متاحة لمالك العلامة فقط");
  // The finance context verifies both the signed cookie and the audited database session.
  if (ownerCafe.role === "platform_admin" && context.cafe.maintenance !== true) throw new Error("انتهت جلسة الصيانة افتح صيانة العلامة مجددًا");
  return context;
}

export async function readFinanceLoyaltySettings(slug?: string) {
  return actionResult(async () => {
    const { client, cafe } = await ownerContext(slug);
    const { data, error } = await client.rpc("finance_loyalty_settings_read", { p_cafe: cafe.id });
    if (error) throw new Error("تعذر تحميل إعدادات الولاء أعد المحاولة");
    const parsed = settingsSchema.safeParse(data);
    if (!parsed.success) throw new Error("تعذر قراءة إعدادات الولاء");
    return parsed.data;
  }, "تعذر تحميل إعدادات الولاء");
}

export async function saveFinanceLoyaltySettings(input: unknown, slug?: string) {
  return actionResult(async () => {
    const { client, cafe } = await ownerContext(slug);
    const parsed = settingsSchema.strict().safeParse(input);
    if (!parsed.success) throw new Error("أدخل مبلغًا من صفر إلى مئة مليون ريال بمنزلتين عشريتين كحد أقصى");
    const { data, error } = await client.rpc("finance_loyalty_settings_save", {
      p_cafe: cafe.id,
      p_credit_earns_stamp: parsed.data.creditEarnsStamp,
      p_minimum_invoice_amount: parsed.data.minimumInvoiceAmount,
    });
    if (error) throw new Error(error.code === "P0001" && /[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر تأكيد حفظ إعدادات الولاء أعد المحاولة");
    const result = settingsSchema.safeParse(data);
    if (!result.success) throw new Error("تعذر قراءة الإعدادات المحفوظة أعد تحميل الصفحة");
    revalidatePath("/dashboard/loyalty/settings");
    return result.data;
  }, "تعذر حفظ إعدادات الولاء");
}
