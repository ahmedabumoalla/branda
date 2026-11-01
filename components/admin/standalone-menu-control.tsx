"use client";

import Link from "next/link";
import { CarFront, ExternalLink, LoaderCircle, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { loadAdminMenuBranchesAction } from "@/app/actions/admin-menu-branches";
import type { PlatformCafe, PlatformPlan } from "@/lib/platform/admin-data";

export function StandaloneMenuControl({ cafe, plans }: { cafe: PlatformCafe; plans: PlatformPlan[] }) {
  const [result, setResult] = useState<{ accessKey: string; menuEnabled: boolean; branches: { id: string; name: string; slug: string; primary: boolean }[]; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  // The displayed latest plan is not the union of current service subscriptions
  // Changed summary data invalidates the result, while the server decides access
  const accessKey = JSON.stringify([cafe.id, cafe.status, cafe.planId, cafe.subscriptionUpdatedAt, cafe.hasActivePlan, cafe.featureOverrides, plans.map(plan => [plan.id, plan.active, plan.features])]);
  useEffect(() => {
    let current = true;
    void loadAdminMenuBranchesAction(cafe.id).then(response => {
      if (current) setResult({ accessKey, menuEnabled: response.ok && response.menuEnabled, branches: response.ok ? response.branches : [], error: response.ok ? undefined : response.error });
    }).catch(() => { if (current) setResult({ accessKey, menuEnabled: false, branches: [], error: "تعذر تحميل منيوهات الفروع حاول مجددًا" }); });
    return () => { current = false; };
  }, [cafe.id, accessKey, retry]);
  const loaded = result?.accessKey === accessKey ? result : null;
  const menuEnabled = Boolean(cafe.slug && loaded?.menuEnabled);
  return <section className="rounded-2xl border border-[#F6C35B]/25 bg-[#F6C35B]/5 p-5" aria-label="إتاحة المنيو المستقل">
    <h3 className="font-black text-[#F8F4EF]">المنيو مرتبط بالباقة</h3>
    <p className="mt-2 text-sm leading-7 text-[#CBB29C]">
      يعمل المنيو المستقل عند وجود اشتراك ساري في باقة مفعلة تتضمن خدمة المنيو مع تفعيل العلامة والخدمة
      عند انتهاء الاشتراك أو إيقاف الخدمة يتوقف المنيو تلقائيًا
    </p>
    <div className="mt-4 flex flex-wrap gap-3">
    {!loaded && <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-[#F6C35B]"><LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />جارٍ تحميل منيوهات الفروع</p>}
    {loaded?.error && <div role="alert" className="w-full text-sm text-[#FFD0B7]"><p>{loaded.error}</p><button type="button" className="mt-2 min-h-11 rounded-xl border border-[#F6C35B]/40 px-4 text-[#F6C35B]" onClick={() => { setResult(null); setRetry(value => value + 1); }}>إعادة المحاولة</button></div>}
    {loaded && !loaded.error && !menuEnabled && <p className="w-full text-sm leading-7 text-[#CBB29C]">المنيو غير متاح حاليًا تحقق من تفعيل العلامة وخدمة المنيو ووجود اشتراك ساري</p>}
    {menuEnabled && loaded && !loaded.error && loaded.branches.length > 0 && loaded.branches.map(branch => {
      const drive = /drive|درايف/i.test(`${branch.slug} ${branch.name}`);
      const Icon = drive ? CarFront : Store;
      const label = drive ? "منيو الدرايف ثرو" : branch.primary ? "منيو الفرع" : `منيو ${branch.name}`;
      return <Link key={branch.id} href={`/menu/${encodeURIComponent(cafe.slug)}?branch=${encodeURIComponent(branch.slug)}`} target="_blank" rel="noopener noreferrer" prefetch={false}
        aria-label={`${label} ل${cafe.name} ${branch.name} في تبويب جديد`}
        className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-[#F6C35B] px-5 py-3 font-bold text-[#211A12] transition-colors hover:bg-[#E8B34B] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F6C35B]">
        <Icon size={23} aria-hidden="true" /><span>{label}<small className="mt-1 block text-xs font-normal">{branch.name}</small></span><ExternalLink size={15} aria-hidden="true" />
      </Link>;
    })}
    {menuEnabled && loaded && !loaded.error && !loaded.branches.length && <Link href={`/menu/${encodeURIComponent(cafe.slug)}`} target="_blank" rel="noopener noreferrer" prefetch={false}
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
