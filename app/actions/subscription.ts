"use server";

import {
  completeOwnerPlanPayment,
  failOwnerPlanPayment,
  getOwnerPendingSubscription,
  getOwnerSubscriptionHistory,
  startOwnerPlanCheckout,
  validateOwnerPlanCoupon,
} from "@/lib/data/subscription";

export async function fetchOwnerSubscriptionHistoryAction() {
  return getOwnerSubscriptionHistory();
}

export async function fetchOwnerPendingSubscriptionAction() {
  return getOwnerPendingSubscription();
}

export async function startPlanCheckoutAction(planId: string, couponCode?: string) {
  return startOwnerPlanCheckout(planId, couponCode);
}

export async function validatePlanCouponAction(planId: string, couponCode?: string) {
  return validateOwnerPlanCoupon(planId, couponCode);
}

export async function completePlanPaymentAction(subscriptionId?: string) {
  return completeOwnerPlanPayment(subscriptionId);
}

export async function failPlanPaymentAction() {
  await failOwnerPlanPayment();
}
