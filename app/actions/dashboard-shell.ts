"use server";

import { getCafeServiceAccess } from "@/lib/data/feature-entitlements";
import type { PlatformFeature } from "@/lib/platform/admin-data";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { getPlatformPlans } from "@/lib/data/admin";
import { mapDbSettingsToCafeSettings } from "@/lib/data/mappers";
import type { AppNotification } from "@/lib/mock/notifications";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import { createClient } from "@/lib/supabase/server";

function fallbackSettings(cafe: { slug: string; name: string; businessCategory?: string }): CafeSettings {
  return {
    cafeSlug: cafe.slug,
    cafeName: cafe.name,
    businessCategory: cafe.businessCategory ?? "cafes_coffee",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    description: "",
    domainStatus: "غير مربوط",
  };
}

export async function fetchOwnerDashboardShellAction() {
  const cafe = await getOwnerCafeContext();
  if (!cafe) {
    return {
      serverTime: Date.now(),
      unauthenticated: true as const,
      planId: "",
      subscription: null,
      serviceSubscriptions: [],
      plans: await getPlatformPlans().catch(() => []),
      featureOverrides: [],
      settings: fallbackSettings({ slug: "", name: "" }),
      notifications: [],
      pendingOrders: 0,
      pendingExperienceReviews: 0,
    };
  }

  const supabase = await createClient();

  const [plans, serviceAccess, settingsResult] = await Promise.all([
    getPlatformPlans(),
    getCafeServiceAccess(cafe.id),
    supabase
      .from("cafe_settings")
      .select("*")
      .eq("cafe_id", cafe.id)
      .maybeSingle(),
  ]);

  if (settingsResult.error) throw settingsResult.error;

  const settings = settingsResult.data
    ? mapDbSettingsToCafeSettings(cafe.slug, settingsResult.data as Parameters<typeof mapDbSettingsToCafeSettings>[1])
    : fallbackSettings(cafe);
  settings.cafeName = cafe.name;
  settings.businessCategory = cafe.businessCategory;

  const logoStoragePath = settingsResult.data?.logo_storage_path as string | null | undefined;
  if (logoStoragePath) {
    settings.logoAssetId = logoStoragePath;
    // The sidebar already resolves this path through the authorized media API.
    // Optional branding must not block the entire authenticated page on Storage.
  }

  return {
    serverTime: Date.now(),
    planId: serviceAccess.planId,
    subscription: serviceAccess.subscription,
    serviceSubscriptions: serviceAccess.serviceSubscriptions,
    plans: plans.map(plan => plan.id === serviceAccess.planId ? { ...plan, features: serviceAccess.features as PlatformFeature[] } : plan),
    featureOverrides: [],
    settings,
    // Optional notifications load after the authorized shell is visible.
    notifications: [] as AppNotification[],
    pendingOrders: 0,
    pendingExperienceReviews: 0,
  };
}
