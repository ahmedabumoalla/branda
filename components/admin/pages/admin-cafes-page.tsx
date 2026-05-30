"use client";

import { Building2, Eye, ExternalLink, Power, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import {
  AdminFilterBar,
  AdminInput,
  AdminPageShell,
  AdminSelect,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  GoldButton,
  StatusBadge,
} from "@/components/ui/design-system";
import {
  getCafeSubdomainHost,
  getCafeDisplayDomain,
  getCafePublicUrl,
  resolveCafeDomainSource,
} from "@/lib/platform/cafe-domain";
import {
  PLATFORM_CAFES_KEY,
  PLATFORM_CUSTOMERS_KEY,
  PLATFORM_OPERATIONS_KEY,
  PLATFORM_PLANS_KEY,
  ACTIVE_CAFE_PLAN_KEY,
  allPlatformFeatures,
  mockPlatformCafes,
  mockPlatformCustomers,
  mockPlatformOperations,
  mockPlatformPlans,
  type PlatformCafe,
  type PlatformCustomer,
  type PlatformOperation,
  type PlatformPlan,
} from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

export function AdminCafesPage() {
  const [cafes, setCafes] = useState<PlatformCafe[]>(mockPlatformCafes);
  const [plans, setPlans] = useState<PlatformPlan[]>(mockPlatformPlans);
  const [customers, setCustomers] = useState<PlatformCustomer[]>(mockPlatformCustomers);
  const [operations, setOperations] = useState<PlatformOperation[]>(mockPlatformOperations);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "نشط" | "موقوف">("all");
  const [selectedId, setSelectedId] = useState<string | null>(mockPlatformCafes[0]?.id ?? null);

  useEffect(() => {
    const savedCafes = localStorage.getItem(PLATFORM_CAFES_KEY);
    const savedPlans = localStorage.getItem(PLATFORM_PLANS_KEY);
    const savedCustomers = localStorage.getItem(PLATFORM_CUSTOMERS_KEY);
    const savedOps = localStorage.getItem(PLATFORM_OPERATIONS_KEY);

    if (savedCafes) setCafes(JSON.parse(savedCafes));
    if (savedPlans) setPlans(JSON.parse(savedPlans));
    if (savedCustomers) setCustomers(JSON.parse(savedCustomers));
    if (savedOps) setOperations(JSON.parse(savedOps));
  }, []);

  useEffect(() => {
    localStorage.setItem(PLATFORM_CAFES_KEY, JSON.stringify(cafes));
  }, [cafes]);

  const filtered = useMemo(() => {
    return cafes.filter((cafe) => {
      const q = query.trim();
      const matchesQuery =
        !q ||
        cafe.name.includes(q) ||
        cafe.ownerName.includes(q) ||
        cafe.ownerPhone.includes(q) ||
        cafe.ownerEmail.includes(q) ||
        cafe.slug.includes(q);
      const matchesStatus = statusFilter === "all" || cafe.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [cafes, query, statusFilter]);

  const selected = cafes.find((c) => c.id === selectedId) ?? null;
  const selectedDomainSettings = selected
    ? {
        customDomain: selected.customDomain,
        domainStatus: selected.customDomainStatus || "غير مربوط",
        purchasedDomain: selected.purchasedDomain,
        purchasedDomainStatus: selected.purchasedDomainStatus || "غير مربوط",
      }
    : null;
  const selectedDomainSource = resolveCafeDomainSource(selectedDomainSettings);
  const selectedPlan = plans.find((p) => p.id === selected?.planId);

  const cafeCustomers = useMemo(
    () => (selected ? customers.filter((c) => c.cafeId === selected.id) : []),
    [customers, selected]
  );

  const cafeOperations = useMemo(
    () => (selected ? operations.filter((o) => o.cafeId === selected.id).slice(0, 8) : []),
    [operations, selected]
  );

  function toggleCafe(id: string) {
    setCafes((prev) =>
      prev.map((cafe) =>
        cafe.id === id ? { ...cafe, status: cafe.status === "نشط" ? "موقوف" : "نشط" } : cafe
      )
    );
  }

  function updatePlan(id: string, planId: string) {
    setCafes((prev) => prev.map((cafe) => (cafe.id === id ? { ...cafe, planId } : cafe)));
    if (id === "cafe_qatrah") localStorage.setItem(ACTIVE_CAFE_PLAN_KEY, planId);
  }

  return (
    <AdminPageShell
      title="الكوفيهات المسجلة"
      subtitle="اضغط على أي كوفي لعرض التفاصيل الكاملة والتحكم بالباقة والحالة."
      action={<BrandaLogo variant="dark" width={140} height={56} />}
    >
      <AdminFilterBar>
        <div className="relative min-w-0 w-full flex-1 sm:min-w-[200px]">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
          <AdminInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم، المالك، الجوال..."
            className="pr-12"
          />
        </div>
        <AdminSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "نشط" | "موقوف")}
          className="max-w-xs"
        >
          <option value="all">كل الحالات</option>
          <option value="نشط">نشط فقط</option>
          <option value="موقوف">موقوف فقط</option>
        </AdminSelect>
        <div className={`w-full min-w-0 sm:w-auto sm:min-w-[140px] ${softPanel}`}>
          <AdminStatPill label="النتائج" value={filtered.length} />
        </div>
      </AdminFilterBar>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <BentoGrid className="xl:grid-cols-1">
          {filtered.map((cafe) => {
            const active = cafe.id === selectedId;
            return (
              <button
                key={cafe.id}
                type="button"
                onClick={() => setSelectedId(cafe.id)}
                className="w-full text-right"
              >
                <BentoCard
                  variant={active ? "gold" : "cyber"}
                  span="4"
                  className={`transition ${active ? "ring-2 ring-[#F6C35B]/50" : "hover:border-[#F6C35B]/30"}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B]">
                        <Building2 className="h-7 w-7" />
                      </div>
                      <div>
                        <h2 className="break-words text-xl font-black sm:text-2xl">{cafe.name}</h2>
                        <p className="mt-1 text-sm font-bold text-[#CBB29C]">
                          {cafe.ownerName} • /c/{cafe.slug}
                        </p>
                      </div>
                    </div>
                    <StatusBadge tone={cafe.status === "نشط" ? "success" : "danger"}>
                      {cafe.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 text-sm font-bold text-[#7A6255]">
                    {formatSar(cafe.totalRevenue)} • {cafe.totalOrders} طلب • {cafe.customersCount}{" "}
                    عميل
                  </p>
                </BentoCard>
              </button>
            );
          })}
        </BentoGrid>

        {selected ? (
          <aside className="xl:sticky xl:top-8 xl:self-start">
            <BentoCard variant="dark" span="4" className="max-h-[calc(100vh-8rem)] overflow-y-auto">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#F6C35B]">تفاصيل الكوفي</p>
                  <h2 className="mt-1 text-3xl font-black text-[#F8F4EF]">{selected.name}</h2>
                  <StatusBadge tone={selected.status === "نشط" ? "success" : "danger"}>
                    {selected.status}
                  </StatusBadge>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded-xl border border-white/10 p-2 text-[#CBB29C] xl:hidden"
                  aria-label="إغلاق"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-sm font-bold">
                <DetailRow label="المعرّف" value={selected.id} />
                <DetailRow label="Slug" value={selected.slug} />
                <DetailRow
                  label="رابط الكوفي"
                  value={getCafeDisplayDomain(selected.slug, selectedDomainSettings)}
                />
                <DetailRow
                  label="مسار fallback"
                  value={getCafePublicUrl(selected.slug)}
                />
                <DetailRow label="المالك" value={selected.ownerName} />
                <DetailRow label="البريد" value={selected.ownerEmail} />
                <DetailRow label="الجوال" value={selected.ownerPhone} />
                <DetailRow label="تاريخ التسجيل" value={selected.createdAt} />
              </div>

              <div className="mt-6">
                <h3 className="mb-3 font-black text-[#F8F4EF]">الدومينات</h3>
                <div className="space-y-2 text-sm font-bold">
                  <DetailRow label="Subdomain" value={getCafeSubdomainHost(selected.slug)} />
                  <DetailRow label="Custom Domain" value={selected.customDomain || "—"} />
                  <DetailRow label="Purchased Domain" value={selected.purchasedDomain || "—"} />
                  <DetailRow
                    label="Status"
                    value={
                      selected.purchasedDomainStatus ||
                      selected.customDomainStatus ||
                      "غير مربوط"
                    }
                  />
                  <DetailRow label="Source" value={selectedDomainSource} />
                  <DetailRow
                    label="CreatedAt"
                    value={selected.purchasedDomainCreatedAt || selected.createdAt}
                  />
                  <DetailRow
                    label="Verified/PurchasedAt"
                    value={selected.purchasedDomainConnectedAt || "—"}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={getCafePublicUrl(selected.slug, { settings: selectedDomainSettings })}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-[#F8E8D2]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    فتح الدومين
                  </a>
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-[#CBB29C]"
                  >
                    إعادة التحقق (Mock)
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <StatMini label="قيمة الطلبات المتوقعة" value={formatSar(selected.totalRevenue)} highlight />
                <StatMini label="الطلبات" value={String(selected.totalOrders)} />
                <StatMini label="العملاء" value={String(selected.customersCount)} />
                <StatMini label="الباقة" value={selectedPlan?.name ?? selected.planId} />
              </div>

              <div className="mt-6">
                <p className="mb-2 text-xs font-black text-[#CBB29C]">الخدمات حسب الباقة</p>
                <div className="flex flex-wrap gap-2">
                  {allPlatformFeatures.map((f) => {
                    const on = selectedPlan?.features.includes(f.id);
                    return (
                      <span
                        key={f.id}
                        className={`rounded-lg px-2 py-1 text-xs font-black ${
                          on
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-white/5 text-[#7A6255]"
                        }`}
                      >
                        {f.title}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <label className="block text-xs font-black text-[#CBB29C]">تغيير الباقة</label>
                <AdminSelect
                  value={selected.planId}
                  onChange={(e) => updatePlan(selected.id, e.target.value)}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {plan.priceMonthly} ر.س
                    </option>
                  ))}
                </AdminSelect>

                <GoldButton
                  onClick={() => toggleCafe(selected.id)}
                  className="flex w-full items-center justify-center gap-2"
                >
                  <Power className="h-4 w-4" />
                  {selected.status === "نشط" ? "إيقاف الكوفي" : "تفعيل الكوفي"}
                </GoldButton>

                <a
                  href={getCafePublicUrl(selected.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#F6C35B]/30 bg-[#F6C35B]/10 py-3.5 font-black text-[#F6C35B]"
                >
                  <ExternalLink className="h-4 w-4" />
                  زيارة صفحة الكوفي
                </a>
              </div>

              <div className="mt-8">
                <h3 className="mb-3 font-black text-[#F8F4EF]">آخر عمليات الكوفي</h3>
                <div className="space-y-2">
                  {cafeOperations.length ? (
                    cafeOperations.map((op) => (
                      <div key={op.id} className={softPanel}>
                        <p className="font-black text-[#F8E8D2]">{op.title}</p>
                        <p className="mt-1 text-xs text-[#CBB29C]">
                          {op.type} • {op.status} • {op.createdAt}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#7A6255]">لا توجد عمليات مسجلة.</p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="mb-3 font-black text-[#F8F4EF]">عملاء الكوفي</h3>
                <div className="space-y-2">
                  {cafeCustomers.length ? (
                    cafeCustomers.slice(0, 5).map((c) => (
                      <div key={c.id} className={softPanel}>
                        <p className="font-black text-[#F8E8D2]">{c.fullName}</p>
                        <p className="mt-1 text-xs text-[#CBB29C]">
                          {c.phone} • {formatSar(c.totalSpent)} • {c.loyaltyPoints} نقطة
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#7A6255]">لا يوجد عملاء مرتبطون بعد.</p>
                  )}
                </div>
              </div>
            </BentoCard>
          </aside>
        ) : (
          <aside className="hidden rounded-[32px] border border-dashed border-white/15 p-8 text-center text-[#CBB29C] xl:flex xl:items-center xl:justify-center">
            <div>
              <Eye className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p className="font-bold">اختر كوفيًا من القائمة لعرض التفاصيل</p>
            </div>
          </aside>
        )}
      </div>
    </AdminPageShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={`flex justify-between gap-3 rounded-xl px-3 py-2 ${softPanel}`}>
      <span className="text-[#CBB29C]">{label}</span>
      <span className="text-left font-black text-[#F8E8D2]">{value}</span>
    </div>
  );
}

function StatMini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={softPanel}>
      <p className="text-xs font-black text-[#CBB29C]">{label}</p>
      <p className={`mt-1 font-black ${highlight ? "text-[#F6C35B]" : "text-[#F8E8D2]"}`}>
        {value}
      </p>
    </div>
  );
}
