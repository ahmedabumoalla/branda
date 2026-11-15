"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { foodSafetyRecordSchema, type FoodSafetySnapshot } from "@/lib/erp/food-safety";

const riyadhDay = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(Date.now() + offset * 86400000));
function fail(error: { message?: string } | null, fallback: string) {
  if (!error) return;
  throw new Error(error.message && error.message.length < 300 && /[\u0600-\u06ff]/.test(error.message) ? error.message : fallback);
}

export async function getFoodSafety(filter?: { from?: string; to?: string; kind?: string; branchId?: string }, slug?: string) {
  return actionResult(async () => {
    const parsed = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), kind: z.string().max(30).optional(), branchId: z.union([z.uuid(), z.literal("")]).optional() }).safeParse(filter ?? {});
    if (!parsed.success) throw new Error("راجع مرشحات سجل سلامة الغذاء");
    const from = parsed.data.from ?? riyadhDay(-6), to = parsed.data.to ?? riyadhDay();
    if (to < from) throw new Error("تاريخ البداية يجب أن يسبق تاريخ النهاية");
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_food_safety_read", { p_cafe: cafe.id, p_from: from, p_to: to, p_kind: parsed.data.kind ?? "", p_branch: parsed.data.branchId || null });
    fail(error, "تعذر تحميل سجل سلامة الغذاء");
    return { ...data, from, to, kind: parsed.data.kind ?? "", filterBranchId: parsed.data.branchId ?? "", slug: cafe.slug, brand: cafe.name } as FoodSafetySnapshot;
  }, "تعذر تحميل سجل سلامة الغذاء");
}

export async function recordFoodSafety(input: unknown, slug?: string) {
  return actionResult(async () => {
    const parsed = foodSafetyRecordSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues.find(issue => /[\u0600-\u06ff]/.test(issue.message))?.message ?? "أكمل نوع السجل وموضوعه وقيمه");
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_food_safety_execute", { p_cafe: cafe.id, p_action: "record", p_payload: parsed.data });
    fail(error, "تعذر حفظ السجل");
    revalidatePath("/dashboard/system/food-safety");
    return data as { id: string; number: number; deviation: boolean };
  }, "تعذر حفظ السجل");
}

export async function closeFoodSafetyDeviation(input: { id: string; note: string }, slug?: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), note: z.string().trim().min(5).max(2000) }).safeParse(input);
    if (!parsed.success) throw new Error("اكتب ما تم التحقق منه لإغلاق الانحراف");
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_food_safety_execute", { p_cafe: cafe.id, p_action: "close", p_payload: parsed.data });
    fail(error, "تعذر إغلاق الانحراف");
    revalidatePath("/dashboard/system/food-safety");
    return data as { id: string };
  }, "تعذر إغلاق الانحراف");
}
