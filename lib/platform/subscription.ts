import type { PlanDurationUnit } from "@/lib/platform/admin-data";

export type SubscriptionPaymentMethod = "cash" | "bank_transfer";
export type SubscriptionRequestStatus =
  | "awaiting_receipt"
  | "pending_review"
  | "approved"
  | "rejected"
  | "cancelled";

export type ActiveSubscription = {
  id: string;
  planId: string;
  planName: string;
  amount: number;
  durationUnit: PlanDurationUnit;
  durationCount: number;
  startedAt: string;
  expiresAt?: string;
};

export type SubscriptionRecord = {
  id: string;
  planId: string;
  planName: string;
  amount: number;
  paymentStatus: "active" | "expired" | "cancelled";
  durationUnit: PlanDurationUnit;
  durationCount: number;
  createdAt: string;
  startedAt?: string;
  expiresAt?: string;
};

export type SubscriptionPaymentRequest = {
  id: string;
  cafeId: string;
  cafeName?: string;
  planId: string;
  planName: string;
  baseAmount: number;
  amount: number;
  durationUnit: PlanDurationUnit;
  durationCount: number;
  paymentMethod: SubscriptionPaymentMethod;
  branchId?: string;
  branchName?: string;
  receiptStoragePath?: string;
  status: SubscriptionRequestStatus;
  createdAt: string;
  adminResponse?: string;
};
