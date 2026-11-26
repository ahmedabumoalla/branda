import "server-only";
import { getBrandPhoneCountry } from "@/lib/data/brand-phone-country";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createAdminBrandAccount, updateAdminBrandOwner } from "@/lib/data/admin-brand-onboarding";
import { replacePreparedBrandPlans } from "@/lib/data/admin-brand-subscriptions";
import { normalizeOwnerPhone } from "@/lib/auth/owner-phone";
import { AVAILABLE_BUSINESS_CATEGORY_IDS } from "@/lib/platform/business-categories";
import { adminBrandOwnerFor, adminBrandPlanIdsSchema, adminBrandProfileSchema, type AdminBrandAccountWithPlansInput, type AdminBrandOwnerInput, type AdminBrandProfileInput, type BrandOwnerDelivery } from "@/lib/platform/brand-onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type SessionClient = Awaited<ReturnType<typeof createClient>>;
const PLACEHOLDER_EMAIL = "@accounts.barndaksa.invalid";

/** Creates the account through the existing guarded flow, then applies the packages the administrator picked */
export async function createAdminBrandAccountWithPlans(input: AdminBrandAccountWithPlansInput) {
  await requirePlatformAdmin();
  const { planIds, ...account } = input;
  const picked = adminBrandPlanIdsSchema.safeParse(planIds);
  if (!picked.success) throw new Error("اختر باقة واحدة على الأقل للحساب الجديد");
  const chosen = [...new Set(picked.data)];
  const available = await createAdminClient().from("platform_plans").select("id").in("id", chosen).eq("active", true);
  if (available.error) throw new Error("تعذر التحقق من الباقات المختارة حاول مجددًا");
  if ((available.data ?? []).length !== chosen.length) throw new Error("إحدى الباقات المختارة لم تعد متاحة حدّث الصفحة واختر مجددًا");
  const cafeId = await createAdminBrandAccount(account);
  try {
    await replacePreparedBrandPlans(cafeId, chosen);
    return { cafeId, plansApplied: true };
  } catch (error) {
    // The account exists with its default trial package; the administrator adjusts packages from the brand file
    console.error("admin_brand_creation_plans_failed", { cafeId, reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    return { cafeId, plansApplied: false };
  }
}

async function ownerDeliveryState(client: SessionClient, cafeId: string): Promise<BrandOwnerDelivery["state"] | null> {
  const status = await client.rpc("admin_brand_onboarding_status");
  if (status.error) throw new Error("تعذر قراءة حالة تسليم الحساب حدّث الصفحة وحاول مجددًا");
  const row = (Array.isArray(status.data) ? status.data : []).find((item: { cafeId?: string }) => item.cafeId === cafeId) as { state?: BrandOwnerDelivery["state"] } | undefined;
  return row?.state ?? null;
}

/**
 * Saves owner details for any account. An account that still waits for its login handoff keeps the
 * staged handoff flow; a delivered or self-registered account is updated on its live login
 */
export async function saveAdminBrandOwner(input: AdminBrandOwnerInput): Promise<{ contactOnly: boolean }> {
  const actor = await requirePlatformAdmin();
  const country = await getBrandPhoneCountry(input.cafeId);
  const parsed = adminBrandOwnerFor(country).safeParse(input);
  if (!parsed.success) throw new Error("راجع بيانات المالك اترك البيانات الناقصة فارغة أو أدخلها بصورة صحيحة");
  const client = await createClient();
  const delivery = await ownerDeliveryState(client, parsed.data.cafeId);
  if (delivery === "ready" || delivery === "editing") {
    await updateAdminBrandOwner(input);
    return { contactOnly: false };
  }
  if (delivery === "sending" || delivery === "uncertain") throw new Error("إرسال بيانات الدخول قيد التنفيذ حدّث حالة الإرسال ثم عدّل البيانات");
  const { cafeId, password, ownerName, phone, email } = parsed.data;
  const admin = createAdminClient();
  const brand = await admin.from("cafes").select("id,owner_user_id,status").eq("id", cafeId).is("deleted_at", null).maybeSingle();
  if (brand.error) throw new Error("تعذر قراءة بيانات العلامة حاول مجددًا");
  if (!brand.data?.owner_user_id || brand.data.status === "archived") throw new Error("العلامة غير متاحة للتعديل");
  const ownerId = String(brand.data.owner_user_id);
  const account = await admin.auth.admin.getUserById(ownerId);
  const user = account.data?.user;
  if (account.error || !user) throw new Error("تعذر قراءة حساب دخول المالك حاول مجددًا");
  // The phone is the login only when the account already signs in with one; an email login keeps its address
  const loginPhone = user.phone ? normalizeOwnerPhone(user.phone) ?? user.phone.replace(/\D/g, "") : "";
  const emailIsLogin = Boolean(user.email) && !String(user.email).endsWith(PLACEHOLDER_EMAIL);
  const phoneIsLogin = Boolean(loginPhone);
  if (phoneIsLogin && !phone) throw new Error("لا يمكن إزالة جوال دخول محفوظ يمكنك استبداله برقم صحيح");
  if (phoneIsLogin && phone !== loginPhone) {
    const clash = await admin.from("profiles").select("id").neq("id", ownerId).in("phone", (country === "SA" ? [phone, `+${phone}`, `0${phone.slice(3)}`] : [phone, `+${phone}`])).limit(1);
    if (clash.error) throw new Error("تعذر التحقق من رقم الجوال حاول مجددًا");
    if (clash.data?.length) throw new Error("رقم الجوال مرتبط بحساب موجود استخدم رقمًا آخر");
  }
  if (!emailIsLogin && email) {
    const clash = await admin.from("profiles").select("id").neq("id", ownerId).eq("email", email).limit(1);
    if (clash.error) throw new Error("تعذر التحقق من البريد الإلكتروني حاول مجددًا");
    if (clash.data?.length) throw new Error("البريد الإلكتروني مرتبط بحساب آخر");
  }
  const changes = {
    phone: phoneIsLogin && phone !== loginPhone,
    password: Boolean(password),
    name: ownerName !== String(user.user_metadata?.full_name ?? ""),
  };
  if (changes.phone || changes.password || changes.name) {
    const result = await admin.auth.admin.updateUserById(ownerId, {
      ...(changes.phone ? { phone: `+${phone}`, phone_confirm: true } : {}),
      ...(changes.password ? { password } : {}),
      ...(changes.name ? { user_metadata: { full_name: ownerName } } : {}),
    });
    if (result.error) {
      if (result.error.code === "phone_exists") throw new Error("رقم الجوال مرتبط بحساب موجود استخدم رقمًا آخر");
      if (result.error.code === "weak_password") throw new Error("كلمة المرور لا تحقق متطلبات الأمان اختر كلمة أقوى ثم أعد الحفظ");
      console.error("admin_brand_live_owner_update_failed", { code: result.error.code, status: result.error.status });
      throw new Error("تعذر حفظ بيانات الدخول بسبب خطأ في خدمة الحساب لم يتغير شيء حاول مجددًا");
    }
  }
  // Contact details follow the login; the settings write needs the administrator session to pass the package guard
  const profile = await admin.from("profiles").update({
    full_name: ownerName,
    ...(phoneIsLogin ? { phone } : {}),
    ...(emailIsLogin ? {} : { email: email || null }),
  }).eq("id", ownerId).select("id");
  const settings = await client.from("cafe_settings").update({ owner_name: ownerName, owner_phone: phone || null, owner_email: email || null }).eq("cafe_id", cafeId).select("cafe_id");
  if (profile.error || !profile.data?.length || settings.error || !settings.data?.length) {
    console.error("admin_brand_live_owner_contact_failed", { profile: profile.error?.code ?? null, settings: settings.error?.code ?? null });
    throw new Error("حُفظت بيانات الدخول وتعذر تحديث بيانات التواصل أعد الحفظ بالبيانات نفسها");
  }
  const audit = await admin.from("audit_logs").insert({ actor_id: actor.id, cafe_id: cafeId, action: "admin_brand_owner_updated", entity_table: "profiles", entity_id: ownerId,
    new_data: { login_phone_changed: changes.phone, password_changed: changes.password, name_changed: changes.name, contact_only: !phoneIsLogin } });
  if (audit.error) console.error("admin_brand_live_owner_audit_failed", { code: audit.error.code });
  return { contactOnly: !phoneIsLogin };
}

/** Brand name, English name, short link and activity. The short link is fixed once the account is handed over */
export async function updateAdminBrandProfile(input: AdminBrandProfileInput) {
  await requirePlatformAdmin();
  const parsed = adminBrandProfileSchema.safeParse(input);
  if (!parsed.success) throw new Error("راجع اسم العلامة يجب أن يكون حرفين على الأقل");
  const { cafeId, brandName, brandNameEn, slug, category } = parsed.data;
  const client = await createClient();
  const current = await client.from("cafes").select("id,name,name_en,slug,business_category,status").eq("id", cafeId).is("deleted_at", null).maybeSingle();
  if (current.error) throw new Error("تعذر قراءة بيانات العلامة حاول مجددًا");
  if (!current.data || current.data.status === "archived") throw new Error("العلامة غير متاحة للتعديل");
  const patch: Record<string, string | null> = {};
  if (brandName !== current.data.name) patch.name = brandName;
  if (brandNameEn !== String(current.data.name_en ?? "")) patch.name_en = brandNameEn || null;
  if (category !== current.data.business_category) {
    if (!(AVAILABLE_BUSINESS_CATEGORY_IDS as readonly string[]).includes(category)) throw new Error("اختر نوع نشاط متاحًا");
    patch.business_category = category;
    if (current.data.business_category === "other") patch.business_category_custom_name = null;
  }
  if (slug !== String(current.data.slug).toLowerCase()) {
    const delivery = await ownerDeliveryState(client, cafeId);
    if (delivery !== "ready" && delivery !== "editing") throw new Error("الرابط المختصر يثبت بعد تسليم الحساب حتى لا تتوقف روابط العملاء ورموز QR");
    if (slug.length < 3 || slug.length > 60 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("يتكون الرابط المختصر من ٣ إلى ٦٠ من الأحرف الإنجليزية الصغيرة والأرقام والشرطات");
    const taken = await client.from("cafes").select("id").eq("slug", slug).neq("id", cafeId).limit(1);
    if (taken.error) throw new Error("تعذر التحقق من الرابط المختصر حاول مجددًا");
    if (taken.data?.length) throw new Error("الرابط المختصر مستخدم اختر رابطًا آخر");
    patch.slug = slug;
  }
  if (!Object.keys(patch).length) return;
  const saved = await client.from("cafes").update(patch).eq("id", cafeId).select("id");
  if (saved.error?.code === "23505") throw new Error("الرابط المختصر مستخدم اختر رابطًا آخر");
  if (saved.error || !saved.data?.length) throw new Error("تعذر حفظ بيانات العلامة حاول مجددًا");
}
