import "server-only";
import { getGreenApiPartnerInstanceRecords, GreenApiProviderError, requestGreenApiPartner } from "@/lib/whatsapp/green-api-partner";

export { GreenApiProviderError } from "@/lib/whatsapp/green-api-partner";

/** Sensitive, server-only: encrypt before persistence; never pass to client props. */
export type GreenApiMarketingCredentials = { idInstance: string; apiTokenInstance: string; apiUrl: string };
export type GreenApiMarketingWebhook = { webhookUrl: string; webhookToken: string };
type JsonObject = Record<string, unknown>;
const UNIVERSAL_HOST = "https://api.greenapi.com";
const STATES = new Set(["notAuthorized", "authorized", "blocked", "sleepMode", "starting", "yellowCard", "suspended"]);

function fail(code: string, uncertain = false): never { throw new GreenApiProviderError(`GREEN_API_MARKETING_${code}`, uncertain); }
function record(value: unknown, uncertain = false): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("RESPONSE_INVALID", uncertain);
  return value as JsonObject;
}
function providerOrigin(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return fail("HOST_INVALID"); }
  const allowed = /^(?:api|[0-9]{1,10}\.api)\.green-?api\.com$/.test(url.hostname);
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) fail("HOST_INVALID");
  return url.origin;
}
function validateCredentials(value: GreenApiMarketingCredentials): GreenApiMarketingCredentials {
  if (!/^[1-9]\d{0,15}$/.test(value.idInstance) || !Number.isSafeInteger(Number(value.idInstance)) || !/^[A-Za-z0-9._-]{8,512}$/.test(value.apiTokenInstance)) fail("CREDENTIALS_INVALID");
  if (value.idInstance === process.env.GREEN_API_ID_INSTANCE?.trim()) fail("OPERATIONAL_INSTANCE_FORBIDDEN");
  return { ...value, apiUrl: providerOrigin(value.apiUrl) };
}
function credentialsFrom(value: JsonObject, uncertain = false): GreenApiMarketingCredentials {
  try {
    if (typeof value.apiTokenInstance !== "string" || !Number.isSafeInteger(value.idInstance)) fail("CREDENTIALS_INVALID");
    return validateCredentials({ idInstance: String(value.idInstance), apiTokenInstance: value.apiTokenInstance, apiUrl: typeof value.apiUrl === "string" ? value.apiUrl : UNIVERSAL_HOST });
  } catch { return fail("CREDENTIALS_INVALID", uncertain); }
}
function instanceName(brandId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brandId)) fail("BRAND_INVALID");
  return `branda-marketing-${brandId.toLowerCase()}`;
}
function webhookSettings(input: GreenApiMarketingWebhook) {
  let url: URL;
  try { url = new URL(input.webhookUrl); } catch { return fail("WEBHOOK_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search ||
    !/^[a-zA-Z0-9_-]{32,256}$/.test(input.webhookToken)) fail("WEBHOOK_INVALID");
  return {
    webhookUrl: url.href, webhookUrlToken: `Bearer ${input.webhookToken}`,
    outgoingWebhook: "yes", outgoingAPIMessageWebhook: "yes", outgoingMessageWebhook: "no",
    incomingWebhook: "yes", stateWebhook: "yes", delaySendMessagesMilliseconds: 60_000,
    markIncomingMessagesReaded: "no", markIncomingMessagesReadedOnReply: "no", keepOnlineStatus: "no",
  };
}

/** No retry: a lost acknowledgement of a mutation must be reconciled by the caller. */
async function instanceRequest(credentials: GreenApiMarketingCredentials, method: string, body?: JsonObject, mutation = false): Promise<unknown> {
  const config = validateCredentials(credentials);
  const canUseUniversalHost = !mutation && !body && config.apiUrl !== UNIVERSAL_HOST && ["getStateInstance", "qr", "getWaSettings"].includes(method);
  let response: Response;
  const requested = Number(process.env.GREEN_API_REQUEST_TIMEOUT_MS);
  const timeout = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 30_000) : 10_000;
  try {
    response = await fetch(`${config.apiUrl}/waInstance${config.idInstance}/${method}/${encodeURIComponent(config.apiTokenInstance)}`, {
      method: body ? "POST" : "GET", ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout),
    });
  } catch { return fail("REQUEST_FAILED", mutation); }
  if (response.status === 401 && canUseUniversalHost) return instanceRequest({ ...config, apiUrl: UNIVERSAL_HOST }, method);
  if (!response.ok) fail(`REQUEST_REJECTED_${response.status}`, mutation && (response.status >= 500 || response.status === 408));
  let payload: unknown;
  try { payload = await response.json(); } catch { return fail("RESPONSE_INVALID", mutation); }
  if (payload && typeof payload === "object" && "code" in payload) {
    const status = Number((payload as JsonObject).code);
    if (status === 401 && canUseUniversalHost) return instanceRequest({ ...config, apiUrl: UNIVERSAL_HOST }, method);
    const validStatus = Number.isInteger(status) && status >= 100 && status <= 599;
    fail(`REQUEST_REJECTED_${validStatus ? status : "UNKNOWN"}`, mutation && (!validStatus || status < 400 || status >= 500 || status === 408));
  }
  return payload;
}

export async function findGreenApiMarketingInstance(brandId: string): Promise<GreenApiMarketingCredentials | null> {
  const name = instanceName(brandId);
  const matches = (await getGreenApiPartnerInstanceRecords()).filter(row => row.name === name && row.deleted === false);
  if (matches.length > 1) fail("PROVISION_CONFLICT");
  if (!matches.length) return null;
  const row = matches[0];
  if (row.isPartner !== true || row.isExpired === true) fail("PROVISION_UNAVAILABLE");
  return credentialsFrom(row);
}

/** Caller must hold a durable brand lock and record create intent BEFORE allowCreate:true. */
export async function provisionGreenApiMarketingInstance(input: GreenApiMarketingWebhook & { brandId: string; allowCreate: boolean }) {
  const name = instanceName(input.brandId);
  const settings = webhookSettings(input);
  const existing = await findGreenApiMarketingInstance(input.brandId);
  if (existing) return { credentials: existing, reused: true };
  if (!input.allowCreate) fail("PROVISION_UNCERTAIN", true);
  const result = await requestGreenApiPartner("createInstance", { name, ...settings });
  const credentials = credentialsFrom(record(result, true), true);
  return { credentials, reused: false };
}

export async function getGreenApiMarketingState(credentials: GreenApiMarketingCredentials): Promise<string | null> {
  const response = await instanceRequest(credentials, "getStateInstance");
  if (response === null) return null; // Provisioning is still in progress.
  const state = record(response).stateInstance;
  if (typeof state !== "string" || !STATES.has(state)) fail("STATE_INVALID");
  return state;
}

export async function getGreenApiMarketingQr(credentials: GreenApiMarketingCredentials): Promise<{ type: "qrCode" | "timeout" | "error" | "passkeyRequired" | "alreadyLogged"; message: string }> {
  const value = record(await instanceRequest(credentials, "qr"));
  if (value.type === "qrCode") {
    if (typeof value.message !== "string" || value.message.length > 500_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.message)) fail("QR_INVALID");
    return { type: "qrCode", message: value.message };
  }
  if (value.type === "timeout" || value.type === "error" || value.type === "passkeyRequired" || value.type === "alreadyLogged") {
    // Do not expose provider diagnostics (which may contain a token or URL).
    return { type: value.type, message: "" };
  }
  return fail("QR_INVALID");
}

export async function getGreenApiMarketingAccount(credentials: GreenApiMarketingCredentials): Promise<{ phone: string }> {
  const value = record(await instanceRequest(credentials, "getWaSettings"));
  if (value.stateInstance !== "authorized") fail("ACCOUNT_NOT_AUTHORIZED");
  const phone = typeof value.phone === "string" ? value.phone.replace(/^\+/, "") : "";
  if (!/^[1-9]\d{6,14}$/.test(phone)) fail("ACCOUNT_PHONE_INVALID");
  return { phone };
}

export async function configureGreenApiMarketingWebhook(credentials: GreenApiMarketingCredentials, input: GreenApiMarketingWebhook): Promise<void> {
  const result = record(await instanceRequest(credentials, "setSettings", webhookSettings(input), true), true);
  if (result.saveSettings !== true) fail("SETTINGS_NOT_SAVED", true);
}

/** Provider acceptance is not proof of delivery; an uncertain error must never auto-retry. */
export async function sendGreenApiMarketingMessage(credentials: GreenApiMarketingCredentials, input: { phone: string; message: string }): Promise<{ providerMessageId: string }> {
  if (!/^[1-9]\d{6,14}$/.test(input.phone) || !input.message.trim() || input.message.length > 20_000) fail("MESSAGE_INVALID");
  const result = record(await instanceRequest(credentials, "sendMessage", {
    chatId: `${input.phone}@c.us`, message: input.message, linkPreview: false,
  }, true), true);
  if (typeof result.idMessage !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(result.idMessage)) fail("ACKNOWLEDGEMENT_MISSING", true);
  return { providerMessageId: result.idMessage };
}

export async function clearGreenApiMarketingQueue(credentials: GreenApiMarketingCredentials): Promise<void> {
  const result = record(await instanceRequest(credentials, "clearMessagesQueue", undefined, true), true);
  if (result.isCleared !== true) fail("QUEUE_NOT_CLEARED", true);
}
export async function logoutGreenApiMarketingInstance(credentials: GreenApiMarketingCredentials): Promise<void> {
  const result = record(await instanceRequest(credentials, "logout", undefined, true), true);
  if (result.isLogout !== true) fail("LOGOUT_UNCONFIRMED", true);
}

/** Only for an explicitly requested disconnect, never as automatic cleanup on a failed request. */
export async function deleteGreenApiMarketingInstance(credentials: GreenApiMarketingCredentials): Promise<void> {
  const checked = validateCredentials(credentials);
  const rows = await getGreenApiPartnerInstanceRecords();
  const row = rows.find(item => String(item.idInstance) === checked.idInstance);
  if (!row || row.deleted === true) return; // Reconcile a prior successful deletion.
  if (row.isPartner !== true || row.apiTokenInstance !== checked.apiTokenInstance || typeof row.name !== "string" || !row.name.startsWith("branda-marketing-")) fail("DELETE_FORBIDDEN");
  await clearGreenApiMarketingQueue(checked);
  const state = await getGreenApiMarketingState(checked);
  if (state !== "notAuthorized") await logoutGreenApiMarketingInstance(checked);
  const result = record(await requestGreenApiPartner("deleteInstanceAccount", { idInstance: Number(checked.idInstance) }), true);
  if (result.deleteInstanceAccount !== true) fail("DELETE_UNCONFIRMED", true);
}
