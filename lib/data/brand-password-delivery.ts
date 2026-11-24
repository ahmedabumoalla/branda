import "server-only";
import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { after } from "next/server";
import { z } from "zod";
import { openWelcomePassword, sealWelcomePassword } from "@/lib/auth/brand-welcome-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBrandPasswordAttempt, type BrandPasswordLane } from "@/lib/whatsapp/green-api";

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "sending", "sent", "failed", "uncertain", "cancelled"]),
  attempt: z.number().int().min(0).max(9),
  nextAttemptAt: z.string().nullable(),
});
const claimSchema = z.object({
  id: z.string().uuid(),
  claimToken: z.string().uuid(),
  phone: z.string(),
  ciphertext: z.string().min(1),
  attempt: z.number().int().min(1).max(9),
});

type Outcome = "accepted" | "rejected" | "unknown" | "abort";
type Admin = ReturnType<typeof createAdminClient>;
function laneFor(attempt: number): BrandPasswordLane {
  if (attempt <= 3) return "notifications";
  return attempt <= 6 ? "primary" : "standby";
}

function statusFor(value: unknown) {
  const { id, status: state, attempt, nextAttemptAt } = statusSchema.parse(value);
  const displayAttempt = state === "queued" ? Math.min(attempt + 1, 9) : Math.max(1, attempt);
  return { id, state, lane: laneFor(displayAttempt), attempt: (displayAttempt - 1) % 3 + 1, nextAttemptAt };
}
export type BrandPasswordDeliveryStatus = ReturnType<typeof statusFor>;

const errors: Record<string, string> = {
  OWNER_PHONE_REQUIRED: "أكمل توثيق رقم جوال دخول المالك أولًا",
  OWNER_WELCOME_PENDING: "أكمل تسليم بيانات الدخول الأولى للمالك قبل إصدار كلمة مرور جديدة",
  BRAND_UNAVAILABLE: "حساب العلامة غير متاح لتغيير كلمة المرور",
  REQUEST_CHANGED: "أغلق النافذة وافتح طلبًا جديدًا لهذه العلامة",
  OWNER_RESET_IN_PROGRESS: "يوجد طلب تغيير كلمة مرور قيد التنفيذ لهذا المالك",
  ADMIN_REQUIRED: "يتطلب هذا الإجراء صلاحية مسؤول المنصة",
};
function requestError(message: string) {
  return new Error(errors[message] ?? "تعذر قراءة طلب كلمة المرور أو حفظه حاول مجددًا");
}

function scheduleAttempt(id: string) {
  // A disconnected admin does not cancel the request. The minute cron also picks up due jobs.
  after(async () => {
    try { await runBrandPasswordAttempt(id); }
    catch { console.warn("brand_password_job_deferred"); }
  });
}

export async function requestBrandPasswordDelivery(cafeId: string, requestId: string, actorId: string) {
  const password = randomInt(10_000_000, 100_000_000).toString();
  const { data, error } = await createAdminClient().rpc("brand_password_reset_enqueue", {
    p_actor: actorId, p_cafe: cafeId, p_request: requestId,
    p_ciphertext: sealWelcomePassword(password, "brand-password-reset:" + requestId),
    p_password_hash: await hash(password, 10),
  });
  if (error) throw requestError(error.message);
  const status = statusFor(data);
  if (status.state === "queued") scheduleAttempt(status.id);
  return status;
}

export async function getBrandPasswordDelivery(cafeId: string, actorId: string) {
  const { data, error } = await createAdminClient().rpc("brand_password_reset_status", {
    p_actor: actorId, p_cafe: cafeId,
  });
  if (error) throw requestError(error.message);
  if (data == null) return null;
  const status = statusFor(data);
  if (status.state === "queued" && status.nextAttemptAt && Date.parse(status.nextAttemptAt) <= Date.now()) {
    scheduleAttempt(status.id);
  }
  return status;
}

async function finishAttempt(admin: Admin, id: string, token: string, outcome: Outcome) {
  // Retrying the same database acknowledgement cannot trigger another provider POST.
  for (let index = 0; index < 3; index++) {
    try {
      const result = await admin.rpc("brand_password_reset_finish", {
        p_request: id, p_claim: token, p_outcome: outcome,
      });
      if (!result.error) return;
    } catch { /* Retry the database write only. */ }
  }
  throw new Error("BRAND_PASSWORD_ACK_UNAVAILABLE");
}

export async function runBrandPasswordAttempt(requestId?: string): Promise<boolean> {
  const admin = createAdminClient();
  const claim = await admin.rpc("brand_password_reset_claim", { p_request: requestId ?? null });
  if (claim.error) throw new Error("BRAND_PASSWORD_CLAIM_UNAVAILABLE");
  if (!claim.data) return false;
  const job = claimSchema.parse(claim.data);
  let password: string;
  try {
    password = openWelcomePassword(job.ciphertext, "brand-password-reset:" + job.id);
  } catch {
    await finishAttempt(admin, job.id, job.claimToken, "abort");
    return true;
  }
  let outcome: Outcome = "unknown";
  try {
    const result = await sendBrandPasswordAttempt({
      lane: laneFor(job.attempt), phone: job.phone, password,
      authorize: async () => {
        const check = await admin.rpc("brand_password_reset_can_send", { p_request: job.id, p_claim: job.claimToken });
        return !check.error && check.data === true;
      },
    });
    outcome = result.status;
  } catch { /* A lost provider response must not cause another send. */ }
  await finishAttempt(admin, job.id, job.claimToken, outcome);
  return true;
}

export async function runBrandPasswordJobs() {
  // Each invocation claims a separate row through SKIP LOCKED in the database.
  const processed = await Promise.all(Array.from({ length: 4 }, () => runBrandPasswordAttempt()));
  return { processed: processed.filter(Boolean).length };
}
