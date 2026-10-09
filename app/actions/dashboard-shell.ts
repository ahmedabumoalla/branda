"use server";

import { getCafeServiceAccess } from "@/lib/data/feature-entitlements";
import type { PlatformFeature } from "@/lib/platform/admin-data";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { getPlatformPlans } from "@/lib/data/admin";
import { mapDbSettingsToCafeSettings } from "@/lib/data/mappers";
import type { AppNotification } from "@/lib/mock/notifications";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import { createClient } from "@/lib/supabase/server";
import {
  resolvePublishedStoragePathToUrl,
  storageBucketForLogo,
} from "@/lib/storage/resolve-storage-url";

function mapNotification(slug: string, row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id ?? ""),
    cafeSlug: slug,
    audience: String(row.audience ?? "cafe") as AppNotification["audience"],
    customerId: row.customer_id ? String(row.customer_id) : undefined,
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    type: String(row.type ?? "experience_submission") as AppNotification["type"],
    read: Boolean(row.read),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    meta:
      row.meta && typeof row.meta === "object"
        ? (row.meta as Record<string, string>)
        : undefined,
  };
}

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
      unauthenticated: true as const,
      planId: "",
      plans: await getPlatformPlans().catch(() => []),
      featureOverrides: [],
      settings: fallbackSettings({ slug: "", name: "" }),
      notifications: [],
      pendingOrders: 0,
      pendingExperienceReviews: 0,
    };
  }

  const supabase = await createClient();

  const [plans, serviceAccess, settingsResult, notificationsResult] = await Promise.all([
    getPlatformPlans(),
    getCafeServiceAccess(cafe.id),
    supabase
      .from("cafe_settings")
      .select("*")
      .eq("cafe_id", cafe.id)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("*")
      .eq("cafe_id", cafe.id)
      .eq("audience", "cafe")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (notificationsResult.error) throw notificationsResult.error;

  const settings = settingsResult.data
    ? mapDbSettingsToCafeSettings(cafe.slug, settingsResult.data as any)
    : fallbackSettings(cafe);
  settings.cafeName = cafe.name;
  settings.businessCategory = cafe.businessCategory;

  const logoStoragePath = settingsResult.data?.logo_storage_path as string | null | undefined;
  if (logoStoragePath) {
    settings.logoAssetId = logoStoragePath;
    settings.logoDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForLogo(),
      logoStoragePath,
    );
  }

  return {
    planId: serviceAccess.planId,
    plans: plans.map(plan => plan.id === serviceAccess.planId ? { ...plan, features: serviceAccess.features as PlatformFeature[] } : plan),
    featureOverrides: [],
    settings,
    notifications: ((notificationsResult.data ?? []) as Record<string, unknown>[]).map((row) =>
      mapNotification(cafe.slug, row),
    ),
    pendingOrders: 0,
    pendingExperienceReviews: 0,
  };
}
