import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OwnerCompanionGuide } from "./owner-guide";

/** Persist only guide destinations, never passwords or login captions. */
export async function queueOwnerCompanionGuides(phone: string, receipt: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await createAdminClient().rpc("enqueue_owner_companion_guides", { p_phone: phone, p_receipt: receipt });
      if (!result.error) return true;
    } catch { /* Same receipt is an idempotent queue key. Never replay the welcome. */ }
  }
  console.error("owner_companion_guides_queue_unconfirmed");
  return false;
}

type SendGuide = (phone: string, guide: OwnerCompanionGuide) => Promise<{ providerMessageId: string }>;

export async function runOwnerCompanionGuides(send: SendGuide) {
  const admin = createAdminClient();
  const started = Date.now();
  let processed = 0;
  // A slow primary/backup attempt gets the whole remaining invocation budget.
  // Fast sends process both clips together; slow sends leave the next clip durable.
  for (let i = 0; i < 10 && (i === 0 || Date.now() - started < 20_000); i++) {
    const claimed = await admin.rpc("claim_owner_companion_guide");
    if (claimed.error) throw new Error("owner_guide_claim_unavailable");
    const job = claimed.data;
    if (!job) break;
    let status: "sent" | "rejected" | "uncertain" = "uncertain";
    let receipt: string | null = null;
    try {
      if (job.guide !== "cashier" && job.guide !== "customer") throw new Error("invalid_guide");
      receipt = (await send(String(job.phone), job.guide)).providerMessageId;
      status = "sent";
    } catch (error) {
      status = error instanceof Error && ["OWNER_WELCOME_REJECTED", "MESSAGING_TEMPORARILY_PAUSED", "GREEN_API_CONFIGURATION_MISSING"].includes(error.message) ? "rejected" : "uncertain";
    }
    let recorded = false;
    for (let n = 0; n < 3; n++) {
      try {
        const result = await admin.rpc("finish_owner_companion_guide", { p_id: job.id, p_attempt: job.attempt, p_status: status, p_receipt: receipt });
        if (!result.error && result.data === true) { recorded = true; break; }
      } catch { /* Retry acknowledgement only. An expired sending lease becomes uncertain. */ }
    }
    if (!recorded) throw new Error("owner_guide_ack_unconfirmed");
    processed++;
  }
  return { processed };
}
