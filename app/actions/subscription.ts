"use server";
import { actionResult } from "@/lib/platform/action-result";

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
  return actionResult(() => createOwnerBankRequest(planId, durationMonths), "تعذر إنشاء طلب الاشتراك حاول مجددًا");
}

export async function uploadSubscriptionReceiptAction(requestId: string, formData: FormData) {
  return actionResult(() => submitOwnerBankReceipt(requestId, formData), "تعذر إرسال الإيصال حاول مجددًا");
}

export async function submitSubscriptionWhatsappAction(requestId: string) {
  return actionResult(() => submitOwnerBankReceipt(requestId), "تعذر إرسال الطلب للمراجعة حاول مجددًا");
}

export async function refreshSubscriptionRequestsAction() {
  return actionResult(() => getOwnerSubscriptionRequests(), "تعذر تحديث حالة الطلب حاول مجددًا");
}
