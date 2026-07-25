import { z } from "zod";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { verifySupabaseHookSignature } from "@/lib/auth/supabase-hook-signature";
import { sendGreenApiSupabaseOtp } from "@/lib/whatsapp/green-api";

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

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function allowedTestPhone(phoneNormalized: string) {
  if (!enabled(process.env.PHONE_OTP_TEST_MODE)) return true;
  return (process.env.PHONE_OTP_ALLOWED_PHONES ?? "")
    .split(",")
    .map((phone) => normalizeSaudiPhone(phone.trim()))
    .some((phone) => phone === phoneNormalized);
}

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
  if (!phoneNormalized || !allowedTestPhone(phoneNormalized)) {
    return errorResponse(403);
  }

  try {
    await sendGreenApiSupabaseOtp({
      phoneNormalized,
      code: parsed.data.sms.otp,
    });
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[sendSmsHook]", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Send failed",
      phone: `${phoneNormalized.slice(0, 4)}****${phoneNormalized.slice(-4)}`,
    });
    return errorResponse(502);
  }
}
