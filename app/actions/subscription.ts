"use server";

import {
  createOwnerSubscriptionRequest,
  getOwnerActiveSubscription,
  getOwnerSubscriptionHistory,
  getOwnerSubscriptionRequests,
} from "@/lib/data/subscription";
import { uploadSubscriptionReceipt } from "@/lib/storage/subscription-receipt-server";

export async function fetchOwnerSubscriptionHistoryAction() {
  return getOwnerSubscriptionHistory();
}

export async function fetchOwnerSubscriptionRequestsAction() {
  return getOwnerSubscriptionRequests();
}

export async function fetchOwnerActiveSubscriptionAction() {
  return getOwnerActiveSubscription();
}

export async function submitSubscriptionRequestAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const paymentMethod = String(formData.get("paymentMethod") ?? "");
  const branchId = String(formData.get("branchId") ?? "") || undefined;

  if (paymentMethod !== "cash" && paymentMethod !== "bank_transfer") {
    throw new Error("اختر طريقة دفع صحيحة");
  }

  const requestId = await createOwnerSubscriptionRequest({
    planId,
    paymentMethod,
    branchId,
  });

  if (paymentMethod === "bank_transfer") {
    const receipt = formData.get("receipt");
    if (!(receipt instanceof File) || receipt.size <= 0) {
      throw new Error("أرفق إيصال التحويل البنكي");
    }
    await uploadSubscriptionReceipt(requestId, receipt);
  }

  return requestId;
}
