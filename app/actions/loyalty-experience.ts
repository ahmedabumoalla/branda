"use server";

import { z } from "zod";
import { completeCustomerPhoneOtpAction, requestCustomerPhoneOtpAction } from "@/app/actions/auth";
import { getLoyaltyBrand, saveOwnerLoyaltyExperience, saveRastLoyaltySettings, saveBrandLoyaltyProgram, lookupRastCashierCard } from "@/lib/data/loyalty-experience";
import { isPhoneOtpRequiredForBrand } from "@/lib/auth/phone-otp";
import { revalidatePath } from "next/cache";
import { getCashierToken } from "@/lib/data/cashier";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes, getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { syncWalletCardByCode, notifyBrandWalletMembers } from "@/lib/wallet";
import type { LoyaltyExperienceSettings } from "@/lib/loyalty/experience-types";
import { GoogleMapsLocationError } from "@/lib/maps/resolve-branch-location";

async function requireEnrollment(slug: string) {
  if (slug !== "rast") throw new Error("هذه الخدمة مخصصة لراست.");
  if (!isPhoneOtpRequiredForBrand(slug)) throw new Error("التحقق بالواتساب غير متاح حاليًا.");
  const brand = await getLoyaltyBrand(z.string().regex(/^[a-z0-9-]{1,80}$/).parse(slug));
  if (!brand || !brand.program.enabled) throw new Error("برنامج الولاء غير متاح حاليًا.");
}

export async function requestLoyaltyOtpAction(slug: string, phone: string) {
  try {
    await requireEnrollment(slug);
    return await requestCustomerPhoneOtpAction(slug, phone, "customer_signup");
  } catch { return { required: true as const, ok: false as const, message: "تعذر إرسال الرمز، حاول لاحقًا." }; }
}

export async function completeLoyaltyOtpAction(slug: string, phone: string, code: string, name: string) {
  try {
    await requireEnrollment(slug);
    const result = await completeCustomerPhoneOtpAction(slug, phone, code, "customer_signup", name);
    if (!result.ok) return { ok: false as const, message: result.message };
    return { ok: true as const, returningCustomer: result.returningCustomer };
  } catch { return { ok: false as const, message: "تعذر إكمال التسجيل، حاول لاحقًا." }; }
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
    revalidatePath("/loyalty/rast");
    revalidatePath("/dashboard/loyalty");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: error instanceof GoogleMapsLocationError ? error.message : "تعذر حفظ إعدادات الولاء. تحقق من البيانات وحاول مرة أخرى." };
  }
}

export async function lookupRastCashierCardAction(value: string) {
  return lookupRastCashierCard(value);
}

export async function scanLoyaltyExperienceAction(input: { value: string; requestId: string; kind: "stamp" | "redeem" }) {
  const parsed = z.object({ value: z.string().trim().min(4).max(500), requestId: z.string().uuid(), kind: z.enum(["stamp", "redeem"]) }).parse(input);
  const token = await getCashierToken();
  if (!token) throw new Error("انتهت جلسة الموظف. سجّل الدخول من جديد.");
  if (!featureCodesAllow(await getPublicCafeFeatureCodesBySlug("rast"), "loyalty")) {
    throw new Error("برنامج الولاء غير متاح حاليًا.");
  }
  const value = parseBarndaksaQrPayload(parsed.value, parsed.kind === "stamp" ? "loyalty-card" : "customer-reward") ?? parsed.value.toUpperCase();
  if (!/^[A-Z0-9_-]{4,100}$/.test(value)) throw new Error("الرمز غير صالح لنوع العملية المحدد.");
  const { data, error } = await createAdminClient().rpc(parsed.kind === "stamp" ? "scan_loyalty_stamp" : "redeem_loyalty_reward", {
    p_session_token: token, [parsed.kind === "stamp" ? "p_card_code" : "p_reward_code"]: value, p_request_id: parsed.requestId,
  });
  if (error) throw new Error("تعذر تسجيل العملية. تحقق من صلاحية البطاقة وجلسة الموظف.");
  const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  if (result?.cardCode && ["stamped", "reward_issued", "redeemed"].includes(String(result.status))) {
    // A provider outage must not turn an already-committed stamp into a failed scan.
    try { await syncWalletCardByCode(String(result.cardCode)); } catch { console.warn("[loyalty-wallet-sync] deferred"); }
  }
  return result;
}

export async function sendLoyaltyWalletAnnouncementAction(title: string, body: string) {
  const message = z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(240) }).parse({ title, body });
  const [cafe, features] = await Promise.all([requireOwnerCafeContext(), getOwnerFeatureCodes()]);
  if (cafe.slug !== "rast") throw new Error("هذه الخدمة مخصصة لراست.");
  if (!featureCodesAllow(features, "loyalty")) throw new Error("الولاء غير متاح في باقتك.");
  const result = await notifyBrandWalletMembers(cafe.id, cafe.slug, message.title, message.body);
  const statuses = [result.apple.status, result.google.status];
  return { ...result, message: statuses.includes("failed") ? "تعذر قبول بعض طلبات الإشعار. الإعلان محفوظ لإعادة المحاولة." : statuses.includes("accepted") ? "قبلت المحفظة طلب الإشعار. ظهوره يعتمد على إعدادات العميل." : "الإعلان محفوظ، ولم يُرسل إشعار لعدم وجود بطاقات مرتبطة جاهزة." };
}
