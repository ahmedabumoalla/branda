import "server-only";

import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGreenApiConfigured, sendGreenApiOtp } from "@/lib/whatsapp/green-api";
import { cashierSessionCookie } from "@/lib/data/cashier";

const CHALLENGE_COOKIE = "barndaksa_staff_otp";
export type CashierOtpResult = { ok: boolean; message: string; retryAfterSeconds?: number };
const unavailable = (): CashierOtpResult => ({ ok: false, message: "تعذر إرسال رمز واتساب حاول مجددًا بعد قليل" });
function hash(value: string) {
  return createHmac("sha256", getSupabaseServiceRoleKey()).update(`staff-otp:v1:${value}`).digest("hex");
}
function digits(value: string) {
  return value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776));
}

export async function requestCashierOtp(phone: string): Promise<CashierOtpResult> {
  const parsed = z.string().max(30).transform(digits).transform(normalizeSaudiPhone).refine(Boolean).safeParse(phone);
  if (!parsed.success) return { ok: false, message: "أدخل رقم جوال سعودي صحيحًا" };
  if (!isGreenApiConfigured()) return unavailable();
  try {
    const admin = createAdminClient();
    const id = randomUUID(), secret = randomBytes(32).toString("hex");
    const sessionHash = hash(`session:${id}:${secret}`);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const requestHeaders = await headers();
    const ip = process.env.VERCEL ? requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local";
    const started = await admin.rpc("begin_staff_otp", {
      p_id: id, p_phone: `+${parsed.data}`, p_phone_hash: hash(`phone:${parsed.data}`),
      p_ip_hash: hash(`ip:${ip || "unknown"}`), p_session_hash: sessionHash, p_code_hash: hash(`code:${id}:${code}`),
    });
    if (started.error) return unavailable();
    if (!started.data?.ok) return { ok: false, message: "انتظر قليلًا قبل طلب رمز آخر أو حاول لاحقًا إذا بلغت حد المحاولات", retryAfterSeconds: 60 };
    // Unknown and legacy numbers receive the same response without a message or login access.
    if (started.data.brandName) {
      try {
        await sendGreenApiOtp({ phoneNormalized: parsed.data!, brandName: String(started.data.brandName), code });
      } catch { return unavailable(); }
      const marked = await admin.rpc("mark_staff_otp_sent", { p_id: id, p_session_hash: sessionHash });
      if (marked.error || marked.data !== true) return unavailable();
    }
    (await cookies()).set(CHALLENGE_COOKIE, `${id}.${secret}`, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 10 * 60,
    });
    return { ok: true, message: "إذا كان الرقم مسجلًا لحساب موظف جديد فسيصلك رمز واتساب صالح لخمس دقائق", retryAfterSeconds: 60 };
  } catch { return unavailable(); }
}

export async function verifyCashierOtp(code: string): Promise<CashierOtpResult> {
  const parsed = z.string().max(6).transform(digits).refine(value => /^\d{6}$/.test(value)).safeParse(code);
  if (!parsed.success) return { ok: false, message: "أدخل رمز التحقق المكوّن من ستة أرقام" };
  try {
    const store = await cookies();
    const [id, secret, extra] = (store.get(CHALLENGE_COOKIE)?.value ?? "").split(".");
    if (extra !== undefined || !z.string().uuid().safeParse(id).success || !/^[a-f0-9]{64}$/.test(secret ?? "")) {
      return { ok: false, message: "اطلب رمز تحقق جديدًا" };
    }
    const result = await createAdminClient().rpc("verify_staff_otp", {
      p_id: id, p_session_hash: hash(`session:${id}:${secret}`), p_code_hash: hash(`code:${id}:${parsed.data}`),
    });
    const session = result.data;
    if (result.error || !session?.ok || !/^[a-f0-9]{48}$/.test(session.token ?? "")) {
      return { ok: false, message: "الرمز غير صحيح أو منتهي اطلب رمزًا جديدًا عند الحاجة" };
    }
    const seconds = Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000);
    if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, message: "اطلب رمز تحقق جديدًا" };
    store.set(cashierSessionCookie, session.token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.min(seconds, 8 * 60 * 60),
    });
    store.delete(CHALLENGE_COOKIE);
    return { ok: true, message: "تم تسجيل الدخول" };
  } catch { return { ok: false, message: "تعذر بدء جلسة نقطة التشغيل حاول مجددًا" }; }
}
