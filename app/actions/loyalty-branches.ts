"use server";
import { revalidatePath } from "next/cache";
import { assignLoyaltyCashierBranch, saveLoyaltyBranch } from "@/lib/data/loyalty-branches";

export async function saveLoyaltyBranchAction(input: unknown) {
  try { const data = await saveLoyaltyBranch(input); revalidatePath("/dashboard/loyalty/branches"); return { ok: true as const, data }; }
  catch (error) { return { ok: false as const, message: error instanceof Error && /^[\u0600-\u06ff]/.test(error.message) ? error.message : "تحقق من بيانات الفرع ثم أعد المحاولة" }; }
}
export async function assignLoyaltyCashierBranchAction(cashierId: string, branchId: string | null) {
  try { const data = await assignLoyaltyCashierBranch(cashierId, branchId); revalidatePath("/cashier"); return { ok: true as const, data }; }
  catch { return { ok: false as const, message: "تعذر ربط الكاشير بالفرع" }; }
}
