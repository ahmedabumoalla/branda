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
import { getCustomerSessionAction } from "@/app/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LoyaltySettings } from "@/lib/mock/loyalty";

type OptionalSection =
  | "orders"
  | "reservations"
  | "loyalty"
  | "loyalty_points"
  | "experience_rewards"
  | "customer_rewards";

const CORE_LOAD_ERROR = "تعذر تحميل بيانات الحساب الأساسية. حاول مرة أخرى.";
const OPTIONAL_TIMEOUT_MS = 8_000;
const emptyLoyaltyPoints = {
  enabled: false,
  balance: 0,
  usedPoints: 0,
  pointValueSar: 0,
  minimumRedemptionPoints: 0,
};

function safeError(
  error: unknown,
  input: { context: string; section?: OptionalSection; slug: string },
) {
  const value =
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
      typeof value.message === "string" ? value.message : "Section load failed",
    code: typeof value.code === "string" ? value.code : undefined,
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
    context: input.context,
    section: input.section,
    slug: input.slug,
  };
}

async function withSectionTimeout<T>(
  section: OptionalSection,
  slug: string,
  task: Promise<T>,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("OPTIONAL_SECTION_TIMEOUT")),
          OPTIONAL_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    console.error(
      "[customer-account-section]",
      safeError(error, {
        context: "optional_section_failed",
        section,
        slug,
      }),
    );
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function sectionContext(cafeSlug: string) {
  const slug = cafeSlug.trim().toLowerCase();
  const [cafe, customer] = await Promise.all([
    getCafeBySlug(slug),
    getCustomerSessionAction(slug),
  ]);
  if (!customer) return { ok: false as const, code: "invalid_session" as const };
  if (!cafe) return { ok: false as const, code: "core_load_failed" as const };
  return { ok: true as const, slug, cafeId: cafe.id, customer };
}

function firstActiveRedemptionRule(settings: LoyaltySettings) {
  return (
    settings.redemptionRules.find((rule) => rule.enabled) ??
    settings.redemptionRules[0] ??
    null
  );
}

function pointValue(settings: LoyaltySettings) {
  const rule = firstActiveRedemptionRule(settings);
  const cost = Number(rule?.pointsCost ?? 0);
  if (
    !rule ||
    cost <= 0 ||
    rule.type !== "fixed_discount" ||
    Number(rule.discountAmount ?? 0) <= 0
  ) {
    return 0;
  }
  return Math.round((Number(rule.discountAmount) / cost) * 100) / 100;
}

async function loyaltyBalance(cafeId: string, customerId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("loyalty_accounts")
    .select("balance")
    .eq("cafe_id", cafeId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return Math.max(0, Number(data?.balance ?? 0));
}

async function usedLoyaltyPoints(cafeId: string, customerId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("loyalty_transactions")
    .select("amount")
    .eq("cafe_id", cafeId)
    .eq("customer_id", customerId)
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
    const [cafe, customer] = await Promise.all([
      getCafeBySlug(slug),
      getCustomerSessionAction(slug),
    ]);
    if (!customer) {
      return {
        success: false as const,
        code: "invalid_session" as const,
        message: "انتهت جلسة العميل. سجّل الدخول مرة أخرى.",
        data: null,
      };
    }
    if (!cafe) {
      return {
        success: false as const,
        code: "core_load_failed" as const,
        message: CORE_LOAD_ERROR,
        data: null,
      };
    }
    return {
      success: true as const,
      code: null,
      message: null,
      data: { customer, cafeId: cafe.id },
    };
  } catch (error) {
    console.error(
      "[fetchCustomerAccountCoreAction]",
      safeError(error, { context: "core_load_failed", slug }),
    );
    return {
      success: false as const,
      code: "core_load_failed" as const,
      message: CORE_LOAD_ERROR,
      data: null,
    };
  }
}

export async function fetchCustomerAccountFeaturesAction(cafeSlug: string) {
  const slug = cafeSlug.trim().toLowerCase();
  try {
    return {
      success: true as const,
      data: await getPublicCafeFeatureCodesBySlug(slug),
    };
  } catch (error) {
    console.error(
      "[customer-account-section]",
      safeError(error, {
        context: "optional_section_failed",
        slug,
      }),
    );
    return { success: false as const, data: [] as string[] };
  }
}

export async function fetchCustomerOrdersSectionAction(cafeSlug: string) {
  const context = await sectionContext(cafeSlug);
  if (!context.ok) return { success: false as const, code: context.code, data: [] };
  try {
    const data = await withSectionTimeout(
      "orders",
      context.slug,
      getCustomerOrdersForProfile(context.slug, context.customer.id, 5),
    );
    return { success: true as const, code: null, data };
  } catch {
    return { success: false as const, code: "optional_section_failed" as const, data: [] };
  }
}

export async function fetchCustomerReservationsSectionAction(cafeSlug: string) {
  const context = await sectionContext(cafeSlug);
  if (!context.ok) return { success: false as const, code: context.code, data: [] };
  try {
    const data = await withSectionTimeout(
      "reservations",
      context.slug,
      getCustomerReservationsForProfile(context.slug, context.customer.id, 5),
    );
    return { success: true as const, code: null, data };
  } catch {
    return { success: false as const, code: "optional_section_failed" as const, data: [] };
  }
}

export async function fetchCustomerLoyaltySectionAction(cafeSlug: string) {
  const context = await sectionContext(cafeSlug);
  if (!context.ok) {
    return {
      success: false as const,
      code: context.code,
      data: { loyalty: null, loyaltyPoints: emptyLoyaltyPoints },
    };
  }
  try {
    const [loyalty, rules, balance, used] = await Promise.all([
      withSectionTimeout(
        "loyalty",
        context.slug,
        getCustomerLoyaltyCardViewForProfile(
          context.slug,
          context.customer.id,
        ),
      ),
      withSectionTimeout(
        "loyalty_points",
        context.slug,
        getPublicLoyaltyBySlug(context.slug),
      ),
      withSectionTimeout(
        "loyalty_points",
        context.slug,
        loyaltyBalance(context.cafeId, context.customer.id),
      ),
      withSectionTimeout(
        "loyalty_points",
        context.slug,
        usedLoyaltyPoints(context.cafeId, context.customer.id),
      ),
    ]);
    const scoped =
      loyalty?.card.cafeId === context.cafeId &&
      loyalty?.cafeSlug === context.slug
        ? loyalty
        : null;
    return {
      success: true as const,
      code: null,
      data: {
        loyalty: scoped,
        loyaltyPoints: rules?.settings.enabled
          ? {
              enabled: true,
              balance,
              usedPoints: used,
              pointValueSar: pointValue(rules.settings),
              minimumRedemptionPoints: Number(
                firstActiveRedemptionRule(rules.settings)?.pointsCost ?? 0,
              ),
            }
          : emptyLoyaltyPoints,
      },
    };
  } catch {
    return {
      success: false as const,
      code: "optional_section_failed" as const,
      data: { loyalty: null, loyaltyPoints: emptyLoyaltyPoints },
    };
  }
}

export async function fetchCustomerExperienceRewardsSectionAction(
  cafeSlug: string,
) {
  const context = await sectionContext(cafeSlug);
  if (!context.ok) return { success: false as const, code: context.code, data: [] };
  try {
    const data = await withSectionTimeout(
      "experience_rewards",
      context.slug,
      getCustomerExperienceRewardSubmissions(
        context.slug,
        context.customer.id,
        5,
      ),
    );
    return {
      success: true as const,
      code: null,
      data: data.filter((reward) => reward.cafeId === context.cafeId),
    };
  } catch {
    return { success: false as const, code: "optional_section_failed" as const, data: [] };
  }
}

export async function fetchCustomerRewardsSectionAction(cafeSlug: string) {
  const context = await sectionContext(cafeSlug);
  if (!context.ok) return { success: false as const, code: context.code, data: [] };
  try {
    const data = await withSectionTimeout(
      "customer_rewards",
      context.slug,
      getCustomerRewardInstances(context.slug, context.customer.id, 50),
    );
    return {
      success: true as const,
      code: null,
      data: data.filter((reward) => reward.cafeId === context.cafeId),
    };
  } catch {
    return { success: false as const, code: "optional_section_failed" as const, data: [] };
  }
}

// Compatibility loader for pages that explicitly need the complete snapshot.
export async function fetchCustomerAccountSnapshotAction(cafeSlug: string) {
  const slug = cafeSlug.trim().toLowerCase();
  const core = await fetchCustomerAccountCoreAction(slug);
  const empty = {
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
      data: empty,
    };
  }
  const [features, orders, reservations, loyalty, experienceRewards, customerRewards] =
    await Promise.all([
      fetchCustomerAccountFeaturesAction(slug),
      fetchCustomerOrdersSectionAction(slug),
      fetchCustomerReservationsSectionAction(slug),
      fetchCustomerLoyaltySectionAction(slug),
      fetchCustomerExperienceRewardsSectionAction(slug),
      fetchCustomerRewardsSectionAction(slug),
    ]);
  return {
    success: true as const,
    code: null,
    error: null,
    errorCode: null,
    message: null,
    data: {
      ...empty,
      customer: core.data.customer,
      features: features.data,
      orders: orders.data,
      reservations: reservations.data,
      loyalty: loyalty.data.loyalty,
      loyaltyPoints: loyalty.data.loyaltyPoints,
      experienceRewards: experienceRewards.data,
      customerRewards: customerRewards.data,
    },
  };
}
