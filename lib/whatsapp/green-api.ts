import "server-only";

const DEFAULT_GREEN_API_TIMEOUT_MS = 10_000;

type GreenApiSendResponse = {
  idMessage?: string;
};

/** Provider acknowledgement starts the trial; this does not claim delivery/read receipt. */
export async function sendGreenApiOwnerWelcome(input: { phone: string; brandName: string; password: string }) {
  if (!/^9665\d{8}$/.test(input.phone)) throw new Error("INVALID_OWNER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
  const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
    signal: AbortSignal.timeout(Math.min(10_000, greenApiTimeoutMs())),
    body: JSON.stringify({ chatId: `${input.phone}@c.us`, linkPreview: false, message: [
      `حساب ${input.brandName} جاهز في برندة`,
      "المنصة: https://barndaksa.com",
      "الدخول: https://barndaksa.com/login",
      `الجوال: ${input.phone}`,
      `كلمة المرور: ${input.password}`,
      "تجربتك المجانية ٧ أيام من اليوم",
    ].join("\n") }),
  });
  if (!response.ok) throw new Error(response.status < 500 ? "OWNER_WELCOME_REJECTED" : "OWNER_WELCOME_UNCERTAIN");
  const data = await response.json() as GreenApiSendResponse;
  if (typeof data.idMessage !== "string" || !data.idMessage) throw new Error("OWNER_WELCOME_UNCERTAIN");
  return { providerMessageId: data.idMessage };
}

export function isGreenApiConfigured() {
  return Boolean(process.env.GREEN_API_API_URL?.trim() && process.env.GREEN_API_ID_INSTANCE?.trim() && process.env.GREEN_API_API_TOKEN_INSTANCE?.trim());
}

/** A provider acknowledgement means queued only. Ambiguous outcomes must not be retried automatically */
export async function sendGreenApiFinanceShiftAlert(input: { phone: string; message: string }): Promise<{ status: "queued" | "rejected" | "unknown"; providerMessageId?: string }> {
  if (!/^9665\d{8}$/.test(input.phone)) throw new Error("INVALID_FINANCE_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
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

function financeReceiptMediaOrigin() {
  // Use the instance's mediaUrl. A generic host can time out for dedicated instances.
  const configured = process.env.GREEN_API_MEDIA_URL?.trim();
  if (!configured) throw new Error("GREEN_API_MEDIA_CONFIGURATION_MISSING");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !/(^|\.)(green-api\.com|greenapi\.com)$/.test(url.hostname)) throw new Error("INVALID_GREEN_MEDIA_HOST");
  return url.origin;
}

export async function sendGreenApiFinanceReceipt(input: { phone: string; message: string; pdf: Uint8Array; invoiceNumber: number }): Promise<{ status: "queued" | "rejected" | "unknown"; providerMessageId?: string }> {
  if (!/^9665\d{8}$/.test(input.phone) || !Number.isSafeInteger(input.invoiceNumber) || input.invoiceNumber < 1 || input.message.length > 1024 || !input.pdf.length || input.pdf.length > 8 * 1024 * 1024 || new TextDecoder().decode(input.pdf.slice(0, 5)) !== "%PDF-") throw new Error("INVALID_FINANCE_RECEIPT");
  const { idInstance, apiTokenInstance } = requireGreenApiConfig();
  const mediaOrigin = financeReceiptMediaOrigin();
  const body = new FormData();
  const fileName = `invoice-${input.invoiceNumber}.pdf`;
  body.set("chatId", `${input.phone}@c.us`);
  body.set("caption", input.message);
  body.set("fileName", fileName);
  body.set("file", new Blob([new Uint8Array(input.pdf)], { type: "application/pdf" }), fileName);
  try {
    const response = await fetch(`${mediaOrigin}/waInstance${idInstance}/sendFileByUpload/${apiTokenInstance}`, { method: "POST", body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(Math.min(15_000, greenApiTimeoutMs())) });
    if (!response.ok) return { status: response.status >= 400 && response.status < 500 ? "rejected" : "unknown" };
    const payload = await response.json() as GreenApiSendResponse;
    return typeof payload.idMessage === "string" && payload.idMessage.length > 0 && payload.idMessage.length <= 200 ? { status: "queued", providerMessageId: payload.idMessage } : { status: "unknown" };
  } catch { return { status: "unknown" }; }
}

/** A provider ID means queued by GREEN-API, not delivered or read */
export async function sendGreenApiPagerMessage(input: { phone: string; message: string }) {
  if (!/^9665\d{8}$/.test(input.phone)) throw new Error("INVALID_PAGER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
  const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
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
}) {
  if (!/^9665\d{8}$/.test(input.phone) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.slug)) throw new Error("INVALID_SALES_CASHIER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
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
export async function sendGreenApiLinkedSalesCashierWelcome(input: { phone: string; fullName: string; brandName: string }) {
  if (!/^9665\d{8}$/.test(input.phone)) throw new Error("INVALID_SALES_CASHIER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
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
}) {
  if (!/^\+9665\d{8}$/.test(input.phone)) throw new Error("INVALID_CASHIER_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
  const response = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(greenApiTimeoutMs()),
    body: JSON.stringify({
      chatId: `${input.phone.slice(1)}@c.us`,
      linkPreview: false,
      message: [
        `مرحبًا ${input.fullName}`,
        `تم إنشاء حسابك في نقطة تشغيل ${input.brandName}`,
        "",
        "رابط الدخول:",
        "https://barndaksa.com/cashier/login",
        "أدخل رقم جوالك واطلب رمز التحقق عبر واتساب للدخول",
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
export async function sendGreenApiMenuFeedback(input: { recipient: string; brandName: string; rating: number; notes: string }) {
  if (!/^9665\d{8}$/.test(input.recipient)) throw new Error("INVALID_FEEDBACK_RECIPIENT");
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
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
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
  const endpoint = `${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chatId: `${input.phoneNormalized}@c.us`,
      message: `رمز التحقق لعلامة ${input.brandName}: ${input.code}\nصالح لمدة 5 دقائق.\nلا تشارك الرمز مع أي شخص.\nإذا لم تطلبه فتجاهل الرسالة`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(greenApiTimeoutMs()),
  });

  if (!response.ok) {
    throw new Error(`GREEN_API_REQUEST_REJECTED_${response.status}`);
  }

  const payload = (await response.json()) as GreenApiSendResponse;
  if (!payload.idMessage) {
    throw new Error("GREEN_API_MESSAGE_ID_MISSING");
  }

  return { providerMessageId: payload.idMessage };
}

export async function sendGreenApiSupabaseOtp(input: {
  phoneNormalized: string;
  code: string;
}, options?: { timeoutMs: number }): Promise<{ providerMessageId: string }> {
  const { apiUrl, idInstance, apiTokenInstance } = requireGreenApiConfig();
  const endpoint = `${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chatId: `${input.phoneNormalized}@c.us`,
      message: `رمز التحقق في برندة: ${input.code}\nصالح لمدة 5 دقائق.\nلا تشارك الرمز مع أي شخص.\nإذا لم تطلبه فتجاهل الرسالة`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(options ? Math.max(1000, Math.min(25_000, options.timeoutMs)) : greenApiTimeoutMs()),
  });

  if (!response.ok) {
    throw new Error(`GREEN_API_REQUEST_REJECTED_${response.status}`);
  }

  const payload = (await response.json()) as GreenApiSendResponse;
  if (!payload.idMessage) {
    throw new Error("GREEN_API_MESSAGE_ID_MISSING");
  }

  return { providerMessageId: payload.idMessage };
}
