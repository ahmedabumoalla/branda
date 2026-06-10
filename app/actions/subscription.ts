"use server";



import {

  completeOwnerPlanPayment,

  failOwnerPlanPayment,

  getOwnerPendingSubscription,

  getOwnerSubscriptionHistory,

  startOwnerPlanCheckout,

} from "@/lib/data/subscription";



export async function fetchOwnerSubscriptionHistoryAction() {

  return getOwnerSubscriptionHistory();

}



export async function fetchOwnerPendingSubscriptionAction() {

  return getOwnerPendingSubscription();

}



export async function startPlanCheckoutAction(planId: string) {

  return startOwnerPlanCheckout(planId);

}



export async function completePlanPaymentAction(subscriptionId?: string) {

  return completeOwnerPlanPayment(subscriptionId);

}



export async function failPlanPaymentAction() {

  await failOwnerPlanPayment();

}

