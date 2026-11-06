import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGreenApiLoyaltyWelcomeReady, sendGreenApiCustomerMessage, sendGreenApiLoyaltyWelcome } from "@/lib/whatsapp/green-api";
import { selectLocoCustomerSender } from "@/lib/whatsapp/customer-routing";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";

type Welcome = { id: string; claimToken: string; cafeId: string; brandName: string; phone: string; stamps: number; reward: string };
const line = (value: string) => value.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, 180);

export function walletWelcomeMessage(job: Welcome) {
  return [
    `يا هلا فيك في ${line(job.brandName)} 🌿`,
    "سعداء بانضمامك لبرنامج الولاء وبطاقتك جاهزة معك",
    `اجمع ${job.stamps} أختام واستمتع بمكافأتك: ${line(job.reward)}`,
    "في زيارتك القادمة اعرض بطاقة الولاء للكاشير لتسجيل ختمك",
    "نورتنا ونتشرف بزيارتك 🤍",
  ].join("\n\n");
}

/** Atomic DB claims deduplicate Apple/Google requests and concurrent cron workers */
export async function dispatchWalletWelcomes(cardId?: string, limit = 1) {
  const result = { processed: 0, queued: 0, rejected: 0, unknown: 0, deferred: false };
  const [primaryReady, locoSender] = await Promise.all([isGreenApiLoyaltyWelcomeReady(), selectLocoCustomerSender(LOCO_CAFE_ID)]);
  if (!primaryReady && !locoSender) return { ...result, deferred: true };
  const admin = createAdminClient();
  for (let index = 0; index < Math.min(5, Math.max(1, limit)); index++) {
    const { data, error } = await admin.rpc("claim_routed_wallet_welcome", { p_card_id: cardId ?? null, p_primary_ready: primaryReady, p_loco_ready: Boolean(locoSender) });
    if (error) throw new Error("wallet_welcome_claim_unavailable");
    if (!data) break;
    const job = data as Welcome;
    let outcome: Awaited<ReturnType<typeof sendGreenApiLoyaltyWelcome>>;
    try {
      const input = { phone: job.phone, message: walletWelcomeMessage(job) };
      if (job.cafeId === LOCO_CAFE_ID) {
        outcome = locoSender ? await sendGreenApiCustomerMessage(locoSender, input) : { status: "rejected" };
      } else {
        outcome = primaryReady ? await sendGreenApiLoyaltyWelcome(input) : { status: "rejected" };
      }
    }
    catch { outcome = { status: "unknown" }; }
    const { data: saved, error: saveError } = await admin.rpc("finish_wallet_welcome", {
      p_id: job.id, p_token: job.claimToken, p_status: outcome.status, p_provider_message_id: outcome.providerMessageId ?? null,
    });
    if (saveError || !saved) throw new Error("wallet_welcome_result_unavailable");
    result.processed++;
    result[outcome.status]++;
  }
  return result;
}

export async function welcomeAfterWalletDownload(cardId: string) {
  try { await dispatchWalletWelcomes(cardId); }
  catch { console.error("wallet_welcome_background_failed"); }
}
