import "server-only";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBrandPhone } from "@/lib/auth/brand-phone";
import { getBrandPhoneCountry } from "@/lib/data/brand-phone-country";
import { createLoyaltySessionToken, loyaltyCookieName, loyaltyIdentityHash, LOYALTY_SESSION_SECONDS } from "@/lib/auth/loyalty-session-token";
import { getBranchLoyaltyBrand } from "./loyalty-experience";

const schema = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/), name: z.string().trim().min(2).max(120), phone: z.string().max(30), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), branchId: z.string().uuid().optional() });

export async function enrollLoyaltyCustomer(input: { slug: string; name: string; phone: string; birthDate?: string; branchId?: string }) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "أدخل اسمك ورقم جوالك بشكل صحيح" };
  const brand = await getBranchLoyaltyBrand(parsed.data.slug, parsed.data.branchId);
  if (!brand?.program.enabled) return { ok: false as const, message: "برنامج الولاء غير متاح حاليًا" };
  const phone = normalizeBrandPhone(parsed.data.phone, await getBrandPhoneCountry(brand.cafeId));
  if (!phone) return { ok: false as const, message: "أدخل رقم جوال صحيح لدولة العلامة" };
  const requestHeaders = await headers();
  const address = (requestHeaders.get("x-vercel-forwarded-for") ?? requestHeaders.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const { data, error } = await createAdminClient().rpc(parsed.data.branchId ? "enroll_branch_loyalty_customer" : "enroll_loyalty_customer_direct", {
    p_cafe_id: brand.cafeId, p_full_name: parsed.data.name, p_phone: phone,
    p_client_key: loyaltyIdentityHash(`client:${address}`),
    ...(parsed.data.branchId ? { p_branch: parsed.data.branchId } : {}),
  });
  const result = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; profile_id?: string; returning_customer?: boolean; reason?: string } | null;
  if (error || !result?.ok || !result.profile_id) return { ok: false as const, message: result?.reason === "rate_limited"
    ? "محاولات كثيرة انتظر قليلًا ثم حاول مجددًا"
    : "تعذر فتح البطاقة تأكد من الاسم المسجّل ورقم الجوال أو تواصل مع العلامة" };
  if (parsed.data.birthDate) {
    // The database stores it only for brands that collect birth dates and never overwrites a stored date
    const saved = await createAdminClient().rpc("set_loyalty_customer_birth_date", { p_cafe: brand.cafeId, p_profile: result.profile_id, p_birth: parsed.data.birthDate });
    if (saved.error) console.error("loyalty_birth_date_unavailable");
  }
  const token = createLoyaltySessionToken({ slug: parsed.data.slug, cafeId: brand.cafeId, profileId: result.profile_id, phoneHash: loyaltyIdentityHash(phone) });
  (await cookies()).set(loyaltyCookieName(parsed.data.slug), token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: LOYALTY_SESSION_SECONDS,
  });
  return { ok: true as const, returningCustomer: Boolean(result.returning_customer) };
}
