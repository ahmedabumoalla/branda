"use server";

import { getCustomerOrdersForProfile, getCustomerReservationsForProfile } from "@/lib/data/customers";
import { getCustomerLoyaltyCardViewForProfile } from "@/lib/data/loyalty-cards";
import { getCustomerExperienceRewardSubmissions } from "@/lib/data/experience-rewards";
import { getPublicLoyaltyBySlug } from "@/lib/data/loyalty";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { getCustomerSessionAction } from "@/app/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import type { LoyaltySettings } from "@/lib/mock/loyalty";

type CustomerAccountErrorCode = "invalid_session" | "load_failed";
const CUSTOMER_ACCOUNT_LOAD_ERROR =
  "تعذر تحميل بيانات الحساب. سجّل الدخول مرة أخرى أو أعد المحاولة.";

type CustomerLoyaltyPointsSnapshot = {
  balance: number;
  usedPoints: number;
  pointValueSar: number;
  minimumRedemptionPoints: number;
};

const emptyLoyaltyPoints: CustomerLoyaltyPointsSnapshot = {
  balance: 0,
  usedPoints: 0,
  pointValueSar: 0,
  minimumRedemptionPoints: 0,
};

function emptySnapshot(cafeSlug: string) {
  return {
    customer: null,
    cafeSlug,
    features: [] as string[],
    orders: [] as Awaited<ReturnType<typeof getCustomerOrdersForProfile>>,
    reservations: [] as Awaited<ReturnType<typeof getCustomerReservationsForProfile>>,
    loyalty: null as Awaited<ReturnType<typeof getCustomerLoyaltyCardViewForProfile>> | null,
    loyaltyPoints: emptyLoyaltyPoints,
    experienceRewards: [] as Awaited<ReturnType<typeof getCustomerExperienceRewardSubmissions>>,
  };
}

async function safeResult<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch (error) {
    console.error("[fetchCustomerAccountSnapshotAction:optional]", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return fallback;
  }
}

async function attachCustomerAvatarUrl(customer: BarndaksaCustomerSession) {
  if (!customer.avatarAssetId) return customer;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("customer-avatars")
    .createSignedUrl(customer.avatarAssetId, 10 * 60);

  if (error || !data?.signedUrl) return customer;
  return { ...customer, avatarUrl: data.signedUrl };
}

function firstActiveRedemptionRule(settings: LoyaltySettings) {
  return settings.redemptionRules.find((rule) => rule.enabled) ?? settings.redemptionRules[0] ?? null;
}

function resolvePointValueSar(settings: LoyaltySettings) {
  const redemptionRule = firstActiveRedemptionRule(settings);
  const pointsCost = Number(redemptionRule?.pointsCost ?? 0);
  if (!redemptionRule || pointsCost <= 0) return 0;
  if (redemptionRule.type === "fixed_discount" && Number(redemptionRule.discountAmount ?? 0) > 0) {
    return Math.round((Number(redemptionRule.discountAmount) / pointsCost) * 100) / 100;
  }
  return 0;
}

async function getCustomerLoyaltyAccountBalance(cafeId: string, customerProfileId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("loyalty_accounts")
    .select("balance")
    .eq("cafe_id", cafeId)
    .eq("customer_id", customerProfileId)
    .maybeSingle();

  if (error) throw error;
  return Math.max(0, Number(data?.balance ?? 0));
}

async function getCustomerUsedLoyaltyPoints(cafeId: string, customerProfileId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("loyalty_transactions")
    .select("amount")
    .eq("cafe_id", cafeId)
    .eq("customer_id", customerProfileId)
    .lt("amount", 0);

  if (error) throw error;
  return (data ?? []).reduce(
    (sum: number, row: { amount?: number | string | null }) => sum + Math.abs(Math.min(0, Number(row.amount ?? 0))),
    0,
  );
}

function logRewardsSnapshotLoad(input: {
  slug: string;
  resolvedCafeId: string | null;
  customerProfileCafeId: string | null;
  loyaltyCardCafeId: string | null;
  rewardsCount: number;
}) {
  console.info("[customer-rewards:load]", input);
}

export async function fetchCustomerAccountSnapshotAction(cafeSlug: string) {
  const normalizedSlug = cafeSlug.trim().toLowerCase();
  const snapshot = emptySnapshot(normalizedSlug);
  let resolvedCafeId: string | null = null;
  let customerProfileCafeId: string | null = null;

  try {
    const cafe = await getCafeBySlug(normalizedSlug);
    if (!cafe) {
      logRewardsSnapshotLoad({
        slug: normalizedSlug,
        resolvedCafeId: null,
        customerProfileCafeId: null,
        loyaltyCardCafeId: null,
        rewardsCount: 0,
      });

      return {
        success: false as const,
        code: "load_failed" as CustomerAccountErrorCode,
        error: CUSTOMER_ACCOUNT_LOAD_ERROR,
        errorCode: "load_failed" as CustomerAccountErrorCode,
        message: CUSTOMER_ACCOUNT_LOAD_ERROR,
        data: snapshot,
      };
    }
    resolvedCafeId = cafe.id;

    const customerSession = await getCustomerSessionAction(normalizedSlug);
    const customer = customerSession ? await attachCustomerAvatarUrl(customerSession) : null;
    if (!customer) {
      logRewardsSnapshotLoad({
        slug: normalizedSlug,
        resolvedCafeId: cafe.id,
        customerProfileCafeId: null,
        loyaltyCardCafeId: null,
        rewardsCount: 0,
      });

      return {
        success: false as const,
        code: "invalid_session" as CustomerAccountErrorCode,
        error: CUSTOMER_ACCOUNT_LOAD_ERROR,
        errorCode: "invalid_session" as CustomerAccountErrorCode,
        message: CUSTOMER_ACCOUNT_LOAD_ERROR,
        data: snapshot,
      };
    }

    const admin = createAdminClient();
    const { data: profileRow, error: profileError } = await admin
      .from("customer_profiles")
      .select("id,cafe_id")
      .eq("id", customer.id)
      .eq("cafe_id", cafe.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profileRow) {
      logRewardsSnapshotLoad({
        slug: normalizedSlug,
        resolvedCafeId: cafe.id,
        customerProfileCafeId: null,
        loyaltyCardCafeId: null,
        rewardsCount: 0,
      });

      return {
        success: false as const,
        code: "invalid_session" as CustomerAccountErrorCode,
        error: CUSTOMER_ACCOUNT_LOAD_ERROR,
        errorCode: "invalid_session" as CustomerAccountErrorCode,
        message: CUSTOMER_ACCOUNT_LOAD_ERROR,
        data: snapshot,
      };
    }

    customerProfileCafeId = String(profileRow.cafe_id ?? "");
    const features = await safeResult(getPublicCafeFeatureCodesBySlug(normalizedSlug), [] as string[]);

    const ordersEnabled = featureCodesAllow(features, "orders") || featureCodesAllow(features, "menu");
    const reservationsEnabled = featureCodesAllow(features, "reservations");
    const loyaltyEnabled = featureCodesAllow(features, "loyalty");
    const experienceEnabled = featureCodesAllow(features, "experience_reviews");

    const [orders, reservations, loyalty, experienceRewards] = await Promise.all([
      ordersEnabled
        ? safeResult(getCustomerOrdersForProfile(normalizedSlug, customer.id, 5), snapshot.orders)
        : Promise.resolve(snapshot.orders),
      reservationsEnabled
        ? safeResult(getCustomerReservationsForProfile(normalizedSlug, customer.id, 5), snapshot.reservations)
        : Promise.resolve(snapshot.reservations),
      loyaltyEnabled
        ? safeResult(getCustomerLoyaltyCardViewForProfile(normalizedSlug, customer.id), null)
        : Promise.resolve(null),
      experienceEnabled
        ? safeResult(getCustomerExperienceRewardSubmissions(normalizedSlug, customer.id, 5), snapshot.experienceRewards)
        : Promise.resolve(snapshot.experienceRewards),
    ]);

    const loyaltyRules = loyaltyEnabled ? await safeResult(getPublicLoyaltyBySlug(normalizedSlug), null) : null;
    const [loyaltyPointsBalance, loyaltyUsedPoints] = loyaltyEnabled
      ? await Promise.all([
          safeResult(getCustomerLoyaltyAccountBalance(cafe.id, String(profileRow.id)), 0),
          safeResult(getCustomerUsedLoyaltyPoints(cafe.id, String(profileRow.id)), 0),
        ])
      : [0, 0];

    const loyaltyPoints =
      loyaltyRules?.settings.enabled
        ? {
            balance: loyaltyPointsBalance,
            usedPoints: loyaltyUsedPoints,
            pointValueSar: resolvePointValueSar(loyaltyRules.settings),
            minimumRedemptionPoints: Number(firstActiveRedemptionRule(loyaltyRules.settings)?.pointsCost ?? 0),
          }
        : emptyLoyaltyPoints;

    const scopedLoyalty =
      loyalty && loyalty.card.cafeId === cafe.id && loyalty.cafeSlug === normalizedSlug
        ? loyalty
        : null;
    const scopedExperienceRewards = experienceRewards.filter(
      (reward) => reward.cafeId === cafe.id,
    );

    logRewardsSnapshotLoad({
      slug: normalizedSlug,
      resolvedCafeId: cafe.id,
      customerProfileCafeId,
      loyaltyCardCafeId: scopedLoyalty?.card.cafeId ?? null,
      rewardsCount: scopedExperienceRewards.length,
    });

    return {
      success: true as const,
      code: null,
      error: null,
      errorCode: null,
      message: null,
      data: {
        ...snapshot,
        customer,
        features,
        orders,
        reservations,
        loyalty: scopedLoyalty,
        loyaltyPoints,
        experienceRewards: scopedExperienceRewards,
      },
    };
  } catch (error) {
    logRewardsSnapshotLoad({
      slug: normalizedSlug,
      resolvedCafeId,
      customerProfileCafeId,
      loyaltyCardCafeId: null,
      rewardsCount: 0,
    });

    console.error("[fetchCustomerAccountSnapshotAction]", {
      message: error instanceof Error ? error.message : "unknown error",
    });

    return {
      success: false as const,
      code: "load_failed" as CustomerAccountErrorCode,
      error: CUSTOMER_ACCOUNT_LOAD_ERROR,
      errorCode: "load_failed" as CustomerAccountErrorCode,
      message: CUSTOMER_ACCOUNT_LOAD_ERROR,
      data: snapshot,
    };
  }
}
