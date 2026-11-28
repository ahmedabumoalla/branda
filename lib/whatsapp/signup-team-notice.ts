import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandCountry, isBrandPhoneCountry } from "@/lib/auth/brand-phone";
import { BUSINESS_CATEGORIES } from "@/lib/platform/business-categories";
import { sendSignupNoticeFromPrimary } from "@/lib/whatsapp/green-api";

type Contact = {
  brandNameAr: string; brandNameEn: string; ownerName: string;
  email?: string; category?: string; customCategoryName?: string; country?: string;
};

function line(label: string, value?: string) {
  return value ? label + ": " + value.replace(/[\r\n\t\u202a-\u202e\u2066-\u2069]/gu, " ").trim() : "";
}

export async function deliverSignupTeamNotice(challengeId: string | null = null) {
  const db = createAdminClient();
  const claimed = await db.rpc("claim_signup_team_notice", { p_id: challengeId });
  if (claimed.error) throw new Error("signup_notice_claim_failed");
  if (!claimed.data) return false;
  const { id, attempt, phone, contact } = claimed.data as { id: string; attempt: string; phone: string; contact: Contact };
  const category = contact.category === "other" ? contact.customCategoryName :
    BUSINESS_CATEGORIES.find(item => item.id === contact.category)?.label;
  const message = [
    "تسجيل ذاتي جديد ينتظر تفعيل الحساب",
    line("العلامة", contact.brandNameAr), line("الاسم بالإنجليزية", contact.brandNameEn),
    line("المسؤول", contact.ownerName), line("الجوال", "+" + phone),
    line("البريد الإلكتروني", contact.email), line("النشاط", category),
    line("الدولة", isBrandPhoneCountry(contact.country) ? getBrandCountry(contact.country).name : undefined),
  ].filter(Boolean).join("\n");
  const result = await sendSignupNoticeFromPrimary(message);
  for (let retry = 0; retry < 3; retry++) {
    const ack = await db.rpc("finish_signup_team_notice", { p_id: id, p_attempt: attempt, p_result: result });
    if (!ack.error && ack.data === true) return true;
  }
  throw new Error("signup_notice_ack_failed");
}
