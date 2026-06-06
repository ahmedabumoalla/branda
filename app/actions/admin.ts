"use server";

import {
  approveSubscriptionRequest,
  getAdminCafes,
  getAdminCustomers,
  getAdminOperations,
  getAdminPlatformPlans,
  getAdminSubscriptionRequests,
  getOwnerActivePlanId,
  getPlatformPlans,
  rejectSubscriptionRequest,
  savePlatformPlans,
  updateCafePlan,
  updateCafeStatus,
} from "@/lib/data/admin";
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

export async function savePlatformSettingsAction(
  settings: import("@/lib/data/platform-settings").PlatformSettings
) {
  const { savePlatformSettings } = await import("@/lib/data/platform-settings");
  await savePlatformSettings(settings);
}
