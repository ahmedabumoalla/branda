"use server";

import {
  completeOwnerPlanPayment,
  failOwnerPlanPayment,
  getOwnerPendingSubscription,
  getOwnerSubscriptionHistory,
  startOwnerPlanCheckout,
  validateOwnerPlanCoupon,
  createOwnerBankRequest,
  submitOwnerBankReceipt,
  getOwnerSubscriptionRequests,
} from "@/lib/data/subscription";

export async function fetchOwnerSubscriptionHistoryAction() {
  return getOwnerSubscriptionHistory();
}

export async function fetchOwnerPendingSubscriptionAction() {
  return getOwnerPendingSubscription();
}

export async function startPlanCheckoutAction(planId: string, couponCode?: string, durationMonths = 1) {
  return startOwnerPlanCheckout(planId, couponCode, durationMonths);
}

export async function validatePlanCouponAction(planId: string, couponCode?: string, durationMonths = 1) {
  return validateOwnerPlanCoupon(planId, couponCode, durationMonths);
}

export async function completePlanPaymentAction(subscriptionId?: string) {
  return completeOwnerPlanPayment(subscriptionId);
}

export async function failPlanPaymentAction() {
  await failOwnerPlanPayment();
}

export async function createBankSubscriptionRequestAction(planId: string, durationMonths: number) {
  return createOwnerBankRequest(planId, durationMonths);
}

export async function uploadSubscriptionReceiptAction(requestId: string, formData: FormData) {
  return submitOwnerBankReceipt(requestId, formData);
}

export async function submitSubscriptionWhatsappAction(requestId: string) {
  return submitOwnerBankReceipt(requestId);
}

export async function refreshSubscriptionRequestsAction() {
  return getOwnerSubscriptionRequests();
}
