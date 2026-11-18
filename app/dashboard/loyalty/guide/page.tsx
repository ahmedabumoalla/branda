import { Download, Eye, BookOpen } from "lucide-react";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { LoyaltyGuidePreview } from "@/components/dashboard/loyalty-guide-preview";

const guideUrl = "/api/loyalty-guide#navpanes=0&view=FitH";

export default async function LoyaltyGuidePage() {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "loyalty")) return <DashboardFeatureBlockedState title="دليل نظام الولاء" />;
  return (
    <section dir="rtl" className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-[#806A5E]"><BookOpen size={18} aria-hidden="true" />الولاء</p>
          <h1 className="text-2xl font-bold text-[#311912] sm:text-3xl">دليل نظام الولاء في برندة</h1>
          <p className="mt-2 text-sm leading-7 text-[#806A5E]">شرح مصور لإعداد الولاء وإصدار البطاقات وتسجيل الأختام وصرف المكافآت</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={guideUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[#D7C8BC] bg-white px-4 py-3 text-sm font-bold text-[#311912] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#713D2A]"><Eye size={17} aria-hidden="true" />استعراض الدليل</a>
          <a href="/api/loyalty-guide?download=1" download="branda-loyalty-guide.pdf" className="inline-flex items-center gap-2 rounded-xl bg-[#713D2A] px-4 py-3 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#713D2A]"><Download size={17} aria-hidden="true" />تحميل الدليل</a>
        </div>
      </header>
      <div className="overflow-hidden rounded-2xl border border-[#E7D7C6] bg-white">
        <div className="flex flex-wrap justify-between gap-2 border-b border-[#E7D7C6] px-4 py-3 text-sm text-[#806A5E]"><span>من أول إعداد إلى أول مكافأة</span><span>١٦ صفحة</span></div>
        <LoyaltyGuidePreview src={guideUrl} />
      </div>
      <p className="text-sm leading-7 text-[#806A5E]">يفتح الاستعراض ملف PDF في نافذة مستقلة ويمكنك تحميل نسخة على جهازك لقراءتها لاحقًا</p>
    </section>
  );
}
