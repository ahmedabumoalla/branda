"use server";

import { z } from "zod";
import { saveOwnerLoyaltyExperience, saveRastLoyaltySettings, saveBrandLoyaltyProgram, lookupRastCashierCard } from "@/lib/data/loyalty-experience";
import { enrollLoyaltyCustomer } from "@/lib/data/loyalty-enrollment";
import type { PhoneOtpRequestResult } from "@/lib/auth/phone-otp";
import { revalidatePath } from "next/cache";
import { requireCashierPermission } from "@/lib/data/cashier";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes, getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { syncWalletCardByCode, notifyBrandWalletMembers } from "@/lib/wallet";
import type { LoyaltyExperienceSettings } from "@/lib/loyalty/experience-types";
import { GoogleMapsLocationError } from "@/lib/maps/resolve-branch-location";
import { lookupRastCashierReward } from "@/lib/data/customer-rewards";
import { localizeCashierCatalog } from "@/lib/cashier/catalog-translation";

export async function enrollLoyaltyAction(slug: string, phone: string, name: string) {
  try {
    return await enrollLoyaltyCustomer({ slug, phone, name });
  } catch { return { ok: false as const, message: "تعذر إكمال التسجيل حاول لاحقًا" }; }
}

// Old open tabs and unpublished legacy components receive a refresh instruction, never an OTP.
export async function requestLoyaltyOtpAction(...input: [string, string]): Promise<PhoneOtpRequestResult> {
  void input;
  return { required: true, ok: false, message: "حدّث الصفحة لفتح بطاقتك بالاسم ورقم الجوال مباشرة" };
}

export async function completeLoyaltyOtpAction(...input: [string, string, string, string]): Promise<{ ok: true; returningCustomer: boolean } | { ok: false; message: string }> {
  void input;
  return { ok: false, message: "حدّث الصفحة لفتح بطاقتك بالاسم ورقم الجوال مباشرة" };
}

export async function saveLoyaltyExperienceAction(input: LoyaltyExperienceSettings) {
  await saveOwnerLoyaltyExperience(input);
}

export async function saveBrandLoyaltyProgramAction(input: Parameters<typeof saveBrandLoyaltyProgram>[0]) {
  await saveBrandLoyaltyProgram(input);
  revalidatePath("/dashboard/loyalty");
}

export async function saveRastLoyaltySettingsAction(input: Parameters<typeof saveRastLoyaltySettings>[0]) {
  try {
    await saveRastLoyaltySettings(input);
    revalidatePath("/loyalty/[slug]", "page");
    revalidatePath("/dashboard/loyalty");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: error instanceof GoogleMapsLocationError ? error.message : "تعذر حفظ إعدادات الولاء تحقق من البيانات وحاول مرة أخرى" };
  }
}

export async function lookupRastCashierCardAction(value: string) {
  const card = await lookupRastCashierCard(value);
  return { ...card, catalog: await localizeCashierCatalog({ rewardName: card.rewardName }) };
}

export async function lookupRastCashierRewardAction(value: string) {
  const reward = await lookupRastCashierReward(z.string().trim().min(4).max(500).parse(value));
  const raw = reward.metadata?.termsSnapshot;
  const terms = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return { ...reward, catalog: await localizeCashierCatalog({ title: reward.rewardTitle, description: reward.rewardDescription,
    product: typeof terms.rewardProductName === "string" ? terms.rewardProductName : "", terms: typeof terms.terms === "string" ? terms.terms : "" }) };
}

export async function scanLoyaltyExperienceAction(input: { value: string; requestId: string; kind: "stamp" | "redeem" }) {
  const parsed = z.object({ value: z.string().trim().min(4).max(500), requestId: z.string().uuid(), kind: z.enum(["stamp", "redeem"]) }).parse(input);
  const session = await requireCashierPermission("loyalty");
  const token = session.token;
  if (!featureCodesAllow(await getPublicCafeFeatureCodesBySlug(session.cafeSlug), "loyalty")) {
    throw new Error("برنامج الولاء غير متاح حاليًا");
  }
  const value = parseBarndaksaQrPayload(parsed.value, parsed.kind === "stamp" ? "loyalty-card" : "customer-reward") ?? parsed.value.toUpperCase();
  if (!/^[A-Z0-9_-]{4,100}$/.test(value)) throw new Error("الرمز غير صالح لنوع العملية المحدد");
  const { data, error } = await createAdminClient().rpc("execute_loyalty_audited_operation", {
    p_session_token: token, p_code: value, p_request_id: parsed.requestId, p_operation: parsed.kind,
  });
  if (error) throw new Error("تعذر تسجيل العملية تحقق من صلاحية البطاقة وجلسة الموظف");
  const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  // An audited rejection means its transaction did not commit. Transport errors remain uncertain.
  if (result?.ok === false && ["invalid_code", "session_invalid", "request_conflict", "program_disabled", "card_unavailable", "reward_unavailable", "operation_failed"].includes(String(result.errorCode))) {
    return { ok: false, status: String(result.errorCode) };
  }
  if (result?.ok !== true) throw new Error("تعذر تسجيل العملية تحقق من صلاحية البطاقة أو المكافأة وجلسة الموظف");
  if (result?.cardCode && ["stamped", "reward_issued", "redeemed"].includes(String(result.status))) {
    // A provider outage must not turn an already-committed stamp into a failed scan.
    try { await syncWalletCardByCode(String(result.cardCode)); } catch { console.warn("[loyalty-wallet-sync] deferred"); }
  }
  return result;
}

export async function sendLoyaltyWalletAnnouncementAction(title: string, body: string) {
  const message = z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(240) }).parse({ title, body });
  const [cafe, features] = await Promise.all([requireOwnerCafeContext(), getOwnerFeatureCodes()]);
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("لا تملك صلاحية إرسال تنبيهات الولاء");
  if (!featureCodesAllow(features, "loyalty")) throw new Error("الولاء غير متاح في باقتك");
  const result = await notifyBrandWalletMembers(cafe.id, cafe.slug, message.title, message.body);
  const statuses = [result.apple.status, result.google.status];
  return { ...result, message: statuses.includes("failed") ? "تعذر قبول بعض طلبات الإشعار الإعلان محفوظ لإعادة المحاولة" : statuses.includes("accepted") ? "قبلت المحفظة طلب الإشعار ظهوره يعتمد على إعدادات العميل" : "الإعلان محفوظ ولم يُرسل إشعار لعدم وجود بطاقات مرتبطة جاهزة" };
}
