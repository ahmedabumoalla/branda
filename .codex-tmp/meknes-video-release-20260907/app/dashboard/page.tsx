export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";
import {
  DashboardRecentOrdersSection,
  DashboardSectionSkeleton,
  DashboardSummarySection,
  DashboardTrendSection,
} from "@/components/dashboard/dashboard-home-sections";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerCafeSettings } from "@/lib/data/settings";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <DashboardHomeClient
        cafeSlug=""
        cafeName="العلامة"
        businessCategory="cafes_coffee"
        ownerName=""
        summary={<DashboardSectionSkeleton />}
        recentOrders={<DashboardSectionSkeleton rows={3} />}
        trend={<DashboardSectionSkeleton rows={2} />}
        configError="قم بإعداد Supabase في env local"
      />
    );
  }

  try {
    const cafe = await requireOwnerCafeContext();

    const settings = await getOwnerCafeSettings();

    return (
      <DashboardHomeClient
        cafeSlug={cafe.slug}
        cafeName={settings.cafeName || cafe.name}
        businessCategory={cafe.businessCategory}
        ownerName={settings.ownerName || ""}
        summary={
          <Suspense fallback={<DashboardSectionSkeleton />}>
            <DashboardSummarySection />
          </Suspense>
        }
        recentOrders={
          <Suspense fallback={<DashboardSectionSkeleton rows={3} />}>
            <DashboardRecentOrdersSection />
          </Suspense>
        }
        trend={
          <Suspense fallback={<DashboardSectionSkeleton rows={2} />}>
            <DashboardTrendSection />
          </Suspense>
        }
      />
    );
  } catch (error) {
    console.error("[DashboardPage]", error);

    return (
      <DashboardHomeClient
        cafeSlug=""
        cafeName="العلامة"
        businessCategory="cafes_coffee"
        ownerName=""
        summary={<DashboardSectionSkeleton />}
        recentOrders={<DashboardSectionSkeleton rows={3} />}
        trend={<DashboardSectionSkeleton rows={2} />}
        configError="تعذر تحميل بيانات لوحة التحكم"
      />
    );
  }
}
