"use server";

import { revalidatePath } from "next/cache";
import { getAdminCafes } from "@/lib/data/admin";
import { createAdminBrandAccount, sendBrandOwnerWelcome, updateAdminBrandOwner } from "@/lib/data/admin-brand-onboarding";
import { actionResult } from "@/lib/platform/action-result";
import type { AdminBrandAccountInput, AdminBrandOwnerInput } from "@/lib/platform/brand-onboarding";

async function updatedBrand(id: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  const cafe = (await getAdminCafes(id))[0];
  if (!cafe) throw new Error("العلامة لم تعد متاحة حدّث القائمة");
  return cafe;
}
export async function createAdminBrandAccountAction(input: AdminBrandAccountInput) {
  return actionResult(async () => updatedBrand(await createAdminBrandAccount(input)), "تعذر إنشاء حساب العلامة حاول مجددًا");
}
export async function sendBrandOwnerWelcomeAction(cafeId: string, retryUncertain: boolean) {
  return actionResult(async () => { await sendBrandOwnerWelcome(cafeId, retryUncertain); return updatedBrand(cafeId); }, "تعذر إرسال تفاصيل الدخول لم يبدأ عداد التجربة");
}
export async function refreshAdminBrandAction(cafeId: string) {
  return actionResult(async () => updatedBrand(cafeId), "تعذر تحديث حالة العلامة");
}
export async function updateAdminBrandOwnerAction(input: AdminBrandOwnerInput) {
  return actionResult(async () => { await updateAdminBrandOwner(input); return updatedBrand(input.cafeId); }, "تعذر حفظ بيانات المالك");
}
