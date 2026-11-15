"use server";
import { revalidatePath } from "next/cache";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { pointsAdjustSchema, pointsSettingsSchema, type PointsBalance, type PointsSnapshot } from "@/lib/erp/points";

function fail(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === "40001") throw new Error("تغيرت إعدادات النقاط أعد تحميل الصفحة قبل الحفظ");
  throw new Error(error.message && error.message.length < 300 && /[\u0600-\u06ff]/.test(error.message) ? error.message : fallback);
}

export async function getPoints(filter?: { phone?: string; query?: string }, slug?: string) {
  return actionResult(async () => {
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_points_read", { p_cafe: cafe.id, p_phone: filter?.phone?.slice(0, 25) || null, p_query: filter?.query?.slice(0, 40) ?? "" });
    fail(error, "تعذر تحميل نقاط الولاء");
    return { ...data, slug: cafe.slug, brand: cafe.name } as PointsSnapshot;
  }, "تعذر تحميل نقاط الولاء");
}

/** Cashier lookup: never throws, a brand without points simply reports them as disabled */
export async function getPointsBalance(slug: string, phone: string): Promise<PointsBalance> {
  try {
    if (typeof phone !== "string" || phone.length > 25) return { enabled: false, balance: 0 };
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_points_balance", { p_cafe: cafe.id, p_phone: phone });
    if (error || !data) return { enabled: false, balance: 0 };
    return data as PointsBalance;
  } catch { return { enabled: false, balance: 0 }; }
}

export async function savePointsSettings(input: unknown, slug?: string) {
  return actionResult(async () => {
    const parsed = pointsSettingsSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues.find(issue => /[\u0600-\u06ff]/.test(issue.message))?.message ?? "راجع حقول إعدادات النقاط");
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_points_execute", { p_cafe: cafe.id, p_action: "settings", p_payload: parsed.data });
    fail(error, "تعذر حفظ إعدادات النقاط");
    revalidatePath("/dashboard/system/points");
    return data as PointsSnapshot["settings"];
  }, "تعذر حفظ إعدادات النقاط");
}

export async function adjustPoints(input: unknown, slug?: string) {
  return actionResult(async () => {
    const parsed = pointsAdjustSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues.find(issue => /[\u0600-\u06ff]/.test(issue.message))?.message ?? "راجع رقم الجوال وعدد النقاط وسبب التعديل");
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_points_execute", { p_cafe: cafe.id, p_action: "adjust", p_payload: { ...parsed.data, branchId: parsed.data.branchId ?? "" } });
    fail(error, "تعذر تعديل رصيد النقاط");
    revalidatePath("/dashboard/system/points");
    return data as { phone: string; balance: number };
  }, "تعذر تعديل رصيد النقاط");
}
