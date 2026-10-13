import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountFingerprint, openWelcomePassword, sealWelcomePassword } from "@/lib/auth/brand-welcome-secret";
import { adminBrandAccountSchema, type AdminBrandAccountInput } from "@/lib/platform/brand-onboarding";
import { isGreenApiConfigured, sendGreenApiOwnerWelcome } from "@/lib/whatsapp/green-api";

function accountError(code: string): never {
  const messages: Record<string, string> = {
    PHONE_EXISTS: "رقم الجوال مرتبط بحساب موجود استخدم رقمًا آخر",
    SLUG_EXISTS: "الرابط المختصر مستخدم اختر رابطًا آخر",
    TRIAL_PLAN_UNAVAILABLE: "حدد باقة تجريبية مجانية وفعالة كباقة افتراضية لهذا النشاط أولًا",
    REQUEST_CHANGED: "تغيّرت بيانات المحاولة أغلق النموذج وافتحه مجددًا",
    SEND_IN_PROGRESS: "الإرسال قيد التنفيذ انتظر قليلًا ثم حدّث حالة العلامة",
    SEND_UNCERTAIN: "لم تتأكد نتيجة الإرسال السابق راجع التنبيه قبل إعادة المحاولة",
    PREPARED_TRIAL_CHANGED: "تغيّرت باقة العلامة لا يمكن بدء التجربة من هذا الإشعار",
    OWNER_PHONE_CHANGED: "تغيّر جوال الدخول بعد إنشاء الحساب راجع بيانات المالك",
    OWNER_PASSWORD_CHANGED: "تغيّرت كلمة المرور بعد إنشاء الحساب لن نرسل كلمة المرور القديمة",
    BRAND_UNAVAILABLE: "العلامة موقوفة أو غير متاحة للإرسال",
  };
  for (const [key, value] of Object.entries(messages)) if (code.includes(key)) throw new Error(value);
  throw new Error("تعذر إكمال العملية راجع البيانات وحاول مجددًا");
}

export async function createAdminBrandAccount(input: AdminBrandAccountInput) {
  const actor = await requirePlatformAdmin();
  const parsed = adminBrandAccountSchema.safeParse(input);
  if (!parsed.success) throw new Error("راجع الاسم والرابط والجوال وكلمة المرور يجب أن تكون ٨ أحرف على الأقل بدون مسافات");
  const { password, requestId, ...draft } = parsed.data;
  const admin = createAdminClient();
  const args = { p_id: requestId, p_actor: actor.id, p_draft: draft,
    p_fingerprint: accountFingerprint(JSON.stringify(parsed.data)), p_ciphertext: sealWelcomePassword(password, requestId) };
  const prepared = await admin.rpc("admin_prepare_brand_account", args);
  if (prepared.error) accountError(prepared.error.message);
  if (prepared.data?.cafeId) return String(prepared.data.cafeId);
  const created = await admin.auth.admin.createUser({
    phone: `+${draft.phone}`, password, phone_confirm: true,
    user_metadata: { account_type: "cafe_owner", full_name: draft.ownerName },
    app_metadata: { admin_brand_onboarding_id: requestId, admin_brand_onboarding_proof: prepared.data.proof },
  });
  // The Auth trigger creates profile + brand + membership + prepared trial atomically.
  // Recover an ambiguous response without creating or resetting another account.
  const completed = await admin.rpc("admin_prepare_brand_account", args);
  if (completed.data?.cafeId) return String(completed.data.cafeId);
  if (created.error) throw new Error("تعذر إنشاء الحساب قد يكون الجوال أو البريد أو الرابط مستخدمًا راجع البيانات ثم افتح نموذجًا جديدًا");
  throw new Error("تعذر تأكيد إنشاء الحساب حدّث قائمة العلامات قبل إعادة المحاولة");
}

export async function sendBrandOwnerWelcome(cafeId: string, retryUncertain = false) {
  const actor = await requirePlatformAdmin();
  if (!z.string().uuid().safeParse(cafeId).success) throw new Error("العلامة غير صالحة");
  if (!isGreenApiConfigured()) throw new Error("خدمة الواتساب غير مهيأة لم يبدأ عداد التجربة");
  const admin = createAdminClient();
  const attemptId = randomUUID();
  const claim = await admin.rpc("admin_claim_brand_welcome", { p_actor: actor.id, p_cafe: cafeId, p_attempt: attemptId, p_retry_uncertain: retryUncertain === true });
  if (claim.error) accountError(claim.error.message);
  if (claim.data?.sent) return;
  let messageId: string;
  try {
    const password = openWelcomePassword(String(claim.data.ciphertext), String(claim.data.requestId));
    const sent = await sendGreenApiOwnerWelcome({ phone: String(claim.data.phone), brandName: String(claim.data.brandName), password });
    messageId = sent.providerMessageId;
  } catch (error) {
    const rejected = error instanceof Error && error.message === "OWNER_WELCOME_REJECTED";
    await admin.rpc("admin_fail_brand_welcome", { p_actor: actor.id, p_cafe: cafeId, p_attempt: attemptId, p_uncertain: !rejected });
    throw new Error(rejected ? "رفض مزوّد الواتساب الرسالة لم يبدأ عداد التجربة ويمكنك المحاولة مجددًا" : "لم تتأكد نتيجة الإرسال لم يبدأ عداد التجربة حدّث الحالة قبل إعادة المحاولة");
  }
  const sentAt = new Date().toISOString();
  // Retry only recording acknowledgement, never sending a second WhatsApp message.
  for (let n = 0; n < 3; n++) {
    try {
      const done = await admin.rpc("admin_finish_brand_welcome", { p_actor: actor.id, p_cafe: cafeId, p_attempt: attemptId, p_message_id: messageId, p_sent_at: sentAt });
      if (!done.error) return;
    } catch { /* Retry the same acknowledgement, never the message. */ }
  }
  throw new Error("قُبلت رسالة الواتساب لكن تعذر تأكيد بدء التجربة حدّث حالة العلامة قبل أي محاولة أخرى");
}
