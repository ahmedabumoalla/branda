export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { ExperienceRewardReviewsPageClient } from "@/components/dashboard/pages/experience-reward-reviews-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerExperienceRewardReviews } from "@/lib/data/experience-rewards";
import { getOwnerMenu } from "@/lib/data/menu";

export default async function ExperienceRewardReviewsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <ExperienceRewardReviewsPageClient
        initialSubmissions={[]}
        products={[]}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [submissions, menu] = await Promise.all([
      getOwnerExperienceRewardReviews(),
      getOwnerMenu(),
    ]);

    return (
      <ExperienceRewardReviewsPageClient
        initialSubmissions={submissions}
        products={menu.products}
      />
    );
  } catch (error) {
    console.error("[ExperienceRewardReviewsPage]", error);
    return (
      <ExperienceRewardReviewsPageClient
        initialSubmissions={[]}
        products={[]}
        configError="تعذر تحميل مراجعة توثيق التجارب"
      />
    );
  }
}
