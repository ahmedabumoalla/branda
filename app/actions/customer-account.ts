"use server";

import {
  getCustomerOrdersForProfile,
  getCustomerReservationsForProfile,
} from "@/lib/data/customers";
import { getCustomerLoyaltyCardViewForProfile } from "@/lib/data/loyalty-cards";
import { getCustomerExperienceRewardSubmissions } from "@/lib/data/experience-rewards";
import { getCustomerRewardInstances } from "@/lib/data/customer-rewards";
import { getPublicLoyaltyBySlug } from "@/lib/data/loyalty";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { getCustomerSessionAction } from "@/app/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LoyaltySettings } from "@/lib/mock/loyalty";

type CustomerAccountErrorCode =
  | "invalid_session"
  | "core_load_failed"
  | "optional_section_failed";
type OptionalSection =
  | "orders"
  | "reservations"
  | "loyalty"
  | "loyalty_points"
  | "experience_rewards"
  | "customer_rewards";

const CORE_LOAD_ERROR = "تعذر تحميل بيانات الحساب الأساسية. حاول مرة أخرى.";
const OPTIONAL_TIMEOUT_MS = 8_000;

type CustomerLoyaltyPointsSnapshot = {
  enabled: boolean;
  balance: number;
  usedPoints: number;
  pointValueSar: number;
  minimumRedemptionPoints: number;
};

const emptyLoyaltyPoints: CustomerLoyaltyPointsSnapshot = {
  enabled: false,
  balance: 0,
  usedPoints: 0,
  pointValueSar: 0,
  minimumRedemptionPoints: 0,
};

function serializeAccountError(
  error: unknown,
  input: { context: string; section?: OptionalSection; slug: string },
) {
  const source =
    error && typeof error === "object"
      ? (error as {
          message?: unknown;
          code?: unknown;
          details?: unknown;
          hint?: unknown;
        })
      : {};
  return {
    message:
      typeof source.message === "string" ? source.message : "Account load failed",
    code: typeof source.code === "string" ? source.code : undefined,
    details: typeof source.details === "string" ? source.details : undefined,
    hint: typeof source.hint === "string" ? source.hint : undefined,
    context: input.context,
    section: input.section,
    slug: input.slug,
  };
}

async function optionalResult<T>(
  task: Promise<T>,
  fallback: T,
  input: { section: OptionalSection; slug: string },
): Promise<{ value: T; failed: boolean }> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("OPTIONAL_SECTION_TIMEOUT")),
          OPTIONAL_TIMEOUT_MS,
        );
      }),
    ]);
    return { value, failed: false };
  } catch (error) {
    console.error(
      "[fetchCustomerAccountOptionalAction]",
      serializeAccountError(error, {
        context: "optional_section_failed",
        section: input.section,
        slug: input.slug,
      }),
    );
    return { value: fallback, failed: true };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function firstActiveRedemptionRule(settings: LoyaltySettings) {
  return (
    settings.redemptionRules.find((rule) => rule.enabled) ??
    settings.redemptionRules[0] ??
    null
  );
}

function resolvePointValueSar(settings: LoyaltySettings) {
  const rule = firstActiveRedemptionRule(settings);
  const pointsCost = Number(rule?.pointsCost ?? 0);
  if (!rule || pointsCost <= 0) return 0;
  if (
    rule.type === "fixed_discount" &&
    Number(rule.discountAmount ?? 0) > 0
  ) {
    return Math.round((Number(rule.discountAmount) / pointsCost) * 100) / 100;
  }
  return 0;
}

async function getCustomerLoyaltyAccountBalance(
  cafeId: string,
  customerProfileId: string,
) {
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

async function getCustomerUsedLoyaltyPoints(
  cafeId: string,
  customerProfileId: string,
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("loyalty_transactions")
    .select("amount")
    .eq("cafe_id", cafeId)
    .eq("customer_id", customerProfileId)
    .lt("amount", 0);
  if (error) throw error;
  return (data ?? []).reduce(
    (sum: number, row: { amount?: number | string | null }) =>
      sum + Math.abs(Math.min(0, Number(row.amount ?? 0))),
    0,
  );
}

export async function fetchCustomerAccountCoreAction(cafeSlug: string) {
  const slug = cafeSlug.trim().toLowerCase();
  try {
    const cafe = await getCafeBySlug(slug);
    if (!cafe) {
      return {
        success: false as const,
        code: "core_load_failed" as CustomerAccountErrorCode,
        message: CORE_LOAD_ERROR,
        data: null,
      };
    }

    const customer = await getCustomerSessionAction(slug);
    if (!customer) {
      return {
        success: false as const,
        code: "invalid_session" as CustomerAccountErrorCode,
        message: "انتهت جلسة العميل. سجّل الدخول مرة أخرى.",
        data: null,
      };
    }

    const admin = createAdminClient();
    const { data: profile, error } = await admin
      .from("customer_profiles")
      .select("id,cafe_id")
      .eq("id", customer.id)
      .eq("cafe_id", cafe.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile || String(profile.cafe_id) !== cafe.id) {
      return {
        success: false as const,
        code: "invalid_session" as CustomerAccountErrorCode,
        message: "تعذر التحقق من ارتباط الحساب بهذه العلامة.",
        data: null,
      };
    }

    let features: string[] = [];
    try {
      features = await getPublicCafeFeatureCodesBySlug(slug);
    } catch (error) {
      console.error(
        "[fetchCustomerAccountCoreAction]",
        serializeAccountError(error, {
          context: "core_features_fallback",
          slug,
        }),
      );
    }

    return {
      success: true as const,
      code: null,
      message: null,
      data: { customer, cafeId: cafe.id, features },
    };
  } catch (error) {
    console.error(
      "[fetchCustomerAccountCoreAction]",
      serializeAccountError(error, { context: "core_load_failed", slug }),
    );
    return {
      success: false as const,
      code: "core_load_failed" as CustomerAccountErrorCode,
      message: CORE_LOAD_ERROR,
      data: null,
    };
  }
}

export async function fetchCustomerAccountOptionalAction(cafeSlug: string) {
  const slug = cafeSlug.trim().toLowerCase();
  const core = await fetchCustomerAccountCoreAction(slug);
  if (!core.success || !core.data) {
    return {
      success: false as const,
      code: core.code,
      message: core.message,
      data: null,
      failedSections: [] as OptionalSection[],
    };
  }

  const { customer, cafeId, features } = core.data;
  const ordersEnabled =
    featureCodesAllow(features, "orders") || featureCodesAllow(features, "menu");
  const reservationsEnabled = featureCodesAllow(features, "reservations");
  const loyaltyEnabled = featureCodesAllow(features, "loyalty");
  const experienceEnabled = featureCodesAllow(features, "experience_reviews");

  const [ordersResult, reservationsResult, loyaltyResult, experienceResult, rewardsResult] =
    await Promise.all([
      ordersEnabled
        ? optionalResult(getCustomerOrdersForProfile(slug, customer.id, 5), [], {
            section: "orders",
            slug,
          })
        : { value: [], failed: false },
      reservationsEnabled
        ? optionalResult(
            getCustomerReservationsForProfile(slug, customer.id, 5),
            [],
            { section: "reservations", slug },
          )
        : { value: [], failed: false },
      loyaltyEnabled
        ? optionalResult(
            getCustomerLoyaltyCardViewForProfile(slug, customer.id),
            null,
            { section: "loyalty", slug },
          )
        : { value: null, failed: false },
      experienceEnabled
        ? optionalResult(
            getCustomerExperienceRewardSubmissions(slug, customer.id, 5),
            [],
            { section: "experience_rewards", slug },
          )
        : { value: [], failed: false },
      loyaltyEnabled || experienceEnabled
        ? optionalResult(getCustomerRewardInstances(slug, customer.id, 50), [], {
            section: "customer_rewards",
            slug,
          })
        : { value: [], failed: false },
    ]);

  const loyaltyRulesResult = loyaltyEnabled
    ? await optionalResult(getPublicLoyaltyBySlug(slug), null, {
        section: "loyalty_points",
        slug,
      })
    : { value: null, failed: false };
  const [balanceResult, usedResult] = loyaltyEnabled
    ? await Promise.all([
        optionalResult(getCustomerLoyaltyAccountBalance(cafeId, customer.id), 0, {
          section: "loyalty_points",
          slug,
        }),
        optionalResult(getCustomerUsedLoyaltyPoints(cafeId, customer.id), 0, {
          section: "loyalty_points",
          slug,
        }),
      ])
    : [
        { value: 0, failed: false },
        { value: 0, failed: false },
      ];

  const failedSections = [
    ordersResult.failed ? "orders" : null,
    reservationsResult.failed ? "reservations" : null,
    loyaltyResult.failed ? "loyalty" : null,
    loyaltyRulesResult.failed || balanceResult.failed || usedResult.failed
      ? "loyalty_points"
      : null,
    experienceResult.failed ? "experience_rewards" : null,
    rewardsResult.failed ? "customer_rewards" : null,
  ].filter((section): section is OptionalSection => Boolean(section));

  const loyaltyPoints =
    loyaltyRulesResult.value?.settings.enabled
      ? {
          enabled: true,
          balance: balanceResult.value,
          usedPoints: usedResult.value,
          pointValueSar: resolvePointValueSar(loyaltyRulesResult.value.settings),
          minimumRedemptionPoints: Number(
            firstActiveRedemptionRule(loyaltyRulesResult.value.settings)
              ?.pointsCost ?? 0,
          ),
        }
      : emptyLoyaltyPoints;

  const loyaltyCandidate = loyaltyResult.value;
  const loyalty =
    loyaltyCandidate?.card.cafeId === cafeId &&
    loyaltyCandidate?.cafeSlug === slug
      ? loyaltyCandidate
      : null;

  return {
    success: true as const,
    code: failedSections.length
      ? ("optional_section_failed" as CustomerAccountErrorCode)
      : null,
    message: null,
    failedSections,
    data: {
      orders: ordersResult.value,
      reservations: reservationsResult.value,
      loyalty,
      loyaltyPoints,
      experienceRewards: experienceResult.value.filter(
        (reward) => reward.cafeId === cafeId,
      ),
      customerRewards: rewardsResult.value.filter(
        (reward) => reward.cafeId === cafeId,
      ),
    },
  };
}

export async function fetchCustomerAccountSnapshotAction(cafeSlug: string) {
  const slug = cafeSlug.trim().toLowerCase();
  const core = await fetchCustomerAccountCoreAction(slug);
  const emptyData = {
    customer: null,
    cafeSlug: slug,
    features: [] as string[],
    orders: [] as Awaited<ReturnType<typeof getCustomerOrdersForProfile>>,
    reservations: [] as Awaited<
      ReturnType<typeof getCustomerReservationsForProfile>
    >,
    loyalty: null as Awaited<
      ReturnType<typeof getCustomerLoyaltyCardViewForProfile>
    > | null,
    loyaltyPoints: emptyLoyaltyPoints,
    experienceRewards: [] as Awaited<
      ReturnType<typeof getCustomerExperienceRewardSubmissions>
    >,
    customerRewards: [] as Awaited<
      ReturnType<typeof getCustomerRewardInstances>
    >,
  };
  if (!core.success || !core.data) {
    return {
      success: false as const,
      code: core.code,
      error: core.message,
      errorCode: core.code,
      message: core.message,
      data: emptyData,
    };
  }
  const optional = await fetchCustomerAccountOptionalAction(slug);
  return {
    success: true as const,
    code: optional.code,
    error: null,
    errorCode: optional.code,
    message: null,
    data: {
      ...emptyData,
      customer: core.data.customer,
      features: core.data.features,
      ...(optional.data ?? {}),
    },
  };
}
