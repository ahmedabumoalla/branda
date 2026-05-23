"use client";

import { Power, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import {
  AdminFilterBar,
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  GoldButton,
  AdminInput,
  StatusBadge,
} from "@/components/ui/design-system";
import {
  PLATFORM_CUSTOMERS_KEY,
  mockPlatformCustomers,
  type PlatformCustomer,
} from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

export function AdminCustomersPage() {
  const [customers, setCustomers] = useState<PlatformCustomer[]>(mockPlatformCustomers);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(PLATFORM_CUSTOMERS_KEY);
    if (saved) setCustomers(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(PLATFORM_CUSTOMERS_KEY, JSON.stringify(customers));
  }, [customers]);

  const filtered = useMemo(() => {
    return customers.filter(
      (c) =>
        c.fullName.includes(query) ||
        c.phone.includes(query) ||
        c.cafeName.includes(query) ||
        c.email?.includes(query)
    );
  }, [customers, query]);

  function toggleCustomer(id: string) {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: c.status === "نشط" ? "موقوف" : "نشط" } : c))
    );
  }

  return (
    <AdminPageShell
      title="عملاء الكوفيهات"
      subtitle="كل عميل موضح تابع لأي كوفي مع إنفاقه ونقاطه وحالة حسابه."
      action={<BrandaLogo variant="dark" width={140} height={56} />}
    >
      <AdminFilterBar>
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
          <AdminInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم، الجوال، الإيميل، أو اسم الكوفي..."
            className="pr-12"
          />
        </div>
        <div className={`min-w-[180px] ${softPanel}`}>
          <AdminStatPill label="النتائج" value={filtered.length} hint={`من ${customers.length} عميل`} />
        </div>
      </AdminFilterBar>

      <BentoGrid className="xl:grid-cols-1">
        {filtered.map((customer) => (
          <BentoCard key={customer.id} variant="cyber" span="4">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_20px_rgba(246,195,91,0.15)]">
                  <UserRound className="h-8 w-8" />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-black text-[#F8F4EF]">{customer.fullName}</h2>
                    <StatusBadge tone={customer.status === "نشط" ? "success" : "danger"}>
                      {customer.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 font-bold text-[#CBB29C]">
                    {customer.phone} • {customer.email || "بدون بريد"}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-[#CBB29C]">تابع إلى:</span>
                    <StatusBadge tone="gold">{customer.cafeName}</StatusBadge>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div className={softPanel}>
                  <AdminStatPill label="الإنفاق" value={formatSar(customer.totalSpent)} />
                </div>
                <div className={softPanel}>
                  <AdminStatPill label="النقاط" value={customer.loyaltyPoints} />
                </div>
                <div className={softPanel}>
                  <AdminStatPill label="الكوفي" value={customer.cafeName} />
                </div>
                <div className={softPanel}>
                  <AdminStatPill label="تاريخ التسجيل" value={customer.createdAt} />
                </div>
              </div>
            </div>

            <GoldButton
              onClick={() => toggleCustomer(customer.id)}
              className="mt-5 inline-flex items-center gap-2 px-5 py-3"
            >
              <Power className="h-4 w-4" />
              {customer.status === "نشط" ? "إيقاف العميل" : "تفعيل العميل"}
            </GoldButton>
          </BentoCard>
        ))}
      </BentoGrid>
    </AdminPageShell>
  );
}
