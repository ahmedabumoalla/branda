"use server";

import { getOwnerLoyaltyCustomerDetail, getOwnerLoyaltyCustomers } from "@/lib/data/loyalty-customers";
import type { LoyaltyCustomerDetail, LoyaltyCustomerPage, LoyaltyCustomerResult } from "@/lib/loyalty/customer-directory-types";

export async function loadLoyaltyCustomersAction(input: { page?: number; query?: string; downloadedOnly?: boolean } = {}): Promise<LoyaltyCustomerResult<LoyaltyCustomerPage>> {
  try { return { ok: true, data: await getOwnerLoyaltyCustomers(input) }; }
  catch { return { ok: false, message: "تعذر تحميل سجل العملاء تحقق من صلاحية الدخول ثم حاول مجددًا" }; }
}

export async function loadLoyaltyCustomerDetailAction(id: string, downloadedOnly = false): Promise<LoyaltyCustomerResult<LoyaltyCustomerDetail>> {
  try { return { ok: true, data: await getOwnerLoyaltyCustomerDetail(id, downloadedOnly) }; }
  catch { return { ok: false, message: "تعذر عرض بيانات العميل أعد المحاولة أو حدّث سجل العملاء" }; }
}
