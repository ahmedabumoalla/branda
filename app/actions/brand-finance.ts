"use server";
import { revalidatePath } from "next/cache";
import { actionResult } from "@/lib/platform/action-result";
import { executeBrandFinanceCommand, getBrandFinanceHistory, getBrandFinanceSnapshot } from "@/lib/data/brand-finance";

export async function fetchBrandFinanceAction(slug?: string) {
  return actionResult(() => getBrandFinanceSnapshot(slug), "تعذر تحميل البيانات المالية حاول مجددا");
}
export async function fetchBrandFinanceHistoryAction(kind: unknown, offset: unknown, slug?: string) {
  return actionResult(() => getBrandFinanceHistory(kind, offset, slug), "تعذر تحميل السجل المالي حاول مجددا");
}
export async function executeBrandFinanceAction(input: unknown, slug?: string) {
  return actionResult(async () => {
    const result = await executeBrandFinanceCommand(input, slug);
    revalidatePath("/dashboard/finance", "layout");
    if (slug) revalidatePath(`/finance/${slug}/pos`);
    return result;
  }, "تعذر تأكيد حفظ العملية أعد المحاولة بنفس الطلب لتجنب التكرار");
}
