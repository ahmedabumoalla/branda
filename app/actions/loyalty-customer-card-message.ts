"use server";

import { getOwnerLoyaltyCustomerCardMessage, type LoyaltyCustomerCardMessage } from "@/lib/data/loyalty-customer-card-message";
import type { LoyaltyCustomerResult } from "@/lib/loyalty/customer-directory-types";

export async function loadLoyaltyCustomerCardMessageAction(id: string, downloadedOnly = false): Promise<LoyaltyCustomerResult<LoyaltyCustomerCardMessage>> {
  try { return { ok: true, data: await getOwnerLoyaltyCustomerCardMessage(id, downloadedOnly) }; }
  catch (error) {
    return { ok: false, message: error instanceof Error && error.message === "customer_phone_unavailable"
      ? "لا يوجد رقم جوال صحيح لهذا العميل"
      : "تعذر تجهيز رسالة البطاقة أعد المحاولة" };
  }
}
