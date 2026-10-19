import "server-only";

const PARTNER_HOSTS = new Set(["api.greenapi.com", "api.green-api.com"]);
const DEFAULT_TIMEOUT_MS = 10_000;

export class GreenApiProviderError extends Error {
  constructor(public readonly code: string, public readonly uncertain = false) {
    super(code);
    this.name = "GreenApiProviderError";
  }
}

/** No instance credentials are returned to callers of the account inventory. */
export type GreenApiPartnerInstanceSummary = {
  idInstance: number;
  name: string;
  tariff: string;
  isPartner: boolean;
  deleted: boolean;
  isExpired: boolean;
};

function requirePartnerConfig() {
  const token = process.env.GREEN_API_PARTNER_TOKEN?.trim();
  if (!token) throw new Error("GREEN_API_PARTNER_CONFIGURATION_MISSING");
  let url: URL;
  try {
    url = new URL(process.env.GREEN_API_PARTNER_API_URL?.trim() || "https://api.greenapi.com");
  } catch {
    throw new Error("GREEN_API_PARTNER_URL_INVALID");
  }
  if (url.protocol !== "https:" || !PARTNER_HOSTS.has(url.hostname) || url.port ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("GREEN_API_PARTNER_URL_INVALID");
  }
  return { origin: url.origin, token };
}

export function isGreenApiPartnerConfigured() {
  try {
    requirePartnerConfig();
    return true;
  } catch {
    return false;
  }
}

/** Server-only transport. Mutations must be called under the application's tenant lock. */
export async function requestGreenApiPartner(
  method: "getInstances" | "createInstance" | "deleteInstanceAccount",
  body?: Record<string, unknown>,
): Promise<unknown> {
  if (!["getInstances", "createInstance", "deleteInstanceAccount"].includes(method)) throw new GreenApiProviderError("GREEN_API_PARTNER_METHOD_INVALID");
  const { origin, token } = requirePartnerConfig();
  const requestedTimeout = Number(process.env.GREEN_API_REQUEST_TIMEOUT_MS);
  const timeout = Number.isSafeInteger(requestedTimeout) && requestedTimeout > 0
    ? Math.min(requestedTimeout, 30_000) : DEFAULT_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(`${origin}/partner/${method}/${encodeURIComponent(token)}`, {
      method: method === "getInstances" ? "GET" : "POST",
      ...(method === "getInstances" ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    // Provider credentials are in the URL: never forward fetch errors or causes.
    throw new GreenApiProviderError("GREEN_API_PARTNER_REQUEST_FAILED", method !== "getInstances");
  }
  if (!response.ok) throw new GreenApiProviderError(`GREEN_API_PARTNER_REQUEST_REJECTED_${response.status}`, method !== "getInstances" && (response.status >= 500 || response.status === 408));
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GreenApiProviderError("GREEN_API_PARTNER_RESPONSE_INVALID", method !== "getInstances");
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "code" in payload) {
    const status = Number((payload as Record<string, unknown>).code);
    const validStatus = Number.isInteger(status) && status >= 100 && status <= 599;
    throw new GreenApiProviderError(method === "getInstances" ? "GREEN_API_PARTNER_RESPONSE_INVALID" : `GREEN_API_PARTNER_REQUEST_REJECTED_${validStatus ? status : "UNKNOWN"}`, method !== "getInstances" && (!validStatus || status < 400 || status >= 500 || status === 408));
  }
  return payload;
}

/** Private inventory for recovery of an interrupted provision; never serialize to a client. */
export async function getGreenApiPartnerInstanceRecords(): Promise<Record<string, unknown>[]> {
  const payload = await requestGreenApiPartner("getInstances");
  // GREEN-API may return a provider error object with HTTP 200.
  if (!Array.isArray(payload)) throw new Error("GREEN_API_PARTNER_RESPONSE_INVALID");
  return payload.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new Error("GREEN_API_PARTNER_RESPONSE_INVALID");
    const value = row as Record<string, unknown>;
    if (!Number.isSafeInteger(value.idInstance) || Number(value.idInstance) <= 0 ||
      typeof value.name !== "string" || typeof value.tariff !== "string" ||
      typeof value.isPartner !== "boolean" || typeof value.deleted !== "boolean" ||
      typeof value.isExpired !== "boolean") throw new Error("GREEN_API_PARTNER_RESPONSE_INVALID");
    return value;
  });
}

/** No credentials or provider-private fields leave the inventory summary. */
export async function getGreenApiPartnerInstances(): Promise<GreenApiPartnerInstanceSummary[]> {
  return (await getGreenApiPartnerInstanceRecords()).map((value) => ({
      idInstance: Number(value.idInstance), name: value.name, tariff: value.tariff,
      isPartner: value.isPartner, deleted: value.deleted, isExpired: value.isExpired,
    } as GreenApiPartnerInstanceSummary));
}
