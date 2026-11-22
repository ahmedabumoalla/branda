"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBrandPhone } from "@/lib/auth/brand-phone";
import { getBrandPhoneCountryBySlug } from "@/lib/data/brand-phone-country";
import { isAllowedCustomerOtpPhone, isPhoneOtpRequiredForBrand, requestCustomerPhoneOtp } from "@/lib/auth/phone-otp";

const validSlug = (slug: unknown): slug is string => typeof slug === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug);
const failure = { required: true as const, ok: false as const, message: "تعذر إرسال رمز التحقق تأكدي من رقم الجوال المسجل لدى المتجر" };

/** A code is sent only to a phone that the brand registered for an active family */
async function registered(slug: string, phone: string) {
  const { data, error } = await createAdminClient().rpc("erp_family_portal_phone", { p_slug: slug, p_phone: phone });
  return !error && data === true;
}

export async function requestFamilyOtp(slug: string, phone: string) {
  try {
    if (!validSlug(slug) || typeof phone !== "string" || phone.length > 25 || !await registered(slug, phone)) return failure;
    // Same verification service, limits and delivery the platform already uses for phone sign-in
    const result = await requestCustomerPhoneOtp(slug, phone, "customer_login");
    if (!result.required) return { required: true as const, ok: false as const, message: "خدمة رمز التحقق غير مفعلة لهذا الحساب حاليًا تواصلي مع إدارة المتجر" };
    return result;
  } catch {
    return failure;
  }
}

export async function completeFamilyOtp(slug: string, phone: string, code: string) {
  try {
    const normalized = validSlug(slug) && typeof phone === "string" && phone.length <= 25 ? normalizeBrandPhone(phone, await getBrandPhoneCountryBySlug(slug)) : null;
    if (!normalized || typeof code !== "string" || !/^\d{6}$/.test(code) || !isPhoneOtpRequiredForBrand(slug) || !isAllowedCustomerOtpPhone(normalized, slug) || !await registered(slug, phone)) {
      return { ok: false as const, message: "راجعي رقم الجوال ورمز التحقق" };
    }
    const client = await createClient();
    const { data, error } = await client.auth.verifyOtp({ phone: `+${normalized}`, token: code, type: "sms" });
    if (error || !data.user || !data.session) return { ok: false as const, message: "رمز التحقق غير صحيح أو منتهي" };
    if (!data.user.phone_confirmed_at || normalizeBrandPhone(data.user.phone ?? "", await getBrandPhoneCountryBySlug(slug)) !== normalized) {
      await client.auth.signOut({ scope: "local" });
      return { ok: false as const, message: "تعذر التحقق من رقم الجوال" };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "تعذر التحقق من الرمز حاولي مرة أخرى" };
  }
}

export async function signOutFamily() {
  try { await (await createClient()).auth.signOut({ scope: "local" }); } catch { /* the page reloads to the sign-in form either way */ }
  return { ok: true as const };
}
