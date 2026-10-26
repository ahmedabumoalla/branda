import "server-only";

import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { requireCashierPermission } from "@/lib/data/cashier";
import { assertRastLoyaltyEntitlement } from "@/lib/data/rast-loyalty-access";
import { createAdminClient } from "@/lib/supabase/admin";

/** Resolves an existing card only; preview and confirmation use the audited scanner. */
export async function resolveCashierLoyaltyPhone(rawPhone: string): Promise<string> {
  const admin = createAdminClient();
  const session = await requireCashierPermission("loyalty", admin);
  await assertRastLoyaltyEntitlement(session.cafeId);
  if (typeof rawPhone !== "string" || rawPhone.length > 30) throw new Error("أدخل رقم جوال سعودي صحيح يبدأ بـ 05");
  const digits = rawPhone.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)));
  const phone = /^[+\d\s()-]+$/.test(digits) ? normalizeSaudiPhone(digits) : null;
  if (!phone) throw new Error("أدخل رقم جوال سعودي صحيح يبدأ بـ 05");

  // Both queries derive the tenant from the authenticated session, never client input.
  const { data: customer, error: customerError } = await admin.from("customer_profiles")
    .select("id,status,blocked_at,phone_auth_conflict")
    .eq("cafe_id", session.cafeId).eq("phone_normalized", phone).maybeSingle();
  if (customerError) throw new Error("تعذر البحث عن العميل حاول مرة أخرى");
  if (!customer || customer.status !== "active" || customer.blocked_at || customer.phone_auth_conflict) {
    throw new Error("لا توجد بطاقة ولاء متاحة لهذا الرقم لدى العلامة");
  }
  const { data: card, error: cardError } = await admin.from("loyalty_cards")
    .select("card_code,status").eq("cafe_id", session.cafeId)
    .eq("customer_profile_id", customer.id).maybeSingle();
  if (cardError) throw new Error("تعذر البحث عن العميل حاول مرة أخرى");
  if (!card || card.status !== "active" || !/^[A-Z0-9_-]{4,100}$/.test(card.card_code)) {
    throw new Error("لا توجد بطاقة ولاء متاحة لهذا الرقم لدى العلامة");
  }
  return card.card_code;
}
