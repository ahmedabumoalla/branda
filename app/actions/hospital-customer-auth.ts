"use server";

import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { createClient } from "@/lib/supabase/server";
import { getBrandPhoneCountryBySlug } from "@/lib/data/brand-phone-country";
import { normalizeBrandPhone } from "@/lib/auth/brand-phone";
import { isAllowedCustomerOtpPhone, isPhoneOtpRequiredForBrand, requestCustomerPhoneOtp } from "@/lib/auth/phone-otp";

async function requireHospitalFinance(slug: string) {
  if (slug !== "mind-hospital" || !featureCodesAllow(await getPublicCafeFeatureCodesBySlug(slug), "finance")) {
    throw new Error("HOSPITAL_AUTH_UNAVAILABLE");
  }
}

export async function requestHospitalCustomerOtpAction(slug: string, phone: string) {
  try {
    await requireHospitalFinance(slug);
    if (typeof phone !== "string" || phone.length > 25) throw new Error("HOSPITAL_AUTH_INVALID_PHONE");
    // Preserve original OTP configuration, phone limits, rate limiting and delivery.
    return await requestCustomerPhoneOtp(slug, phone, "customer_login");
  } catch {
    return { required: true as const, ok: false as const, message: "تعذر إرسال رمز التحقق حاول مرة أخرى" };
  }
}

export async function completeHospitalCustomerOtpAction(slug: string, phone: string, code: string) {
  try {
    await requireHospitalFinance(slug);
    const normalized = typeof phone === "string" && phone.length <= 25 ? normalizeBrandPhone(phone, await getBrandPhoneCountryBySlug(slug)) : null;
    if (!normalized || typeof code !== "string" || !isPhoneOtpRequiredForBrand(slug) || !isAllowedCustomerOtpPhone(normalized, slug) || !/^\d{6}$/.test(code)) {
      return { ok: false as const, message: "راجع رقم الجوال ورمز التحقق" };
    }
    const client = await createClient();
    const { data, error } = await client.auth.verifyOtp({ phone: `+${normalized}`, token: code, type: "sms" });
    if (error || !data.user || !data.session) return { ok: false as const, message: "رمز التحقق غير صحيح أو منتهي" };
    if (!data.user.phone_confirmed_at || normalizeBrandPhone(data.user.phone ?? "", await getBrandPhoneCountryBySlug(slug)) !== normalized) {
      await client.auth.signOut({ scope: "local" });
      return { ok: false as const, message: "تعذر التحقق من رقم الجوال" };
    }
    // The statement reader resolves the original financial party from this
    // verified Auth phone. No storefront profile or alternate ledger is created.
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "تعذر التحقق من الرمز حاول مرة أخرى" };
  }
}
