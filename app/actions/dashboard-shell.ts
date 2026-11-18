"use server";

import { getCafeServiceAccess } from "@/lib/data/feature-entitlements";
import type { PlatformFeature } from "@/lib/platform/admin-data";
import { getDashboardCafeContext } from "@/lib/data/cafes";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformPlans } from "@/lib/data/admin";
import { mapDbSettingsToCafeSettings } from "@/lib/data/mappers";
import type { AppNotification } from "@/lib/mock/notifications";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import { createClient } from "@/lib/supabase/server";
import { resolveErpModules } from "@/lib/platform/erp-modules";
import { managedBrandLogo } from "@/lib/brands/management";

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
  const cafe = await getDashboardCafeContext();
  if (!cafe) {
    return {
      serverTime: Date.now(),
      unauthenticated: true as const,
      staff: null,
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
    // Loco employees see the brand logo only, never the owner's contact settings
    cafe.staff
      ? createAdminClient().from("cafe_settings").select("logo_storage_path").eq("cafe_id", cafe.id).maybeSingle()
      : supabase
        .from("cafe_settings")
        .select("*")
        .eq("cafe_id", cafe.id)
        .maybeSingle(),
  ]);

  if (settingsResult.error) throw settingsResult.error;

  const settings = settingsResult.data && !cafe.staff
    ? mapDbSettingsToCafeSettings(cafe.slug, settingsResult.data as Parameters<typeof mapDbSettingsToCafeSettings>[1])
    : fallbackSettings(cafe);
  settings.cafeName = cafe.name;
  settings.businessCategory = cafe.businessCategory;

  const logoStoragePath = settingsResult.data?.logo_storage_path as string | null | undefined;
  if (logoStoragePath) {
    settings.logoAssetId = logoStoragePath;
    if (cafe.managementName) settings.logoDataUrl = await managedBrandLogo(cafe.id);
    // The sidebar already resolves this path through the authorized media API.
    // Optional branding must not block the entire authenticated page on Storage.
  }

  return {
    serverTime: Date.now(),
    // Loco employee sections; absent for owners and managers
    staff: cafe.staff ?? null,
    planId: serviceAccess.planId,
    subscription: serviceAccess.subscription,
    serviceSubscriptions: serviceAccess.serviceSubscriptions,
    plans: plans.map(plan => plan.id === serviceAccess.planId ? { ...plan, features: serviceAccess.features as PlatformFeature[] } : plan),
    featureOverrides: [],
    // Sections of the integrated system allowed by the current finance packages; null means all of them
    erpModules: resolveErpModules(serviceAccess.subscriptions.filter(subscription => subscription.features.includes("finance")).map(subscription => plans.find(plan => plan.id === subscription.planId)?.erpModules)),
    settings,
    // Optional notifications load after the authorized shell is visible.
    notifications: [] as AppNotification[],
    pendingOrders: 0,
    pendingExperienceReviews: 0,
  };
}
