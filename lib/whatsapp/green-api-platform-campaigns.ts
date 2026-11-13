import "server-only";

export class PlatformCampaignProviderError extends Error {
  constructor(public code: string, public uncertain = false) { super(code); }
}

function configuration() {
  if (process.env.GREEN_API_TEMPORARY_BACKUP_ONLY?.trim() === "true") throw new PlatformCampaignProviderError("MESSAGING_TEMPORARILY_PAUSED");
  const apiUrl = process.env.GREEN_API_API_URL?.trim().replace(/\/+$/, "");
  const id = process.env.GREEN_API_ID_INSTANCE?.trim();
  const token = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim();
  if (!apiUrl || !id || !token) throw new PlatformCampaignProviderError("SENDER_NOT_CONFIGURED");
  const url = new URL(apiUrl);
  if (url.protocol !== "https:" || !/^(?:api|[0-9]{1,10}\.api)\.green-?api\.com$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !/^\d{1,16}$/.test(id) || !/^[A-Za-z0-9._-]{8,512}$/.test(token)) throw new PlatformCampaignProviderError("SENDER_CONFIGURATION_INVALID");
  return { origin: url.origin, id, token };
}

async function request(method: "getWaSettings" | "sendMessage" | "sendFileByUrl", body?: Record<string, unknown>) {
  const config = configuration();
  let response: Response;
  try {
    response = await fetch(`${config.origin}/waInstance${config.id}/${method}/${config.token}`, {
      method: body ? "POST" : "GET", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(body ? 20_000 : 10_000),
    });
  } catch { throw new PlatformCampaignProviderError("PROVIDER_UNAVAILABLE", Boolean(body)); }
  if (!response.ok) throw new PlatformCampaignProviderError(`PROVIDER_REJECTED_${response.status}`, Boolean(body) && (response.status >= 500 || response.status === 408));
  let value: Record<string, unknown>;
  try { value = await response.json(); } catch { throw new PlatformCampaignProviderError("INVALID_PROVIDER_RESPONSE", Boolean(body)); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformCampaignProviderError("INVALID_PROVIDER_RESPONSE", Boolean(body));
  if ("code" in value) {
    const code = Number(value.code);
    throw new PlatformCampaignProviderError("PROVIDER_REJECTED", Boolean(body) && (!Number.isInteger(code) || code < 400 || code >= 500 || code === 408));
  }
  return value;
}

/** Uses the same server-side instance as Branda's operational notifications. */
export async function getBrandaCampaignSender() {
  try {
    const value = await request("getWaSettings");
    const phone = typeof value.phone === "string" ? value.phone.replace(/^\+/, "") : null;
    const ready = value.stateInstance === "authorized" && Boolean(phone && /^[1-9]\d{6,14}$/.test(phone));
    return { phone: phone && /^[1-9]\d{6,14}$/.test(phone) ? phone : null, ready, status: ready ? "connected" : "disconnected" };
  } catch (error) {
    return { phone: null, ready: false, status: error instanceof PlatformCampaignProviderError && error.code === "SENDER_NOT_CONFIGURED" ? "not_configured" : "unavailable" };
  }
}

/** Exactly one request, body unchanged. Acceptance does not mean delivery. */
export async function sendBrandaCampaignMessage(input: { phone: string; body: string; media?: { url: string; fileName: string } | null }) {
  if (!/^9665\d{8}$/.test(input.phone) || !input.body.trim() || input.body.length > (input.media ? 1024 : 3000)) throw new PlatformCampaignProviderError("INVALID_CAMPAIGN_MESSAGE");
  let payload: Record<string, unknown>;
  if (input.media) {
    let url: URL, origin: URL;
    try { url = new URL(input.media.url); origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""); } catch { throw new PlatformCampaignProviderError("INVALID_MEDIA_URL"); }
    if (url.protocol !== "https:" || url.origin !== origin.origin || url.username || url.password || url.hash || !url.pathname.startsWith("/storage/v1/object/sign/platform-marketing-media/") || !url.searchParams.get("token") || !/^campaign\.(jpg|png|webp|mp4)$/.test(input.media.fileName)) throw new PlatformCampaignProviderError("INVALID_MEDIA_URL");
    payload = await request("sendFileByUrl", { chatId: `${input.phone}@c.us`, urlFile: url.href, fileName: input.media.fileName, caption: input.body });
  } else payload = await request("sendMessage", { chatId: `${input.phone}@c.us`, message: input.body, linkPreview: false });
  if (typeof payload.idMessage !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.idMessage)) throw new PlatformCampaignProviderError("ACKNOWLEDGEMENT_MISSING", true);
  return { providerMessageId: payload.idMessage };
}
