import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCashierToken } from "@/lib/data/cashier";
import { getCafeBySlug } from "@/lib/data/cafes";
import {
  createBarndaksaQrPayload,
  parseBarndaksaQrPayload,
} from "@/lib/loyalty/secure-qr-payload";

export type CustomerRewardSourceType = "loyalty" | "experience";
export type CustomerRewardStatus =
  | "available"
  | "redeemed"
  | "expired"
  | "cancelled";

export type CustomerRewardInstance = {
  id: string;
  cafeId: string;
  customerId: string | null;
  customerName: string;
  loyaltyCardId: string | null;
  sourceType: CustomerRewardSourceType;
  sourceId: string | null;
  rewardDefinitionId: string | null;
  rewardTitle: string;
  rewardDescription: string;
  rewardCode: string;
  qrPayload: string;
  status: CustomerRewardStatus;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  metadata: Record<string, unknown>;
};

export type CashierRewardPreview = CustomerRewardInstance & {
  canRedeem: boolean;
  invalidReason: string | null;
  remainingText: string;
};

function rewardCodeFromInput(rawValue: string) {
  const raw = rawValue.trim();
  const parsed =
    parseBarndaksaQrPayload(raw, "customer-reward") ??
    parseBarndaksaQrPayload(raw, "experience-reward") ??
    raw;
  return parsed.trim().toUpperCase();
}

function mapReward(row: Record<string, unknown>): CustomerRewardInstance {
  const customer = Array.isArray(row.customer_profiles)
    ? row.customer_profiles[0]
    : row.customer_profiles;
  const customerRecord =
    customer && typeof customer === "object"
      ? (customer as Record<string, unknown>)
      : null;

  return {
    id: String(row.id),
    cafeId: String(row.cafe_id ?? ""),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: customerRecord?.full_name
      ? String(customerRecord.full_name)
      : "عميل",
    loyaltyCardId: row.loyalty_card_id ? String(row.loyalty_card_id) : null,
    sourceType: String(row.source_type ?? "loyalty") as CustomerRewardSourceType,
    sourceId: row.source_id ? String(row.source_id) : null,
    rewardDefinitionId: row.reward_definition_id
      ? String(row.reward_definition_id)
      : null,
    rewardTitle: String(row.reward_title ?? "مكافأة"),
    rewardDescription: String(row.reward_description ?? ""),
    rewardCode: String(row.reward_code ?? ""),
    qrPayload: String(row.qr_payload ?? ""),
    status: String(row.status ?? "available") as CustomerRewardStatus,
    issuedAt: String(row.issued_at ?? row.created_at ?? ""),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    redeemedAt: row.redeemed_at ? String(row.redeemed_at) : null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.ceil((expiresAt.getTime() - today.getTime()) / 86_400_000);
}

function previewFromReward(
  reward: CustomerRewardInstance,
  options?: { loyaltyCardEnabled?: boolean },
): CashierRewardPreview {
  const remainingDays = daysUntil(reward.expiresAt);
  const isExpired =
    reward.status === "expired" ||
    (remainingDays !== null && remainingDays < 0);
  const invalidReason =
    reward.sourceType === "loyalty" && options?.loyaltyCardEnabled === false
      ? "بطاقة الولاء موقوفة لهذه العلامة"
      : reward.status === "redeemed"
      ? "تم استخدام هذه المكافأة مسبقًا"
      : reward.status === "cancelled"
        ? "هذه المكافأة ملغاة"
        : isExpired
          ? "انتهت صلاحية هذه المكافأة"
          : reward.status !== "available"
            ? "هذه المكافأة غير قابلة للصرف"
            : null;

  return {
    ...reward,
    canRedeem: !invalidReason,
    invalidReason,
    remainingText:
      remainingDays === null
        ? ""
        : remainingDays >= 0
          ? `باقي ${remainingDays} يوم`
          : "انتهت",
  };
}

async function isLoyaltyCardProgramEnabled(
  admin: ReturnType<typeof createAdminClient>,
  cafeId: string,
) {
  const { data, error } = await admin
    .from("cafe_loyalty_programs")
    .select("enabled")
    .eq("cafe_id", cafeId)
    .maybeSingle();

  if (error) throw error;
  return data ? Boolean(data.enabled) : true;
}

async function getValidCashierSession() {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");

  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from("cafe_cashier_sessions")
    .select("id,cafe_id,cashier_id,expires_at,revoked_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!session || session.revoked_at) {
    throw new Error("جلسة الكاشير منتهية");
  }

  return {
    admin,
    session,
    token,
    cafeId: String(session.cafe_id),
    cashierId: String(session.cashier_id),
  };
}

export async function getCustomerRewardInstances(
  cafeSlug: string,
  customerProfileId: string,
  limit = 50,
): Promise<CustomerRewardInstance[]> {
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) return [];

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("customer_profiles")
    .select("id")
    .eq("id", customerProfileId)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return [];

  const { data, error } = await admin
    .from("customer_reward_instances")
    .select("*, customer_profiles(full_name)")
    .eq("cafe_id", cafe.id)
    .eq("customer_id", customerProfileId)
    .order("issued_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const loyaltyCardEnabled = await isLoyaltyCardProgramEnabled(admin, cafe.id);
  return ((data ?? []) as Record<string, unknown>[])
    .map(mapReward)
    .filter(
      (reward) =>
        reward.sourceType !== "loyalty" || loyaltyCardEnabled,
    );
}

export async function upsertExperienceCustomerRewardInstance(input: {
  cafeId: string;
  customerId: string;
  submissionId: string;
  rewardCode: string;
  rewardTitle: string;
  rewardDescription?: string | null;
  expiresAt?: string | null;
}) {
  const parsed = z.object({
    cafeId: z.string().uuid(),
    customerId: z.string().uuid(),
    submissionId: z.string().uuid(),
    rewardCode: z.string().min(3).max(120),
    rewardTitle: z.string().min(1).max(160),
    rewardDescription: z.string().max(1000).nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  }).parse(input);

  const admin = createAdminClient();
  const rewardCode = parsed.rewardCode.trim().toUpperCase();
  const qrPayload = createBarndaksaQrPayload("customer-reward", rewardCode);

  const { data: existing, error: existingError } = await admin
    .from("customer_reward_instances")
    .select("id,status")
    .eq("source_type", "experience")
    .eq("source_id", parsed.submissionId)
    .maybeSingle();

  if (existingError) throw existingError;

  const payload = {
    cafe_id: parsed.cafeId,
    customer_id: parsed.customerId,
    source_type: "experience",
    source_id: parsed.submissionId,
    reward_title: parsed.rewardTitle,
    reward_description: parsed.rewardDescription ?? null,
    reward_code: rewardCode,
    qr_payload: qrPayload,
    status: existing?.status === "redeemed" ? "redeemed" : "available",
    expires_at: parsed.expiresAt ?? null,
    metadata: { source: "experience_reward_submission" },
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await admin
        .from("customer_reward_instances")
        .update(payload)
        .eq("id", String(existing.id))
    : await admin.from("customer_reward_instances").insert(payload);

  if (error) throw error;
}

async function findCashierReward(rawRewardCode: string) {
  const code = rewardCodeFromInput(rawRewardCode);
  if (!code) throw new Error("QR المكافأة مطلوب");

  const context = await getValidCashierSession();
  const { data, error } = await context.admin
    .from("customer_reward_instances")
    .select("*, customer_profiles(full_name,phone,email)")
    .eq("reward_code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("مكافأة غير موجودة");

  const reward = mapReward(data as Record<string, unknown>);
  if (reward.cafeId !== context.cafeId) {
    throw new Error("هذه المكافأة تابعة لعلامة تجارية أخرى");
  }

  const loyaltyCardEnabled =
    reward.sourceType === "loyalty"
      ? await isLoyaltyCardProgramEnabled(context.admin, context.cafeId)
      : true;

  return { ...context, reward, code, loyaltyCardEnabled };
}

export async function lookupCashierCustomerReward(
  rawRewardCode: string,
): Promise<CashierRewardPreview> {
  const { reward, loyaltyCardEnabled } = await findCashierReward(rawRewardCode);
  return previewFromReward(reward, { loyaltyCardEnabled });
}

export async function redeemCashierCustomerReward(rawRewardCode: string) {
  const { admin, reward, code, cafeId, cashierId, loyaltyCardEnabled } =
    await findCashierReward(rawRewardCode);
  const preview = previewFromReward(reward, { loyaltyCardEnabled });
  if (!preview.canRedeem) {
    throw new Error(preview.invalidReason ?? "هذه المكافأة غير قابلة للصرف");
  }

  const redeemedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("customer_reward_instances")
    .update({
      status: "redeemed",
      redeemed_at: redeemedAt,
      metadata: {
        ...reward.metadata,
        redeemedByCashierId: cashierId,
      },
      updated_at: redeemedAt,
    })
    .eq("id", reward.id)
    .eq("cafe_id", cafeId)
    .eq("status", "available")
    .select("id")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) throw new Error("تم استخدام هذه المكافأة مسبقًا");

  const { error: redemptionError } = await admin
    .from("customer_reward_redemptions")
    .insert({
      cafe_id: cafeId,
      reward_instance_id: reward.id,
      customer_id: reward.customerId,
      redeemed_by_cashier_id: cashierId,
      scanned_code: code,
      status: "redeemed",
    });

  if (redemptionError) throw redemptionError;

  if (reward.sourceType === "experience" && reward.sourceId) {
    await admin
      .from("experience_reward_submissions")
      .update({
        status: "redeemed",
        used_at: redeemedAt,
        used_by_cashier_id: cashierId,
        updated_at: redeemedAt,
      })
      .eq("id", reward.sourceId)
      .eq("cafe_id", cafeId)
      .is("used_at", null);
  }

  if (reward.sourceType === "loyalty" && reward.loyaltyCardId) {
    const { data: card } = await admin
      .from("loyalty_cards")
      .select("available_rewards")
      .eq("id", reward.loyaltyCardId)
      .eq("cafe_id", cafeId)
      .maybeSingle();
    const nextRewards = Math.max(0, Number(card?.available_rewards ?? 1) - 1);
    await admin
      .from("loyalty_cards")
      .update({
        available_rewards: nextRewards,
        last_used_at: redeemedAt,
        updated_at: redeemedAt,
      })
      .eq("id", reward.loyaltyCardId)
      .eq("cafe_id", cafeId);
  }

  await admin.from("cafe_cashier_activity_logs").insert({
    cafe_id: cafeId,
    cashier_id: cashierId,
    action_type: "loyalty_redeem",
    target_type: "customer_reward_instance",
    target_id: reward.id,
    invoice_barcode: code,
    details: {
      source: reward.sourceType,
      customerName: reward.customerName,
      rewardCode: code,
      rewardName: reward.rewardTitle,
      expiresAt: reward.expiresAt,
    },
  });

  return {
    ok: true,
    rewardInstanceId: reward.id,
    customerName: reward.customerName,
    rewardName: reward.rewardTitle,
    rewardType:
      reward.sourceType === "loyalty"
        ? "مكافأة ولاء"
        : "مكافأة توثيق تجربة",
    rewardCode: code,
    issuedAt: reward.issuedAt,
    expiresAt: reward.expiresAt ?? "",
    remainingText: preview.remainingText,
    status: "تم الصرف",
    sourceType: reward.sourceType,
    items: [
      {
        id: reward.id,
        productId: "",
        productName: reward.rewardTitle,
        quantity: 1,
      },
    ],
  };
}
