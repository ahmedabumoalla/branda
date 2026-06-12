"use client";

import Link from "next/link";
import { ArrowRight, Calculator, Percent } from "lucide-react";
import type { BarndaksaFinanceDashboard } from "@/lib/data/finance";
import { AdminPageShell, BentoCard, BentoGrid } from "@/components/ui/design-system";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س`;
}

export function AdminValuationPage({ data, configError }: { data: BarndaksaFinanceDashboard | null; configError?: string }) {
  return (
    <AdminPageShell title="تفصيل آلية تقييم برندة" subtitle="صفحة مستقلة توضح المعايير العالمية المستخدمة في قراءة القيمة السوقية الحالية للمنصة." action={<BarndaksaLogo variant="dark" width={140} height={56} />}>
      {configError ? <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center font-black text-amber-200">{configError}</div> : null}
      <Link href="/admin/finance" className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-[#F8F4EF]"><ArrowRight className="h-5 w-5" /> رجوع للمالية</Link>
      <BentoGrid className="mb-6">
        <BentoCard variant="gold"><p className="text-sm font-bold text-[#241610]">القيمة السوقية الحالية للبراند اللي هو برندة</p><h2 className="mt-2 text-4xl font-black text-[#241610]">{data ? money(data.currentMarketValue) : "—"}</h2></BentoCard>
        <BentoCard variant="dark"><p className="text-sm font-bold text-[#CBB29C]">المنهج</p><h2 className="mt-2 text-3xl font-black text-[#F8F4EF]">Weighted SaaS Score</h2></BentoCard>
      </BentoGrid>
      <BentoGrid className="xl:grid-cols-5">
        {(data?.valuationMethods ?? []).map((method) => (
          <BentoCard key={method.key} variant="cyber">
            <div className="mb-4 flex items-center justify-between gap-3"><Calculator className="h-7 w-7 text-[#F6C35B]" /><span className="inline-flex items-center gap-1 rounded-xl bg-[#F6C35B]/10 px-3 py-1 font-black text-[#F6C35B]"><Percent className="h-4 w-4" />{method.weight}%</span></div>
            <h3 className="text-xl font-black text-[#F8F4EF]">{method.title}</h3>
            <p className="mt-3 text-sm font-bold leading-7 text-[#CBB29C]">{method.description}</p>
          </BentoCard>
        ))}
      </BentoGrid>
      <BentoCard variant="dark" className="mt-6">
        <h2 className="text-2xl font-black text-[#F8F4EF]">التفصيل العملي للتقييم</h2>
        <div className="mt-4 space-y-3 text-sm font-bold leading-8 text-[#CBB29C]">
          <p>يبدأ التقييم من صافي الاشتراكات بدون ضريبة القيمة المضافة لأن الضريبة ليست إيرادًا تشغيليًا للمنصة.</p>
          <p>يتم تقدير ARR عبر آخر معدل اشتراكات فعلي ثم استخدام مضاعف SaaS محافظ للمرحلة المبكرة، وبعدها تعديله حسب النمو والاحتفاظ وحجم السوق ونضج المنتج.</p>
          <p>يتم خصم مخاطر المرحلة المبكرة لأن برندة ما زالت في مرحلة توسع، لذلك التقييم المعروض داخل المالية يعتبر قراءة إدارية داخلية وليس تقييمًا استثماريًا نهائيًا.</p>
        </div>
      </BentoCard>
    </AdminPageShell>
  );
}
