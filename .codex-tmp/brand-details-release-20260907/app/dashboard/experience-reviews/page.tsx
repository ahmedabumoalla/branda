export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { ExperienceRewardReviewsPageClient } from "@/components/dashboard/pages/experience-reward-reviews-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerExperienceRewardReviews } from "@/lib/data/experience-rewards";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerMenu } from "@/lib/data/menu";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

function FeatureBlocked() {
  return (
    <div dir="rtl" className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4 py-12">
      <div className="rounded-[32px] border border-[#E7D7C6] bg-[#FCF8F3] p-8 text-center shadow-[0_20px_60px_rgba(49,25,18,0.12)]">
        <p className="text-sm font-black text-[#806A5E]">ميزة غير مفعلة في الباقة الحالية</p>
        <h1 className="mt-3 text-3xl font-black text-[#311912]">مراجعة توثيق التجارب</h1>
        <p className="mt-4 font-bold leading-8 text-[#806A5E]">
          هذه الصفحة لا تظهر للعلامة التجارية ولا تعمل روابط توثيق التجربة إلا إذا كانت الخدمة مضافة ضمن الباقة.
        </p>
        <Link href="/dashboard/subscription" className="mt-6 inline-flex rounded-2xl bg-[#4A281D] px-6 py-4 font-black text-white">
          ترقية الباقة
        </Link>
      </div>
    </div>
  );
}

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
    const features = await getOwnerFeatureCodes();
    if (!featureCodesAllow(features, "experience_reviews")) {
      return <FeatureBlocked />;
    }

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
