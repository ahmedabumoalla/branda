"use client";

import { CircleDollarSign } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import {
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  StatusBadge,
} from "@/components/ui/design-system";
import {
  PLATFORM_CAFES_KEY,
  mockPlatformCafes,
  type PlatformCafe,
} from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

export function AdminRevenuePage() {
  const [cafes, setCafes] = useState<PlatformCafe[]>(mockPlatformCafes);

  useEffect(() => {
    const saved = localStorage.getItem(PLATFORM_CAFES_KEY);
    if (saved) setCafes(JSON.parse(saved));
  }, []);

  const totalRevenue = useMemo(() => cafes.reduce((sum, cafe) => sum + cafe.totalRevenue, 0), [cafes]);
  const platformCommission = totalRevenue * 0.03;
  const topCafeId = useMemo(() => {
    if (cafes.length === 0) return null;
    return cafes.reduce((top, cafe) =>
      cafe.totalRevenue > top.totalRevenue ? cafe : top
    ).id;
  }, [cafes]);

  return (
    <AdminPageShell
      title="قيمة الطلبات المتوقعة"
      subtitle="متابعة قيمة طلبات الاستلام المقبولة (الدفع عند الاستلام — غير مؤكد داخل النظام)."
      action={<BrandaLogo variant="dark" width={140} height={56} />}
    >
      <BentoGrid className="mb-6">
        <BentoCard variant="gold" span="2">
          <div className="flex items-start justify-between gap-4">
            <AdminStatPill label="إجمالي قيمة الطلبات المتوقعة" value={formatSar(totalRevenue)} />
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B]">
              <CircleDollarSign className="h-7 w-7" />
            </div>
          </div>
        </BentoCard>
        <BentoCard variant="cyber">
          <AdminStatPill
            label="عمولة المنصة التقديرية"
            value={formatSar(platformCommission)}
            hint="3% من الإجمالي"
          />
        </BentoCard>
        <BentoCard variant="dark">
          <AdminStatPill label="عدد الكوفيهات" value={cafes.length} />
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="md:grid-cols-2 xl:grid-cols-3">
        {cafes.map((cafe) => {
          const share = totalRevenue > 0 ? Math.round((cafe.totalRevenue / totalRevenue) * 100) : 0;
          const isTop = cafe.id === topCafeId;

          return (
            <BentoCard key={cafe.id} variant={isTop ? "gold" : "cyber"}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-[#F8F4EF]">{cafe.name}</h3>
                  <p className="mt-1 text-sm font-bold text-[#CBB29C]">
                    {cafe.totalOrders} طلب • {cafe.customersCount} عميل
                  </p>
                </div>
                <StatusBadge tone={cafe.status === "نشط" ? "success" : "danger"}>
                  {cafe.status}
                </StatusBadge>
              </div>

              <AdminStatPill label="قيمة الطلبات المتوقعة" value={formatSar(cafe.totalRevenue)} />

              <div className="mt-4 rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4">
                <div className="flex items-center justify-between text-sm font-bold text-[#CBB29C]">
                  <span>نسبة من الإجمالي</span>
                  <span className="text-[#F6C35B]">{share}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-[#F6C35B] to-[#d4a84a]"
                    style={{ width: `${share}%` }}
                  />
                </div>
                <p className="mt-3 text-sm font-bold text-[#CBB29C]">
                  عمولة تقديرية {formatSar(cafe.totalRevenue * 0.03)}
                </p>
              </div>
            </BentoCard>
          );
        })}
      </BentoGrid>
    </AdminPageShell>
  );
}
