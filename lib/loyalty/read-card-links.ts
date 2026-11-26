import "server-only";
import { canonicalBrandMobile } from "@/lib/auth/brand-phone";
import { brandAllowsNewWork } from '@/lib/data/account-cancellation';
import { createAdminClient } from "@/lib/supabase/admin";
import { createLoyaltySessionToken, loyaltyIdentityHash } from "@/lib/auth/loyalty-session-token";
import { isGreenApiLoyaltyWelcomeReady, sendGreenApiCustomerMessage, sendGreenApiLoyaltyWelcome } from "@/lib/whatsapp/green-api";
import { selectLocoLoyaltySender, selectBrandLoyaltySender } from "@/lib/whatsapp/customer-routing";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
import { selectNotificationSender } from "@/lib/whatsapp/notification-sender";
import { getGoogleWalletSaveState } from "@/lib/wallet/google";

type CardLinkJob = { id: string; claimToken: string; cafeId: string; profileId: string; cardId: string; brandSlug: string; brandName: string; phone: string; cardCreated: boolean; googleIssued: boolean; privateSenderRequested: boolean; stampsInCycle?: number | null; purchasesRequired?: number | null; rewardName?: string | null };
const BOLINGO_CAFE_ID = "dbe942ba-dfa4-422b-a9f6-9527c3b27cc9";
/** Brands explicitly authorized to send card links through Branda's notifications number. */
export const PLATFORM_CARD_LINK_CAFE_IDS: ReadonlySet<string> = new Set([
  BOLINGO_CAFE_ID,
  "49a6e788-1650-48d7-b8f8-4d65e8bcfd37", // Atheer Spa
]);
/** `rating` is the text for a brand named above: it suits stamps and points alike and closes with a rating that
 * invites a reply. Brands with their own sender keep the original text */
export function stampCardLinkMessage(job: Pick<CardLinkJob, "cafeId" | "profileId" | "brandSlug" | "brandName" | "phone" | "cardCreated">, options: { rating?: boolean } = {}) {
  if (!/^[a-z0-9-]{1,80}$/.test(job.brandSlug) || !canonicalBrandMobile.test(job.phone)) throw new Error("invalid_card_link_job");
  const token = createLoyaltySessionToken({ slug: job.brandSlug, cafeId: job.cafeId, profileId: job.profileId, phoneHash: loyaltyIdentityHash(job.phone) });
  const link = `https://barndaksa.com/loyalty/${job.brandSlug}/access?token=${encodeURIComponent(token)}`;
  const name = job.brandName.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, 180);
  if (options.rating) return [ `يا هلا فيك في ${name}`, job.cardCreated ? "بطاقة الولاء جاهزة باسمك" : "تم تحديث رصيدك في بطاقة الولاء", "افتح الرابط لعرض بطاقتك وتحميلها إلى المحفظة", link, `قيّم تجربتك مع ${name} من 1 إلى 5 بالرد برقم` ].join("\n\n");
  return [ `يا هلا فيك في ${name}`, job.cardCreated ? "بطاقة الولاء جاهزة وسجّلنا فيها أول ختم لك" : "تم تسجيل ختمك في بطاقة الولاء", "افتح الرابط لعرض بطاقتك وتحميلها إلى المحفظة", link, "في زيارتك القادمة اعرض بطاقتك للكاشير لتسجيل ختمك" ].join("\n\n");
}
/** The only loyalty message Branda's own numbers send since 2026-11-22: a stamp completed the card and a reward
 * is waiting. It speaks in the brand's name, carries the card link, and closes with a rating to invite a reply. */
export function rewardNoticeMessage(job: CardLinkJob) {
  if (!/^[a-z0-9-]{1,80}$/.test(job.brandSlug) || !canonicalBrandMobile.test(job.phone)) throw new Error("invalid_card_link_job");
  const token = createLoyaltySessionToken({ slug: job.brandSlug, cafeId: job.cafeId, profileId: job.profileId, phoneHash: loyaltyIdentityHash(job.phone) });
  const link = `https://barndaksa.com/loyalty/${job.brandSlug}/access?token=${encodeURIComponent(token)}`;
  const clean = (value: unknown, max: number) => String(value ?? "").replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, max);
  const name = clean(job.brandName, 180), reward = clean(job.rewardName, 120);
  return [ `مبروك، استحقيت مكافأة من ${name}`, reward ? `مكافأتك: ${reward}` : "مكافأتك جاهزة في بطاقة الولاء", "حمّل بطاقتك من الرابط واعرضها للكاشير عند الاستلام", link, `قيّم تجربتك مع ${name} من 1 إلى 5 بالرد برقم` ].join("\n\n");
}
export async function dispatchStampCardLinks(limit = 2) {
  const startedAt = Date.now();
  const result = { processed: 0, queued: 0, rejected: 0, unknown: 0, skipped: 0, deferred: 0 };
  const [primaryReady, locoSender, readyNotifySender] = await Promise.all([isGreenApiLoyaltyWelcomeReady(), selectLocoLoyaltySender(LOCO_CAFE_ID), selectNotificationSender()]);
  // User decision of 2026-11-22 (BRANDA_PLATFORM_CARD_LINKS "off" in next.config.ts): Branda's own numbers, the
  // notifications number included, no longer send the card link after a stamp. Their jobs are claimed and closed
  // as skipped so nothing waits. Brands with their own sender are not affected
  const platformOff = process.env.BRANDA_PLATFORM_CARD_LINKS?.trim() === "off";
  const notifySender = platformOff ? null : readyNotifySender;
  // BRANDA_REWARD_NOTICES "on": the one exception. When a stamp completes the card, the notifications number
  // tells the customer, in the brand's name, that a reward is waiting
  const rewardSender = platformOff && process.env.BRANDA_REWARD_NOTICES?.trim() === "on" ? readyNotifySender : null;
  // Card links of brands without their own sender leave from the notifications number (second standby). Branda's
  // primary and first standby carry them only when that number is unavailable and the access-only switch is off.
  // While the switch is on and the notifications number is unavailable, the jobs are still claimed and closed as
  // skipped, so nothing waits in the queue and goes out late. Brand-owned senders keep sending
  // The same build-time switch that isPlatformAccessOnly reads in lib/whatsapp/green-api.ts
  const paused = process.env.BRANDA_ACCESS_MESSAGES_ONLY?.trim() === "true";
  const drain = platformOff || (paused && !notifySender);
  const claimPlatform = primaryReady || paused || Boolean(notifySender) || platformOff;
  const admin = createAdminClient();
  const sendBudget = Math.min(5, Math.max(1, limit));
  let sends = 0;
  for (let index = 0; index < (drain ? 40 : sendBudget) && sends < sendBudget && (index === 0 || Date.now() - startedAt < 70_000); index++) {
    const { data, error } = await admin.rpc("claim_stamp_card_link_v3", { p_primary_ready: claimPlatform, p_loco_ready: Boolean(locoSender) });
    if (error) throw new Error("stamp_card_link_claim_unavailable");
    if (!data) break;
    const job = data as CardLinkJob;
    const finish = async (status: "queued" | "rejected" | "unknown" | "skipped" | "deferred", providerMessageId?: string) => {
      const { data: saved, error: saveError } = await admin.rpc("finish_stamp_card_link_v2", { p_id: job.id, p_token: job.claimToken, p_status: status, p_provider_message_id: providerMessageId ?? null });
      if (saveError || !saved) throw new Error("stamp_card_link_result_unavailable");
      result.processed++; result[status]++;
    };
    const privateSender = job.cafeId === LOCO_CAFE_ID ? locoSender
      : job.privateSenderRequested ? await selectBrandLoyaltySender(job.cafeId) : null;
    if (!claimPlatform && !privateSender) { await finish("deferred"); continue; }
    const usesPlatformNumber = job.cafeId !== LOCO_CAFE_ID && !privateSender;
    // A stamp that completes the card sets the count back to zero, so zero right after a stamp means a reward was earned
    // A brand the user named keeps its card link while the platform switch is off, from the notifications number
    // only. Bolingo's points invoices report zero stamps even when no reward has been earned.
    const namedLink = Boolean(platformOff && usesPlatformNumber && readyNotifySender) && PLATFORM_CARD_LINK_CAFE_IDS.has(job.cafeId);
    const earnedReward = !(namedLink && job.cafeId === BOLINGO_CAFE_ID) && Boolean(drain && usesPlatformNumber && rewardSender) && job.stampsInCycle === 0 && Number(job.purchasesRequired) >= 1;
    if (drain && usesPlatformNumber && !earnedReward && !namedLink) { await finish("skipped"); continue; }
    if (!await brandAllowsNewWork(job.cafeId)) { await finish('skipped'); continue; }
    if (job.googleIssued) {
      let saved: boolean;
      try { saved = await getGoogleWalletSaveState({ cafeId: job.cafeId, cardId: job.cardId }); }
      catch { await finish("deferred"); continue; }
      if (saved) { await finish("skipped"); continue; }
    }
    let outcome: Awaited<ReturnType<typeof sendGreenApiLoyaltyWelcome>>;
    try {
      const input = { phone: job.phone, message: earnedReward ? rewardNoticeMessage(job) : stampCardLinkMessage(job, { rating: namedLink }) };
      if (!await brandAllowsNewWork(job.cafeId)) { await finish('skipped'); continue; }
      sends++;
      outcome = earnedReward ? await sendGreenApiCustomerMessage(rewardSender!, input)
        : namedLink ? await sendGreenApiCustomerMessage(readyNotifySender!, input)
        : privateSender ? await sendGreenApiCustomerMessage(privateSender, input)
        : job.cafeId === LOCO_CAFE_ID ? { status: "rejected" }
        : notifySender ? await sendGreenApiCustomerMessage(notifySender, input)
        : primaryReady ? await sendGreenApiLoyaltyWelcome(input) : { status: "rejected" };
    } catch { outcome = { status: "unknown" }; }
    await finish(outcome.status, outcome.providerMessageId);
  }
  return result;
}
