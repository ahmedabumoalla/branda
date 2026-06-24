import { Buffer } from "node:buffer";

export type WhatsAppSendInput = {
  to?: string | null;
  body: string;
  eventType: string;
  cafeId?: string | null;
  recipientName?: string | null;
};

export type WhatsAppSendResult =
  | { ok: true; sid?: string }
  | {
      ok: false;
      skipped?: boolean;
      reason: string;
      devHint?: string;
    };

function isEnabled() {
  return process.env.TWILIO_WHATSAPP_ENABLED === "true";
}

function normalizePhone(input?: string | null) {
  const raw = input?.trim();
  if (!raw) return null;

  const withoutChannel = raw.replace(/^whatsapp:/i, "");
  const compact = withoutChannel.replace(/[^\d+]/g, "");
  let digits = compact.startsWith("+") ? compact.slice(1) : compact;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("05") && digits.length === 10) {
    digits = `966${digits.slice(1)}`;
  } else if (digits.startsWith("5") && digits.length === 9) {
    digits = `966${digits}`;
  }

  if (!/^\d{8,15}$/.test(digits)) return null;
  return `+${digits}`;
}

function maskPhone(input?: string | null) {
  const normalized = normalizePhone(input);
  if (!normalized) return undefined;
  const visibleEnd = normalized.slice(-4);
  const visibleStart = normalized.slice(0, 5);
  return `${visibleStart}***${visibleEnd}`;
}

function safeReason(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 140);
  }
  return "unknown_error";
}

function logWhatsAppFailure(
  input: WhatsAppSendInput,
  reason: string,
  normalizedTo?: string | null,
) {
  console.warn("[whatsapp] failed to send", {
    eventType: input.eventType,
    cafeId: input.cafeId ?? null,
    reason,
    to: maskPhone(normalizedTo ?? input.to),
  });
}

// Twilio Sandbox note: during development the recipient number must join the
// configured WhatsApp Sandbox before Twilio will deliver messages.
export async function sendWhatsAppMessage(
  input: WhatsAppSendInput,
): Promise<WhatsAppSendResult> {
  if (!isEnabled()) {
    return { ok: false, skipped: true, reason: "disabled" };
  }

  const normalizedTo = normalizePhone(input.to);
  if (!normalizedTo) {
    return { ok: false, skipped: true, reason: "invalid_recipient" };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();

  if (!accountSid || !authToken || !from) {
    const reason = "missing_config";
    logWhatsAppFailure(input, reason, normalizedTo);
    return { ok: false, skipped: true, reason };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
        accountSid,
      )}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${accountSid}:${authToken}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: from,
          To: `whatsapp:${normalizedTo}`,
          Body: input.body,
        }).toString(),
      },
    );

    if (!response.ok) {
      const reason = `twilio_http_${response.status}`;
      logWhatsAppFailure(input, reason, normalizedTo);
      return {
        ok: false,
        reason,
        devHint:
          process.env.NODE_ENV === "development"
            ? "Twilio WhatsApp Sandbox recipients must opt in before delivery."
            : undefined,
      };
    }

    const payload = (await response.json().catch(() => null)) as
      | { sid?: unknown }
      | null;
    return {
      ok: true,
      sid: typeof payload?.sid === "string" ? payload.sid : undefined,
    };
  } catch (error) {
    const reason = safeReason(error);
    logWhatsAppFailure(input, reason, normalizedTo);
    return { ok: false, reason };
  }
}
