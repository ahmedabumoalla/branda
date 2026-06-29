export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { ReviewsPageClient } from "@/components/dashboard/pages/reviews-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerReviews } from "@/lib/data/reviews";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function ReviewsPage() {
  if (!isSupabaseConfigured()) {
    return <ReviewsPageClient initialReviews={[]} configError="قم بإعداد Supabase في .env.local" />;
  }
  try {
    const features = await getOwnerFeatureCodes();
    if (!featureCodesAllow(features, "reviews")) {
      return <DashboardFeatureBlockedState title="التقييمات والتعليقات" />;
    }

    return <ReviewsPageClient initialReviews={await getOwnerReviews()} />;
  } catch {
    return <ReviewsPageClient initialReviews={[]} configError="تعذر تحميل التقييمات" />;
  }
}
