import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptMarketingSecret, marketingConfigured, marketingPublicOrigin, signMarketingUnsubscribe } from "@/lib/marketing/crypto";
import { getGreenApiMarketingState, getGreenApiMarketingAccount, sendGreenApiMarketingMessage, GreenApiProviderError, type GreenApiMarketingCredentials } from "@/lib/whatsapp/green-api-marketing";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";

type Job = { id: string; cafe_id: string; campaign_id: string; phone: string; body: string; title: string; created_by: string; lease_token: string; instance_id: string; encrypted_credentials: string; requested_phone: string; generation: string };

export async function runMarketingJobs() {
  if (!marketingConfigured()) throw new Error("MARKETING_CONFIGURATION_MISSING");
  const db = createAdminClient();
  const { data, error } = await db.rpc("marketing_claim_jobs", { p_limit: 15 });
  if (error) throw new Error("MARKETING_QUEUE_UNAVAILABLE");
  const jobs = (data ?? []) as Job[];
  const result = { claimed: jobs.length, accepted: 0, deferred: 0, failed: 0, uncertain: 0 };
  async function finish(job: Job, status: "queued" | "accepted" | "failed" | "uncertain", message: string | null = null, reason: string | null = null) {
    const response = await db.rpc("marketing_finish_dispatch", { p_id: job.id, p_lease: job.lease_token, p_status: status, p_message: message, p_error: reason });
    if (response.error) throw new Error("MARKETING_FINALIZE_UNAVAILABLE");
  }
  async function dispatch(job: Job) {
    let attempted = false;
    try {
      const credentials = decryptMarketingSecret<GreenApiMarketingCredentials>(job.encrypted_credentials, `${job.cafe_id}:${job.instance_id}`);
      if (credentials.idInstance !== job.instance_id) throw new Error("MARKETING_INSTANCE_MISMATCH");
      const state = await getGreenApiMarketingState(credentials);
      const account = state === "authorized" ? await getGreenApiMarketingAccount(credentials) : null;
      const verified = account ? normalizeSaudiPhone(account.phone) : null;
      if (state !== "authorized" || verified !== job.requested_phone) {
        await db.from("brand_marketing_connections").update({ status: state === "authorized" ? "mismatch" : "pairing", verified_phone: verified, updated_at: new Date().toISOString() }).eq("cafe_id", job.cafe_id).eq("generation", job.generation).eq("status", "connected");
        await finish(job, "queued"); result.deferred++; return;
      }
      const unsubscribe = `${marketingPublicOrigin()}/api/marketing/unsubscribe?id=${job.id}&token=${signMarketingUnsubscribe(job.id)}`;
      const message = `${job.body}\n\nلإيقاف الرسائل أرسل إيقاف أو استخدم الرابط\n${unsubscribe}`;
      // Last transactional check covers current profile, package, brand, cancellation, opt-out and pacing.
      const begin = await db.rpc("marketing_begin_dispatch", { p_id: job.id, p_lease: job.lease_token, p_generation: job.generation });
      if (begin.error || begin.data !== true) { await finish(job, "queued"); result.deferred++; return; }
      attempted = true;
      const response = await sendGreenApiMarketingMessage(credentials, { phone: job.phone, message });
      await finish(job, "accepted", response.providerMessageId);
      result.accepted++;
    } catch (error) {
      const status = !attempted ? "queued" : error instanceof GreenApiProviderError && !error.uncertain ? "failed" : "uncertain";
      // If the final write failed, the persisted attempt becomes uncertain on lease expiry, never queued.
      try { await finish(job, status, null, error instanceof GreenApiProviderError ? error.code : "DISPATCH_UNCERTAIN"); } catch { /* Durable lease recovery remains responsible. */ }
      if (status === "queued") result.deferred++; else result[status]++;
    }
  }
  for (let index = 0; index < jobs.length; index += 5) await Promise.all(jobs.slice(index, index + 5).map(dispatch));
  return result;
}
