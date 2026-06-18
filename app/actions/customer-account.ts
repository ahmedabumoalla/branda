"use server";

import { getCustomerProfileByUser, getCustomerOrdersForProfile, getCustomerReservationsForProfile, mapCustomerProfileToSession } from "@/lib/data/customers";
import { getCurrentCustomerLoyaltyCardView } from "@/lib/data/loyalty-cards";
import { getCustomerExperienceRewardSubmissions } from "@/lib/data/experience-rewards";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { createClient } from "@/lib/supabase/server";

function emptySnapshot(cafeSlug: string) {
  return {
    customer: null,
    cafeSlug,
    features: [] as string[],
    orders: [] as Awaited<ReturnType<typeof getCustomerOrdersForProfile>>,
    reservations: [] as Awaited<ReturnType<typeof getCustomerReservationsForProfile>>,
    loyalty: null as Awaited<ReturnType<typeof getCurrentCustomerLoyaltyCardView>> | null,
    experienceRewards: [] as Awaited<ReturnType<typeof getCustomerExperienceRewardSubmissions>>,
  };
}

async function safeResult<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch (error) {
    console.warn("[fetchCustomerAccountSnapshotAction] skipped", error);
    return fallback;
  }
}

export async function fetchCustomerAccountSnapshotAction(cafeSlug: string) {
  const normalizedSlug = cafeSlug.trim().toLowerCase();
  const snapshot = emptySnapshot(normalizedSlug);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return snapshot;

  const profile = await getCustomerProfileByUser(normalizedSlug, user.id);
  if (!profile) return snapshot;

  const customer = mapCustomerProfileToSession(normalizedSlug, profile as Record<string, unknown>);
  const features = await safeResult(getPublicCafeFeatureCodesBySlug(normalizedSlug), [] as string[]);

  const ordersEnabled = featureCodesAllow(features, "orders") || featureCodesAllow(features, "menu");
  const reservationsEnabled = featureCodesAllow(features, "reservations");
  const loyaltyEnabled = featureCodesAllow(features, "loyalty");
  const experienceEnabled = featureCodesAllow(features, "experience_reviews");

  const [orders, reservations, loyalty, experienceRewards] = await Promise.all([
    ordersEnabled
      ? safeResult(getCustomerOrdersForProfile(normalizedSlug, customer.id), snapshot.orders)
      : Promise.resolve(snapshot.orders),
    reservationsEnabled
      ? safeResult(getCustomerReservationsForProfile(normalizedSlug, customer.id), snapshot.reservations)
      : Promise.resolve(snapshot.reservations),
    loyaltyEnabled
      ? safeResult(getCurrentCustomerLoyaltyCardView(normalizedSlug), null)
      : Promise.resolve(null),
    experienceEnabled
      ? safeResult(getCustomerExperienceRewardSubmissions(normalizedSlug), snapshot.experienceRewards)
      : Promise.resolve(snapshot.experienceRewards),
  ]);

  return {
    ...snapshot,
    customer,
    features,
    orders,
    reservations,
    loyalty,
    experienceRewards,
  };
}
