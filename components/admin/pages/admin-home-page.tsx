"use client";

import { Building2, CircleDollarSign, ClipboardList, Users } from "lucide-react";
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
  PLATFORM_CUSTOMERS_KEY,
  PLATFORM_OPERATIONS_KEY,
  mockPlatformCafes,
  mockPlatformCustomers,
  mockPlatformOperations,
  type PlatformCafe,
  type PlatformCustomer,
  type PlatformOperation,
} from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

export function AdminHomePage() {
  const [cafes, setCafes] = useState<PlatformCafe[]>(mockPlatformCafes);
  const [customers, setCustomers] = useState<PlatformCustomer[]>(mockPlatformCustomers);
  const [operations, setOperations] = useState<PlatformOperation[]>(mockPlatformOperations);

  useEffect(() => {
    const savedCafes = localStorage.getItem(PLATFORM_CAFES_KEY);
    const savedCustomers = localStorage.getItem(PLATFORM_CUSTOMERS_KEY);
    const savedOperations = localStorage.getItem(PLATFORM_OPERATIONS_KEY);

    if (savedCafes) setCafes(JSON.parse(savedCafes));
    if (savedCustomers) setCustomers(JSON.parse(savedCustomers));
    if (savedOperations) setOperations(JSON.parse(savedOperations));
  }, []);

  const revenue = useMemo(() => cafes.reduce((sum, cafe) => sum + cafe.totalRevenue, 0), [cafes]);
  const activeCafes = useMemo(() => cafes.filter((c) => c.status === "نشط").length, [cafes]);

  const stats = [
    { title: "الكوفيهات", value: cafes.length, hint: `${activeCafes} نشط`, icon: Building2 },
    { title: "العملاء", value: customers.length, icon: Users },
    { title: "العمليات", value: operations.length, icon: ClipboardList },
  ];

  return (
    <AdminPageShell
      title="لوحة تحكم المنصة"
      subtitle="مراقبة كاملة للكوفيهات والعملاء والإيرادات والعمليات."
      action={<BrandaLogo variant="dark" width={140} height={56} />}
    >
      <BentoGrid>
        <BentoCard variant="gold" span="2" className="md:row-span-2">
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-[#F6C35B]/90">الإيرادات العامة</p>
                <p className="mt-3 text-4xl font-black text-[#F8F4EF] sm:text-5xl">{formatSar(revenue)}</p>
                <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                  مجموع إيرادات كل الكوفيهات المسجلة
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_24px_rgba(246,195,91,0.25)]">
                <CircleDollarSign className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-8 flex h-48 items-end gap-3 sm:h-56">
              {[55, 72, 44, 88, 69, 93, 61].map((height, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-2xl bg-gradient-to-t from-[#F6C35B]/40 to-[#F6C35B]"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </BentoCard>

        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <BentoCard key={item.title} variant="cyber">
              <Icon className="mb-4 h-7 w-7 text-[#F6C35B]" />
              <AdminStatPill label={item.title} value={item.value} hint={item.hint} />
            </BentoCard>
          );
        })}

        <BentoCard variant="dark" span="2">
          <h2 className="mb-5 text-xl font-black text-[#F8F4EF]">آخر العمليات</h2>
          <div className="space-y-3">
            {operations.slice(0, 6).map((op) => (
              <div
                key={op.id}
                className="rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-black text-[#F8F4EF]">{op.title}</h3>
                  <StatusBadge tone="gold">{op.type}</StatusBadge>
                </div>
                <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                  {op.cafeName} • {op.status} • {op.createdAt}
                </p>
              </div>
            ))}
          </div>
        </BentoCard>
      </BentoGrid>
    </AdminPageShell>
  );
}
