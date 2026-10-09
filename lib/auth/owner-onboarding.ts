import "server-only";

import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isGreenApiConfigured, sendGreenApiOtp } from "@/lib/whatsapp/green-api";
import { resolveBranchGoogleMapsUrl } from "@/lib/maps/resolve-branch-location";

const COOKIE = "barndaksa_owner_onboarding";
const mapsUrl = z.string().trim().max(1000).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.port && (
    url.hostname === "maps.app.goo.gl" || url.hostname === "maps.google.com" ||
    ((["google.com", "www.google.com", "google.com.sa", "www.google.com.sa"].includes(url.hostname)) && /^\/maps(?:\/|$)/.test(url.pathname)) ||
    (url.hostname === "goo.gl" && url.pathname.startsWith("/maps"))
  );
}, "أدخل رابطًا صحيحًا من خرائط Google");
export const ownerOnboardingSchema = z.object({
  brandNameAr: z.string().trim().min(2).max(120).regex(/[\u0600-\u06ff]/),
  brandNameEn: z.string().trim().min(2).max(120).regex(/^[A-Za-z0-9 &'().-]+$/).regex(/[A-Za-z]/),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(24).transform(normalizeSaudiPhone).refine(value => Boolean(value), "أدخل رقم جوال سعودي صحيحًا"),
  mapsUrl,
  couponCode: z.string().trim().max(30).optional().transform(value => value?.toUpperCase() || ""),
});
export type OwnerOnboardingInput = z.input<typeof ownerOnboardingSchema>;
export type OwnerOnboardingResult = { ok: boolean; message: string; retryAfterSeconds?: number; redirectTo?: string | null };

export async function resolveOwnerMapPreview(input: string) {
  if (!mapsUrl.safeParse(input).success) return null;
  return resolveBranchGoogleMapsUrl(input).catch(() => null);
}

function hash(value: string) {
  return createHmac("sha256", getSupabaseServiceRoleKey()).update(`owner-onboarding:v1:${value}`).digest("hex");
}
async function sessionProof() {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  const [id, secret] = raw.split(".");
  if (!z.string().uuid().safeParse(id).success || !/^[a-f0-9]{64}$/.test(secret ?? "")) return null;
  return { id, sessionHash: hash(`session:${id}:${secret}`) };
}
const unavailable = (): OwnerOnboardingResult => ({ ok: false, message: "تعذر إكمال الطلب حاول مجددًا بعد قليل" });

export async function requestOwnerOnboarding(input: OwnerOnboardingInput): Promise<OwnerOnboardingResult> {
  const parsed = ownerOnboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "راجع البيانات وأدخل رقم جوال سعودي ورابط خرائط Google صحيحين" };
  if (!isGreenApiConfigured()) return unavailable();
  try {
    const admin = createAdminClient();
    if (parsed.data.couponCode) {
      const coupon = await admin.rpc("validate_representative_coupon", { p_code: parsed.data.couponCode });
      if (coupon.error || !coupon.data) return { ok: false, message: "الكوبون غير صالح أو منتهي" };
    }
    const id = randomUUID();
    const secret = randomBytes(32).toString("hex");
    const sessionHash = hash(`session:${id}:${secret}`);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const headerStore = await headers();
    const trustedIp = process.env.VERCEL ? headerStore.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local";
    const slug = `${parsed.data.brandNameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45).replace(/-$/, "") || "brand"}-${randomBytes(4).toString("hex")}`;
    const started = await admin.rpc("begin_owner_onboarding", {
      p_id: id, p_phone: parsed.data.phone, p_ip_hash: hash(`ip:${trustedIp || "unknown"}`),
      p_session_hash: sessionHash, p_code_hash: hash(`code:${id}:${code}`), p_draft: { ...parsed.data, slug },
    });
    if (started.error) return unavailable();
    if (!started.data?.ok) return {
      ok: false,
      message: started.data?.reason === "registered" ? "رقم الجوال مرتبط بحساب علامة استخدم تسجيل الدخول" : "انتظر قليلًا قبل طلب رمز آخر أو حاول لاحقًا إذا بلغت حد المحاولات",
      retryAfterSeconds: Number(started.data?.retryAfterSeconds) || 60,
    };
    try {
      await sendGreenApiOtp({ phoneNormalized: parsed.data.phone!, brandName: parsed.data.brandNameAr, code });
    } catch {
      await admin.rpc("mark_owner_onboarding_sent", { p_id: id, p_session_hash: sessionHash, p_sent: false });
      return unavailable();
    }
    const location = await resolveOwnerMapPreview(parsed.data.mapsUrl);
    const marked = await admin.rpc("mark_owner_onboarding_sent", { p_id: id, p_session_hash: sessionHash, p_sent: true, p_location: location ?? {} });
    if (marked.error) return unavailable();
    (await cookies()).set(COOKIE, `${id}.${secret}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 15 * 60 });
    return { ok: true, message: "أرسلنا رمز التحقق إلى واتساب رقمك الرمز صالح لخمس دقائق", retryAfterSeconds: 60 };
  } catch { return unavailable(); }
}

export async function verifyOwnerOnboarding(code: string): Promise<OwnerOnboardingResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "أدخل رمز التحقق المكوّن من ستة أرقام" };
  try {
    const proof = await sessionProof();
    if (!proof) return { ok: false, message: "اطلب رمز تحقق جديدًا" };
    const result = await createAdminClient().rpc("verify_owner_onboarding", {
      p_id: proof.id, p_session_hash: proof.sessionHash, p_code_hash: hash(`code:${proof.id}:${code}`),
    });
    return result.error || !result.data?.ok
      ? { ok: false, message: "الرمز غير صحيح أو منتهي اطلب رمزًا جديدًا عند الحاجة" }
      : { ok: true, message: "تم التحقق من رقمك اختر كلمة مرور لحسابك" };
  } catch { return unavailable(); }
}

export async function completeOwnerOnboarding(input: { password: string; confirmPassword: string }): Promise<OwnerOnboardingResult> {
  const password = z.string().min(8).max(72).safeParse(input?.password);
  if (!password.success || input.password !== input.confirmPassword) return { ok: false, message: "أدخل كلمة مرور من ٨ أحرف على الأقل وأكدها بشكل مطابق" };
  try {
    const proof = await sessionProof();
    if (!proof) return { ok: false, message: "تحقق من رقم الجوال أولًا" };
    const admin = createAdminClient();
    const verified = await admin.rpc("get_verified_owner_onboarding", { p_id: proof.id, p_session_hash: proof.sessionHash });
    if (verified.error || !verified.data?.draft) return { ok: false, message: "انتهت جلسة التحقق اطلب رمزًا جديدًا" };
    const { draft, phone } = verified.data;
    const created = await admin.auth.admin.createUser({
      phone: `+${phone}`, password: password.data,
      phone_confirm: true, email_confirm: false,
      user_metadata: { account_type: "cafe_owner", full_name: draft.ownerName },
      app_metadata: { owner_onboarding_id: proof.id, owner_onboarding_proof: proof.sessionHash },
    });
    if (created.error || !created.data.user) return { ok: false, message: "تعذر إنشاء الحساب قد يكون البريد أو الجوال مسجلًا مسبقًا؛ جرّب تسجيل الدخول" };
    (await cookies()).delete(COOKIE);
    const signedIn = await (await createClient()).auth.signInWithPassword({ phone: `+${phone}`, password: password.data });
    if (signedIn.error || !signedIn.data.session) return { ok: true, message: "تم إنشاء حسابك وتفعيل تجربة المنيو ٧ أيام سجّل الدخول للمتابعة", redirectTo: "/login" };
    return { ok: true, message: "حسابك جاهز بدأت تجربة المنيو المجانية لمدة ٧ أيام", redirectTo: "/dashboard/menu" };
  } catch { return unavailable(); }
}
