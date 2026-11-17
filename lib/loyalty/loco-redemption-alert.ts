import "server-only";

import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
import { isGreenApiLoyaltyWelcomeReady, sendGreenApiLoyaltyWelcome } from "@/lib/whatsapp/green-api";

// Loco only (user request 2026-11-17): each committed reward redemption sends one WhatsApp
// notice from the Branda platform number to the brand number with the customer and the employee

function alertEventId(cafeId: string, rewardId: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("ALERT_STORAGE_NOT_CONFIGURED");
  const hex = createHmac("sha256", secret).update(`reward-redeemed-alert:${cafeId}:${rewardId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function localPhone(phone: string | null | undefined) {
  const digits = normalizeSaudiPhone(String(phone ?? ""));
  return digits ? `0${digits.slice(3)}` : "غير مسجل";
}

export function locoRewardRedeemedMessage(input: { brandName: string; customerName: string; customerPhone: string; rewardTitle: string; redeemedBy: string; redeemedAt: Date }) {
  const time = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(input.redeemedAt);
  return [
    `تم صرف مكافأة في ${input.brandName}`,
    `العميل: ${input.customerName}`,
    `رقم الجوال: ${input.customerPhone}`,
    `المكافأة: ${input.rewardTitle}`,
    `الموظف الذي صرف المكافأة: ${input.redeemedBy}`,
    `الوقت: ${time}`,
  ].join("\n");
}

/**
 * Call only after the redemption committed. Never throws; a failed or uncertain send is recorded and never retried,
 * so the owner can never receive the same notice twice
 */
export async function notifyLocoRewardRedeemed(input: { cafeId: string; rewardCode?: string; rewardInstanceId?: string; redeemedBy: string }) {
  if (input.cafeId !== LOCO_CAFE_ID || (!input.rewardCode && !input.rewardInstanceId)) return;
  try {
    const admin = createAdminClient();
    let query = admin.from("customer_reward_instances")
      .select("id,status,reward_title,redeemed_at,customer_profiles(full_name,phone)")
      .eq("cafe_id", input.cafeId);
    query = input.rewardInstanceId ? query.eq("id", input.rewardInstanceId) : query.eq("reward_code", input.rewardCode as string);
    const { data: reward } = await query.maybeSingle();
    if (!reward || reward.status !== "redeemed") return;

    const [cafe, settings] = await Promise.all([
      admin.from("cafes").select("name,owner_user_id").eq("id", input.cafeId).maybeSingle(),
      admin.from("cafe_settings").select("whatsapp").eq("cafe_id", input.cafeId).maybeSingle(),
    ]);
    if (!cafe.data) return;
    // The brand WhatsApp number from settings, otherwise the owner's account phone
    let recipient = normalizeSaudiPhone(String(settings.data?.whatsapp ?? ""));
    if (!recipient && cafe.data.owner_user_id) {
      const owner = await admin.from("profiles").select("phone").eq("id", cafe.data.owner_user_id).maybeSingle();
      recipient = normalizeSaudiPhone(String(owner.data?.phone ?? ""));
    }
    if (!recipient) return;

    const customer = (Array.isArray(reward.customer_profiles) ? reward.customer_profiles[0] : reward.customer_profiles) as { full_name?: string | null; phone?: string | null } | null;
    const message = locoRewardRedeemedMessage({
      brandName: String(cafe.data.name), customerName: customer?.full_name?.trim() || "عميل الولاء",
      customerPhone: localPhone(customer?.phone), rewardTitle: String(reward.reward_title ?? "مكافأة"),
      redeemedBy: input.redeemedBy.trim() || "موظف الكاشير", redeemedAt: reward.redeemed_at ? new Date(String(reward.redeemed_at)) : new Date(),
    });

    // One notice per reward: the deterministic event id is claimed before sending
    const id = alertEventId(input.cafeId, String(reward.id));
    const claimed = await admin.from("cafe_operation_events").insert({
      id, cafe_id: input.cafeId, event_type: "loyalty_reward_redeemed_alert", actor_type: "system",
      entity_type: "customer_reward", entity_id: String(reward.id), metadata: { status: "sending" },
    });
    if (claimed.error) return;

    let status: "queued" | "rejected" | "unknown" | "not_configured" = "not_configured";
    let providerMessageId: string | undefined;
    if (await isGreenApiLoyaltyWelcomeReady()) {
      try {
        const outcome = await sendGreenApiLoyaltyWelcome({ phone: recipient, message });
        status = outcome.status; providerMessageId = outcome.providerMessageId;
      } catch { status = "unknown"; }
    }
    await admin.from("cafe_operation_events").update({ metadata: { status, ...(providerMessageId ? { providerMessageId } : {}) } }).eq("id", id).eq("cafe_id", input.cafeId);
  } catch (error) {
    console.warn("[loco-reward-alert] skipped", error instanceof Error ? error.message : "unknown");
  }
}
