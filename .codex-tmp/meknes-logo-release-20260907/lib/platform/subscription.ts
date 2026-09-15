export type SubscriptionPaymentRequest = {
  id: string;
  cafeId: string;
  cafeName: string;
  planId: string;
  planName: string;
  baseAmount: number;
  amount: number;
  durationUnit: "day" | "month" | "year";
  durationCount: number;
  paymentMethod: "bank_transfer" | "card" | "cash" | "paypal" | "mada" | string;
  branchId?: string;
  branchName?: string;
  receiptStoragePath?: string;
  status: "pending" | "approved" | "rejected" | "paid" | "failed" | string;
  createdAt: string;
  adminResponse?: string;
};

export type SubscriptionPaymentStatus = "pending" | "paid" | "failed";

export type SubscriptionRecord = {
  id: string;
  planId: string;
  planName: string;
  amount: number;
  paymentStatus: SubscriptionPaymentStatus;
  createdAt: string;
  paidAt?: string;
  paymentMethodLabel?: string;
};

export type PendingSubscription = {
  id?: string;
  planId: string;
  planName: string;
  amount: number;
  paymentStatus: SubscriptionPaymentStatus;
  createdAt: string;
};

export const SUBSCRIPTION_HISTORY_KEY = "barndaksa_qatrah_subscription_history";
export const PENDING_SUBSCRIPTION_KEY = "barndaksa_qatrah_pending_subscription";

export function getSubscriptionHistory(): SubscriptionRecord[] {
  throw new Error("Use fetchOwnerSubscriptionHistoryAction");
}

export function saveSubscriptionHistory(_records: SubscriptionRecord[]) {
  throw new Error("Use Supabase subscription actions");
}

export function getPendingSubscription(): PendingSubscription | null {
  throw new Error("Use fetchOwnerPendingSubscriptionAction");
}

export function setPendingSubscription(_pending: PendingSubscription | null) {
  throw new Error("Use Supabase subscription actions");
}

export function startPlanCheckout(_planId: string, _planName: string, _amount: number) {
  throw new Error("Use startPlanCheckoutAction");
}

export function completePlanPayment(_recordId?: string): boolean {
  throw new Error("Use completePlanPaymentAction");
}

export function failPlanPayment() {
  throw new Error("Use failPlanPaymentAction");
}

export function getActivePlanIdFromStorage() {
  throw new Error("Use fetchOwnerPlanIdAction");
}
