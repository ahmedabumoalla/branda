import { ACTIVE_CAFE_PLAN_KEY } from "@/lib/platform/admin-data";
import { setActiveCafePlanId } from "@/lib/platform/permissions";

export type SubscriptionPaymentStatus = "pending" | "paid" | "failed";

export type SubscriptionRecord = {
  id: string;
  planId: string;
  planName: string;
  amount: number;
  paymentStatus: SubscriptionPaymentStatus;
  createdAt: string;
  paidAt?: string;
};

export type PendingSubscription = {
  planId: string;
  planName: string;
  amount: number;
  paymentStatus: SubscriptionPaymentStatus;
  createdAt: string;
};

export const SUBSCRIPTION_HISTORY_KEY = "branda_qatrah_subscription_history";
export const PENDING_SUBSCRIPTION_KEY = "branda_qatrah_pending_subscription";

export function getSubscriptionHistory(): SubscriptionRecord[] {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem(SUBSCRIPTION_HISTORY_KEY);
  return saved ? JSON.parse(saved) : [];
}

export function saveSubscriptionHistory(records: SubscriptionRecord[]) {
  localStorage.setItem(SUBSCRIPTION_HISTORY_KEY, JSON.stringify(records));
}

export function getPendingSubscription(): PendingSubscription | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem(PENDING_SUBSCRIPTION_KEY);
  return saved ? JSON.parse(saved) : null;
}

export function setPendingSubscription(pending: PendingSubscription | null) {
  if (!pending) {
    localStorage.removeItem(PENDING_SUBSCRIPTION_KEY);
    return;
  }
  localStorage.setItem(PENDING_SUBSCRIPTION_KEY, JSON.stringify(pending));
}

export function startPlanCheckout(planId: string, planName: string, amount: number) {
  const pending: PendingSubscription = {
    planId,
    planName,
    amount,
    paymentStatus: "pending",
    createdAt: new Date().toISOString(),
  };
  setPendingSubscription(pending);

  const record: SubscriptionRecord = {
    id: crypto.randomUUID(),
    planId,
    planName,
    amount,
    paymentStatus: "pending",
    createdAt: pending.createdAt,
  };

  const history = getSubscriptionHistory();
  saveSubscriptionHistory([record, ...history]);
  return record.id;
}

export function completePlanPayment(recordId?: string): boolean {
  const pending = getPendingSubscription();
  if (!pending || pending.paymentStatus !== "pending") return false;

  const paidAt = new Date().toISOString();
  setActiveCafePlanId(pending.planId);

  const history = getSubscriptionHistory().map((item) => {
    if (recordId && item.id !== recordId) return item;
    if (!recordId && item.planId === pending.planId && item.paymentStatus === "pending") {
      return { ...item, paymentStatus: "paid" as const, paidAt };
    }
    if (item.planId === pending.planId && item.paymentStatus === "pending") {
      return { ...item, paymentStatus: "paid" as const, paidAt };
    }
    return item;
  });

  saveSubscriptionHistory(history);
  setPendingSubscription(null);
  return true;
}

export function failPlanPayment() {
  const pending = getPendingSubscription();
  if (!pending) return;

  const history = getSubscriptionHistory().map((item) =>
    item.planId === pending.planId && item.paymentStatus === "pending"
      ? { ...item, paymentStatus: "failed" as const }
      : item
  );

  saveSubscriptionHistory(history);
  setPendingSubscription({ ...pending, paymentStatus: "failed" });
}

export function getActivePlanIdFromStorage() {
  if (typeof window === "undefined") return "pro";
  return localStorage.getItem(ACTIVE_CAFE_PLAN_KEY) || "pro";
}
