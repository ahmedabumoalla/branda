import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletReadiness } from "./config";
import { issueApplePass as generateApplePass, pushAppleDevice } from "./apple";
import { issueGoogleSaveUrl as generateGoogleSaveUrl, updateGooglePass, notifyGoogleBrand } from "./google";
import type { WalletMember, WalletDeliveryResult } from "./types";

export { getWalletReadiness } from "./config";
export { walletBrandLogo } from "./apple";
export type { WalletMember, WalletDeliveryResult } from "./types";

async function trackIssuedPass(member: WalletMember, provider: "apple" | "google") {
  const { error } = await createAdminClient().from("wallet_passes").upsert({ card_id: member.card.id, cafe_id: member.card.cafeId, provider }, { onConflict: "card_id,provider", ignoreDuplicates: true });
  if (error) throw new Error("wallet_tracking_unavailable");
}

export async function issueApplePass(member: WalletMember) {
  const pass = await generateApplePass(member);
  await trackIssuedPass(member, "apple");
  return pass;
}

export async function issueGoogleSaveUrl(member: WalletMember) {
  const url = await generateGoogleSaveUrl(member);
  await trackIssuedPass(member, "google");
  return url;
}

function skipped(): WalletDeliveryResult {
  return { apple: { status: "skipped", count: 0 }, google: { status: "skipped", count: 0 } };
}

function providerFailed(error: unknown): WalletDeliveryResult["google"] {
  return { status: "failed", count: 0, ...(error instanceof Error && /_429$/.test(error.message) ? { retryAfterSeconds: 86400 } : {}) };
}

async function pushRegistrations(cafeId: string, cardId?: string) {
  const db = createAdminClient();
  const registered = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    let query = db.from("wallet_apple_registrations").select("push_token").eq("cafe_id", cafeId)
      .order("device_library_id").order("card_id").range(offset, offset + 499);
    if (cardId) query = query.eq("card_id", cardId);
    const { data, error } = await query;
    if (error) throw new Error("wallet_registration_unavailable");
    for (const row of data ?? []) registered.add(String(row.push_token));
    if (!data || data.length < 500) break;
  }
  const tokens = [...registered];
  let count = 0;
  let failed = false;
  // Bound connection concurrency without discarding registered devices.
  for (let offset = 0; offset < tokens.length; offset += 8) {
    const batch = await Promise.allSettled(tokens.slice(offset, offset + 8).map(async (token) => {
      try { await pushAppleDevice(token); return true; } catch (error) {
        if (error instanceof Error && error.message === "apple_push_410") {
          const { error: deleteError } = await db.from("wallet_apple_registrations").delete().eq("cafe_id", cafeId).eq("push_token", token);
          if (deleteError) throw new Error("wallet_registration_unavailable");
          return false;
        }
        throw error;
      }
    }));
    for (const item of batch) { if (item.status === "fulfilled") { if (item.value) count++; } else failed = true; }
  }
  return { status: failed ? "failed" as const : count ? "accepted" as const : "skipped" as const, count };
}

async function syncMember(member: WalletMember, previous?: WalletDeliveryResult): Promise<WalletDeliveryResult> {
  const result = skipped();
  const readiness = getWalletReadiness();
  const { data: passes, error } = await createAdminClient().from("wallet_passes").select("provider").eq("card_id", member.card.id).eq("cafe_id", member.card.cafeId);
  if (error) throw new Error("wallet_tracking_unavailable");
  const hasGoogle = passes?.some(pass => pass.provider === "google") && member.program.googleWalletEnabled;
  const hasApple = passes?.some(pass => pass.provider === "apple") && member.program.appleWalletEnabled;
  if (hasGoogle && !readiness.google) result.google.pending = true;
  if (hasApple && !readiness.apple) result.apple.pending = true;
  if (previous?.google.status === "accepted") result.google = previous.google;
  else if (readiness.google && hasGoogle) {
    try { await updateGooglePass(member, true); result.google = { status: "accepted", count: 1 }; } catch (error) { result.google = providerFailed(error); }
  }
  if (previous?.apple.status === "accepted") result.apple = previous.apple;
  else if (readiness.apple && hasApple) {
    try { result.apple = await pushRegistrations(member.card.cafeId, member.card.id); } catch { result.apple.status = "failed"; }
  }
  return result;
}

async function finishJob(id: string, result: WalletDeliveryResult, attempts = 1) {
  const statuses = [result.apple.status, result.google.status];
  const incomplete = statuses.includes("failed") || result.apple.pending || result.google.pending;
  const status = incomplete ? attempts >= 5 && statuses.includes("failed") ? "failed" : "pending" : "sent";
  const delay = Math.max(result.apple.retryAfterSeconds ?? 0, result.google.retryAfterSeconds ?? 0, Math.min(60 * 2 ** Math.min(attempts, 6), 3600));
  const db = createAdminClient();
  const update = { status, delivery_state: result, attempts, claimed_at: null, last_error: statuses.includes("failed") ? "provider_request_failed" : null, updated_at: new Date().toISOString(), available_at: new Date(Date.now() + delay * 1000).toISOString() };
  const { error } = await db.from("wallet_notification_jobs").update(update).eq("id", id);
  if (error?.code === "23505" && status === "pending") {
    // A new scan can queue the same card while this worker holds the older job.
    const { data: oldJob, error: oldError } = await db.from("wallet_notification_jobs").select("kind,card_id,cafe_id").eq("id", id).maybeSingle();
    if (oldError || oldJob?.kind !== "sync") throw new Error("wallet_job_unavailable");
    const { data: replacement, error: replacementError } = await db.from("wallet_notification_jobs").select("id").eq("kind", "sync").eq("card_id", oldJob.card_id).eq("cafe_id", oldJob.cafe_id).eq("status", "pending").neq("id", id).limit(1).maybeSingle();
    if (replacementError || !replacement) throw new Error("wallet_job_unavailable");
    const { error: supersededError } = await db.from("wallet_notification_jobs").update({ ...update, status: "sent", last_error: "superseded_by_newer_sync" }).eq("id", id);
    if (supersededError) throw new Error("wallet_job_unavailable");
    return;
  }
  if (error) throw new Error("wallet_job_unavailable");
}

export async function syncWalletCardByCode(code: string) {
  const { loadWalletMemberByCode } = await import("@/lib/data/loyalty-experience");
  const member = await loadWalletMemberByCode(code);
  if (!member) return skipped();
  const result = await syncMember(member);
  // The atomic database update already enqueued the durable sync; settle only jobs older than this completed snapshot.
  const statuses = [result.apple.status, result.google.status];
  if (!statuses.includes("failed") && !result.apple.pending && !result.google.pending && statuses.includes("accepted")) {
    const { error } = await createAdminClient().from("wallet_notification_jobs").update({ status: "sent", updated_at: new Date().toISOString() }).eq("kind", "sync").eq("card_id", member.card.id).eq("cafe_id", member.card.cafeId).eq("status", "pending").lte("created_at", member.card.updatedAt);
    if (error) throw new Error("wallet_job_unavailable");
  }
  return result;
}

async function deliverBrandMessage(cafeId: string, title: string, body: string, messageId: string, previous?: WalletDeliveryResult) {
  const result = skipped();
  const readiness = getWalletReadiness();
  const { data: passes, error } = await createAdminClient().from("wallet_passes").select("provider").eq("cafe_id", cafeId);
  if (error) throw new Error("wallet_tracking_unavailable");
  const { data: program, error: programError } = await createAdminClient().from("cafe_loyalty_programs").select("enabled,apple_wallet_enabled,google_wallet_enabled").eq("cafe_id", cafeId).maybeSingle();
  if (programError) throw new Error("wallet_program_unavailable");
  if (!program?.enabled) return result;
  const googleCount = program.google_wallet_enabled ? passes?.filter(pass => pass.provider === "google").length ?? 0 : 0;
  const appleCount = program.apple_wallet_enabled ? passes?.filter(pass => pass.provider === "apple").length ?? 0 : 0;
  if (googleCount && !readiness.google) result.google.pending = true;
  if (appleCount && !readiness.apple) result.apple.pending = true;
  if (previous?.google.status === "accepted") result.google = previous.google;
  else if (readiness.google && googleCount) {
    try { await notifyGoogleBrand(cafeId, title, body, messageId); result.google = { status: "accepted", count: 1 }; } catch (error) { result.google = providerFailed(error); }
  }
  if (previous?.apple.status === "accepted") result.apple = previous.apple;
  else if (readiness.apple && appleCount) {
    try { result.apple = await pushRegistrations(cafeId); } catch { result.apple.status = "failed"; }
  }
  return result;
}

// Only an authenticated internal scheduler or owner-authorized server action may call this server-only worker.
export async function retryWalletNotificationJobs(limit = 10) {
  const db = createAdminClient();
  const { data: jobs, error } = await db.rpc("claim_wallet_notification_jobs", { p_limit: Math.min(25, Math.max(1, limit)) });
  if (error) throw new Error("wallet_queue_unavailable");
  const { loadWalletMemberByCode } = await import("@/lib/data/loyalty-experience");
  let processed = 0;
  for (const job of jobs ?? []) {
    let result = skipped();
    const state = job.delivery_state && typeof job.delivery_state === "object" ? job.delivery_state as WalletDeliveryResult : undefined;
    try {
      if (job.kind === "message") result = await deliverBrandMessage(job.cafe_id, job.title ?? "", job.body ?? "", job.id, state);
      else if (job.card_id) {
        const { data: card, error: cardError } = await db.from("loyalty_cards").select("card_code").eq("id", job.card_id).eq("cafe_id", job.cafe_id).maybeSingle();
        if (cardError) throw new Error("wallet_card_unavailable");
        const member = card ? await loadWalletMemberByCode(card.card_code) : null;
        if (member) result = await syncMember(member, state);
      }
    } catch { result = { apple: { status: "failed", count: 0 }, google: { status: "failed", count: 0 } }; }
    await finishJob(job.id, result, Number(job.attempts));
    processed++;
  }
  return { processed };
}

// Caller enforces owner tenant; the RPC atomically persists, deduplicates and rate-limits the announcement.
export async function notifyBrandWalletMembers(cafeId: string, _cafeSlug: string, title: string, body: string) {
  if (_cafeSlug !== "rast") throw new Error("wallet_disabled");
  if (!title.trim() || title.length > 80 || !body.trim() || body.length > 240) throw new Error("wallet_invalid_message");
  const { data, error } = await createAdminClient().rpc("enqueue_rast_wallet_announcement", { p_cafe_id: cafeId, p_title: title.trim(), p_body: body.trim() });
  if (error) {
    if (error.message?.includes("Announcement daily limit reached")) throw new Error("يمكن إرسال ثلاثة إعلانات خلال ٢٤ ساعة. حاول لاحقًا.");
    throw new Error("wallet_job_unavailable");
  }
  const job = (Array.isArray(data) ? data[0] : data) as { id?: string; created?: boolean; delivery_state?: Partial<WalletDeliveryResult> } | null;
  if (!job?.id || typeof job.created !== "boolean") throw new Error("wallet_job_unavailable");
  if (!job.created) {
    const prior = skipped();
    for (const provider of ["apple", "google"] as const) {
      const state = job.delivery_state?.[provider];
      if (state && ["accepted", "skipped", "failed"].includes(state.status)) prior[provider] = state;
      else prior[provider].pending = true;
    }
    return prior;
  }
  const id = job.id;
  let result: WalletDeliveryResult;
  try { result = await deliverBrandMessage(cafeId, title, body, id); }
  catch (error) { result = { apple: providerFailed(error), google: providerFailed(error) }; }
  await finishJob(id, result);
  return result;
}
