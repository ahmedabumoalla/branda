import "server-only";
import { canonicalBrandMobile } from "@/lib/auth/brand-phone";
import { cashierGuideFilename, cashierGuideUrl } from "@/lib/cashier/guide";
import { ownerGuideFilename, ownerGuideUrl, ownerCompanionGuides, type OwnerCompanionGuide } from "@/lib/whatsapp/owner-guide";
import { queueOwnerCompanionGuides } from "@/lib/whatsapp/owner-guide-delivery";
import { selectNotificationSender } from "@/lib/whatsapp/notification-sender";
import { MERAM_CAFE_ID } from "@/lib/commerce/meram-profile";

const supportedMobile = canonicalBrandMobile;
const DEFAULT_GREEN_API_TIMEOUT_MS = 10_000;

type GreenApiSendResponse = {
  idMessage?: string;
};

/** Provider acknowledgement does not claim delivery/read receipt; billing mode comes from the locked handoff claim. */
export async function sendGreenApiOwnerWelcome(input: { phone: string; brandName: string; password: string; startsTrial: boolean; trialTerms?: unknown }) {
  if (!supportedMobile.test(input.phone)) throw new Error("INVALID_OWNER_RECIPIENT");
  let trialMessage = "بيانات الدخول تخص باقتك الحالية دون تغيير مدة الاشتراك";
  if (input.startsTrial) {
    const terms = input.trialTerms;
    if (!Array.isArray(terms) || !terms.length || terms.some(term => !term || typeof term.planId !== "string" || typeof term.planName !== "string" || !term.planName.trim() || term.days !== (["-", "starter", "pro", "plan-b523d348"].includes(term.planId) ? 30 : 7))) {
      throw new Error("OWNER_WELCOME_REJECTED");
    }
    const month = terms.filter(term => term.days === 30);
    const week = terms.filter(term => term.days === 7);
    trialMessage = month.length && week.length
      ? `تجربة مجانية لمدة شهر (٣٠ يومًا) من اليوم لباقات: ${month.map(term => term.planName).join("، ")}\nتجربة مجانية لمدة ٧ أيام من اليوم لباقات: ${week.map(term => term.planName).join("، ")}`
      : month.length ? "تجربتك المجانية شهر كامل (٣٠ يومًا) من اليوم" : "تجربتك المجانية ٧ أيام من اليوم";
    if (trialMessage.length > 450) trialMessage = "تبدأ التجربة المجانية اليوم لمدة ٣٠ يومًا أو ٧ أيام حسب كل باقة راجع مدة كل باقة في لوحة التحكم";
  }
  // The login message an administrator sends stays allowed while Branda's numbers carry access messages only
  return sendOwnerWelcomeVideo(input.phone, [
    `مرحبًا بك في برندة حساب ${input.brandName} جاهز`,
    "المنصة: https://barndaksa.com",
    "الدخول: https://barndaksa.com/login",
    `الجوال: ${input.phone}`,
    `كلمة المرور: ${input.password}`,
    trialMessage,
    "١ من ٣ — إعداد حساب الولاء\nشاهد المقطع المرفق لتجهيز حسابك وسنرسل بعده شرح الكاشير وتحميل بطاقة العميل",
    // A closing prompt invites a reply, so the number is not a one-way sender (user decision 2026-11-22)
    "قدرت تدخل حسابك؟ رد علينا بكلمة تم",
  ].join("\n"), "owner_handoff");
}

/** Called only after verified self-registration commits successfully; never includes the chosen password. */
export async function sendGreenApiOwnerSignupWelcome(input: { phone: string; brandName: string }) {
  return sendOwnerWelcomeVideo(input.phone, [
    `مرحبًا بك في برندة حساب ${input.brandName} جاهز`,
    "يسعدنا انضمامك ابدأ تجهيز حسابك من لوحة التحكم",
    "الدخول: https://barndaksa.com/login",
    `الجوال: ${input.phone}`,
    "استخدم كلمة المرور التي اخترتها عند التسجيل",
    "١ من ٣ — إعداد حساب الولاء\nشاهد المقطع المرفق لتجهيز حسابك وسنرسل بعده شرح الكاشير وتحميل بطاقة العميل",
  ].join("\n"));
}

async function sendOwnerWelcomeVideo(phone: string, caption: string, kind: "owner" | "owner_handoff" = "owner") {
  const sent = await sendOwnerVideo(phone, ownerGuideUrl, ownerGuideFilename, caption, kind);
  // A companion failure must never replay accepted login credentials or undo trial activation.
  await queueOwnerCompanionGuides(phone, sent.providerMessageId);
  return sent;
}

export async function sendGreenApiOwnerCompanionGuide(phone: string, guide: OwnerCompanionGuide) {
  const clip = ownerCompanionGuides[guide];
  if (!clip) throw new Error("OWNER_WELCOME_REJECTED");
  // These clips follow the login message an administrator sent, so they are allowed with it. Self-registration
  // sends no welcome while Branda's numbers carry access messages only, so it queues none
  return sendOwnerVideo(phone, clip.url, clip.filename, clip.caption, "owner_handoff");
}

async function sendOwnerVideo(phone: string, urlFile: string, fileName: string, caption: string, kind: "owner" | "owner_handoff" = "owner") {
  if (!supportedMobile.test(phone)) throw new Error("INVALID_OWNER_RECIPIENT");
  if (caption.length > 1024) throw new Error("OWNER_WELCOME_REJECTED");
  const primary = await requireDeliveryConfig(kind);
  const backup = backupOtpSender(primary);
  const send = (target: OtpSender) => fetch(otpEndpoint(target, "sendFileByUrl"), {
    method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ chatId: `${phone}@c.us`, urlFile, fileName, caption }),
  });
  let response: Response;
  try { response = await submitPlatformMessage(validateOtpSender(primary), backup, send, OWNER_LOGIN_PACING); }
  catch (error) { throw new Error(error instanceof Error && error.message === "PLATFORM_SENDERS_UNAVAILABLE" ? "OWNER_WELCOME_REJECTED" : "OWNER_WELCOME_UNCERTAIN"); }
  if (!response.ok) throw new Error(response.status < 500 && response.status !== 408 ? "OWNER_WELCOME_REJECTED" : "OWNER_WELCOME_UNCERTAIN");
  let data: GreenApiSendResponse;
  try { data = await response.json(); } catch { throw new Error("OWNER_WELCOME_UNCERTAIN"); }
  if (typeof data.idMessage !== "string" || !data.idMessage) throw new Error("OWNER_WELCOME_UNCERTAIN");
  return { providerMessageId: data.idMessage };
}

export function isGreenApiConfigured() {
  return Boolean(process.env.GREEN_API_API_URL?.trim() && process.env.GREEN_API_ID_INSTANCE?.trim() && process.env.GREEN_API_API_TOKEN_INSTANCE?.trim());
}

/** Live platform sender selection finishes before submitting any customer message. */
export async function isGreenApiLoyaltyWelcomeReady() {
  if (isGreenApiBackupOnly() || isPlatformAccessOnly()) return false;
  if (!isGreenApiConfigured()) return false;
  try { await requireDeliveryConfig("other"); return true; }
  catch { return false; }
}

export async function sendGreenApiLoyaltyWelcome(input: { phone: string; message: string }): Promise<{ status: "queued" | "rejected" | "unknown"; providerMessageId?: string }> {
  if (!supportedMobile.test(input.phone) || !input.message.trim() || input.message.length > 2000) throw new Error("INVALID_LOYALTY_WELCOME");
  const { apiUrl, idInstance, apiTokenInstance } = validateOtpSender(await requireDeliveryConfig("other"));
  try {
    const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(Math.min(10_000, greenApiTimeoutMs())),
      body: JSON.stringify({ chatId: `${input.phone}@c.us`, linkPreview: false, message: input.message }),
    });
    if (!response.ok) return { status: response.status >= 400 && response.status < 500 ? "rejected" : "unknown" };
    const data = await response.json() as GreenApiSendResponse;
    return typeof data.idMessage === "string" && data.idMessage.length > 0 && data.idMessage.length <= 200
      ? { status: "queued", providerMessageId: data.idMessage } : { status: "unknown" };
  } catch { return { status: "unknown" }; }
}

/** A provider acknowledgement means queued only. Ambiguous outcomes must not be retried automatically */
export async function sendGreenApiFinanceShiftAlert(input: { phone: string; message: string }, cafeId?: string): Promise<{ status: "queued" | "rejected" | "unknown"; providerMessageId?: string }> {
  if (!supportedMobile.test(input.phone)) throw new Error("INVALID_FINANCE_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = await selectOperationalDeliveryConfig(cafeId);
  try {
    const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
      signal: AbortSignal.timeout(Math.min(10_000, greenApiTimeoutMs())),
      body: JSON.stringify({ chatId: `${input.phone}@c.us`, linkPreview: false, message: input.message }),
    });
    if (!response.ok) return { status: response.status >= 400 && response.status < 500 ? "rejected" : "unknown" };
    const payload = await response.json() as GreenApiSendResponse;
    return typeof payload.idMessage === "string" && payload.idMessage.length > 0 && payload.idMessage.length <= 200
      ? { status: "queued", providerMessageId: payload.idMessage } : { status: "unknown" };
  } catch { return { status: "unknown" }; }
}

/** One provider message carries the PDF and loyalty caption, sharing one durable delivery outcome. */
export function isGreenApiFinanceReceiptConfigured() {
  if (!isGreenApiConfigured()) return false;
  try { financeReceiptMediaOrigin(); return true; } catch { return false; }
}

function financeReceiptMediaOrigin(senderId = process.env.GREEN_API_ID_INSTANCE?.trim()) {
  // Use the instance's mediaUrl. A generic host can time out for dedicated instances.
  const configured = (senderId === process.env.GREEN_API_OTP_BACKUP_ID_INSTANCE?.trim()
    ? process.env.GREEN_API_OTP_BACKUP_MEDIA_URL : process.env.GREEN_API_MEDIA_URL)?.trim();
  if (!configured) throw new Error("GREEN_API_MEDIA_CONFIGURATION_MISSING");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !/(^|\.)(green-api\.com|greenapi\.com)$/.test(url.hostname)) throw new Error("INVALID_GREEN_MEDIA_HOST");
  return url.origin;
}

export async function sendGreenApiFinanceReceipt(input: { phone: string; message: string; pdf: Uint8Array; invoiceNumber: number }, cafeId?: string): Promise<{ status: "queued" | "rejected" | "unknown"; providerMessageId?: string; errorCode?: string }> {
  if (!supportedMobile.test(input.phone) || !Number.isSafeInteger(input.invoiceNumber) || input.invoiceNumber < 1 || input.message.length > 1024 || !input.pdf.length || input.pdf.length > 8 * 1024 * 1024 || new TextDecoder().decode(input.pdf.slice(0, 5)) !== "%PDF-") throw new Error("INVALID_FINANCE_RECEIPT");
  const { apiUrl, idInstance, apiTokenInstance } = await selectOperationalDeliveryConfig(cafeId);
  const mediaOrigin = cafeId === MERAM_CAFE_ID
    ? apiUrl.replace(/\bapi(?=\.green-?api\.com$)/, "media")
    : financeReceiptMediaOrigin(idInstance);
  const body = new FormData();
  const fileName = `invoice-${input.invoiceNumber}.pdf`;
  body.set("chatId", `${input.phone}@c.us`);
  body.set("caption", input.message);
  body.set("fileName", fileName);
  body.set("file", new Blob([new Uint8Array(input.pdf)], { type: "application/pdf" }), fileName);
  try {
    // Give multipart uploads a bounded budget independent of short text messages.
    const response = await fetch(`${mediaOrigin}/waInstance${idInstance}/sendFileByUpload/${apiTokenInstance}`, { method: "POST", body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000) });
    if (!response.ok) return { status: response.status >= 400 && response.status < 500 ? "rejected" : "unknown", errorCode: `customer_media_http_${response.status}` };
    const payload = await response.json() as GreenApiSendResponse;
    return typeof payload.idMessage === "string" && payload.idMessage.length > 0 && payload.idMessage.length <= 200 ? { status: "queued", providerMessageId: payload.idMessage } : { status: "unknown", errorCode: "customer_media_missing_ack" };
  } catch (error) {
    return { status: "unknown", errorCode: error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "customer_media_timeout" : "customer_media_transport_failed" };
  }
}

/** A provider ID means queued by GREEN-API, not delivered or read */
export async function sendGreenApiPagerMessage(input: { phone: string; message: string }, cafeId?: string) {
  if (!supportedMobile.test(input.phone)) throw new Error("INVALID_PAGER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = await selectOperationalDeliveryConfig(cafeId, "pager");
  const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(Math.min(10_000, greenApiTimeoutMs())),
    body: JSON.stringify({ chatId: `${input.phone}@c.us`, linkPreview: false, message: input.message }),
  });
  if (!response.ok) throw new Error("PAGER_PROVIDER_REJECTED");
  const payload = await response.json() as GreenApiSendResponse;
  if (typeof payload.idMessage !== "string" || !payload.idMessage) throw new Error("PAGER_PROVIDER_INVALID_RESPONSE");
  return { providerMessageId: payload.idMessage };
}

/** Sales cashier credentials are sent only after the owner's account provisioning succeeds. */
export async function sendGreenApiSalesCashierWelcome(input: {
  phone: string; fullName: string; brandName: string; slug: string; password: string;
}, cafeId?: string) {
  if (!supportedMobile.test(input.phone) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.slug)) throw new Error("INVALID_SALES_CASHIER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = await selectOperationalDeliveryConfig(cafeId, "cashier_welcome");
  const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
    signal: AbortSignal.timeout(Math.min(10_000, greenApiTimeoutMs())),
    body: JSON.stringify({ chatId: `${input.phone}@c.us`, linkPreview: false, message: [
      `مرحبًا ${input.fullName}`,
      `حساب كاشير المبيعات لدى ${input.brandName} جاهز`,
      `رقم الجوال: ${input.phone}`,
      `كلمة المرور: ${input.password}`,
      "رابط الدخول إلى نقطة البيع:",
      `https://barndaksa.com/finance/${input.slug}/login`,
      "هذا الحساب مخصص للمبيعات والورديات وليس لكاشير الولاء",
      "احتفظ ببيانات الدخول ولا تشاركها مع أي شخص",
    ].join("\n") }),
  });
  if (!response.ok) throw new Error("SALES_CASHIER_WELCOME_UNCONFIRMED");
  const data = await response.json() as GreenApiSendResponse;
  if (typeof data.idMessage !== "string" || !data.idMessage) throw new Error("SALES_CASHIER_WELCOME_UNCONFIRMED");
  return { providerMessageId: data.idMessage };
}

/** Linking a customer never reveals or replaces their existing password. */
export async function sendGreenApiLinkedSalesCashierWelcome(input: { phone: string; fullName: string; brandName: string }, cafeId?: string) {
  if (!supportedMobile.test(input.phone)) throw new Error("INVALID_SALES_CASHIER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = await selectOperationalDeliveryConfig(cafeId, "cashier_welcome");
  const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
    signal: AbortSignal.timeout(Math.min(10_000, greenApiTimeoutMs())),
    body: JSON.stringify({ chatId: `${input.phone}@c.us`, linkPreview: false, message: [
      `مرحبًا ${input.fullName}`,
      `أضافتك علامة ${input.brandName} إلى فريق كاشير المبيعات`,
      `رقم الدخول: ${input.phone}`,
      "https://barndaksa.com/cashier/login?type=sales",
      "اختر الدخول برمز واتساب أو استخدم كلمة مرور حسابك الحالية",
      "حساب العميل ومزاياه وكلمة مروره لم تتغير",
      "هذا الوصول للمبيعات والورديات ولا يمنح صلاحية لوحة العلامة أو كاشير الولاء",
    ].join("\n") }),
  });
  if (!response.ok) throw new Error("SALES_CASHIER_WELCOME_UNCONFIRMED");
  const data = await response.json() as GreenApiSendResponse;
  if (typeof data.idMessage !== "string" || !data.idMessage) throw new Error("SALES_CASHIER_WELCOME_UNCONFIRMED");
  return { providerMessageId: data.idMessage };
}

/** New loyalty staff use phone OTP; the welcome message contains no credentials. */
export async function sendGreenApiCashierWelcome(input: {
  phone: string;
  fullName: string;
  brandName: string;
}, cafeId?: string) {
  if (!input.phone.startsWith("+") || !supportedMobile.test(input.phone.slice(1))) throw new Error("INVALID_CASHIER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = await selectOperationalDeliveryConfig(cafeId, "cashier_welcome");
  const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendFileByUrl/${apiTokenInstance}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(Math.max(greenApiTimeoutMs(), 30_000)),
    body: JSON.stringify({
      chatId: `${input.phone.slice(1)}@c.us`,
      urlFile: cashierGuideUrl,
      fileName: cashierGuideFilename,
      caption: [
        `مرحبًا ${input.fullName}`,
        `تم إنشاء حسابك في نقطة تشغيل ${input.brandName}`,
        "",
        "رابط الدخول:",
        "https://barndaksa.com/cashier/login",
        "أدخل رقم جوالك واطلب رمز التحقق عبر واتساب للدخول",
        "",
        "شاهد الفيديو المرفق لشرح الدخول وتسجيل الأختام وصرف المكافآت",
        "تجد الفيديو دائمًا من زر شرح استخدام الكاشير داخل صفحتك",
        "",
        "لا تشارك رمز التحقق مع أي شخص",
      ].join("\n"),
    }),
  });
  if (!response.ok) throw new Error("CASHIER_WELCOME_REJECTED");
  const payload = await response.json() as GreenApiSendResponse;
  if (typeof payload.idMessage !== "string" || !payload.idMessage) {
    throw new Error("CASHIER_WELCOME_INVALID_RESPONSE");
  }
  return { providerMessageId: payload.idMessage };
}

/** idMessage acknowledges provider queueing only, not WhatsApp delivery */
export async function sendGreenApiMenuFeedback(input: { recipient: string; brandName: string; rating: number; notes: string }, cafeId?: string) {
  if (!supportedMobile.test(input.recipient)) throw new Error("INVALID_FEEDBACK_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = await selectOperationalDeliveryConfig(cafeId);
  const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
    signal: AbortSignal.timeout(greenApiTimeoutMs()),
    body: JSON.stringify({ chatId: `${input.recipient}@c.us`, linkPreview: false,
      message: `تقييم جديد من المنيو\n${input.brandName}\n${"★".repeat(input.rating)}${"☆".repeat(5 - input.rating)}\nالتقييم ${input.rating} من 5\n\n${input.notes || "بدون ملاحظات"}` }),
  });
  if (!response.ok) throw new Error("FEEDBACK_PROVIDER_REJECTED");
  const payload = await response.json() as GreenApiSendResponse;
  if (typeof payload.idMessage !== "string" || !payload.idMessage) throw new Error("FEEDBACK_PROVIDER_INVALID_RESPONSE");
  return { providerMessageId: payload.idMessage };
}

function requireGreenApiConfig() {
  const apiUrl = process.env.GREEN_API_API_URL?.trim().replace(/\/+$/, "");
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim();
  const apiTokenInstance = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim();

  if (!apiUrl || !idInstance || !apiTokenInstance) {
    throw new Error("GREEN_API_CONFIGURATION_MISSING");
  }

  return { apiUrl, idInstance, apiTokenInstance };
}

function greenApiTimeoutMs() {
  const configured = Number.parseInt(
    process.env.GREEN_API_REQUEST_TIMEOUT_MS ?? "",
    10,
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_GREEN_API_TIMEOUT_MS;
}

export function greenApiProviderInstanceKey() {
  const { idInstance } = requireGreenApiConfig();
  return `green_api:${idInstance}`;
}

export async function sendGreenApiOtp(input: {
  phoneNormalized: string;
  brandName: string;
  code: string;
}): Promise<{ providerMessageId: string }> {
  return sendVerificationCode(input.phoneNormalized, input.code,
    `رمز التحقق لعلامة ${input.brandName}: ${input.code}\nصالح لمدة 5 دقائق\nلا تشارك الرمز مع أي شخص\nإذا لم تطلبه فتجاهل الرسالة`, greenApiTimeoutMs());
}

export async function sendGreenApiSupabaseOtp(input: {
  phoneNormalized: string;
  code: string;
}, options?: { timeoutMs: number }): Promise<{ providerMessageId: string }> {
  return sendVerificationCode(input.phoneNormalized, input.code,
    `رمز التحقق في برندة: ${input.code}\nصالح لمدة 5 دقائق\nلا تشارك الرمز مع أي شخص\nإذا لم تطلبه فتجاهل الرسالة`, options?.timeoutMs ?? greenApiTimeoutMs());
}

type OtpSender = ReturnType<typeof requireGreenApiConfig>;

/** Server-only credentials for customer routing; never serialize to client props or logs. */
export type GreenApiCustomerSender = OtpSender;

export function getGreenApiCustomerPlatformSenders() {
  let primary: OtpSender | null = null;
  try { primary = validateOtpSender(requireGreenApiConfig()); } catch { /* Standby cannot bypass a missing primary configuration. */ }
  return { primary, backup: primary ? backupOtpSender(primary) : null };
}

export async function isGreenApiCustomerSenderReady(sender: GreenApiCustomerSender) {
  try { return await otpSenderReady(validateOtpSender(sender)); } catch { return false; }
}

/** Exactly one POST. Selection/failover must finish before calling this function. */
export async function sendGreenApiCustomerMessage(sender: GreenApiCustomerSender, input: { phone: string; message: string }, timeoutMs = 10_000, kind: "otp" | "other" = "other"): Promise<{ status: "queued" | "rejected" | "unknown"; providerMessageId?: string }> {
  const validPhone = supportedMobile.test(input.phone);
  if (!validPhone || !input.message.trim() || input.message.length > 2000) throw new Error("INVALID_CUSTOMER_MESSAGE");
  if (isGreenApiBackupOnly() && kind === "other") throw new Error("MESSAGING_TEMPORARILY_PAUSED");
  // A sender the brand connected itself keeps working; only Branda's own numbers are held to access messages
  if (isPlatformAccessOnly() && kind === "other" && isGreenApiPlatformSender(sender)) throw new Error("MESSAGING_TEMPORARILY_PAUSED");
  return postCustomerText(validateOtpSender(sender), input, timeoutMs);
}

async function postCustomerText(config: OtpSender, input: { phone: string; message: string }, timeoutMs: number,
  isRefusal = (status: number) => status >= 400 && status < 500 && status !== 408,
): Promise<{ status: "queued" | "rejected" | "unknown"; providerMessageId?: string }> {
  try {
    const response = await fetch(otpEndpoint(config, "sendMessage"), {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(Math.max(1000, Math.min(25_000, timeoutMs))),
      body: JSON.stringify({ chatId: `${input.phone}@c.us`, linkPreview: false, message: input.message }),
    });
    if (!response.ok) return { status: isRefusal(response.status) ? "rejected" : "unknown" };
    const data = await response.json() as GreenApiSendResponse;
    return typeof data?.idMessage === "string" && data.idMessage.length > 0 && data.idMessage.length <= 200
      ? { status: "queued", providerMessageId: data.idMessage } : { status: "unknown" };
  } catch { return { status: "unknown" }; }
}

export type BrandPasswordLane = "notifications" | "primary" | "standby";
type BrandPasswordAttempt = { status: "accepted"; providerMessageId: string } | { status: "rejected" | "unknown" };

/** One attempt on the lane claimed by the admin reset worker. All retry timing lives in its durable job. */
export async function sendBrandPasswordAttempt(input: {
  lane: BrandPasswordLane; phone: string; password: string; authorize?: () => Promise<boolean>;
}): Promise<BrandPasswordAttempt> {
  if (!supportedMobile.test(input.phone) || !/^[\x21-\x7e]{8,128}$/.test(input.password)) return { status: "rejected" };
  if (isGreenApiBackupOnly()) return { status: "rejected" };
  let config: OtpSender;
  try {
    let sender: OtpSender | null;
    switch (input.lane) {
      case "notifications":
        sender = await selectNotificationSender();
        break;
      case "primary":
        sender = requireGreenApiConfig();
        break;
      case "standby":
        sender = backupOtpSender({ idInstance: process.env.GREEN_API_ID_INSTANCE?.trim() ?? "" });
        break;
      default:
        return { status: "rejected" };
    }
    if (!sender) return { status: "rejected" };
    config = validateOtpSender(sender);
    if (!(await probeSenderReady(config)) || (input.authorize && !(await input.authorize()))) return { status: "rejected" };
  } catch { return { status: "rejected" }; }
  const message = [
    "كلمة المرور الجديدة لحسابك في برندة",
    input.password,
    "رابط الدخول https://barndaksa.com/login",
    "للمساعدة رد على هذه الرسالة دون مشاركة كلمة المرور",
  ].join("\n");
  const receipt = await postCustomerText(config, { phone: input.phone, message }, greenApiTimeoutMs(),
    status => [400, 401, 403, 404, 422, 429, 466].includes(status));
  if (receipt.status === "queued" && receipt.providerMessageId) return { status: "accepted", providerMessageId: receipt.providerMessageId };
  return { status: receipt.status === "rejected" ? "rejected" : "unknown" };
}

function validateOtpSender(sender: OtpSender): OtpSender {
  let url: URL;
  try { url = new URL(sender.apiUrl); } catch { throw new Error("OTP_SENDER_CONFIG_INVALID"); }
  if (url.protocol !== "https:" || !/^(?:api|[0-9]{1,10}\.api)\.green-?api\.com$/.test(url.hostname) ||
    url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    !/^[1-9]\d{0,15}$/.test(sender.idInstance) || !/^[A-Za-z0-9._-]{8,512}$/.test(sender.apiTokenInstance)) {
    throw new Error("OTP_SENDER_CONFIG_INVALID");
  }
  return { ...sender, apiUrl: url.origin };
}

function backupOtpSender(primary: Pick<OtpSender, "idInstance">): OtpSender | null {
  const apiUrl = process.env.GREEN_API_OTP_BACKUP_API_URL?.trim();
  const idInstance = process.env.GREEN_API_OTP_BACKUP_ID_INSTANCE?.trim();
  const apiTokenInstance = process.env.GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE?.trim();
  if (!apiUrl && !idInstance && !apiTokenInstance) return null;
  // A bad optional backup must not disable a healthy primary sender.
  try {
    if (!apiUrl || !idInstance || !apiTokenInstance || idInstance === primary.idInstance) return null;
    return validateOtpSender({ apiUrl, idInstance, apiTokenInstance });
  } catch { return null; }
}

function otpEndpoint(sender: OtpSender, method: "getStateInstance" | "sendMessage" | "sendFileByUrl") {
  return `${sender.apiUrl}/waInstance${sender.idInstance}/${method}/${sender.apiTokenInstance}`;
}

const PRIMARY_RETRY_DELAY_MS = 30_000;
/** User decision of 2026-11-23 for the login message an administrator sends and the clips that follow it: the
 * primary is tried three times, one minute apart, and the first standby sends only after the third refusal */
const OWNER_LOGIN_PACING = { delayMs: 60_000, waitBeforeStandby: false };
/** The claims behind these sends hold a four-minute lease, so no request starts later than this */
const PLATFORM_SEND_BUDGET_MS = 200_000;
const waitForPrimaryRetry = (delayMs = PRIMARY_RETRY_DELAY_MS) => new Promise<void>(resolve => setTimeout(resolve, delayMs));

async function probeSenderReady(sender: OtpSender) {
  try {
    const response = await fetch(otpEndpoint(sender, "getStateInstance"), {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2500),
    });
    return response.ok && (await response.json())?.stateInstance === "authorized";
  } catch { return false; }
}

async function otpSenderReady(sender: OtpSender) {
  // Three primary attempts, thirty seconds apart, then the fourth slot may use standby.
  const attempts = sender.idInstance === process.env.GREEN_API_ID_INSTANCE?.trim() ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await probeSenderReady(sender)) return true;
    if (attempts === 3) await waitForPrimaryRetry();
  }
  return false;
}

async function submitPlatformMessage(primary: OtpSender, backup: OtpSender | null, send: (sender: OtpSender) => Promise<Response>, pacing = { delayMs: PRIMARY_RETRY_DELAY_MS, waitBeforeStandby: true }) {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < (backup ? 4 : 3); attempt++) {
    if (attempt && (attempt < 3 || pacing.waitBeforeStandby)) await waitForPrimaryRetry(pacing.delayMs);
    const sender = attempt < 3 ? primary : backup!;
    if (!await probeSenderReady(sender)) continue;
    // Past the budget nothing is sent: the claim's lease may have passed to another worker
    if (Date.now() - startedAt > PLATFORM_SEND_BUDGET_MS) break;
    // Transport errors and ambiguous acknowledgements are not permission to duplicate a message.
    const response = await send(sender);
    if (response.ok || ![401, 403, 429, 466].includes(response.status) || attempt === (backup ? 3 : 2)) return response;
  }
  throw new Error("PLATFORM_SENDERS_UNAVAILABLE");
}

/** OTP entry points and owner welcome can use the backup; campaigns cannot. OTP queue admission remains bound
 * to the primary logical provider; failover happens inside the already-claimed job.
 * Never repeat a POST after timeout/5xx/malformed acknowledgement: it may be queued.
 */
async function sendVerificationCode(phone: string, code: string, message: string, timeoutMs: number) {
  if (!supportedMobile.test(phone) || !/^\d{6}$/.test(code)) throw new Error("OTP_INPUT_INVALID");
  // Verification codes leave from the notifications number first (user decision 2026-11-22). Its state is read
  // right before sending because the provider queues messages for a disconnected number. Branda's primary and
  // first standby carry a code only when that number is not connected or refuses, so sign-in never depends on one number
  const notify = await selectNotificationSender();
  if (notify && await probeSenderReady(notify)) {
    let outcome: Awaited<ReturnType<typeof sendGreenApiCustomerMessage>> | null = null;
    // Everything this call can throw happens before any request, so falling back cannot duplicate a code
    try { outcome = await sendGreenApiCustomerMessage(notify, { phone, message }, timeoutMs, "otp"); } catch { outcome = null; }
    if (outcome?.status === "queued" && outcome.providerMessageId) return { providerMessageId: outcome.providerMessageId };
    // An uncertain outcome may already be queued: the same code is never sent twice
    if (outcome && outcome.status !== "rejected") throw new Error("OTP_SEND_OUTCOME_UNKNOWN");
  }
  const primary = validateOtpSender(await requireDeliveryConfig("otp"));
  const backup = backupOtpSender(primary);
  let response: Response;
  try {
    response = await submitPlatformMessage(primary, backup, sender => fetch(otpEndpoint(sender, "sendMessage"), {
      method: "POST", headers: { "content-type": "application/json" },
      cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(Math.max(1000, Math.min(25_000, timeoutMs))),
      body: JSON.stringify({ chatId: `${phone}@c.us`, message, linkPreview: false }),
    }));
  } catch (error) { throw new Error(error instanceof Error && error.message === "PLATFORM_SENDERS_UNAVAILABLE" ? "OTP_SENDERS_UNAVAILABLE" : "OTP_SEND_OUTCOME_UNKNOWN"); }
  if (!response.ok) {
    throw new Error(`OTP_SEND_HTTP_${response.status}`);
  }
  let payload: GreenApiSendResponse;
  try { payload = await response.json(); } catch { throw new Error("OTP_SEND_OUTCOME_UNKNOWN"); }
  if (!payload || typeof payload.idMessage !== "string" || !payload.idMessage || payload.idMessage.length > 200) {
    throw new Error("OTP_SEND_OUTCOME_UNKNOWN");
  }
  return { providerMessageId: payload.idMessage };
}

/** Legacy pause flag never bypasses the mandatory primary attempt policy. */
export function isGreenApiBackupOnly() {
  return process.env.GREEN_API_TEMPORARY_BACKUP_ONLY?.trim() === "true";
}

/** Incident switch, set at build time in next.config.ts (BRANDA_ACCESS_MESSAGES_ONLY). While on, only verification
 * codes and the login message an administrator sends to a brand owner leave Branda's own numbers, primary or
 * standby. Every other message from those numbers is refused before any request. Brand-owned senders are not affected. */
export function isPlatformAccessOnly() {
  return process.env.BRANDA_ACCESS_MESSAGES_ONLY?.trim() === "true";
}

/** True for Branda's primary and standby numbers, false for a sender a brand connected itself. */
export function isGreenApiPlatformSender(sender: { idInstance: string }) {
  return [process.env.GREEN_API_ID_INSTANCE?.trim(), process.env.GREEN_API_OTP_BACKUP_ID_INSTANCE?.trim()].includes(sender.idInstance);
}

async function requireDeliveryConfig(kind: "otp" | "owner" | "owner_handoff" | "pager" | "subscription_reminder" | "other") {
  if (isPlatformAccessOnly() && kind !== "otp" && kind !== "owner_handoff") throw new Error("MESSAGING_TEMPORARILY_PAUSED");
  if (isGreenApiBackupOnly() && (kind === "other" || kind === "owner" || kind === "owner_handoff")) throw new Error("MESSAGING_TEMPORARILY_PAUSED");
  const configured = requireGreenApiConfig();
  // Access sends share a single attempt budget across readiness and explicit refusals.
  if (kind === "otp" || kind === "owner" || kind === "owner_handoff") return configured;
  const primary = validateOtpSender(configured);
  if (await otpSenderReady(primary)) return primary;
  const backup = backupOtpSender(primary);
  if (backup && await otpSenderReady(backup)) return backup;
  throw new Error("PLATFORM_SENDERS_UNAVAILABLE");
}

/** Server-only platform credentials; never use this for a brand-owned connection.
 * Exactly one sender is selected before POST; an uncertain send is never replayed. */
export async function selectGreenApiPlatformSender() {
  return requireDeliveryConfig("other");
}

/** The cafe identity comes from the authorized operation or its claimed database job. */
export async function selectOperationalDeliveryConfig(cafeId?: string, kind: "other" | "pager" | "cashier_welcome" = "other") {
  if (kind === "cashier_welcome" && isPlatformAccessOnly()) throw new Error("MESSAGING_TEMPORARILY_PAUSED");
  if (cafeId !== MERAM_CAFE_ID) return requireDeliveryConfig(kind === "pager" ? "pager" : "other");
  if (isGreenApiBackupOnly()) throw new Error("MESSAGING_TEMPORARILY_PAUSED");
  const { selectVerifiedBrandWhatsAppSender } = await import("@/lib/whatsapp/customer-routing");
  const sender = await selectVerifiedBrandWhatsAppSender(cafeId);
  if (!sender || isGreenApiPlatformSender(sender)) throw new Error("BRAND_WHATSAPP_UNAVAILABLE");
  return validateOtpSender(sender);
}

/** Explicitly authorized renewal notices also use standby during the primary restriction. */
export async function sendGreenApiSubscriptionReminder(input: { phone: string; message: string }, authorize: () => Promise<boolean>): Promise<{ status: "queued" | "rejected" | "unknown" | "not_sent" | "skipped"; providerMessageId?: string }> {
  if (!supportedMobile.test(input.phone) || !input.message || input.message.length > 2000) throw new Error("INVALID_SUBSCRIPTION_REMINDER");
  let sender: OtpSender;
  try {
    sender = validateOtpSender(await requireDeliveryConfig("subscription_reminder"));
  } catch { return { status: "not_sent" }; }
  // Recheck the deadline and recipient after readiness I/O, immediately before POST.
  if (!await authorize()) return { status: "skipped" };
  try {
    const response = await fetch(otpEndpoint(sender, "sendMessage"), {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(Math.min(10_000, greenApiTimeoutMs())),
      body: JSON.stringify({ chatId: `${input.phone}@c.us`, linkPreview: false, message: input.message }),
    });
    if (!response.ok) return { status: [401, 403, 429, 466].includes(response.status) ? "rejected" : "unknown" };
    const payload = await response.json() as GreenApiSendResponse;
    return typeof payload.idMessage === "string" && payload.idMessage.length > 0 && payload.idMessage.length <= 200
      ? { status: "queued", providerMessageId: payload.idMessage } : { status: "unknown" };
  } catch { return { status: "unknown" }; }
}
