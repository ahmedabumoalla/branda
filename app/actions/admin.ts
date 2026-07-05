"use server";

import { revalidatePath } from "next/cache";
import {
  approveSubscriptionRequest,
  type CafeFeatureOverrideInput,
  getAdminCafes,
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
  await savePlatformPlans(plans);
  return getAdminPlatformPlans();
}

export async function fetchAdminSubscriptionRequestsAction() {
  return getAdminSubscriptionRequests();
}

export async function approveSubscriptionRequestAction(requestId: string) {
  await approveSubscriptionRequest(requestId);
  return getAdminSubscriptionRequests();
}

export async function rejectSubscriptionRequestAction(requestId: string, response: string) {
  await rejectSubscriptionRequest(requestId, response);
  return getAdminSubscriptionRequests();
}

export async function updateCafePlanAction(cafeId: string, planId: string) {
  await updateCafePlan(cafeId, planId);
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
