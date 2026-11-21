import "server-only";
import { brandAllowsNewWork } from '@/lib/data/account-cancellation';
import { createAdminClient } from "@/lib/supabase/admin";
import { createLoyaltySessionToken, loyaltyIdentityHash } from "@/lib/auth/loyalty-session-token";
import { isGreenApiLoyaltyWelcomeReady, sendGreenApiCustomerMessage, sendGreenApiLoyaltyWelcome } from "@/lib/whatsapp/green-api";
import { selectLocoLoyaltySender, selectBrandLoyaltySender } from "@/lib/whatsapp/customer-routing";
import { LOCO_CAFE_ID, WAHED_MASOUB_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
import { selectNotificationSender } from "@/lib/whatsapp/notification-sender";
import { getGoogleWalletSaveState } from "@/lib/wallet/google";

type CardLinkJob = { id: string; claimToken: string; cafeId: string; profileId: string; cardId: string; brandSlug: string; brandName: string; phone: string; cardCreated: boolean; googleIssued: boolean };
export function stampCardLinkMessage(job: CardLinkJob) {
  if (!/^[a-z0-9-]{1,80}$/.test(job.brandSlug) || !/^9665\d{8}$/.test(job.phone)) throw new Error("invalid_card_link_job");
  const token = createLoyaltySessionToken({ slug: job.brandSlug, cafeId: job.cafeId, profileId: job.profileId, phoneHash: loyaltyIdentityHash(job.phone) });
  const link = `https://barndaksa.com/loyalty/${job.brandSlug}/access?token=${encodeURIComponent(token)}`;
  const name = job.brandName.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, 180);
  return [ `يا هلا فيك في ${name}`, job.cardCreated ? "بطاقة الولاء جاهزة وسجّلنا فيها أول ختم لك" : "تم تسجيل ختمك في بطاقة الولاء", "افتح الرابط لعرض بطاقتك وتحميلها إلى المحفظة", link, "في زيارتك القادمة اعرض بطاقتك للكاشير لتسجيل ختمك" ].join("\n\n");
}
export async function dispatchStampCardLinks(limit = 2) {
  const startedAt = Date.now();
  const result = { processed: 0, queued: 0, rejected: 0, unknown: 0, skipped: 0, deferred: 0 };
  const [primaryReady, locoSender, wahedSender, notifySender] = await Promise.all([isGreenApiLoyaltyWelcomeReady(), selectLocoLoyaltySender(LOCO_CAFE_ID), selectBrandLoyaltySender(WAHED_MASOUB_CAFE_ID), selectNotificationSender()]);
  // Card links of brands without their own sender leave from the notifications number (second standby). Branda's
  // primary and first standby carry them only when that number is unavailable and the access-only switch is off.
  // While the switch is on and the notifications number is unavailable, the jobs are still claimed and closed as
  // skipped, so nothing waits in the queue and goes out late. Brand-owned senders keep sending
  // The same build-time switch that isPlatformAccessOnly reads in lib/whatsapp/green-api.ts
  const paused = process.env.BRANDA_ACCESS_MESSAGES_ONLY?.trim() === "true";
  const drain = paused && !notifySender;
  const claimPlatform = primaryReady || paused || Boolean(notifySender);
  if (!claimPlatform && !locoSender && !wahedSender) return result;
  const admin = createAdminClient();
  const sendBudget = Math.min(5, Math.max(1, limit));
  let sends = 0;
  for (let index = 0; index < (drain ? 40 : sendBudget) && sends < sendBudget && (index === 0 || Date.now() - startedAt < 70_000); index++) {
    const { data, error } = await admin.rpc("claim_stamp_card_link_v2", { p_primary_ready: claimPlatform, p_loco_ready: Boolean(locoSender), p_wahed_ready: Boolean(wahedSender) });
    if (error) throw new Error("stamp_card_link_claim_unavailable");
    if (!data) break;
    const job = data as CardLinkJob;
    const finish = async (status: "queued" | "rejected" | "unknown" | "skipped" | "deferred", providerMessageId?: string) => {
      const { data: saved, error: saveError } = await admin.rpc("finish_stamp_card_link_v2", { p_id: job.id, p_token: job.claimToken, p_status: status, p_provider_message_id: providerMessageId ?? null });
      if (saveError || !saved) throw new Error("stamp_card_link_result_unavailable");
      result.processed++; result[status]++;
    };
    const usesPlatformNumber = job.cafeId !== LOCO_CAFE_ID && !(job.cafeId === WAHED_MASOUB_CAFE_ID && wahedSender);
    if (drain && usesPlatformNumber) { await finish("skipped"); continue; }
    if (!await brandAllowsNewWork(job.cafeId)) { await finish('skipped'); continue; }
    if (job.googleIssued) {
      let saved: boolean;
      try { saved = await getGoogleWalletSaveState({ cafeId: job.cafeId, cardId: job.cardId }); }
      catch { await finish("deferred"); continue; }
      if (saved) { await finish("skipped"); continue; }
    }
    let outcome: Awaited<ReturnType<typeof sendGreenApiLoyaltyWelcome>>;
    try {
      const input = { phone: job.phone, message: stampCardLinkMessage(job) };
      if (!await brandAllowsNewWork(job.cafeId)) { await finish('skipped'); continue; }
      sends++;
      outcome = job.cafeId === LOCO_CAFE_ID
        ? locoSender ? await sendGreenApiCustomerMessage(locoSender, input) : { status: "rejected" }
        : job.cafeId === WAHED_MASOUB_CAFE_ID && wahedSender ? await sendGreenApiCustomerMessage(wahedSender, input)
        : notifySender ? await sendGreenApiCustomerMessage(notifySender, input)
        : primaryReady ? await sendGreenApiLoyaltyWelcome(input) : { status: "rejected" };
    } catch { outcome = { status: "unknown" }; }
    await finish(outcome.status, outcome.providerMessageId);
  }
  return result;
}
