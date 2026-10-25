import { z } from "zod";
import { after } from "next/server";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { verifySupabaseHookSignature } from "@/lib/auth/supabase-hook-signature";
import { enqueueOtpDelivery, deliverQueuedOtp } from "@/lib/auth/otp-delivery";
import { isAllowedCustomerOtpPhone, isPhoneOtpRequiredForBrand } from "@/lib/auth/phone-otp";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    // SQL atomically consumes an authorized admission and persists the encrypted
    // job. A signature alone cannot bypass quotas or active membership checks.
    if (!isPhoneOtpRequiredForBrand("", "loyalty")
      || !isAllowedCustomerOtpPhone(phoneNormalized, "", "loyalty")) return errorResponse(403);
    const id = await enqueueOtpDelivery({
      phoneNormalized,
      code: parsed.data.sms.otp,
      webhookId: request.headers.get("webhook-id") ?? "",
    });
    after(async () => {
      try { await deliverQueuedOtp(id); }
      catch { console.error("[otpDelivery]", { status: "worker_unavailable", jobId: id }); }
    });
    return Response.json({}, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "OTP_ADMISSION_DENIED") return errorResponse(403);
    console.error("[sendSmsHook]", { status: "queue_unavailable" });
    return errorResponse(502);
  }
}
