import "server-only";
import { brandAllowsNewWork } from '@/lib/data/account-cancellation';
import { createAdminClient } from "@/lib/supabase/admin";
import { createLoyaltySessionToken, loyaltyIdentityHash } from "@/lib/auth/loyalty-session-token";
import { isGreenApiLoyaltyWelcomeReady, sendGreenApiCustomerMessage, sendGreenApiLoyaltyWelcome } from "@/lib/whatsapp/green-api";
import { selectLocoLoyaltySender } from "@/lib/whatsapp/customer-routing";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
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
  const result = { processed: 0, queued: 0, rejected: 0, unknown: 0, skipped: 0, deferred: 0 };
  const [primaryReady, locoSender] = await Promise.all([isGreenApiLoyaltyWelcomeReady(), selectLocoLoyaltySender(LOCO_CAFE_ID)]);
  if (!primaryReady && !locoSender) return result;
  const admin = createAdminClient();
  for (let index = 0; index < Math.min(5, Math.max(1, limit)); index++) {
    const { data, error } = await admin.rpc("claim_stamp_card_link_v2", { p_primary_ready: primaryReady, p_loco_ready: Boolean(locoSender) });
    if (error) throw new Error("stamp_card_link_claim_unavailable");
    if (!data) break;
    const job = data as CardLinkJob;
    const finish = async (status: "queued" | "rejected" | "unknown" | "skipped" | "deferred", providerMessageId?: string) => {
      const { data: saved, error: saveError } = await admin.rpc("finish_stamp_card_link_v2", { p_id: job.id, p_token: job.claimToken, p_status: status, p_provider_message_id: providerMessageId ?? null });
      if (saveError || !saved) throw new Error("stamp_card_link_result_unavailable");
      result.processed++; result[status]++;
    };
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
      outcome = job.cafeId === LOCO_CAFE_ID
        ? locoSender ? await sendGreenApiCustomerMessage(locoSender, input) : { status: "rejected" }
        : primaryReady ? await sendGreenApiLoyaltyWelcome(input) : { status: "rejected" };
    } catch { outcome = { status: "unknown" }; }
    await finish(outcome.status, outcome.providerMessageId);
  }
  return result;
}
