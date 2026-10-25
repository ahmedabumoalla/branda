import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { greenApiProviderInstanceKey, sendGreenApiSupabaseOtp } from "@/lib/whatsapp/green-api";

const payloadSchema = z.object({
  phoneNormalized: z.string().regex(/^9665\d{8}$/),
  code: z.string().regex(/^\d{6}$/),
});
const sealedPayloadSchema = payloadSchema.extend({ providerInstance: z.string().min(1).max(200) });
const jobSchema = z.object({ id: z.uuid(), payload: z.string().max(4096), lease_token: z.uuid() });
const context = "branda:auth-otp-delivery:v1";

function encryptionKey() {
  return Buffer.from(hkdfSync("sha256", getSupabaseServiceRoleKey(), context, "payload", 32));
}

// OTPs are recoverable only by the trusted worker, never stored as plaintext.
export function sealOtpDelivery(input: z.infer<typeof payloadSchema>) {
  const payload = sealedPayloadSchema.parse({ ...input, providerInstance: greenApiProviderInstanceKey() });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function openOtpDelivery(envelope: string) {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("OTP_PAYLOAD_INVALID");
  const iv = Buffer.from(parts[1], "base64url"), tag = Buffer.from(parts[2], "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("OTP_PAYLOAD_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]);
  return sealedPayloadSchema.parse(JSON.parse(plain.toString("utf8")));
}

export async function enqueueOtpDelivery(input: z.infer<typeof payloadSchema> & { webhookId: string }) {
  const webhookId = z.string().min(1).max(200).parse(input.webhookId);
  const { data, error } = await createAdminClient().rpc("enqueue_customer_phone_otp_delivery", {
    p_phone_normalized: input.phoneNormalized,
    p_provider_instance: greenApiProviderInstanceKey(),
    p_webhook_id: webhookId,
    p_payload: sealOtpDelivery(input),
  });
  if (error) throw new Error(error.code === "42501" ? "OTP_ADMISSION_DENIED" : "OTP_QUEUE_UNAVAILABLE");
  return z.uuid().parse(data);
}

/** Claims once; an uncertain provider outcome is never automatically sent again. */
export async function deliverQueuedOtp(id?: string) {
  const admin = createAdminClient();
  const providerInstance = greenApiProviderInstanceKey();
  const claim = await admin.rpc("claim_customer_phone_otp_delivery", { p_provider_instance: providerInstance, p_id: id ?? null });
  if (claim.error) throw new Error("OTP_QUEUE_UNAVAILABLE");
  if (!Array.isArray(claim.data) || claim.data.length === 0) return false;
  const job = jobSchema.parse(claim.data[0]);
  let status: "sent" | "unknown" | "failed" = "failed";
  try {
    const payload = openOtpDelivery(job.payload);
    if (payload.providerInstance !== providerInstance) throw new Error("OTP_PROVIDER_MISMATCH");
    // The Auth response has already been acknowledged after durable enqueue.
    // A slow provider can now finish without invalidating the user's Auth OTP.
    status = "unknown";
    await sendGreenApiSupabaseOtp({ phoneNormalized: payload.phoneNormalized, code: payload.code }, { timeoutMs: 25_000 });
    status = "sent";
  } catch {
    // Neither provider errors nor ciphertext/plaintext belong in logs.
    console.error("[otpDelivery]", { status, jobId: job.id });
  }
  const result = await admin.rpc("finish_customer_phone_otp_delivery", {
    p_id: job.id, p_lease_token: job.lease_token, p_status: status,
  });
  if (result.error || result.data !== true) throw new Error("OTP_QUEUE_COMPLETION_UNAVAILABLE");
  return true;
}

export async function runOtpDeliveryJobs() {
  // Bounded parallel claims allow cron to recover pending jobs after a cold start
  // or worker termination without sending the same job twice.
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => deliverQueuedOtp()));
  return {
    processed: results.filter(result => result.status === "fulfilled" && result.value).length,
    errors: results.filter(result => result.status === "rejected").length,
  };
}
