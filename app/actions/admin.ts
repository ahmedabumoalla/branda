"use server";

import { revalidatePath } from "next/cache";
import {
  approveSubscriptionRequest,
  type CafeFeatureOverrideInput,
  getAdminCafes,
  getAdminCafeSubscriptionSummary,
  getAdminCustomers,
  getAdminOperations,
  getAdminPlatformPlans,
  getAdminSubscriptionRequests,
  getOwnerActivePlanId,
  getPlatformPlans,
  rejectSubscriptionRequest,
  saveCafeFeatureOverrides,
  savePlatformPlans,
  updateCafePlan,
  updateCafeStatus,
} from "@/lib/data/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformPlan } from "@/lib/platform/admin-data";
import { actionResult } from "@/lib/platform/action-result";

export async function fetchPlatformPlansAction() {
  return getPlatformPlans();
}

export async function fetchAdminPlatformPlansAction() {
  return getAdminPlatformPlans();
}

export async function fetchOwnerPlanIdAction() {
  return getOwnerActivePlanId();
}

export async function fetchAdminCafesAction() {
  return getAdminCafes();
}

export async function fetchAdminCustomersAction() {
  return getAdminCustomers();
}

export async function fetchAdminOperationsAction() {
  return getAdminOperations();
}

export async function savePlatformPlansAction(plans: PlatformPlan[]) {
  return actionResult(async () => {
    await savePlatformPlans(plans);
    return getAdminPlatformPlans();
  }, "تعذر حفظ الباقات بقيت تعديلاتك محفوظة في الصفحة؛ حاول مجددًا");
}

export async function fetchAdminSubscriptionRequestsAction() {
  return getAdminSubscriptionRequests();
}

export async function approveSubscriptionRequestAction(requestId: string) {
  return actionResult(async () => {
    await approveSubscriptionRequest(requestId);
    return getAdminSubscriptionRequests();
  }, "تعذر اعتماد الطلب حدّث حالته وتأكد من الإيصال ثم حاول مجددًا");
}

export async function rejectSubscriptionRequestAction(requestId: string, response: string) {
  return actionResult(async () => {
    await rejectSubscriptionRequest(requestId, response);
    return getAdminSubscriptionRequests();
  }, "تعذر تحديث الطلب حاول مجددًا");
}

export async function updateCafePlanAction(cafeId: string, planId: string) {
  await updateCafePlan(cafeId, planId);
  return getAdminCafeSubscriptionSummary(cafeId);
}

export async function updateCafeStatusAction(cafeId: string, active: boolean) {
  await updateCafeStatus(cafeId, active);
}

export async function saveCafeFeatureOverridesAction(
  cafeId: string,
  overrides: CafeFeatureOverrideInput[]
) {
  const saved = await saveCafeFeatureOverrides(cafeId, overrides);
  const admin = createAdminClient();
  const { data: cafe } = await admin
    .from("cafes")
    .select("slug")
    .eq("id", cafeId)
    .maybeSingle();

  revalidatePath("/admin/cafes");
  revalidatePath("/dashboard", "layout");
  if (cafe?.slug) {
    revalidatePath(`/c/${cafe.slug}`);
    revalidatePath("/c/[slug]", "layout");
  }

  return saved;
}

export async function savePlatformSettingsAction(
  settings: import("@/lib/data/platform-settings").PlatformSettings
) {
  const { savePlatformSettings } = await import("@/lib/data/platform-settings");
  await savePlatformSettings(settings);
}

export async function fetchPlatformDiscountCouponsAction() {
  const { getPlatformDiscountCoupons } = await import("@/lib/data/platform-coupons");
  return getPlatformDiscountCoupons();
}

export async function savePlatformDiscountCouponAction(
  input: Omit<import("@/lib/data/platform-coupons").PlatformDiscountCoupon, "createdAt" | "redeemedCount">
) {
  const { savePlatformDiscountCoupon, getPlatformDiscountCoupons } = await import("@/lib/data/platform-coupons");
  await savePlatformDiscountCoupon(input);
  return getPlatformDiscountCoupons();
}

export async function deletePlatformDiscountCouponAction(couponId: string) {
  const { deletePlatformDiscountCoupon, getPlatformDiscountCoupons } = await import("@/lib/data/platform-coupons");
  await deletePlatformDiscountCoupon(couponId);
  return getPlatformDiscountCoupons();
}
