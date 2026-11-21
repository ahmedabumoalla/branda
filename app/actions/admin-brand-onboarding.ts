"use server";

import { revalidatePath } from "next/cache";
import { getAdminCafes } from "@/lib/data/admin";
import { createAdminBrandAccountWithPlans, saveAdminBrandOwner, updateAdminBrandProfile } from "@/lib/data/admin-brand-account";
import { getAdminBrandBilling } from "@/lib/data/admin-brand-billing";
import { sendBrandOwnerWelcome } from "@/lib/data/admin-brand-onboarding";
import { actionResult } from "@/lib/platform/action-result";
import type { AdminBrandAccountWithPlansInput, AdminBrandOwnerInput, AdminBrandProfileInput } from "@/lib/platform/brand-onboarding";

async function updatedBrand(id: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  const cafe = (await getAdminCafes(id))[0];
  if (!cafe) throw new Error("العلامة لم تعد متاحة حدّث القائمة");
  return cafe;
}
export async function createAdminBrandAccountAction(input: AdminBrandAccountWithPlansInput) {
  return actionResult(async () => {
    const created = await createAdminBrandAccountWithPlans(input);
    return { cafe: await updatedBrand(created.cafeId), plansApplied: created.plansApplied };
  }, "تعذر إنشاء حساب العلامة حاول مجددًا");
}
export async function sendBrandOwnerWelcomeAction(cafeId: string, retryUncertain: boolean) {
  return actionResult(async () => { await sendBrandOwnerWelcome(cafeId, retryUncertain); return updatedBrand(cafeId); }, "تعذر إرسال تفاصيل الدخول حدّث حالة الإرسال قبل إعادة المحاولة");
}
export async function refreshAdminBrandAction(cafeId: string) {
  return actionResult(async () => updatedBrand(cafeId), "تعذر تحديث حالة العلامة");
}
export async function updateAdminBrandOwnerAction(input: AdminBrandOwnerInput) {
  return actionResult(async () => {
    const saved = await saveAdminBrandOwner(input);
    return { cafe: await updatedBrand(input.cafeId), contactOnly: saved.contactOnly };
  }, "تعذر حفظ بيانات المالك");
}
export async function updateAdminBrandProfileAction(input: AdminBrandProfileInput) {
  return actionResult(async () => {
    await updateAdminBrandProfile(input);
    // The brand name appears on its public pages
    revalidatePath("/c/[slug]", "layout");
    revalidatePath("/menu/[slug]", "page");
    revalidatePath("/loyalty/[slug]", "page");
    return updatedBrand(input.cafeId);
  }, "تعذر حفظ بيانات العلامة");
}
export async function fetchAdminBrandBillingAction(cafeId: string) {
  return actionResult(() => getAdminBrandBilling(cafeId), "تعذر تحميل أسعار اشتراك العلامة حاول مجددًا");
}
