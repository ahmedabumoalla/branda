import { z } from "zod";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { verifySupabaseHookSignature } from "@/lib/auth/supabase-hook-signature";
import { greenApiProviderInstanceKey, sendGreenApiSupabaseOtp } from "@/lib/whatsapp/green-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedCustomerOtpPhone, isPhoneOtpRequiredForBrand } from "@/lib/auth/phone-otp";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;
const sendSmsHookSchema = z.object({
  user: z.object({
    phone: z.string().min(1).max(32),
  }),
  sms: z.object({
    otp: z.string().regex(/^\d{6}$/),
  }),
});

function errorResponse(status: number) {
  return Response.json(
    { error: { http_code: status, message: "Unable to send verification code." } },
    { status },
  );
}

export async function POST(request: Request) {
  const declaredLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413);
  }

  const signatureValid = verifySupabaseHookSignature({
    rawBody,
    webhookId: request.headers.get("webhook-id"),
    webhookTimestamp: request.headers.get("webhook-timestamp"),
    webhookSignature: request.headers.get("webhook-signature"),
    secret: process.env.SUPABASE_SEND_SMS_HOOK_SECRET,
  });
  if (!signatureValid) return errorResponse(401);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse(400);
  }

  const parsed = sendSmsHookSchema.safeParse(payload);
  if (!parsed.success) return errorResponse(400);

  const phoneNormalized = normalizeSaudiPhone(parsed.data.user.phone);
  if (!phoneNormalized) {
    return errorResponse(403);
  }

  try {
    // A valid Supabase signature alone must not bypass the application send limits.
    // Consume one recent, server-authorized request before contacting WhatsApp.
    const { data: cafeSlug, error } = await createAdminClient().rpc("claim_customer_phone_otp_dispatch", {
      p_phone_normalized: phoneNormalized,
      p_provider_instance: greenApiProviderInstanceKey(),
    });
    if (error || typeof cafeSlug !== "string" || !isPhoneOtpRequiredForBrand(cafeSlug)
      || !isAllowedCustomerOtpPhone(phoneNormalized, cafeSlug)) return errorResponse(403);
    await sendGreenApiSupabaseOtp({
      phoneNormalized,
      code: parsed.data.sms.otp,
    });
    return Response.json({}, { status: 200 });
  } catch (error) {
    console.error("[sendSmsHook]", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Send failed",
      phone: `${phoneNormalized.slice(0, 4)}****${phoneNormalized.slice(-4)}`,
    });
    return errorResponse(502);
  }
}
