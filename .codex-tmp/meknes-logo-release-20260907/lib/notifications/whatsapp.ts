import {
  isMetaWhatsAppConfigured,
  normalizeWhatsAppToNumber,
  sendMetaWhatsAppText,
} from "@/lib/whatsapp/meta-cloud";

export type WhatsAppSendInput = {
  to?: string | null;
  body: string;
  mediaUrls?: string[];
  eventType: string;
  cafeId?: string | null;
  recipientName?: string | null;
};

export type WhatsAppSendResult =
  | { ok: true; sid?: string; messageId?: string }
  | {
      ok: false;
      skipped?: boolean;
      reason: string;
      status?: number;
      errorCode?: string;
      errorType?: string;
      devHint?: string;
    };

function isEnabled(): boolean {
  return isMetaWhatsAppConfigured();
}

export function normalizeWhatsAppPhone(input?: string | null): string | null {
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

export function maskWhatsAppPhone(input?: string | null): string | undefined {
  const normalized = normalizeWhatsAppPhone(input);
  if (!normalized) return undefined;
  const visibleEnd = normalized.slice(-4);
  const visibleStart = normalized.slice(0, 5);
  return `${visibleStart}***${visibleEnd}`;
}

function logWhatsAppFailure(
  input: WhatsAppSendInput,
  reason: string,
  normalizedTo?: string | null,
): void {
  console.warn("[whatsapp] failed to send", {
    eventType: input.eventType,
    cafeId: input.cafeId ?? null,
    reason,
    to: maskWhatsAppPhone(normalizedTo ?? input.to),
  });
}

export async function sendWhatsAppMessage(
  input: WhatsAppSendInput,
): Promise<WhatsAppSendResult> {
  if (!isEnabled()) {
    return { ok: false, skipped: true, reason: "disabled" };
  }

  const normalizedTo = normalizeWhatsAppPhone(input.to);
  if (!normalizedTo) {
    return { ok: false, skipped: true, reason: "invalid_recipient" };
  }

  const result = await sendMetaWhatsAppText({
    to: normalizeWhatsAppToNumber(normalizedTo) ?? normalizedTo,
    body: input.body,
  });

  if (!result.ok) {
    logWhatsAppFailure(input, result.reason, normalizedTo);
    return result;
  }

  return { ok: true, messageId: result.messageId };
}

export async function sendWhatsAppOtp(input: {
  to?: string | null;
  code: string;
  customerName?: string | null;
  brandName?: string | null;
  cafeId?: string | null;
}): Promise<WhatsAppSendResult> {
  const customerName = input.customerName?.trim() || "عميلنا العزيز";
  const brandName = input.brandName?.trim() || "برنداكسه";

  return sendWhatsAppMessage({
    to: input.to,
    body: [
      `مرحبا ${customerName}`,
      `كود تأكيد رقم جوالك في ${brandName} هو:`,
      input.code,
      "",
      "صالح لمدة 10 دقائق.",
      "لا تشارك هذا الكود مع أي شخص.",
    ].join("\n"),
    eventType: "customer_phone_otp",
    cafeId: input.cafeId,
    recipientName: customerName,
  });
}
