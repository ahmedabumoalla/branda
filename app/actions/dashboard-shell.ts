"use server";

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
    type: String(row.type ?? "new_review") as AppNotification["type"],
    read: Boolean(row.read),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    meta:
      row.meta && typeof row.meta === "object"
        ? (row.meta as Record<string, string>)
        : undefined,
  };
}

async function countRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  cafeId: string,
  build?: (query: any) => any,
) {
  try {
    let query = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("cafe_id", cafeId);

    if (build) query = build(query);

    const { count, error } = await query;
    if (error) {
      console.warn(`[dashboard-shell/count:${table}]`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.warn(`[dashboard-shell/count:${table}]`, error);
    return 0;
  }
}

async function getFastDashboardCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cafeId: string,
) {
  try {
    const { data, error } = await supabase.rpc("get_owner_dashboard_shell_fast", {
      p_cafe_id: cafeId,
    });

    if (!error && data && typeof data === "object") {
      const row = data as Record<string, unknown>;
      return {
        pendingReservations: Number(row.pendingReservations ?? row.pending_reservations ?? 0),
        pendingOrders: Number(row.pendingOrders ?? row.pending_orders ?? 0),
        pendingExperienceReviews: Number(row.pendingExperienceReviews ?? row.pending_experience_reviews ?? 0),
      };
    }
  } catch {
    // The migration is optional. Fall back to safe count queries until it is applied.
  }

  const [pendingReservations, pendingOrders, pendingExperienceReviews] = await Promise.all([
    countRows(supabase, "reservations", cafeId, (query) =>
      query.eq("status", "pending").is("deleted_at", null),
    ),
    countRows(supabase, "orders", cafeId, (query) =>
      query.eq("status", "pending_cafe").is("deleted_at", null),
    ),
    countRows(supabase, "experience_reward_submissions", cafeId, (query) =>
      query.eq("status", "pending"),
    ),
  ]);

  return { pendingReservations, pendingOrders, pendingExperienceReviews };
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
      settings: fallbackSettings({ slug: "", name: "" }),
      notifications: [],
      pendingReservations: 0,
      pendingOrders: 0,
      pendingExperienceReviews: 0,
    };
  }

  const supabase = await createClient();

  const [plans, subscriptionResult, settingsResult, notificationsResult, fastCounts] = await Promise.all([
    getPlatformPlans(),
    supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("cafe_id", cafe.id)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
    getFastDashboardCounts(supabase, cafe.id),
  ]);

  if (subscriptionResult.error) throw subscriptionResult.error;
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
    planId: String(subscriptionResult.data?.plan_id ?? ""),
    plans,
    settings,
    notifications: ((notificationsResult.data ?? []) as Record<string, unknown>[]).map((row) =>
      mapNotification(cafe.slug, row),
    ),
    pendingReservations: fastCounts.pendingReservations,
    pendingOrders: fastCounts.pendingOrders,
    pendingExperienceReviews: fastCounts.pendingExperienceReviews,
  };
}
