import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { PlatformCafe, PlatformPlan } from "@/lib/platform/admin-data";
import { getBrandFeatureOverrides, getEffectiveBrandFeatureAccess, getPlanIncludedFeatures } from "@/lib/platform/feature-access";

export function StandaloneMenuControl({ cafe, plans }: { cafe: PlatformCafe; plans: PlatformPlan[] }) {
  const plan = plans.find(item => item.id === cafe.planId);
  const menuEnabled = Boolean(cafe.slug && cafe.status === "نشط" && cafe.hasActivePlan && plan?.active
    && getEffectiveBrandFeatureAccess(getPlanIncludedFeatures(cafe.planId, plans), getBrandFeatureOverrides(cafe))
      .some(row => row.feature.id === "menu" && row.effectiveEnabled));
  return <section className="rounded-2xl border border-[#F6C35B]/25 bg-[#F6C35B]/5 p-5" aria-label="إتاحة المنيو المستقل">
    <h3 className="font-black text-[#F8F4EF]">المنيو مرتبط بالباقة</h3>
    <p className="mt-2 text-sm leading-7 text-[#CBB29C]">
      يعمل المنيو المستقل عند وجود اشتراك ساري في باقة مفعلة تتضمن خدمة المنيو مع تفعيل العلامة والخدمة
      عند انتهاء الاشتراك أو إيقاف الخدمة يتوقف المنيو تلقائيًا
    </p>
    <div className="mt-4 flex flex-wrap gap-3">
    {menuEnabled && <Link href={`/menu/${encodeURIComponent(cafe.slug)}`} target="_blank" rel="noopener noreferrer" prefetch={false}
      aria-label={`فتح المنيو المستقل ل${cafe.name} في تبويب جديد`}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F6C35B] px-5 py-2 font-bold text-[#211A12] transition-colors hover:bg-[#E8B34B] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F6C35B]">
      <ExternalLink size={18} aria-hidden="true" />فتح المنيو المستقل
    </Link>}
    <Link href="/admin/plans" className="inline-flex min-h-11 items-center rounded-xl border border-[#F6C35B]/40 px-5 py-2 font-bold text-[#F6C35B] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F6C35B]">
      إدارة خدمات الباقات
    </Link>
    </div>
  </section>;
}
