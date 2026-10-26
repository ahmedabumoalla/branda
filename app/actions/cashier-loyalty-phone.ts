"use server";

import { resolveCashierLoyaltyPhone } from "@/lib/data/cashier-loyalty-phone";

export async function lookupCashierLoyaltyPhoneAction(phone: string) {
  try {
    return { ok: true as const, cardCode: await resolveCashierLoyaltyPhone(phone) };
  } catch (error) {
    const allowed = ["أدخل رقم جوال سعودي صحيح يبدأ بـ 05", "لا توجد بطاقة ولاء متاحة لهذا الرقم لدى العلامة", "برنامج الولاء غير متاح حاليًا"];
    return { ok: false as const, message: error instanceof Error && allowed.includes(error.message) ? error.message : "تعذر البحث عن العميل حاول مرة أخرى" };
  }
}
