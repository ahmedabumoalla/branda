import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OwnerCompanionGuide } from "./owner-guide";

type SendGuide = (phone: string, guide: OwnerCompanionGuide) => Promise<{ providerMessageId: string }>;

export async function runOwnerCompanionGuides(send: SendGuide) {
  const admin = createAdminClient();
  const started = Date.now();
  let processed = 0;
  for (let i = 0; i < 10 && (i === 0 || Date.now() - started < 20_000); i++) {
    const claimed = await admin.rpc("claim_owner_signup_guide");
    if (claimed.error) throw new Error("owner_guide_claim_unavailable");
    const job = claimed.data;
    if (!job) break;
    let status: "sent" | "rejected" | "uncertain" | "deferred" = "uncertain";
    let receipt: string | null = null;
    try {
      if (job.guide !== "setup" && job.guide !== "cashier" && job.guide !== "customer") throw new Error("invalid_guide");
      receipt = (await send(String(job.phone), job.guide)).providerMessageId;
      status = "sent";
    } catch (error) {
      if (error instanceof Error && error.message === "OWNER_GUIDE_PRIMARY_UNAVAILABLE") status = "deferred";
      if (error instanceof Error && error.message === "OWNER_WELCOME_REJECTED") status = "rejected";
    }
    let recorded = false;
    for (let n = 0; n < 3; n++) {
      try {
        const lease = { p_id: job.id, p_attempt: job.attempt };
        const result = status === "deferred" ? await admin.rpc("defer_owner_signup_guide", lease)
          : await admin.rpc("finish_owner_companion_guide", { ...lease, p_status: status, p_receipt: receipt });
        if (!result.error && result.data === true) { recorded = true; break; }
      } catch { /* Retry acknowledgement only. An expired sending lease becomes uncertain. */ }
    }
    if (!recorded) throw new Error("owner_guide_ack_unconfirmed");
    processed++;
  }
  return { processed };
}
