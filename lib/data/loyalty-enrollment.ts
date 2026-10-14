import "server-only";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { createLoyaltySessionToken, loyaltyCookieName, loyaltyIdentityHash, LOYALTY_SESSION_SECONDS } from "@/lib/auth/loyalty-session-token";
import { getLoyaltyBrand } from "./loyalty-experience";

const schema = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/), name: z.string().trim().min(2).max(120), phone: z.string().max(30) });

export async function enrollLoyaltyCustomer(input: { slug: string; name: string; phone: string }) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "أدخل اسمك ورقم جوالك بشكل صحيح" };
  const phone = normalizeSaudiPhone(parsed.data.phone.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632))));
  if (!phone) return { ok: false as const, message: "أدخل رقم جوال سعودي صحيح يبدأ بـ 05" };
  const brand = await getLoyaltyBrand(parsed.data.slug);
  if (!brand?.program.enabled) return { ok: false as const, message: "برنامج الولاء غير متاح حاليًا" };
  const requestHeaders = await headers();
  const address = (requestHeaders.get("x-vercel-forwarded-for") ?? requestHeaders.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const { data, error } = await createAdminClient().rpc("enroll_loyalty_customer_direct", {
    p_cafe_id: brand.cafeId, p_full_name: parsed.data.name, p_phone: phone,
    p_client_key: loyaltyIdentityHash(`client:${address}`),
  });
  const result = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; profile_id?: string; returning_customer?: boolean; reason?: string } | null;
  if (error || !result?.ok || !result.profile_id) return { ok: false as const, message: result?.reason === "rate_limited"
    ? "محاولات كثيرة انتظر قليلًا ثم حاول مجددًا"
    : "تعذر فتح البطاقة تأكد من الاسم المسجّل ورقم الجوال أو تواصل مع العلامة" };
  const token = createLoyaltySessionToken({ slug: parsed.data.slug, cafeId: brand.cafeId, profileId: result.profile_id, phoneHash: loyaltyIdentityHash(phone) });
  (await cookies()).set(loyaltyCookieName(parsed.data.slug), token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: LOYALTY_SESSION_SECONDS,
  });
  return { ok: true as const, returningCustomer: Boolean(result.returning_customer) };
}
