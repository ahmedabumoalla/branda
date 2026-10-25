import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient as createEphemeralAuthClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { getSupabaseServiceRoleKey, requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/barndaksa/env";
import { isSalesCashierPassword, SALES_CASHIER_PASSWORD_HINT } from "@/lib/finance/sales-cashier-password";
import { greenApiProviderInstanceKey, sendGreenApiSalesCashierWelcome, sendGreenApiLinkedSalesCashierWelcome } from "@/lib/whatsapp/green-api";

const slugSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(128),
  role: z.enum(["manager", "cashier"]),
});

const salesPhoneSchema = z.string().trim().max(30)
  .transform(value => value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632))))
  .refine(value => /^[+\d\s()-]+$/.test(value))
  .transform(normalizeSaudiPhone).refine((value): value is string => value !== null);
const salesCashierSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: salesPhoneSchema,
  password: z.string().refine(isSalesCashierPassword, SALES_CASHIER_PASSWORD_HINT),
});

export class SalesCashierCreationError extends Error {
  constructor(public readonly code: "owner_required" | "finance_required" | "existing_account_unavailable" | "password_rejected" | "service_unavailable" | "grant_failed") {
    super(code);
    this.name = "SalesCashierCreationError";
  }
}

/** Authenticate first, then disclose only live sales-cashier memberships. */
export async function signInSalesCashier(phone: string, password: string) {
  const normalized = salesPhoneSchema.parse(phone);
  z.string().min(1).max(128).parse(password);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ phone: `+${normalized}`, password });
  if (error || !data.user) {
    const unavailable = error?.status === 402 || (error?.status ?? 0) >= 500 || error?.name === "AuthRetryableFetchError";
    return { ok: false as const, message: unavailable ? "خدمة تسجيل الدخول غير متاحة مؤقتًا حاول لاحقًا" : "تعذر تسجيل الدخول تحقق من رقم الجوال وكلمة المرور" };
  }
  return salesCashierDestination(supabase);
}

async function salesCashierDestination(supabase: Awaited<ReturnType<typeof createClient>>) {
  let lookupFailed = false;
  try {
    // Use the client that just authenticated, not a new cookie-based client.
    // The RPC derives its actor from auth.uid(); callers cannot choose another employee.
    const { data, error } = await supabase.rpc("brand_finance_sales_cashier_destinations");
    if (error) throw new Error("Sales cashier destinations unavailable");
    const destinations = z.array(z.object({ id: z.uuid(), slug: slugSchema, name: z.string() })).parse(data);
    const brands = destinations.map(({ slug, name }) => ({ slug, name }));
    if (brands.length === 1) return { ok: true as const, redirectTo: `/finance/${brands[0].slug}/pos` };
    if (brands.length > 1) return { ok: true as const, brands };
  } catch { lookupFailed = true; }
  await supabase.auth.signOut({ scope: "local" });
  if (lookupFailed) return { ok: false as const, message: "تعذر التحقق من صلاحية نقطة البيع مؤقتًا حاول مجددًا" };
  return { ok: false as const, message: "لا يوجد وصول نشط لكاشير المبيعات تواصل مع مالك العلامة" };
}

export async function requestSalesCashierOtp(phone: string) {
  const normalized = salesPhoneSchema.parse(phone);
  if (process.env.PHONE_OTP_ENABLED?.trim().toLowerCase() !== "true" || process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() !== "green_api") {
    return { ok: false as const, message: "دخول واتساب غير متاح مؤقتًا استخدم كلمة المرور أو حاول لاحقًا" };
  }
  const admin = createAdminClient();
  const requestHeaders = await headers();
  const ip = process.env.VERCEL ? requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local";
  const ipHash = createHmac("sha256", getSupabaseServiceRoleKey()).update(`sales-otp:v1:ip:${ip || "unknown"}`).digest("hex");
  const configuredLimit = Number.parseInt(process.env.PHONE_OTP_MAX_UNIQUE_RECIPIENTS_PER_DAY ?? "", 10);
  const admission = await admin.rpc("begin_finance_sales_cashier_otp_request", {
    p_phone_normalized: normalized, p_provider_instance: greenApiProviderInstanceKey(), p_ip_hash: ipHash,
    p_global_daily_limit: Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20,
  });
  if (admission.error) throw new Error("Sales OTP unavailable");
  const row = Array.isArray(admission.data) ? admission.data[0] : admission.data;
  if (!row || !["created", "unavailable"].includes(row.result)) {
    return { ok: false as const, message: "انتظر قليلًا قبل طلب رمز آخر أو حاول لاحقًا إذا بلغت حد المحاولات" };
  }
  // Unknown or inactive identities get the same response without creating an Auth user.
  if (row.result === "created") {
    if (typeof row.request_id !== "string") throw new Error("Sales OTP admission unavailable");
    const supabase = await createClient();
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: `+${normalized}`, options: { shouldCreateUser: false } });
      if (error) throw new Error("Sales OTP delivery failed");
      const completion = await admin.rpc("complete_finance_sales_cashier_otp_request", { p_request_id: row.request_id, p_accepted: true });
      if (completion.error) throw new Error("Sales OTP completion failed");
    } catch {
      try { await admin.rpc("complete_finance_sales_cashier_otp_request", { p_request_id: row.request_id, p_accepted: false }); } catch { /* Keep the original safe error. */ }
      return { ok: false as const, message: "تعذر إرسال الرمز انتظر دقيقة ثم حاول مجددًا" };
    }
  }
  return { ok: true as const, message: "إذا كان الرقم مرتبطًا بكاشير مبيعات نشط فسيصلك رمز الدخول على واتساب" };
}

export async function verifySalesCashierOtp(phone: string, code: string) {
  const normalized = salesPhoneSchema.parse(phone);
  const token = z.string().max(6).transform(value => value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)))).pipe(z.string().regex(/^\d{6}$/)).parse(code);
  const eligible = await createAdminClient().rpc("brand_finance_sales_cashier_phone_enabled", { p_phone: normalized });
  if (eligible.error || eligible.data !== true) return { ok: false as const, message: "تعذر تسجيل الدخول تحقق من الرمز وصلاحية حساب الكاشير" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone: `+${normalized}`, token, type: "sms" });
  if (error || !data.user) return { ok: false as const, message: "الرمز غير صحيح أو منتهي اطلب رمزًا جديدًا" };
  return salesCashierDestination(supabase);
}

/** Only the employee who proves control of their phone may set their own password. */
export async function resetSalesCashierPassword(phone: string, code: string, password: string, confirmation: string) {
  const normalized = salesPhoneSchema.parse(phone);
  const token = z.string().max(6).transform(value => value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)))).pipe(z.string().regex(/^\d{6}$/)).parse(code);
  z.string().refine(isSalesCashierPassword, SALES_CASHIER_PASSWORD_HINT).parse(password);
  z.string().max(128).parse(confirmation);
  if (password !== confirmation) return { ok: false as const, message: "تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة" };
  // Stage this new session in memory. A failed reset must not leave authenticated
  // cookies behind, including when revocation itself encounters a network error.
  const supabase = createEphemeralAuthClient(requireSupabaseUrl(), requireSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let completed = false;
  let passwordSaved = false;
  try {
    const eligible = await createAdminClient().rpc("brand_finance_sales_cashier_phone_enabled", { p_phone: normalized });
    if (eligible.error || eligible.data !== true) return { ok: false as const, message: "تعذر تسجيل الدخول تحقق من الرمز وصلاحية حساب الكاشير" };
    const { data, error } = await supabase.auth.verifyOtp({ phone: `+${normalized}`, token, type: "sms" });
    if (error || !data.user || !data.session?.access_token || !data.session.refresh_token || data.session.user.id !== data.user.id || normalizeSaudiPhone(data.user.phone ?? "") !== normalized) {
      return { ok: false as const, message: "الرمز غير صحيح أو منتهي اطلب رمزًا جديدًا" };
    }
    // Derive authorization and the password target from this freshly verified session.
    // No user ID, owner session, or service-role password update is accepted here.
    const destination = await salesCashierDestination(supabase);
    if (!destination.ok) return destination;
    const updated = await supabase.auth.updateUser({ password });
    if (updated.error || !updated.data.user || updated.data.user.id !== data.user.id) {
      return { ok: false as const, message: "تعذر حفظ كلمة المرور اطلب رمزًا جديدًا وحاول بكلمة أخرى تستوفي الشروط" };
    }
    passwordSaved = true;
    const browserSession = await createClient();
    const persisted = await browserSession.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (persisted.error) return { ok: false as const, message: "تم حفظ كلمة المرور لكن تعذر فتح الجلسة ادخل بكلمة المرور الجديدة" };
    completed = true;
    return destination;
  } catch {
    return { ok: false as const, message: passwordSaved ? "تم حفظ كلمة المرور لكن تعذر فتح الجلسة ادخل بكلمة المرور الجديدة" : "تعذر إكمال تعيين كلمة المرور اطلب رمزًا جديدًا وحاول مجددًا" };
  } finally {
    if (!completed) {
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* Never disclose Auth internals or keep a successful result on failure. */ }
    }
  }
}

/** Owner may link an existing customer; its personal credentials and profile stay unchanged. */
export async function provisionSalesCashier(input: { name: string; phone: string; password: string }) {
  const parsed = salesCashierSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  if (cafe.role !== "owner") throw new SalesCashierCreationError("owner_required");
  if (!featureCodesAllow(await getOwnerFeatureCodes(), "finance")) throw new SalesCashierCreationError("finance_required");
  const snapshot = await getBrandFinanceSnapshot(cafe.slug);
  if (snapshot.cafe.id !== cafe.id || !snapshot.canAdminister) throw new SalesCashierCreationError("owner_required");
  const supabase = await createClient();
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    phone: `+${parsed.phone}`, password: parsed.password, phone_confirm: true,
    user_metadata: { full_name: parsed.name },
    app_metadata: { finance_staff_provisioned: true, finance_cafe_id: cafe.id },
  });
  if (created.error || !created.data.user) {
    if (created.error?.code === "phone_exists" || created.error?.code === "user_already_exists") {
      const linked = await supabase.rpc("brand_finance_link_sales_cashier", { p_cafe_id: cafe.id, p_phone: parsed.phone, p_name: parsed.name });
      if (linked.error || !linked.data?.id) throw new SalesCashierCreationError("existing_account_unavailable");
      if (!linked.data.changed) return { ok: true as const, delivery: "unchanged" as const, message: "الموظف مضاف بالفعل ككاشير مبيعات لهذه العلامة حساب العميل وكلمة مروره لم يتغيرا" };
      try {
        await sendGreenApiLinkedSalesCashierWelcome({ phone: parsed.phone, fullName: parsed.name, brandName: snapshot.cafe.name });
        return { ok: true as const, delivery: "queued" as const, message: "تم ربط حساب العميل بكاشير المبيعات وقبول رسالة رابط الدخول لدى مزود واتساب كلمة مروره لم تتغير ويمكنه الدخول برمز واتساب" };
      } catch {
        return { ok: true as const, delivery: "unconfirmed" as const, message: "تم ربط حساب العميل بكاشير المبيعات لكن لم يتأكد إرسال واتساب يمكنه الدخول برمز واتساب من صفحة الكاشيرات لا تكرر إضافته" };
      }
    }
    if (created.error?.code === "weak_password") throw new SalesCashierCreationError("password_rejected");
    throw new SalesCashierCreationError("service_unavailable");
  }
  const userId = created.data.user.id;
  try {
    const grant = await supabase.rpc("brand_finance_add_sales_cashier", {
      p_cafe_id: cafe.id, p_user_id: userId, p_name: parsed.name,
    });
    if (grant.error) throw new Error("Sales cashier grant failed");
  } catch {
    // Only this request's newly created identity is eligible for compensation.
    // A committed bf_staff FK prevents deleting it if the RPC succeeded but its response was lost.
    try {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) console.error("Sales cashier cleanup requires review", { userId });
    } catch { console.error("Sales cashier cleanup requires review", { userId }); }
    throw new SalesCashierCreationError("grant_failed");
  }
  // Send once, only after the committed grant; delivery failure never rolls back a usable account.
  // The password stays in this request only, never in metadata, logs, or a delivery queue.
  try {
    await sendGreenApiSalesCashierWelcome({ phone: parsed.phone, fullName: parsed.name, brandName: snapshot.cafe.name, slug: cafe.slug, password: parsed.password });
    return { ok: true as const, delivery: "queued" as const, message: "تم إنشاء كاشير المبيعات وقبول رسالة بيانات الدخول ورابط نقطة البيع لدى مزود واتساب" };
  } catch {
    return { ok: true as const, delivery: "unconfirmed" as const, message: "تم إنشاء كاشير المبيعات لكن لم يتأكد إرسال واتساب سلّم بيانات الدخول للموظف ولا تكرر إضافة الحساب" };
  }
}

export async function signInFinance(slug: string, identity: string, password: string) {
  const safeSlug = slugSchema.parse(slug);
  const value = z.string().trim().min(3).max(254).parse(identity);
  z.string().min(1).max(128).parse(password);
  const supabase = await createClient();
  const phone = value.replace(/[\s()-]/g, "").replace(/^00/, "+");
  const credentials = value.includes("@")
    ? { email: value.toLowerCase(), password }
    : { phone: phone.startsWith("+") ? phone : phone.startsWith("05") ? "+966" + phone.slice(1) : "+" + phone, password };
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !data.user) return { ok: false as const, message: "تعذر تسجيل الدخول تحقق من بياناتك" };
  try {
    await getBrandFinanceSnapshot(safeSlug);
    return { ok: true as const, redirectTo: `/finance/${safeSlug}/pos`, message: "تم تسجيل الدخول" };
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false as const, message: "لا تملك صلاحية المالية لهذه العلامة أو أن الباقة غير مفعلة" };
  }
}

/** Owner-controlled account provisioning; existing accounts are never reset or overwritten. */
export async function provisionFinanceStaff(input: z.infer<typeof staffSchema>) {
  const parsed = staffSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  if (cafe.role !== "owner" || !featureCodesAllow(await getOwnerFeatureCodes(), "finance")) {
    throw new Error("Finance owner access required");
  }
  const supabase = await createClient();
  // Check live finance authorization before creating an Auth account.
  const snapshot = await getBrandFinanceSnapshot(cafe.slug);
  if (snapshot.cafe.id !== cafe.id || !snapshot.canAdminister) throw new Error("Finance owner access required");
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.name },
    app_metadata: { finance_staff_provisioned: true },
  });
  if (created.error || !created.data.user) throw new Error("Staff account creation failed");
  const userId = created.data.user.id;
  const result = await supabase.rpc("brand_finance_execute", {
    p_cafe_id: cafe.id,
    p_operation: "staff",
    p_payload: { email: parsed.email, name: parsed.name, role: parsed.role, active: true },
    p_request_id: crypto.randomUUID(),
  });
  if (result.error) {
    // Only this newly created identity is eligible for compensation, never an existing account.
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) console.error("Finance staff provisioning cleanup failed", { userId });
    throw new Error("Staff access grant failed");
  }
  return { ok: true as const, message: "تم إنشاء حساب الموظف وربطه بالمالية" };
}
