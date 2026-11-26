"use server";

import { getOwnerLoyaltyCustomerDetail, getOwnerLoyaltyCustomers, suspendOwnerLoyaltyCard } from "@/lib/data/loyalty-customers";
import type { LoyaltyCustomerDetail, LoyaltyCustomerPage, LoyaltyCustomerResult } from "@/lib/loyalty/customer-directory-types";

export async function loadLoyaltyCustomersAction(input: { page?: number; query?: string; downloadedOnly?: boolean } = {}): Promise<LoyaltyCustomerResult<LoyaltyCustomerPage>> {
  try { return { ok: true, data: await getOwnerLoyaltyCustomers(input) }; }
  catch { return { ok: false, message: "تعذر تحميل سجل العملاء تحقق من صلاحية الدخول ثم حاول مجددًا" }; }
}

export async function loadLoyaltyCustomerDetailAction(id: string, downloadedOnly = false): Promise<LoyaltyCustomerResult<LoyaltyCustomerDetail>> {
  try { return { ok: true, data: await getOwnerLoyaltyCustomerDetail(id, downloadedOnly) }; }
  catch { return { ok: false, message: "تعذر عرض بيانات العميل أعد المحاولة أو حدّث سجل العملاء" }; }
}

export async function suspendLoyaltyCustomerCardAction(customerId: string, cardId: string) {
  try {
    await suspendOwnerLoyaltyCard(customerId, cardId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "تعذر إيقاف البطاقة حدّث بيانات العميل وحاول مرة أخرى" };
  }
}
