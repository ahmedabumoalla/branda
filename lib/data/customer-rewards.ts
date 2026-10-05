import { z } from "zod";
import { randomUUID } from "node:crypto";
import { assertRastLoyaltyEntitlement } from "@/lib/data/rast-loyalty-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCashierSessionContext } from "@/lib/data/cashier";
import { operationEventTypes, recordOperationEvent } from "@/lib/data/operation-events";
import { getCafeBySlug } from "@/lib/data/cafes";
import { rastRedemptionCode } from "@/lib/loyalty/rast-redemption-code";
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
  options?: { loyaltyCardEnabled?: boolean; exactExpiry?: boolean },
): CashierRewardPreview {
  const remainingDays = daysUntil(reward.expiresAt);
  const isExpired =
    reward.status === "expired" ||
    (options?.exactExpiry
      ? reward.expiresAt !== null && Date.parse(reward.expiresAt) <= Date.now()
      : remainingDays !== null && remainingDays < 0);
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
  const admin = createAdminClient();
  const session = await requireCashierSessionContext(admin);
  return { admin, ...session };
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
    .eq("cafe_id", context.cafeId)
    .eq("reward_code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("مكافأة غير موجودة");

  const reward = mapReward(data as Record<string, unknown>);
  if (reward.cafeId !== context.cafeId) {
    throw new Error("هذه المكافأة تابعة لعلامة تجارية أخرى");
  }

  if (context.cafeSlug === "rast" && reward.sourceType === "loyalty") {
    await assertRastLoyaltyEntitlement(context.cafeId);
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
  const { reward, loyaltyCardEnabled, cafeSlug, admin, token, code } = await findCashierReward(rawRewardCode);
  if (cafeSlug === "rast" && reward.sourceType === "loyalty") {
    const { data, error } = await admin.rpc("preview_loyalty_reward", {
      p_session_token: token, p_reward_code: code,
    });
    if (error || data?.ok !== true) throw new Error("تعذر قراءة المكافأة. تحقق من صلاحية البطاقة وجلسة الموظف.");
  }
  return previewFromReward(reward, { loyaltyCardEnabled, exactExpiry: cafeSlug === "rast" });
}

export async function lookupRastCashierReward(rawCode: string): Promise<CashierRewardPreview> {
  const code = rastRedemptionCode(rawCode);
  const { admin, token, cafeId, cafeSlug } = await getValidCashierSession();
  if (cafeSlug !== "rast") throw new Error("هذه العملية غير متاحة لهذه العلامة.");
  await assertRastLoyaltyEntitlement(cafeId);

  const { data: card, error: cardError } = await admin.from("loyalty_cards")
    .select("id,customer_profile_id").eq("cafe_id", cafeId).eq("card_code", code).maybeSingle();
  if (cardError) throw new Error("تعذر فحص البطاقة. حاول مرة أخرى.");
  let rewardCode = code;
  if (card) {
    // Validate the active card/customer/program through the existing audited RPC.
    const { data: checked, error } = await admin.rpc("preview_loyalty_card", { p_session_token: token, p_card_code: code });
    if (error || checked?.ok !== true) throw new Error("البطاقة غير متاحة أو البرنامج موقوف.");
    if (!card.customer_profile_id) throw new Error("البطاقة غير مرتبطة بعميل صالح.");
    const { data: earned, error: rewardError } = await admin.from("customer_reward_instances")
      .select("reward_code").eq("cafe_id", cafeId).eq("loyalty_card_id", card.id)
      .eq("customer_id", card.customer_profile_id).eq("source_type", "loyalty").eq("status", "available")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false })
      .order("issued_at", { ascending: true }).order("id", { ascending: true }).limit(1).maybeSingle();
    if (rewardError) throw new Error("تعذر قراءة المكافآت. حاول مرة أخرى.");
    if (!earned) throw new Error("لا توجد مكافأة متاحة للصرف لهذه البطاقة. قد تكون صُرفت أو انتهت صلاحيتها.");
    rewardCode = String(earned.reward_code);
  }
  // Pin a real reward instance before confirmation; never redeem by selecting the next reward.
  const reward = await lookupCashierCustomerReward(rewardCode);
  if (reward.sourceType !== "loyalty" || (card && (reward.loyaltyCardId !== card.id || reward.customerId !== card.customer_profile_id))) {
    throw new Error("هذه المكافأة غير متاحة لهذه البطاقة.");
  }
  return reward;
}

export async function redeemCashierCustomerReward(rawRewardCode: string) {
  const { admin, reward, code, cafeId, cashierId, cashierName, cashierEmail, loyaltyCardEnabled, cafeSlug, token } =
    await findCashierReward(rawRewardCode);
  const preview = previewFromReward(reward, { loyaltyCardEnabled, exactExpiry: cafeSlug === "rast" });
  if (!preview.canRedeem) {
    throw new Error(preview.invalidReason ?? "هذه المكافأة غير قابلة للصرف");
  }

  if (cafeSlug === "rast" && reward.sourceType === "loyalty") {
    const { data, error } = await admin.rpc("execute_loyalty_audited_operation", {
      p_session_token: token, p_code: code, p_request_id: randomUUID(), p_operation: "redeem",
    });
    if (error || data?.ok !== true) throw new Error("تعذر صرف المكافأة. ربما صُرفت أو انتهت صلاحيتها.");
    const result = data as Record<string, unknown>;
    return {
      ok: true, rewardInstanceId: reward.id, customerName: reward.customerName,
      rewardName: reward.rewardTitle, rewardType: "مكافأة ولاء", rewardCode: code,
      issuedAt: reward.issuedAt, expiresAt: reward.expiresAt ?? "", remainingText: preview.remainingText,
      status: "تم الصرف", sourceType: reward.sourceType, cardCode: result.cardCode,
      items: [{ id: reward.id, productId: reward.rewardDefinitionId ?? "", productName: reward.rewardTitle, quantity: 1 }],
    };
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

  await recordOperationEvent({
    cafeId,
    eventType: operationEventTypes.rewardRedeemed,
    actorType: "cashier",
    actorId: cashierId,
    actorName: cashierName,
    actorEmail: cashierEmail,
    entityType: "customer_reward_instance",
    entityId: reward.id,
    metadata: {
      rewardCode: code,
      rewardName: reward.rewardTitle,
      rewardSource: reward.sourceType,
      customerName: reward.customerName,
      customerId: reward.customerId,
      loyaltyCardId: reward.loyaltyCardId,
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
