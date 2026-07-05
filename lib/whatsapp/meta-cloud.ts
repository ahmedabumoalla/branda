export const META_WHATSAPP_TEMPLATE_ENV_NAMES = {
  loginOtp: "META_WHATSAPP_TEMPLATE_LOGIN_OTP",
  orderStatus: "META_WHATSAPP_TEMPLATE_ORDER_STATUS",
  reservationReminder: "META_WHATSAPP_TEMPLATE_RESERVATION_REMINDER",
  orderTracking: "META_WHATSAPP_TEMPLATE_ORDER_TRACKING",
} as const;

export type MetaWhatsAppTextParameter = {
  type: "text";
  text: string;
};

export type MetaWhatsAppCurrencyParameter = {
  type: "currency";
  currency: {
    fallback_value: string;
    code: string;
    amount_1000: number;
  };
};

export type MetaWhatsAppDateTimeParameter = {
  type: "date_time";
  date_time: {
    fallback_value: string;
  };
};

export type MetaWhatsAppTemplateParameter =
  | MetaWhatsAppTextParameter
  | MetaWhatsAppCurrencyParameter
  | MetaWhatsAppDateTimeParameter;

export type MetaWhatsAppTemplateComponent = {
  type: "header" | "body" | "button";
  parameters?: MetaWhatsAppTemplateParameter[];
  sub_type?: "quick_reply" | "url";
  index?: string;
};

export type SendMetaWhatsAppTemplateInput = {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: MetaWhatsAppTemplateComponent[];
};

export type SendMetaWhatsAppTextInput = {
  to: string;
  body: string;
  previewUrl?: boolean;
};

export type MetaWhatsAppSendResult =
  | { ok: true; messageId?: string }
  | {
      ok: false;
      skipped?: boolean;
      reason: string;
      status?: number;
      errorCode?: string;
      errorType?: string;
    };

type MetaWhatsAppApiResponse = {
  messages?: Array<{ id?: string }>;
  error?: {
    code?: number | string;
    type?: string;
  };
};

const META_GRAPH_API_VERSION = "v20.0";

function metaAccessToken(): string | undefined {
  return process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() || undefined;
}

function metaPhoneNumberId(): string | undefined {
  return process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined;
}

export function isMetaWhatsAppConfigured(): boolean {
  return Boolean(metaAccessToken() && metaPhoneNumberId());
}

export function normalizeWhatsAppToNumber(phone: string): string | null {
  const withoutChannel = phone.trim().replace(/^whatsapp:/i, "");
  const compact = withoutChannel.replace(/[^\d+]/g, "");
  let digits = compact.startsWith("+") ? compact.slice(1) : compact;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("05") && digits.length === 10) {
    digits = `966${digits.slice(1)}`;
  } else if (digits.startsWith("5") && digits.length === 9) {
    digits = `966${digits}`;
  }

  if (!/^\d{8,15}$/.test(digits)) return null;
  return digits;
}

function metaMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(
    phoneNumberId,
  )}/messages`;
}

function getMetaMessageId(payload: MetaWhatsAppApiResponse | null): string | undefined {
  const messageId = payload?.messages?.[0]?.id;
  return typeof messageId === "string" ? messageId : undefined;
}

function safeErrorDetails(payload: MetaWhatsAppApiResponse | null): {
  errorCode?: string;
  errorType?: string;
} {
  const code = payload?.error?.code;
  const type = payload?.error?.type;
  return {
    errorCode:
      typeof code === "string" || typeof code === "number"
        ? String(code)
        : undefined,
    errorType: typeof type === "string" ? type.slice(0, 80) : undefined,
  };
}

function safeReason(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 140);
  }
  return "unknown_error";
}

async function sendMetaWhatsAppMessage(
  payload: Record<string, unknown>,
): Promise<MetaWhatsAppSendResult> {
  const accessToken = metaAccessToken();
  const phoneNumberId = metaPhoneNumberId();

  if (!accessToken || !phoneNumberId) {
    return { ok: false, skipped: true, reason: "missing_config" };
  }

  try {
    const response = await fetch(metaMessagesUrl(phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responsePayload = (await response.json().catch(() => null)) as
      | MetaWhatsAppApiResponse
      | null;

    if (!response.ok) {
      return {
        ok: false,
        reason: `meta_http_${response.status}`,
        status: response.status,
        ...safeErrorDetails(responsePayload),
      };
    }

    return {
      ok: true,
      messageId: getMetaMessageId(responsePayload),
    };
  } catch (error) {
    return { ok: false, reason: safeReason(error) };
  }
}

export async function sendMetaWhatsAppTemplate(
  input: SendMetaWhatsAppTemplateInput,
): Promise<MetaWhatsAppSendResult> {
  const to = normalizeWhatsAppToNumber(input.to);
  if (!to) {
    return { ok: false, skipped: true, reason: "invalid_recipient" };
  }

  return sendMetaWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode ?? "en_US" },
      ...(input.components?.length ? { components: input.components } : {}),
    },
  });
}

export async function sendMetaWhatsAppText(
  input: SendMetaWhatsAppTextInput,
): Promise<MetaWhatsAppSendResult> {
  const to = normalizeWhatsAppToNumber(input.to);
  if (!to) {
    return { ok: false, skipped: true, reason: "invalid_recipient" };
  }

  return sendMetaWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body: input.body,
      preview_url: input.previewUrl ?? false,
    },
  });
}

export async function sendMetaWhatsAppTextForTesting(
  input: SendMetaWhatsAppTextInput,
): Promise<MetaWhatsAppSendResult> {
  return sendMetaWhatsAppText(input);
}
