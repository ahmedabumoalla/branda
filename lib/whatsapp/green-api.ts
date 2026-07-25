import "server-only";

const DEFAULT_GREEN_API_TIMEOUT_MS = 10_000;

type GreenApiSendResponse = {
  idMessage?: string;
};

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
      message: `رمز التحقق لعلامة ${input.brandName}: ${input.code}\nصالح لمدة 5 دقائق.\nلا تشارك الرمز مع أي شخص.\nإذا لم تطلبه فتجاهل الرسالة.`,
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
      message: `رمز التحقق في برندة: ${input.code}\nصالح لمدة 5 دقائق.\nلا تشارك الرمز مع أي شخص.\nإذا لم تطلبه فتجاهل الرسالة.`,
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
