import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function hookSecretBytes(secret: string) {
  const normalized = secret.trim().replace(/^v1,whsec_/, "");
  if (!normalized) throw new Error("SUPABASE_SEND_SMS_HOOK_SECRET_MISSING");
  return Buffer.from(normalized, "base64");
}

export function verifySupabaseHookSignature(input: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string | undefined;
  nowSeconds?: number;
}) {
  if (
    !input.webhookId ||
    !input.webhookTimestamp ||
    !input.webhookSignature ||
    !input.secret
  ) {
    return false;
  }

  const timestamp = Number.parseInt(input.webhookTimestamp, 10);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS
  ) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = createHmac("sha256", hookSecretBytes(input.secret))
      .update(`${input.webhookId}.${input.webhookTimestamp}.${input.rawBody}`)
      .digest();
  } catch {
    return false;
  }

  return input.webhookSignature.split(/\s+/).some((candidate) => {
    const [version, encoded] = candidate.split(",", 2);
    if (version !== "v1" || !encoded) return false;
    try {
      const received = Buffer.from(encoded, "base64");
      return received.length === expected.length && timingSafeEqual(received, expected);
    } catch {
      return false;
    }
  });
}
