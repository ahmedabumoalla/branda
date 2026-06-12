export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { ReviewsPageClient } from "@/components/dashboard/pages/reviews-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerReviews } from "@/lib/data/reviews";

export default async function ReviewsPage() {
  if (!isSupabaseConfigured()) {
    return <ReviewsPageClient initialReviews={[]} configError="قم بإعداد Supabase في .env.local" />;
  }
  try {
    return <ReviewsPageClient initialReviews={await getOwnerReviews()} />;
  } catch {
    return <ReviewsPageClient initialReviews={[]} configError="تعذر تحميل التقييمات" />;
  }
}
