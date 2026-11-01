import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandaCampaignSender, sendBrandaCampaignMessage, PlatformCampaignProviderError } from "@/lib/whatsapp/green-api-platform-campaigns";
import { signPlatformCampaignMedia } from "@/lib/marketing/platform-media";

type Job = { id: string; campaign_id: string; phone: string; body: string; title: string; media_id: string | null; created_by: string; lease_token: string };

/** Durable, globally paced queue; timeout after attempted send is never auto-retried. */
export async function runPlatformMarketingJobs() {
  const result = { claimed: 0, accepted: 0, failed: 0, uncertain: 0, deferred: 0 };
  if (!(await getBrandaCampaignSender()).ready) return { ...result, senderReady: false };
  const db = createAdminClient(), started = Date.now();
  async function finish(job: Job, status: "queued" | "accepted" | "failed" | "uncertain", message: string | null = null, error: string | null = null) {
    const saved = await db.rpc("platform_marketing_finish_dispatch", { p_id: job.id, p_lease: job.lease_token, p_status: status, p_message: message, p_error: error });
    if (saved.error) throw new Error("PLATFORM_CAMPAIGN_FINISH_FAILED");
  }
  for (let index = 0; index < 8 && Date.now() - started < 70_000; index++) {
    const claim = await db.rpc("platform_marketing_claim_job");
    if (claim.error) throw new Error("PLATFORM_CAMPAIGN_QUEUE_UNAVAILABLE");
    const job = claim.data as Job | null;
    if (!job) break;
    result.claimed++;
    let attempted = false;
    try {
      const media = job.media_id ? await signPlatformCampaignMedia(job.created_by, job.media_id) : null;
      const begin = await db.rpc("platform_marketing_begin_dispatch", { p_id: job.id, p_lease: job.lease_token });
      if (begin.error || begin.data !== true) { await finish(job, "queued"); result.deferred++; break; }
      attempted = true;
      const sent = await sendBrandaCampaignMessage({ phone: job.phone, body: job.body, media });
      await finish(job, "accepted", sent.providerMessageId);
      result.accepted++;
    } catch (error) {
      const status = !attempted ? "queued" : error instanceof PlatformCampaignProviderError && !error.uncertain ? "failed" : "uncertain";
      try { await finish(job, status, null, error instanceof PlatformCampaignProviderError ? error.code : "DISPATCH_UNCERTAIN"); } catch { /* Lease recovery safely retains the attempted result as uncertain. */ }
      if (status === "queued") { result.deferred++; break; }
      result[status]++;
    }
    if (index < 7 && Date.now() - started < 70_000) await new Promise(resolve => setTimeout(resolve, 5100));
  }
  return { ...result, senderReady: true };
}
