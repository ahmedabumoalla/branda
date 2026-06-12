# Components Source

# File: components/admin/AdminSidebar.tsx

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Home,
  Layers3,
  LogOut,
  Settings2,
  Users,
} from "lucide-react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { logoutBarndaksaAuth } from "@/lib/platform/auth";

const links = [
  ["الرئيسية", "/admin", Home],
  ["الكوفيهات", "/admin/cafes", Building2],
  ["العملاء", "/admin/customers", Users],
  ["الإيرادات", "/admin/revenue", CircleDollarSign],
  ["العمليات", "/admin/operations", ClipboardList],
  ["الباقات", "/admin/plans", Layers3],
  ["خيارات المنصة", "/admin/options", Settings2],
] as const;

type AdminSidebarProps = {
  onNavigate?: () => void;
};

export function AdminSidebar({ onNavigate }: AdminSidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    logoutBarndaksaAuth();
    router.push("/login");
  }

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll flex h-full w-full flex-col overflow-y-auto border-l border-white/10 bg-gradient-to-b from-[#0f0c0a] via-[#1a1210] to-[#241610] text-[#F8F4EF] shadow-[-16px_0_48px_rgba(0,0,0,0.5)]"
    >
      <div className="border-b border-white/10 px-6 py-7">
        <BarndaksaLogo variant="dark" width={168} height={68} priority className="mx-auto" />
        <p className="mt-3 text-center text-xs font-bold text-[#CBB29C]">
          لوحة تحكم المنصة
        </p>
      </div>

      <div className="mx-5 mt-6 rounded-[28px] border border-[#F6C35B]/20 bg-[#F6C35B]/5 p-5 shadow-[0_0_32px_rgba(246,195,91,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <p className="text-sm font-bold text-[#CBB29C]">صلاحية الدخول</p>
        <h2 className="mt-1 text-2xl font-black text-[#F8F4EF]">مدير المنصة</h2>
        <p className="mt-2 text-xs font-bold text-[#7A6255]">
          Cyber-Eco • Bento Dashboard
        </p>
        <Link
          href="/dashboard"
          className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-[#F6C35B] to-[#d4a84a] font-black text-[#241610] shadow-[0_0_20px_rgba(246,195,91,0.3)] transition hover:brightness-105"
        >
          لوحة الكوفي
        </Link>
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {links.map(([title, href, Icon]) => {
          const active =
            href === "/admin" ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`group flex items-center justify-between rounded-2xl px-4 py-3.5 font-black transition ${
                active
                  ? "bg-[#F6C35B]/15 text-[#F6C35B] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_rgba(246,195,91,0.12)]"
                  : "text-[#CBB29C] hover:bg-white/5 hover:text-[#F8F4EF]"
              }`}
            >
              <span>{title}</span>
              <Icon
                className={`h-5 w-5 ${active ? "text-[#F6C35B]" : "text-[#7A6255] group-hover:text-[#F6C35B]"}`}
              />
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-white/10 px-4 py-5">
        <Link
          href="/admin/revenue"
          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-[#CBB29C] transition hover:border-[#F6C35B]/30"
        >
          <BarChart3 className="h-4 w-4 text-[#F6C35B]" />
          <span>تقارير الإيرادات</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-between rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-black text-red-300 transition hover:bg-red-500/20"
        >
          <span>تسجيل الخروج</span>
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}

```

# File: components/admin/admin-app-layout.tsx

```tsx
"use client";

import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ResponsiveAppShell } from "@/components/ui/responsive-app-shell";

export function AdminAppLayout({ children }: { children: ReactNode }) {
  return (
    <ResponsiveAppShell
      variant="admin"
      mobileTitle="لوحة المنصة"
      sidebar={(close) => <AdminSidebar onNavigate={close} />}
    >
      <div className="barndaksa-admin-fields min-w-0">{children}</div>
    </ResponsiveAppShell>
  );
}

```

# File: components/admin/pages/admin-cafes-page.tsx

```tsx
"use client";

import { Building2, Eye, ExternalLink, Power, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  updateCafePlanAction,
  updateCafeStatusAction,
} from "@/app/actions/admin";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
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
  allPlatformFeatures,
  type PlatformCafe,
  type PlatformCustomer,
  type PlatformOperation,
  type PlatformPlan,
} from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

type Props = {
  initialCafes: PlatformCafe[];
  initialPlans: PlatformPlan[];
  initialCustomers: PlatformCustomer[];
  initialOperations: PlatformOperation[];
  configError?: string;
};

export function AdminCafesPage({
  initialCafes,
  initialPlans,
  initialCustomers,
  initialOperations,
  configError,
}: Props) {
  const [cafes, setCafes] = useState<PlatformCafe[]>(initialCafes);
  const [plans] = useState<PlatformPlan[]>(initialPlans);
  const [customers] = useState<PlatformCustomer[]>(initialCustomers);
  const [operations] = useState<PlatformOperation[]>(initialOperations);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "نشط" | "موقوف">("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialCafes[0]?.id ?? null);

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

  async function toggleCafe(id: string) {
    const cafe = cafes.find((item) => item.id === id);
    if (!cafe) return;
    const nextActive = cafe.status !== "نشط";
    try {
      await updateCafeStatusAction(id, nextActive);
      setCafes((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: nextActive ? "نشط" : "موقوف" } : item
        )
      );
    } catch {
      alert("تعذر تحديث حالة الكوفي");
    }
  }

  async function updatePlan(id: string, planId: string) {
    try {
      await updateCafePlanAction(id, planId);
      setCafes((prev) => prev.map((cafe) => (cafe.id === id ? { ...cafe, planId } : cafe)));
    } catch {
      alert("تعذر تحديث الباقة");
    }
  }

  return (
    <AdminPageShell
      title="الكوفيهات المسجلة"
      subtitle="اضغط على أي كوفي لعرض التفاصيل الكاملة والتحكم بالباقة والحالة."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      {configError ? (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center font-black text-amber-200">
          {configError}
        </div>
      ) : null}
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

```

# File: components/admin/pages/admin-customers-page.tsx

```tsx
"use client";

import { Power, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
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
import { type PlatformCustomer } from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

type Props = {
  initialCustomers: PlatformCustomer[];
  configError?: string;
};

export function AdminCustomersPage({ initialCustomers, configError }: Props) {
  const [customers, setCustomers] = useState<PlatformCustomer[]>(initialCustomers);
  const [query, setQuery] = useState("");

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
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      <AdminFilterBar>
        <div className="relative min-w-0 w-full flex-1 sm:min-w-[200px]">
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

```

# File: components/admin/pages/admin-home-page.tsx

```tsx
"use client";

import { Building2, CircleDollarSign, ClipboardList, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  StatusBadge,
} from "@/components/ui/design-system";
import {
  mockPlatformCafes,
  mockPlatformCustomers,
  mockPlatformOperations,
  type PlatformCafe,
  type PlatformCustomer,
  type PlatformOperation,
} from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

type Props = {
  initialCafes: PlatformCafe[];
  initialCustomers: PlatformCustomer[];
  initialOperations: PlatformOperation[];
  configError?: string;
};

export function AdminHomePage({
  initialCafes,
  initialCustomers,
  initialOperations,
  configError,
}: Props) {
  const [cafes] = useState<PlatformCafe[]>(initialCafes);
  const [customers] = useState<PlatformCustomer[]>(initialCustomers);
  const [operations] = useState<PlatformOperation[]>(initialOperations);

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
      subtitle="مراقبة كاملة للكوفيهات والعملاء وقيمة الطلبات والعمليات."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      {configError ? (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center font-black text-amber-200">
          {configError}
        </div>
      ) : null}
      <BentoGrid>
        <BentoCard variant="gold" span="2" className="md:row-span-2">
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-[#F6C35B]/90">قيمة الطلبات المتوقعة</p>
                <p className="mt-3 text-4xl font-black text-[#F8F4EF] sm:text-5xl">{formatSar(revenue)}</p>
                <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                  مجموع قيمة طلبات الاستلام المقبولة — الدفع عند الاستلام
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

```

# File: components/admin/pages/admin-operations-page.tsx

```tsx
"use client";

import { ClipboardList, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminFilterBar,
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  AdminInput,
  StatusBadge,
} from "@/components/ui/design-system";
import { mockPlatformOperations, type PlatformOperation } from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

function operationTone(status: string): "success" | "warning" | "danger" | "neutral" | "gold" {
  if (status.includes("مكتمل") || status.includes("نجح")) return "success";
  if (status.includes("قيد") || status.includes("انتظار")) return "warning";
  if (status.includes("ملغ") || status.includes("فشل")) return "danger";
  return "neutral";
}

type Props = {
  initialOperations: PlatformOperation[];
  configError?: string;
};

export function AdminOperationsPage({ initialOperations, configError }: Props) {
  const [operations] = useState<PlatformOperation[]>(initialOperations);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return operations.filter(
      (op) =>
        op.title.includes(query) ||
        op.cafeName.includes(query) ||
        op.type.includes(query) ||
        op.customerName?.includes(query)
    );
  }, [operations, query]);

  return (
    <AdminPageShell
      title="كل العمليات"
      subtitle="سجل كامل لكل طلب وحجز ودفع وتقييم وتغيير يتم داخل المنصة."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      <AdminFilterBar>
        <div className="relative min-w-0 w-full flex-1 sm:min-w-[200px]">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
          <AdminInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في العمليات..."
            className="pr-12"
          />
        </div>
        <div className={`min-w-[180px] ${softPanel}`}>
          <AdminStatPill label="النتائج" value={filtered.length} hint={`من ${operations.length} عملية`} />
        </div>
      </AdminFilterBar>

      <BentoGrid className="xl:grid-cols-1">
        {filtered.map((op) => (
          <BentoCard key={op.id} variant="dark" span="4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_16px_rgba(246,195,91,0.15)]">
                  <ClipboardList className="h-7 w-7" />
                </div>
                <div>
                  <StatusBadge tone="gold">{op.type}</StatusBadge>
                  <h2 className="mt-2 text-2xl font-black text-[#F8F4EF]">{op.title}</h2>
                  <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                    {op.cafeName} {op.customerName ? `• ${op.customerName}` : ""} • {op.createdAt}
                  </p>
                </div>
              </div>

              <div className={`flex flex-col items-start gap-2 md:items-end ${softPanel}`}>
                {op.amount ? (
                  <p className="text-2xl font-black text-[#F6C35B]">{formatSar(op.amount)}</p>
                ) : null}
                <StatusBadge tone={operationTone(op.status)}>{op.status}</StatusBadge>
              </div>
            </div>
          </BentoCard>
        ))}
      </BentoGrid>
    </AdminPageShell>
  );
}

```

# File: components/admin/pages/admin-options-page.tsx

```tsx
"use client";

import { Save, Settings2 } from "lucide-react";
import { useState } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminPageShell,
  BentoCard,
  BentoGrid,
  GoldButton,
  AdminInput,
  AdminSelect,
  StatusBadge,
} from "@/components/ui/design-system";
import { mockPlatformOptions, type PlatformPlan } from "@/lib/platform/admin-data";
import { savePlatformSettingsAction } from "@/app/actions/admin";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

type Props = {
  initialOptions: typeof mockPlatformOptions;
  initialPlans: PlatformPlan[];
  configError?: string;
};

export function AdminOptionsPage({ initialOptions, initialPlans, configError }: Props) {
  const [options, setOptions] = useState(initialOptions);
  const [plans] = useState<PlatformPlan[]>(initialPlans);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  async function save() {
    if (configError) {
      alert(configError);
      return;
    }
    setSaving(true);
    setSaveMessage("");
    try {
      await savePlatformSettingsAction(options);
      setSaveMessage("تم حفظ الخيارات في قاعدة البيانات");
    } catch {
      alert("تعذر حفظ الخيارات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell
      title="خيارات المنصة العامة"
      subtitle="تحكم في التسجيل، الموافقات، العمولة، والباقات الافتراضية."
      action={
        <div className="flex flex-col items-end gap-4 sm:flex-row sm:items-center">
          <BarndaksaLogo variant="dark" width={120} height={48} />
          <GoldButton onClick={save} disabled={saving} className="inline-flex items-center gap-2">
            <Save className="h-5 w-5" />
            {saving ? "جاري الحفظ..." : "حفظ الخيارات"}
          </GoldButton>
        </div>
      }
    >
      {saveMessage ? (
        <p className="mb-4 text-sm font-bold text-emerald-400">{saveMessage}</p>
      ) : null}
      {configError ? (
        <p className="mb-4 text-sm font-bold text-red-400">{configError}</p>
      ) : null}
      <BentoGrid className="xl:grid-cols-2">
        <BentoCard variant="cyber" span="2">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_20px_rgba(246,195,91,0.15)]">
              <Settings2 className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#F8F4EF]">إعدادات التسجيل والموافقة</h2>
              <p className="text-sm font-bold text-[#CBB29C]">تحكم في سياسات انضمام الكوفيهات الجديدة.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Toggle
              title="السماح بتسجيل كوفيهات جديدة"
              active={options.allowCafeSignup}
              onClick={() => setOptions((p) => ({ ...p, allowCafeSignup: !p.allowCafeSignup }))}
            />

            <Toggle
              title="مراجعة الكوفي قبل التفعيل"
              active={options.requireCafeApproval}
              onClick={() => setOptions((p) => ({ ...p, requireCafeApproval: !p.requireCafeApproval }))}
            />
          </div>
        </BentoCard>

        <BentoCard variant="dark">
          <h3 className="mb-4 text-lg font-black text-[#F8F4EF]">عمولة المنصة</h3>
          <label>
            <span className="text-xs font-black text-[#CBB29C]">عمولة المنصة %</span>
            <AdminInput
              value={options.platformCommissionPercent}
              onChange={(e) =>
                setOptions((p) => ({
                  ...p,
                  platformCommissionPercent: Number(e.target.value) || 0,
                }))
              }
              className="mt-2"
            />
          </label>
        </BentoCard>

        <BentoCard variant="gold">
          <h3 className="mb-4 text-lg font-black text-[#F8F4EF]">الدعم والتواصل</h3>
          <label>
            <span className="text-xs font-black text-[#CBB29C]/90">إيميل الدعم</span>
            <AdminInput
              value={options.supportEmail}
              onChange={(e) => setOptions((p) => ({ ...p, supportEmail: e.target.value }))}
              className="mt-2"
            />
          </label>
        </BentoCard>

        <BentoCard variant="cyber" span="2">
          <h3 className="mb-4 text-lg font-black text-[#F8F4EF]">الباقة الافتراضية</h3>
          <p className="mb-4 text-sm font-bold text-[#CBB29C]">
            تُعيَّن تلقائياً لأي كوفي جديد يسجّل في المنصة.
          </p>
          <AdminSelect
            value={options.defaultPlanId}
            onChange={(e) => setOptions((p) => ({ ...p, defaultPlanId: e.target.value }))}
            className="mt-2"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} {plan.active ? "" : "(متوقفة)"}
              </option>
            ))}
          </AdminSelect>
        </BentoCard>
      </BentoGrid>
    </AdminPageShell>
  );
}

function Toggle({ title, active, onClick }: { title: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col items-start gap-3 text-right transition hover:border-[#F6C35B]/30 ${softPanel}`}
    >
      <span className="font-black text-[#F8F4EF]">{title}</span>
      <StatusBadge tone={active ? "success" : "danger"}>
        {active ? "مفعل" : "متوقف"}
      </StatusBadge>
    </button>
  );
}

```

# File: components/admin/pages/admin-plans-page.tsx

```tsx
"use client";

import { Check, Layers3, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { savePlatformPlansAction } from "@/app/actions/admin";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  GoldButton,
  AdminInput,
  AdminTextarea,
  StatusBadge,
} from "@/components/ui/design-system";
import { allPlatformFeatures, type PlatformFeature, type PlatformPlan } from "@/lib/platform/admin-data";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),4px_6px_20px_rgba(0,0,0,0.35)]";

const planVariants: Array<"cyber" | "dark" | "gold"> = ["gold", "cyber", "dark"];

type Props = {
  initialPlans: PlatformPlan[];
  configError?: string;
};

export function AdminPlansPage({ initialPlans, configError }: Props) {
  const [plans, setPlans] = useState<PlatformPlan[]>(initialPlans);

  const [name, setName] = useState("");
  const [priceMonthly, setPriceMonthly] = useState("");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState<PlatformFeature[]>(["menu", "settings"]);

  const activeCount = useMemo(() => plans.filter((p) => p.active).length, [plans]);

  async function persistPlans(nextPlans: PlatformPlan[]) {
    try {
      await savePlatformPlansAction(nextPlans);
      setPlans(nextPlans);
      alert("تم حفظ الباقات");
    } catch {
      alert("تعذر حفظ الباقات");
    }
  }

  function toggleFeature(planId: string, feature: PlatformFeature) {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== planId) return plan;

        const exists = plan.features.includes(feature);

        return {
          ...plan,
          features: exists
            ? plan.features.filter((item) => item !== feature)
            : [...plan.features, feature],
        };
      })
    );
  }

  function toggleNewFeature(feature: PlatformFeature) {
    setFeatures((prev) =>
      prev.includes(feature)
        ? prev.filter((item) => item !== feature)
        : [...prev, feature]
    );
  }

  function addPlan() {
    if (!name.trim()) {
      alert("اكتب اسم الباقة");
      return;
    }

    const id = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    const plan: PlatformPlan = {
      id: id || crypto.randomUUID(),
      name: name.trim(),
      priceMonthly: Number(priceMonthly) || 0,
      description: description.trim() || "باقة مخصصة من إدارة منصة برندة.",
      active: true,
      features,
    };

    setPlans((prev) => {
      const next = [plan, ...prev];
      void persistPlans(next);
      return next;
    });

    setName("");
    setPriceMonthly("");
    setDescription("");
    setFeatures(["menu", "settings"]);
  }

  function updatePlanField(
    planId: string,
    field: "name" | "description" | "priceMonthly",
    value: string
  ) {
    setPlans((prev) =>
      prev.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              [field]: field === "priceMonthly" ? Number(value) || 0 : value,
            }
          : plan
      )
    );
  }

  function togglePlanActive(planId: string) {
    setPlans((prev) =>
      prev.map((plan) =>
        plan.id === planId ? { ...plan, active: !plan.active } : plan
      )
    );
  }

  function deletePlan(planId: string) {
    if (["starter", "growth", "pro"].includes(planId)) {
      alert("لا تحذف الباقات الأساسية، تقدر توقفها بدل الحذف");
      return;
    }

    setPlans((prev) => prev.filter((plan) => plan.id !== planId));
  }

  return (
    <AdminPageShell
      title="الباقات وخيارات الكوفيهات"
      subtitle="أنشئ باقات جديدة وحدد الخدمات المتاحة داخل كل باقة. أي خيار تلغيه من الباقة يختفي مباشرة من لوحة الكوفي."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      <BentoGrid className="mb-6">
        <BentoCard variant="cyber" span="2">
          <AdminStatPill label="إجمالي الباقات" value={plans.length} />
        </BentoCard>
        <BentoCard variant="gold">
          <AdminStatPill label="الباقات المفعلة" value={activeCount} />
        </BentoCard>
        <BentoCard variant="dark">
          <AdminStatPill
            label="المميزات المتاحة"
            value={allPlatformFeatures.length}
            hint="خيارات قابلة للتخصيص"
          />
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6 xl:grid-cols-1">
        <BentoCard variant="cyber" span="4">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_20px_rgba(246,195,91,0.2)]">
              <Plus className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#F8F4EF]">إنشاء باقة جديدة</h2>
              <p className="text-sm font-bold text-[#CBB29C]">
                سمّ الباقة وحدد السعر والمميزات المتاحة فيها.
              </p>
            </div>
          </div>

          <div className={`grid gap-4 p-4 md:grid-cols-3 ${softPanel}`}>
            <AdminInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الباقة"
            />
            <AdminInput
              value={priceMonthly}
              onChange={(e) => setPriceMonthly(e.target.value)}
              placeholder="السعر الشهري"
            />
            <AdminInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف الباقة"
            />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {allPlatformFeatures.map((feature) => {
              const active = features.includes(feature.id);

              return (
                <button
                  key={feature.id}
                  onClick={() => toggleNewFeature(feature.id)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                    active
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.15)]"
                      : `${softPanel} text-[#CBB29C] hover:border-[#F6C35B]/30`
                  }`}
                >
                  {feature.title}
                </button>
              );
            })}
          </div>

          <GoldButton onClick={addPlan} className="mt-5 inline-flex items-center gap-2">
            <Save className="h-5 w-5" />
            حفظ الباقة
          </GoldButton>
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="xl:grid-cols-3">
        {plans.map((plan, index) => (
          <BentoCard
            key={plan.id}
            variant={planVariants[index % planVariants.length]}
            className="shadow-[inset_0_1px_0_rgba(255,255,255,0.06),8px_10px_28px_rgba(0,0,0,0.4)]"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Layers3 className="h-7 w-7" />
              </div>
              <StatusBadge tone={plan.active ? "success" : "danger"}>
                {plan.active ? "مفعلة" : "متوقفة"}
              </StatusBadge>
            </div>

            <div className={`space-y-4 p-4 ${softPanel}`}>
              <label className="block">
                <span className="text-xs font-black text-[#CBB29C]">اسم الباقة</span>
                <AdminInput
                  value={plan.name}
                  onChange={(e) => updatePlanField(plan.id, "name", e.target.value)}
                  className="mt-2 text-2xl font-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black text-[#CBB29C]">الوصف</span>
                <AdminTextarea
                  value={plan.description}
                  onChange={(e) => updatePlanField(plan.id, "description", e.target.value)}
                  className="mt-2 h-24 text-sm leading-7"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black text-[#CBB29C]">السعر الشهري</span>
                <AdminInput
                  value={plan.priceMonthly}
                  onChange={(e) => updatePlanField(plan.id, "priceMonthly", e.target.value)}
                  className="mt-2 text-2xl font-black text-[#F6C35B]"
                />
              </label>
            </div>

            <div className="mt-6 grid gap-2">
              {allPlatformFeatures.map((feature) => {
                const active = plan.features.includes(feature.id);

                return (
                  <button
                    key={feature.id}
                    onClick={() => toggleFeature(plan.id, feature.id)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 font-black transition ${
                      active
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : `${softPanel} text-[#CBB29C] hover:border-[#F6C35B]/25`
                    }`}
                  >
                    <span>{feature.title}</span>
                    {active ? <Check className="h-5 w-5" /> : <span>—</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => togglePlanActive(plan.id)}
                className={`flex-1 rounded-2xl border px-4 py-3 font-black transition ${
                  plan.active
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-red-500/40 bg-red-500/15 text-red-300"
                }`}
              >
                {plan.active ? "الباقة مفعلة" : "الباقة متوقفة"}
              </button>

              <button
                onClick={() => deletePlan(plan.id)}
                className="rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-3 font-black text-red-300"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </BentoCard>
        ))}
      </BentoGrid>
    </AdminPageShell>
  );
}

```

# File: components/admin/pages/admin-revenue-page.tsx

```tsx
"use client";

import { CircleDollarSign } from "lucide-react";
import { useMemo, useState } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  StatusBadge,
} from "@/components/ui/design-system";
import { type PlatformCafe } from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

type Props = {
  initialCafes: PlatformCafe[];
  configError?: string;
};

export function AdminRevenuePage({ initialCafes, configError }: Props) {
  const [cafes] = useState<PlatformCafe[]>(initialCafes);

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
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
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

```

# File: components/cafe/cafe-footer.tsx

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { LOGO } from "@/lib/ui/brand";
import { getThemeClasses, type CafeThemeId } from "@/lib/mock/cafe-theme";

type Props = {
  slug: string;
  cafeName: string;
  themeId?: CafeThemeId;
};

export function CafeFooter({ slug, cafeName, themeId = "soft-cream-3d" }: Props) {
  const theme = getThemeClasses(themeId);
  const isDark = themeId === "cyber-eco-dark" || themeId === "luxury-boutique";
  const logoSrc = isDark ? LOGO.dark : LOGO.brown;

  return (
    <footer className={`mt-12 border-t pt-8 ${theme.footer}`}>
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-5 pb-8">
        <p className={`text-center text-sm font-black ${theme.accent}`}>{cafeName}</p>

        <nav className={`flex flex-wrap items-center justify-center gap-4 text-sm font-bold ${theme.muted}`}>
          <Link href={`/c/${slug}/products/popular`} className={`transition hover:opacity-80 ${theme.link}`}>
            المنيو
          </Link>
          <Link href={`/c/${slug}/reserve`} className={`transition hover:opacity-80 ${theme.link}`}>
            الحجز
          </Link>
          <Link href={`/c/${slug}/products/branches`} className={`transition hover:opacity-80 ${theme.link}`}>
            الفروع
          </Link>
          <Link href={`/c/${slug}/account`} className={`transition hover:opacity-80 ${theme.link}`}>
            الحساب
          </Link>
        </nav>

        <div className={`flex items-center gap-2 rounded-full border px-4 py-2 ${theme.card}`}>
          <span className="text-[11px] font-bold tracking-wide opacity-80">صُمم بواسطة برندة</span>
          <span className="text-[10px] font-medium opacity-50" aria-hidden>
            ·
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
            Powered by Barndaksa
          </span>
          <Image
            src={logoSrc}
            alt="برندة"
            width={52}
            height={20}
            className="object-contain opacity-70"
          />
        </div>
      </div>
    </footer>
  );
}

```

# File: components/cafe/cafe-header.tsx

```tsx
"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { getThemeClasses, type CafeThemeId } from "@/lib/mock/cafe-theme";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";

type Props = {
  slug: string;
  cafeName: string;
  logoUrl?: string;
  themeId: CafeThemeId;
  customer: BarndaksaCustomerSession | null;
};

export function CafeHeader({ slug, cafeName, logoUrl, themeId, customer }: Props) {
  const theme = getThemeClasses(themeId);

  return (
    <header className={`sticky top-0 z-50 border-b backdrop-blur-xl ${theme.nav}`}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href={`/c/${slug}`} className="flex min-w-0 items-center gap-3">
          <CafeLogo name={cafeName} logoUrl={logoUrl} size="sm" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black">{cafeName}</h1>
            <p className={`truncate text-xs font-bold ${theme.muted}`}>منيو رقمي</p>
          </div>
        </Link>

        {customer ? (
          <Link
            href={`/c/${slug}/account`}
            className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black shadow-sm ${theme.button}`}
          >
            <UserRound className="h-4 w-4" />
            حسابي
          </Link>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/c/${slug}/login`}
              className={`rounded-2xl border px-3 py-2.5 text-sm font-black sm:px-4 ${theme.card}`}
            >
              دخول
            </Link>
            <Link
              href={`/c/${slug}/register`}
              className={`rounded-2xl px-3 py-2.5 text-sm font-black sm:px-4 ${theme.button}`}
            >
              حساب جديد
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

```

# File: components/cafe/cafe-layout.tsx

```tsx
"use client";

import type { ReactNode } from "react";
import {
  ThemedCafeShell,
  useCafeThemePage,
} from "@/components/cafe/themes/themed-cafe-shell";

type Props = {
  slug: string;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
};

/** غلاف موحّد لكل صفحات العميل — يطبق الثيم + previewTheme */
export function CafeLayout({ slug, children, className, maxWidth }: Props) {
  return (
    <ThemedCafeShell slug={slug} className={className} maxWidth={maxWidth}>
      {children}
    </ThemedCafeShell>
  );
}

/** سياق الثيم للصفحات الداخلية (داخل CafeLayout / ThemedCafeShell) */
export function useCafePageContext(slug: string) {
  const ctx = useCafeThemePage(slug);
  return {
    settings: ctx.settings,
    themeId: ctx.themeId,
    theme: ctx.theme,
    experience: ctx.experience,
    previewThemeId: ctx.previewThemeId,
    isPreview: ctx.isPreview,
    path: ctx.path,
    nextPath: ctx.nextPath,
  };
}

```

# File: components/cafe/cafe-logo.tsx

```tsx
"use client";

import { Coffee } from "lucide-react";

type Props = {
  name: string;
  logoUrl?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeMap = {
  sm: { box: "h-12 w-12", text: "text-lg", icon: "h-5 w-5", pad: "p-1" },
  md: { box: "h-16 w-16", text: "text-2xl", icon: "h-7 w-7", pad: "p-1.5" },
  lg: { box: "h-24 w-24", text: "text-3xl", icon: "h-10 w-10", pad: "p-2" },
  xl: { box: "h-32 w-32", text: "text-4xl", icon: "h-12 w-12", pad: "p-3" },
};

export function CafeLogo({ name, logoUrl, size = "md", className = "" }: Props) {
  const s = sizeMap[size];
  const initial = name.trim().charAt(0) || "ك";

  if (logoUrl) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F8F4EF] shadow-[6px_8px_24px_rgba(58,33,23,0.1)] ${s.box} ${className}`}
      >
        <img src={logoUrl} alt={name} className={`h-full w-full object-contain ${s.pad}`} />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3A2117] to-[#6B3A25] font-black text-[#F6C35B] shadow-[6px_8px_24px_rgba(58,33,23,0.15)] ${s.box} ${className}`}
      aria-hidden
    >
      {initial.length === 1 && /[\u0600-\u06FFa-zA-Z0-9]/.test(initial) ? (
        <span className={s.text}>{initial}</span>
      ) : (
        <Coffee className={s.icon} />
      )}
    </div>
  );
}

```

# File: components/cafe/cafe-page-client.tsx

```tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { CafeThemeRenderer } from "@/components/cafe/themes/cafe-theme-renderer";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { useCafeThemePage } from "@/lib/cafe/use-cafe-theme-page";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { getCustomerSession, type BarndaksaCustomerSession } from "@/lib/customer/session";
import type { MenuProduct } from "@/lib/mock/menu";

function productScore(product: MenuProduct, index: number) {
  return Number(product.loyaltyPoints || 0) + Number(product.price || 0) + (100 - index);
}

function CafePageInner({ slug }: { slug: string }) {
  const { themeId, theme, isPreview, previewThemeId, settings, loadError: cafeLoadError } =
    useCafeThemePage(slug);
  const {
    products,
    offers,
    loyaltySettings,
    loyaltyRewards,
    loading,
    error: menuError,
  } = usePublicCafeMenu(slug);
  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  const cafeLogoUrl = useResolvedCafeLogoUrl(settings);
  const availableProducts = products.filter((p) => p.available);
  const activeRewards = loyaltyRewards.filter((r) => r.active);

  const bannerOffers = offers.filter(
    (o) =>
      o.status === "نشط" &&
      o.visibleInCafe &&
      ((o.placement ?? "كلاهما") === "بانر الكوفي" ||
        (o.placement ?? "كلاهما") === "كلاهما")
  );

  const popularProducts = useMemo(
    () =>
      [...availableProducts]
        .sort((a, b) => productScore(b, 0) - productScore(a, 0))
        .slice(0, 4),
    [availableProducts]
  );

  const latestProducts = useMemo(
    () => [...availableProducts].slice(-4).reverse(),
    [availableProducts]
  );

  const loadError = cafeLoadError || menuError;

  if (loading) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#e8e4df]">
        <p className="font-black text-[#4a4540]">جاري التحميل...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#e8e4df] px-4">
        <p className="text-center font-black text-[#4a4540]">{loadError}</p>
      </main>
    );
  }

  return (
    <CafeThemeRenderer
      slug={slug}
      cafeSettings={settings}
      cafeLogoUrl={cafeLogoUrl}
      themeId={themeId}
      theme={theme}
      previewThemeId={previewThemeId}
      customer={customer}
      products={products}
      offers={offers}
      availableProducts={availableProducts}
      popularProducts={popularProducts}
      latestProducts={latestProducts}
      bannerOffers={bannerOffers}
      activeRewards={activeRewards}
      loyaltySettings={loyaltySettings}
      isPreview={isPreview}
    />
  );
}

export function CafePageClient({ slug }: { slug: string }) {
  return (
    <Suspense
      fallback={
        <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#e8e4df]">
          <p className="font-black text-[#4a4540]">جاري التحميل...</p>
        </main>
      }
    >
      <CafePageInner slug={slug} />
    </Suspense>
  );
}

```

# File: components/cafe/customer-notifications.tsx

```tsx
"use client";

import { Bell, Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCustomerNotificationsAction,
  markCustomerNotificationReadAction,
} from "@/app/actions/customer";
import type { AppNotification } from "@/lib/mock/notifications";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

type Props = {
  slug: string;
  customerId: string;
  experience: ThemeExperience;
};

export function CustomerNotifications({ slug, customerId, experience }: Props) {
  const { theme } = experience;
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refresh = useCallback(async () => {
    const list = await fetchCustomerNotificationsAction(slug);
    setNotifications(list);
  }, [slug, customerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  async function handleMarkRead(id: string) {
    await markCustomerNotificationReadAction(slug, id);
    await refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-2xl ${theme.card}`}
        aria-label="الإشعارات"
      >
        <Bell className={`h-4 w-4 ${theme.accent}`} />
        {unreadCount > 0 ? (
          <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute left-0 top-12 z-50 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-xl ${theme.card}`}
          >
            <div className={`flex items-center justify-between border-b px-4 py-3 ${theme.muted}`}>
              <h3 className="font-black">إشعاراتي</h3>
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className={`p-5 text-center text-sm font-bold ${theme.muted}`}>
                  لا توجد إشعارات
                </li>
              ) : (
                notifications.slice(0, 15).map((n) => (
                  <li
                    key={n.id}
                    className={`border-b px-4 py-3 ${n.read ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black">{n.title}</p>
                        <p className={`mt-1 text-xs font-bold ${theme.muted}`}>{n.body}</p>
                      </div>
                      {!n.read ? (
                        <button
                          onClick={() => void handleMarkRead(n.id)}
                          className="shrink-0 rounded-lg p-1.5 opacity-80"
                          aria-label="قراءة"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
            <button
              onClick={() => setOpen(false)}
              className={`flex w-full items-center justify-center gap-1 py-2 text-xs font-black ${theme.muted}`}
            >
              <X className="h-3 w-3" />
              إغلاق
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

```

# File: components/cafe/experience-campaign-section.tsx

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Camera, Send, Sparkles } from "lucide-react";
import { useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedInput } from "@/components/cafe/themes/themed-auth-panel";
import { ThemedSelect } from "@/components/cafe/themes/themed-reservation-panel";
import {
  platformLabels,
  type ExperienceCampaign,
  type ExperiencePlatform,
  type ExperienceSubmission,
} from "@/lib/mock/experience-campaigns";
import {
  fetchPublicExperienceCampaignsAction,
  submitExperienceCampaignAction,
} from "@/app/actions/customer";
import { getCustomerSession, type BarndaksaCustomerSession } from "@/lib/customer/session";

type Props = {
  slug?: string;
  compact?: boolean;
};

function ExperienceCampaignSectionInner({ slug: slugProp, compact }: Props) {
  const params = useParams<{ slug: string }>();
  const slug = slugProp || params.slug;
  const { experience, theme, path } = useCafePageContext(slug);

  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);
  const [campaigns, setCampaigns] = useState<ExperienceCampaign[]>([]);
  const [submissions, setSubmissions] = useState<ExperienceSubmission[]>([]);
  const [platform, setPlatform] = useState<ExperiencePlatform>("tiktok");
  const [videoUrl, setVideoUrl] = useState("");
  const [platformUsername, setPlatformUsername] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
    void fetchPublicExperienceCampaignsAction(slug).then(setCampaigns);
  }, [slug]);

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.cafeSlug === slug && c.status === "active"),
    [campaigns, slug]
  );

  const mySubmissions = useMemo(
    () =>
      submissions.filter(
        (s) => s.customerId === customer?.id && s.campaignId === activeCampaign?.id
      ),
    [submissions, customer, activeCampaign]
  );

  if (!activeCampaign) return null;

  async function handleSubmit() {
    if (!customer) {
      alert("سجّل دخولك أولاً");
      return;
    }
    if (!videoUrl.trim()) {
      alert("أدخل رابط الفيديو");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitExperienceCampaignAction({
        slug,
        customer,
        campaignId: activeCampaign!.id,
        platform,
        videoUrl,
        platformUsername,
        note,
      });

      if (result.ok) {
        setSubmissions((prev) => [result.submission, ...prev]);
        setVideoUrl("");
        setPlatformUsername("");
        setNote("");
        alert("تم إرسال مشاركتك — بانتظار مراجعة الكوفي");
      }
    } catch {
      alert("تعذر إرسال المشاركة");
    } finally {
      setSubmitting(false);
    }
  }

  const wrapClass = compact
    ? `rounded-2xl border p-5 ${theme.card}`
    : `rounded-[28px] border p-6 md:p-8 ${theme.card}`;

  return (
    <section className={`mt-8 ${wrapClass}`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${theme.hero}`}>
          <Camera className={`h-6 w-6 ${theme.accent}`} />
        </div>
        <div>
          <p className={`text-sm font-black ${theme.accent}`}>حملة نشطة</p>
          <h2 className={`text-2xl font-black ${experience.headingTracking}`}>
            {activeCampaign.title}
          </h2>
          <p className={`mt-2 font-bold ${theme.muted}`}>{activeCampaign.description}</p>
        </div>
      </div>

      <div className={`mt-4 rounded-2xl p-4 text-sm font-bold ${theme.hero}`}>
        <Sparkles className={`mb-2 inline h-4 w-4 ${theme.accent}`} />{" "}
        {activeCampaign.basePoints} نقطة أساسية + مكافآت حسب المشاهدات والتفاعل (حد{" "}
        {activeCampaign.maxPointsPerSubmission} نقطة)
      </div>

      {!customer ? (
        <div className="mt-4">
          <p className="font-black">سجّل دخولك للمشاركة في الحملة.</p>
          <Link
            href={path("login")}
            className={`mt-3 inline-flex rounded-2xl px-6 py-3 font-black ${theme.button}`}
          >
            تسجيل الدخول
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <ThemedSelect
            experience={experience}
            value={platform}
            onChange={(e) => setPlatform(e.target.value as ExperiencePlatform)}
          >
            {activeCampaign.platforms.map((p) => (
              <option key={p} value={p}>
                {platformLabels[p]}
              </option>
            ))}
          </ThemedSelect>
          <ThemedInput
            experience={experience}
            value={platformUsername}
            onChange={(e) => setPlatformUsername(e.target.value)}
            placeholder="اسم الحساب (@username)"
          />
          <ThemedInput
            experience={experience}
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="رابط الفيديو"
            className="md:col-span-2"
          />
          <ThemedInput
            experience={experience}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة (اختياري)"
            className="md:col-span-2"
          />
          <button
            type="button"
            onClick={handleSubmit}
            className={`inline-flex items-center justify-center gap-2 md:col-span-2 ${experience.reserve === "kiosk" ? "h-14 rounded-lg" : "h-12 rounded-2xl"} font-black ${theme.button}`}
          >
            <Send className="h-4 w-4" />
            إرسال المشاركة
          </button>
        </div>
      )}

      {mySubmissions.length > 0 ? (
        <div className="mt-6 space-y-2">
          <p className="font-black">مشاركاتك</p>
          {mySubmissions.map((s) => (
            <div
              key={s.id}
              className={`rounded-xl px-4 py-3 text-sm font-bold ${theme.hero}`}
            >
              {platformLabels[s.platform]} —{" "}
              {s.status === "pending"
                ? "بانتظار المراجعة"
                : s.status === "approved"
                  ? `مقبولة (+${s.awardedPoints ?? 0} نقطة)`
                  : "مرفوضة"}
            </div>
          ))}
        </div>
      ) : null}

      <p className={`mt-4 text-xs font-bold ${theme.muted}`}>{activeCampaign.terms}</p>
    </section>
  );
}

export function ExperienceCampaignSection(props: Props) {
  return (
    <Suspense fallback={null}>
      <ExperienceCampaignSectionInner {...props} />
    </Suspense>
  );
}

```

# File: components/cafe/offer-banner-image.tsx

```tsx
"use client";

import { LocalAssetImage } from "@/components/ui/local-asset-image";
import type { CafeOffer } from "@/lib/mock/offers";
import { isHttpImageUrl } from "@/lib/cafe/image-asset-pipeline";

type Props = {
  offer: Pick<CafeOffer, "bannerAssetId" | "bannerImageUrl">;
  className?: string;
  fallbackSrc?: string;
};

export function OfferBannerImage({ offer, className = "", fallbackSrc }: Props) {
  const external =
    isHttpImageUrl(offer.bannerImageUrl) ? offer.bannerImageUrl : undefined;

  return (
    <LocalAssetImage
      assetId={offer.bannerAssetId}
      fallbackSrc={external ?? fallbackSrc}
      alt=""
      className={className}
    />
  );
}

```

# File: components/cafe/product-collection-page.tsx

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedFilterBar,
  defaultProductFilters,
  type FilterBarState,
} from "@/components/cafe/themes/themed-filter-bar";
import {
  ThemedProductCard,
  getCollectionGridClass,
} from "@/components/cafe/themes/themed-product-card";
import { getCafePath } from "@/lib/cafe/theme-links";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import {
  getCustomerCategoryFilterOptions,
  productMatchesCategory,
  productMatchesPriceRange,
  resolveProductCategoryLabel,
} from "@/lib/cafe/menu-category-utils";
import type { MenuProduct } from "@/lib/mock/menu";

type Props = {
  slug: string;
  view: string;
};

const viewInfo: Record<string, { title: string; desc: string }> = {
  offers: {
    title: "العروض",
    desc: "كل العروض والخصومات والمنتجات الترويجية المتاحة في الكوفي.",
  },
  latest: {
    title: "أحدث المنتجات",
    desc: "أحدث المنتجات المضافة أولًا.",
  },
  popular: {
    title: "أكثر المنتجات طلبًا",
    desc: "المنتجات الأعلى طلبًا.",
  },
  branches: {
    title: "أقرب الفروع إليك",
    desc: "استعرض فروع الكوفي القريبة.",
  },
};

function getScore(product: MenuProduct, index: number) {
  return Number(product.loyaltyPoints || 0) + Number(product.price || 0) + (100 - index);
}

export function ProductCollectionPage({ slug, view }: Props) {
  const searchParams = useSearchParams();
  const { theme, settings, experience, path, previewThemeId } = useCafePageContext(slug);
  const { products, offers, branches, categories: menuCategories, loading, error } =
    usePublicCafeMenu(slug);

  const [filters, setFilters] = useState<FilterBarState>(() =>
    defaultProductFilters({
      category: searchParams.get("category") ?? "الكل",
      sort: view === "popular" ? "popular" : view === "latest" ? "latest" : "popular",
      onlyOffers: view === "offers",
    })
  );

  useEffect(() => {
    const fromUrl = searchParams.get("category");
    if (fromUrl) {
      setFilters((prev) => ({ ...prev, category: fromUrl }));
    }
  }, [searchParams]);

  const availableProducts = products.filter((product) => product.available);

  const categories = useMemo(
    () => getCustomerCategoryFilterOptions(availableProducts, menuCategories),
    [availableProducts, menuCategories]
  );

  function resetFilters() {
    setFilters(
      defaultProductFilters({
        sort: view === "popular" ? "popular" : view === "latest" ? "latest" : "popular",
      })
    );
  }

  const offerProductIds = useMemo(
    () =>
      new Set(
        offers
          .filter((offer) => offer.status === "نشط" && offer.visibleInCafe)
          .map((offer) => offer.linkedProductId)
          .filter(Boolean)
      ),
    [offers]
  );

  const orderedProducts = useMemo(() => {
    let list = [...availableProducts];

    if (view === "latest") list = [...list].reverse();
    if (view === "popular") list = list.sort((a, b) => getScore(b, 0) - getScore(a, 0));
    if (view === "offers") list = list.filter((item) => offerProductIds.has(item.id));

    list = list.filter((product) => {
      const categoryLabel = resolveProductCategoryLabel(product);
      const matchesQuery =
        product.name.includes(filters.query) ||
        product.description.includes(filters.query) ||
        categoryLabel.includes(filters.query);
      const matchesCategory = productMatchesCategory(
        product,
        filters.category,
        menuCategories
      );
      const matchesPrice = productMatchesPriceRange(product, filters.priceRange);
      const matchesOffer =
        filters.onlyOffers || filters.sort === "offers"
          ? offerProductIds.has(product.id)
          : true;
      return matchesQuery && matchesCategory && matchesPrice && matchesOffer;
    });

    if (filters.sort === "offers") {
      list = list.filter((item) => offerProductIds.has(item.id));
    }
    if (filters.sort === "popular") list = list.sort((a, b) => getScore(b, 0) - getScore(a, 0));
    if (filters.sort === "price-low") list = list.sort((a, b) => a.price - b.price);
    if (filters.sort === "price-high") list = list.sort((a, b) => b.price - a.price);
    if (filters.sort === "latest") list = [...list].reverse();

    return list;
  }, [availableProducts, view, filters, offerProductIds, menuCategories]);

  const activeOffers = offers.filter((o) => o.status === "نشط" && o.visibleInCafe);
  const activeBranches = branches.filter((b) => b.active !== false);
  const gridClass = getCollectionGridClass(experience.collection);

  if (loading) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">جاري التحميل...</p>
        </div>
      </CafeLayout>
    );
  }

  if (error) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">{error}</p>
        </div>
      </CafeLayout>
    );
  }

  if (view === "branches") {
    return (
      <CafeLayout slug={slug}>
        <Link
          href={path()}
          className={`mb-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-black ${theme.buttonOutline}`}
        >
          <ArrowRight className="h-4 w-4" />
          رجوع للكوفي
        </Link>
        <h1 className={`text-4xl font-black ${experience.headingTracking}`}>
          فروع {settings.cafeName}
        </h1>
        <p className={`mt-2 font-bold ${theme.muted}`}>اختر الفرع الأقرب واحجز مباشرة.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {activeBranches.length ? (
            activeBranches.map((branch) => (
              <article key={branch.id} className={`p-6 ${theme.card}`}>
                <MapPin className={`mb-3 h-7 w-7 ${theme.accent}`} />
                <h2 className="text-2xl font-black">{branch.name}</h2>
                <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{branch.address}</p>
                {branch.mapUrl ? (
                  <a
                    href={branch.mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-4 inline-flex rounded-2xl px-5 py-2.5 text-sm font-black ${theme.button}`}
                  >
                    عرض على الخريطة
                  </a>
                ) : null}
              </article>
            ))
          ) : (
            <p className={`font-bold ${theme.muted}`}>لا توجد فروع متاحة حاليًا.</p>
          )}
        </div>
      </CafeLayout>
    );
  }

  return (
    <CafeLayout slug={slug}>
      <Link
        href={path()}
        className={`mb-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-black ${theme.buttonOutline}`}
      >
        <ArrowRight className="h-4 w-4" />
        رجوع للكوفي
      </Link>

      <div className="space-y-8">
        <div>
          <p className={`font-black ${theme.accent}`}>{viewInfo[view]?.title || "المنتجات"}</p>
          <h1
            className={`mt-2 break-words text-3xl font-black sm:text-4xl lg:text-5xl ${experience.headingTracking}`}
          >
            {viewInfo[view]?.title || "منتجات الكوفي"}
          </h1>
          <p className={`mt-3 max-w-2xl font-bold ${theme.muted}`}>
            {viewInfo[view]?.desc || "استعرض منتجات الكوفي."}
          </p>
        </div>

        <ThemedFilterBar
          experience={experience}
          categories={categories}
          state={filters}
          onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
          onReset={resetFilters}
        />

        {view === "offers" && activeOffers.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-4 text-2xl font-black">العروض النشطة</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {activeOffers.map((offer) => (
                <article key={offer.id} className={`p-5 ${theme.card}`}>
                  <p className={`font-black ${theme.accent}`}>{offer.type}</p>
                  <h3 className="mt-2 text-xl font-black">{offer.title}</h3>
                  <p className={`mt-2 text-sm ${theme.muted}`}>{offer.description}</p>
                  {offer.discountPercent ? (
                    <span
                      className={`mt-3 inline-block rounded-xl px-3 py-1 text-sm font-black ${theme.badge}`}
                    >
                      خصم {offer.discountPercent}%
                    </span>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-black">المنتجات</h2>
            <span className={`rounded-xl px-4 py-2 text-sm font-black ${theme.badge}`}>
              {orderedProducts.length} منتج
            </span>
          </div>

          <div className={gridClass}>
            {orderedProducts.map((item) => (
              <ThemedProductCard
                key={item.id}
                slug={slug}
                product={item}
                experience={experience}
                href={getCafePath(slug, `product/${item.id}`, previewThemeId)}
              />
            ))}
          </div>

          {!orderedProducts.length ? (
            <div className={`mt-8 p-10 text-center ${theme.card}`}>
              <h3 className="text-2xl font-black">لا توجد منتجات مطابقة للفلاتر الحالية</h3>
              <p className={`mt-2 ${theme.muted}`}>جرّب تغيير التصنيف أو مسح الفلاتر.</p>
              <button
                type="button"
                onClick={resetFilters}
                className={`mt-5 rounded-2xl px-6 py-3 text-sm font-black ${theme.button}`}
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </CafeLayout>
  );
}

```

# File: components/cafe/product-detail-client.tsx

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Coffee, Minus, Plus, ShoppingBag, MapPin, Clock } from "lucide-react";
import { createCafeOrderAction } from "@/app/actions/orders";
import { formatSar } from "@/lib/format";
import { promoBadgeText, type MenuProduct } from "@/lib/mock/menu";
import type { CafeBranch } from "@/lib/mock/branches";
import { ProductReviews } from "@/components/cafe/product-reviews";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedProductDetailLayout } from "@/components/cafe/themes/themed-product-detail";
import { getCustomerSession } from "@/lib/customer/session";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { appendPreviewToNextPath, getCafePath } from "@/lib/cafe/theme-links";
import { ProductImage } from "@/components/cafe/product-image";
import { resolveProductCategoryLabel } from "@/lib/cafe/menu-category-utils";

const TAX_RATE = 0.15;

function defaultPickupTime(leadMinutes = 30) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + leadMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProductDetailClient({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const { theme, experience, previewThemeId, path } = useCafePageContext(slug);
  const { products, branches, loading, error } = usePublicCafeMenu(slug);
  const [quantity, setQuantity] = useState(1);
  const [branchName, setBranchName] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const active = branches.filter((b: CafeBranch) => b.active);
    if (active[0]) setBranchName(active[0].name);
  }, [branches]);

  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);

  useEffect(() => {
    if (!product) return;
    setPickupAt(defaultPickupTime(product.pickupLeadTimeMinutes ?? 30));
  }, [product]);

  const activeBranches = branches.filter((b) => b.active);

  const subtotal = product ? product.price * quantity : 0;
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const loyaltyPoints = Math.floor(total);

  async function addToOrder() {
    if (!product) return;
    const customer = await getCustomerSession(slug);
    if (!customer) {
      const next = appendPreviewToNextPath(`/c/${slug}/product/${id}`, previewThemeId);
      router.push(`${path("login")}?next=${encodeURIComponent(next)}`);
      return;
    }

    if (!branchName) {
      alert("اختر فرع الاستلام");
      return;
    }

    if (!pickupAt) {
      alert("حدد وقت الاستلام");
      return;
    }

    setAdding(true);
    try {
      const pickupLabel = pickupAt.replace("T", " ");
      const result = await createCafeOrderAction({
        slug,
        customer,
        product,
        quantity,
        branchName,
        pickupAt: pickupLabel,
        notes: notes.trim() || undefined,
      });
      alert(
        `تم إرسال طلب الاستلام!\nالإجمالي: ${result.total} ر.س\nالدفع عند الاستلام.\nبانتظار موافقة الكوفي.`
      );
      router.push(appendPreviewToNextPath(path("account"), previewThemeId));
    } catch {
      alert("تعذر إرسال الطلب. حاول مرة أخرى.");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">جاري التحميل...</p>
        </div>
      </CafeLayout>
    );
  }

  if (error) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">{error}</p>
        </div>
      </CafeLayout>
    );
  }

  if (!product) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <h1 className="text-3xl font-black">المنتج غير موجود</h1>
          <Link href={path()} className={`mt-5 inline-block px-6 py-3 font-black ${theme.button}`}>
            رجوع للمنيو
          </Link>
        </div>
      </CafeLayout>
    );
  }

  const pickupAvailable = product.availableForPickup !== false;
  const categoryLabel = resolveProductCategoryLabel(product);

  const metaBadges: { icon?: typeof Clock; text: string }[] = [];
  if (product.preparationTimeMinutes && product.preparationTimeMinutes > 0) {
    metaBadges.push({
      icon: Clock,
      text: `جاهز خلال ${product.preparationTimeMinutes} دقيقة`,
    });
  }
  if (product.redeemableWithPoints && product.redemptionPoints) {
    metaBadges.push({
      text: `يمكن استبداله مقابل ${product.redemptionPoints} نقطة`,
    });
  }
  if (loyaltyPoints > 0) {
    metaBadges.push({
      text: `تكسب +${loyaltyPoints} نقطة عند الطلب`,
    });
  }

  const imageSlot = (
    <div className="relative flex h-[min(420px,50vh)] items-center justify-center overflow-hidden rounded-2xl bg-black/5">
      <ProductImage
        product={product}
        alt={product.name}
        className="relative z-10 max-h-full w-full object-contain p-6"
        fallback={<Coffee className="relative z-10 h-16 w-16 opacity-40" />}
      />
    </div>
  );

  const infoSlot = (
    <>
      <p className={`text-sm font-black ${theme.accent}`}>{categoryLabel}</p>
      <h1
        className={`mt-2 font-black ${experience.detail === "kiosk" ? "text-4xl" : "text-3xl sm:text-4xl"} ${experience.headingTracking}`}
      >
        {product.name}
      </h1>
      <p className={`mt-4 leading-9 ${theme.muted}`}>{product.description}</p>

      {metaBadges.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {metaBadges.map((badge) => (
            <span
              key={badge.text}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black ${theme.badge}`}
            >
              {badge.icon ? <badge.icon className="h-4 w-4" /> : null}
              {badge.text}
            </span>
          ))}
        </div>
      ) : null}

      {product.promo ? (
        <div className={`mt-5 rounded-2xl p-4 ${theme.card}`}>
          <p className={`text-sm font-bold ${theme.muted}`}>عرض مرتبط</p>
          <h3 className={`mt-1 text-xl font-black ${theme.accent}`}>
            {promoBadgeText(product.promo)}
          </h3>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-4">
        <span className="text-sm font-black">الكمية</span>
        <div className={`flex items-center gap-2 rounded-2xl border p-1 ${theme.card}`}>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl font-black"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-xl font-black">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl font-black"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["السعر", formatSar(product.price)],
          ["الضريبة", formatSar(taxAmount)],
          ["الإجمالي", formatSar(total)],
          ["نقاط الولاء", `+${loyaltyPoints}`],
        ].map(([label, val]) => (
          <div key={label} className={`rounded-2xl p-3 text-center ${theme.card}`}>
            <p className={`text-xs font-black ${theme.muted}`}>{label}</p>
            <p className="mt-1 font-black">{val}</p>
          </div>
        ))}
      </div>

      {pickupAvailable ? (
        <div className={`mt-6 space-y-4 rounded-2xl p-4 ${theme.card}`}>
          <p className="text-sm font-black">تفاصيل الاستلام</p>

          <label className="block">
            <span className={`flex items-center gap-1 text-xs font-black ${theme.muted}`}>
              <MapPin className="h-3.5 w-3.5" />
              فرع الاستلام
            </span>
            <select
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none ${theme.card}`}
            >
              {activeBranches.map((branch) => (
                <option key={branch.id} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={`flex items-center gap-1 text-xs font-black ${theme.muted}`}>
              <Clock className="h-3.5 w-3.5" />
              وقت الاستلام
            </span>
            <input
              type="datetime-local"
              value={pickupAt}
              onChange={(e) => setPickupAt(e.target.value)}
              className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none ${theme.card}`}
            />
          </label>

          <label className="block">
            <span className={`text-xs font-black ${theme.muted}`}>ملاحظات (اختياري)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="مثال: بدون سكر، ثلج قليل..."
              className={`mt-2 w-full resize-none rounded-xl border px-4 py-3 text-sm font-bold outline-none ${theme.card}`}
            />
          </label>

          <div className={`rounded-xl border border-dashed p-4 text-sm font-bold ${theme.muted}`}>
            الدفع عند الاستلام — لا يتم خصم أي مبلغ الآن. سيتم تأكيد الطلب بعد موافقة الكوفي.
          </div>
        </div>
      ) : (
        <div className={`mt-6 rounded-2xl p-4 text-sm font-bold ${theme.card} ${theme.muted}`}>
          هذا المنتج غير متاح للاستلام حاليًا.
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-lg font-black">المكونات</h2>
        <div className="flex flex-wrap gap-2">
          {product.ingredients.map((ing) => (
            <span key={ing} className={`rounded-full px-3 py-1.5 text-sm font-black ${theme.badge}`}>
              {ing}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void addToOrder()}
        disabled={adding || !pickupAvailable}
        className={`mt-8 flex w-full items-center justify-center gap-2 font-black disabled:opacity-60 ${
          experience.detail === "kiosk" ? "h-16 text-lg rounded-lg" : "h-16 rounded-2xl text-lg"
        } ${theme.button}`}
      >
        <ShoppingBag className="h-6 w-6" />
        {adding ? "جاري الإرسال..." : "اطلب للاستلام — الدفع عند الاستلام"}
      </button>
    </>
  );

  return (
    <CafeLayout slug={slug}>
      <Link
        href={getCafePath(slug, "products/popular", previewThemeId)}
        className={`mb-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-black ${theme.buttonOutline}`}
      >
        <ArrowRight className="h-4 w-4" />
        رجوع للمنيو
      </Link>

      <ThemedProductDetailLayout
        experience={experience}
        imageSlot={imageSlot}
        infoSlot={infoSlot}
        reviewsSlot={
          <ProductReviews
            slug={slug}
            productId={product.id}
            productName={product.name}
            experience={experience}
            previewThemeId={previewThemeId}
          />
        }
      />
    </CafeLayout>
  );
}

```

# File: components/cafe/product-image.tsx

```tsx
"use client";

import { LocalAssetImage } from "@/components/ui/local-asset-image";
import type { MenuProduct } from "@/lib/mock/menu";
import { isHttpImageUrl } from "@/lib/cafe/image-asset-pipeline";

type Props = {
  product: Pick<MenuProduct, "imageAssetId" | "imageDataUrl">;
  alt: string;
  className?: string;
  previewUrl?: string;
  fallback?: React.ReactNode;
};

export function ProductImage({
  product,
  alt,
  className = "",
  previewUrl,
  fallback = null,
}: Props) {
  const externalUrl = isHttpImageUrl(product.imageDataUrl)
    ? product.imageDataUrl ?? undefined
    : product.imageDataUrl?.startsWith("data:image")
      ? product.imageDataUrl
      : undefined;

  return (
    <LocalAssetImage
      assetId={product.imageAssetId}
      fallbackSrc={externalUrl}
      previewUrl={previewUrl}
      alt={alt}
      className={className}
      fallback={fallback}
    />
  );
}

```

# File: components/cafe/product-reviews.tsx

```tsx
"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchProductReviewsAction,
  submitProductReviewAction,
} from "@/app/actions/customer";
import { getCustomerSession } from "@/lib/customer/session";
import { type CafeReview } from "@/lib/mock/reviews";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import { ThemedTextarea } from "@/components/cafe/themes/themed-reservation-panel";

export function ProductReviews({
  slug,
  productId,
  productName,
  experience,
  previewThemeId,
}: {
  slug: string;
  productId: string;
  productName: string;
  experience: ThemeExperience;
  previewThemeId?: string | null;
}) {
  const { theme } = experience;
  const [reviews, setReviews] = useState<CafeReview[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetchProductReviewsAction(slug, productId)
      .then(setReviews)
      .finally(() => setLoading(false));
  }, [slug, productId]);

  const productReviews = reviews.filter((r) => r.productId === productId && r.status === "ظاهر");

  async function submitReview() {
    const customer = await getCustomerSession(slug);

    if (!customer) {
      const next = appendPreviewToNextPath(`/c/${slug}/product/${productId}`, previewThemeId);
      window.location.href = `/c/${slug}/login?next=${encodeURIComponent(next)}`;
      return;
    }

    if (!comment.trim() && !question.trim()) {
      alert("اكتب تعليق أو سؤال");
      return;
    }

    setSubmitting(true);
    try {
      await submitProductReviewAction({
        cafeSlug: slug,
        productId,
        customerId: customer.id,
        customerName: customer.fullName,
        rating,
        comment: comment.trim() || question.trim(),
      });
      setComment("");
      setQuestion("");
      alert("تم إرسال تقييمك وسيظهر بعد المراجعة");
      const next = await fetchProductReviewsAction(slug, productId);
      setReviews(next);
    } catch {
      alert("تعذر إرسال التقييم");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={`mt-10 p-6 ${theme.card}`}>
      <h2 className={`flex items-center gap-2 text-2xl font-black ${experience.headingTracking}`}>
        <MessageSquareText className="h-6 w-6" />
        الأسئلة والتقييمات
      </h2>

      {loading ? (
        <p className={`mt-6 ${theme.muted}`}>جاري التحميل...</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            {productReviews.length ? (
              productReviews.map((review) => (
                <article key={review.id} className={`rounded-2xl p-4 ${theme.buttonOutline}`}>
                  <div className="flex justify-between gap-3">
                    <h3 className="font-black">{review.customerName}</h3>
                    <div className={`flex gap-1 ${theme.accent}`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < review.rating ? "fill-current" : ""}`} />
                      ))}
                    </div>
                  </div>
                  <p className={`mt-2 ${theme.muted}`}>{review.comment}</p>
                  {review.question ? (
                    <p className="mt-2 font-bold">سؤال: {review.question}</p>
                  ) : null}
                  {review.answer ? (
                    <p className={`mt-2 rounded-2xl p-3 font-bold ${theme.card}`}>
                      رد الكوفي: {review.answer}
                    </p>
                  ) : null}
                </article>
              ))
            ) : (
              <p className={`rounded-2xl p-5 ${theme.muted}`}>لا توجد تقييمات على هذا المنتج حتى الآن.</p>
            )}
          </div>

          <aside className={`rounded-2xl p-4 ${theme.buttonOutline}`}>
            <p className="font-black">أضف تقييمك أو سؤالك</p>

            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className={`mt-3 w-full ${experience.formInput}`}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} نجوم
                </option>
              ))}
            </select>

            <ThemedTextarea
              experience={experience}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="تعليقك على المنتج"
              className="mt-3 h-24"
            />
            <ThemedTextarea
              experience={experience}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="سؤالك عن المنتج"
              className="mt-3 h-24"
            />

            <button
              type="button"
              onClick={() => void submitReview()}
              disabled={submitting}
              className={`mt-3 h-12 w-full font-black disabled:opacity-60 ${theme.button}`}
            >
              {submitting ? "جاري الإرسال..." : "إرسال"}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}

```

# File: components/cafe/themes/brand-identity-custom-theme.tsx

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import {
  featuredSectionTitle,
  resolveFeaturedProducts,
} from "@/lib/cafe/custom-identity-featured";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { CafeHeader } from "@/components/cafe/cafe-header";
import { getCafePath } from "@/lib/cafe/theme-links";
import {
  buildCustomIdentityCssVars,
  defaultCustomIdentityTheme,
  OVERLAY_OPACITY,
  type CustomIdentityTheme,
} from "@/lib/mock/custom-identity-theme";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import {
  CafeIdentityBlock,
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

type BgTarget = "page" | "hero" | "banner";

function scopeApplies(scope: CustomIdentityTheme["backgroundScope"], target: BgTarget) {
  if (scope === "all-customer-pages" || scope === "home-only") return target === "page";
  if (scope === "hero-only") return target === "hero";
  if (scope === "top-banner") return target === "banner";
  return false;
}

function IdentityBackground({
  identity,
  backgroundUrl,
  target,
  className = "",
  children,
}: {
  identity: CustomIdentityTheme;
  backgroundUrl?: string;
  target: BgTarget;
  className?: string;
  children: ReactNode;
}) {
  if (!backgroundUrl || !scopeApplies(identity.backgroundScope, target)) {
    return <div className={className}>{children}</div>;
  }

  const overlay = OVERLAY_OPACITY[identity.overlayStrength];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${backgroundUrl})`,
          backgroundSize: identity.backgroundFit,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: `rgba(0,0,0,${overlay})` }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function BrandIdentityCustomTheme(props: CafeThemePageProps) {
  const {
    slug,
    cafeSettings,
    themeId,
    theme,
    bannerOffers,
    previewThemeId,
    availableProducts,
    popularProducts,
    latestProducts,
    cafeLogoUrl,
    customIdentityPreviewUrls,
  } = props;

  const [identity, setIdentity] = useState(
    () => props.customIdentityOverride ?? defaultCustomIdentityTheme()
  );
  const [categories, setCategories] = useState(() => props.menuCategories ?? []);

  useEffect(() => {
    if (props.customIdentityOverride) {
      setIdentity(props.customIdentityOverride);
    }
    if (props.menuCategories) {
      setCategories(props.menuCategories);
    }
  }, [props.customIdentityOverride, props.menuCategories]);

  const { logoUrl: identityLogoUrl, backgroundUrl } = useCustomIdentityVisuals(
    identity,
    customIdentityPreviewUrls
  );

  const cssVars = buildCustomIdentityCssVars(identity.palette) as CSSProperties;
  const logoUrl = identityLogoUrl ?? cafeLogoUrl;

  const featuredProducts = useMemo(
    () =>
      resolveFeaturedProducts(
        { availableProducts, popularProducts, latestProducts },
        identity,
        categories
      ),
    [availableProducts, popularProducts, latestProducts, identity, categories]
  );

  const sectionTitle = featuredSectionTitle(identity, categories);

  return (
    <main
      dir="rtl"
      className={`min-h-screen brand-identity-custom-theme ${theme.page}`}
      style={cssVars}
    >
      <IdentityBackground
        identity={identity}
        backgroundUrl={backgroundUrl}
        target="banner"
        className="border-b border-black/5"
      >
        <CafeHeader
          slug={slug}
          cafeName={cafeSettings.cafeName}
          logoUrl={logoUrl}
          themeId={themeId}
          customer={props.customer}
        />
      </IdentityBackground>

      <IdentityBackground identity={identity} backgroundUrl={backgroundUrl} target="page">
        <div className="mx-auto max-w-5xl px-5 py-8">
          <IdentityBackground identity={identity} backgroundUrl={backgroundUrl} target="hero">
            <section className={`rounded-3xl p-8 ${theme.hero}`}>
              <CafeIdentityBlock
                cafeName={cafeSettings.cafeName}
                logoUrl={logoUrl}
                description={cafeSettings.description}
                theme={theme}
              />
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={getCafePath(slug, "products/popular", previewThemeId)}
                  className={`rounded-2xl px-6 py-3 font-black ${theme.button}`}
                >
                  تصفح المنيو
                </Link>
                <Link
                  href={getCafePath(slug, "reserve", previewThemeId)}
                  className={`rounded-2xl px-6 py-3 font-black ${theme.buttonOutline}`}
                >
                  احجز طاولة
                </Link>
              </div>
            </section>
          </IdentityBackground>

          <nav className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {buildCafeNavItems(slug, previewThemeId).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-2xl py-4 text-center text-xs font-black ${theme.card}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <ThemeCategoryStrip
            slug={slug}
            theme={theme}
            previewThemeId={previewThemeId}
            className="mt-6"
          />

          {bannerOffers.length > 0 ? (
            <ThemeBannerCarousel
              slug={slug}
              offers={bannerOffers}
              theme={theme}
              previewThemeId={previewThemeId}
              variant="soft"
            />
          ) : null}

          {featuredProducts.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-4 text-xl font-black">{sectionTitle}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {featuredProducts.map((p) => (
                  <ThemeProductCard
                    key={p.id}
                    slug={slug}
                    product={p}
                    theme={theme}
                    previewThemeId={previewThemeId}
                    size="compact"
                  />
                ))}
              </div>
            </section>
          ) : null}

          <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
        </div>
      </IdentityBackground>
    </main>
  );
}

```

# File: components/cafe/themes/cafe-theme-renderer.tsx

```tsx
"use client";

import type { ComponentType } from "react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import { MarketplaceAmazonTheme } from "./marketplace-amazon-theme";
import { PremiumAppleTheme } from "./premium-apple-theme";
import { NoonCommerceTheme } from "./noon-commerce-theme";
import { LuxuryBoutiqueTheme } from "./luxury-boutique-theme";
import { MobileFirstCafeTheme } from "./mobile-first-cafe-theme";
import { CyberEcoDarkTheme } from "./cyber-eco-dark-theme";
import { SoftCream3dTheme } from "./soft-cream-3d-theme";
import { MagazineEditorialTheme } from "./magazine-editorial-theme";
import { FastOrderKioskTheme } from "./fast-order-kiosk-theme";
import { ReservationLoungeTheme } from "./reservation-lounge-theme";
import { BrandIdentityCustomTheme } from "./brand-identity-custom-theme";

const THEME_COMPONENTS: Record<CafeThemeId, ComponentType<CafeThemePageProps>> = {
  "marketplace-amazon": MarketplaceAmazonTheme,
  "premium-apple": PremiumAppleTheme,
  "noon-commerce": NoonCommerceTheme,
  "luxury-boutique": LuxuryBoutiqueTheme,
  "mobile-first-cafe": MobileFirstCafeTheme,
  "cyber-eco-dark": CyberEcoDarkTheme,
  "soft-cream-3d": SoftCream3dTheme,
  "magazine-editorial": MagazineEditorialTheme,
  "fast-order-kiosk": FastOrderKioskTheme,
  "reservation-lounge": ReservationLoungeTheme,
  "brand-identity-custom": BrandIdentityCustomTheme,
};

export function CafeThemeRenderer(props: CafeThemePageProps) {
  const Component = THEME_COMPONENTS[props.themeId] ?? SoftCream3dTheme;
  return <Component {...props} />;
}

```

# File: components/cafe/themes/cyber-eco-dark-theme.tsx

```tsx
"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeSearchBar,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function CyberEcoDarkTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,230,118,0.08),_transparent_50%)]" />
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={props.cafeLogoUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <div className="relative mx-auto max-w-5xl px-4 py-8">
        <section className={`rounded-lg border p-8 ${theme.hero}`}>
          <p className={`font-mono text-xs ${theme.accent}`}>// eco_mode.on</p>
          <h1 className="mt-2 text-3xl font-black">{cafeSettings.cafeName}</h1>
          <p className={`mt-3 ${theme.muted}`}>{cafeSettings.description}</p>
          <div className="mt-6">
            <ThemeSearchBar slug={slug} theme={theme} placeholder="بحث ذكي في المنيو" />
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-2">
          {buildCafeNavItems(slug).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-lg border px-4 py-2 text-sm font-bold ${theme.buttonOutline}`}
            >
              {label}
            </Link>
          ))}
        </div>

        <ThemeCategoryStrip slug={slug} theme={theme} className="mt-4" />

        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} variant="neon" />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-8">
            <h2 className={`mb-4 font-mono text-sm ${theme.accent}`}>featured[]</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="compact" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}

```

# File: components/cafe/themes/fast-order-kiosk-theme.tsx

```tsx
"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { ThemePageFooter, ThemeProductCard, ThemeCategoryStrip, buildCafeNavItems } from "./theme-shared";

export function FastOrderKioskTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, availableProducts } = props;
  const items = availableProducts.slice(0, 8);

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <header className={`${theme.header} px-6 py-5`}>
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <CafeLogo name={cafeSettings.cafeName} logoUrl={props.cafeLogoUrl} size="md" />
          <Link
            href={`/c/${slug}/products/popular`}
            className={`rounded-lg px-6 py-3 text-lg font-black ${theme.buttonOutline}`}
          >
            كل المنيو
          </Link>
        </div>
      </header>

      <section className={`${theme.hero} px-6 py-8 text-center`}>
        <h1 className="text-4xl font-black">اختر واطلب</h1>
        <p className="mt-2 text-lg opacity-90">اضغط على المنتج للتفاصيل والطلب</p>
      </section>

      <div className="mx-auto max-w-4xl px-4">
        <ThemeCategoryStrip slug={slug} theme={theme} className="pb-4" />
      </div>

      <div className="mx-auto max-w-4xl space-y-3 px-4 py-6">
        {items.map((p) => (
          <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="kiosk" />
        ))}
      </div>

      <div className={`sticky bottom-0 ${theme.nav} px-4 py-4`}>
        <div className="mx-auto flex max-w-4xl gap-3">
          {buildCafeNavItems(slug).slice(0, 3).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex-1 rounded-lg py-4 text-center font-black"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
    </main>
  );
}

```

# File: components/cafe/themes/luxury-boutique-theme.tsx

```tsx
"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function LuxuryBoutiqueTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers } = props;
  const hero = popularProducts[0];

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <nav className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-5 ${theme.nav}`}>
        <CafeLogo name={cafeSettings.cafeName} logoUrl={props.cafeLogoUrl} size="sm" />
        <div className="flex gap-6 text-sm font-medium tracking-wide">
          {buildCafeNavItems(slug).slice(0, 3).map(({ href, label }) => (
            <Link key={href} href={href} className={theme.link}>
              {label}
            </Link>
          ))}
          <Link href={`/c/${slug}/account`} className={theme.accent}>
            الحساب
          </Link>
        </div>
      </nav>

      <section className={`relative min-h-[70vh] pt-24 ${theme.hero}`}>
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-20 text-center">
          <p className={`text-xs tracking-[0.3em] uppercase ${theme.accent}`}>تجربة حصرية</p>
          <h1 className="mt-6 break-words font-serif text-3xl font-light sm:text-5xl lg:text-7xl">
            {cafeSettings.cafeName}
          </h1>
          <p className={`mt-6 max-w-2xl text-lg leading-relaxed ${theme.muted}`}>
            {cafeSettings.description || "قصة كل كوب تبدأ هنا."}
          </p>
          {hero ? (
            <Link
              href={`/c/${slug}/product/${hero.id}`}
              className={`mt-10 inline-block px-10 py-4 text-sm tracking-widest ${theme.button}`}
            >
              اكتشف {hero.name}
            </Link>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <ThemeCategoryStrip slug={slug} theme={theme} className="py-8 justify-center" variant="cards" />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-12">
        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel
            slug={slug}
            offers={bannerOffers}
            theme={theme}
            variant="cinematic"
          />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-16 space-y-8">
            <h2 className={`text-center text-sm tracking-[0.2em] ${theme.accent}`}>المجموعة</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="story" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}

```

# File: components/cafe/themes/magazine-editorial-theme.tsx

```tsx
"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function MagazineEditorialTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <header className={`border-b-2 px-6 py-4 ${theme.header}`}>
        <div className="mx-auto flex max-w-6xl items-end justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Issue · 2026</p>
            <h1 className="mt-1 break-words text-3xl font-black sm:text-4xl lg:text-6xl">
              {cafeSettings.cafeName}
            </h1>
          </div>
          <nav className="hidden gap-6 text-sm font-black md:flex">
            {buildCafeNavItems(slug).map(({ href, label }) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section className={`px-6 py-16 ${theme.hero}`}>
        <p className="mx-auto max-w-3xl text-center text-lg leading-relaxed opacity-90">
          {cafeSettings.description || "تحرير خاص بقهوة المختصين."}
        </p>
      </section>

      <div className="mx-auto max-w-6xl px-6 pb-8">
        <ThemeCategoryStrip slug={slug} theme={theme} className="justify-center" variant="cards" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-12">
        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel
            slug={slug}
            offers={bannerOffers}
            theme={theme}
            variant="editorial"
          />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-12 space-y-10">
            {popularProducts.map((p, i) => (
              <div key={p.id}>
                <p className={`mb-2 text-xs font-black ${theme.accent}`}>
                  {String(i + 1).padStart(2, "0")} — قصة المنتج
                </p>
                <ThemeProductCard slug={slug} product={p} theme={theme} size="story" />
              </div>
            ))}
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}

```

# File: components/cafe/themes/marketplace-amazon-theme.tsx

```tsx
"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { getCafePath } from "@/lib/cafe/theme-links";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeSearchBar,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function MarketplaceAmazonTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers, customer, previewThemeId } =
    props;
  const nav = buildCafeNavItems(slug, previewThemeId);

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <header className={`${theme.header} sticky top-0 z-50`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href={getCafePath(slug, "", previewThemeId)} className="flex items-center gap-3">
            <CafeLogo name={cafeSettings.cafeName} logoUrl={props.cafeLogoUrl} size="sm" />
            <span className="font-black">{cafeSettings.cafeName}</span>
          </Link>
          <Link
            href={customer ? getCafePath(slug, "account", previewThemeId) : getCafePath(slug, "login", previewThemeId)}
            className={`flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-bold ${theme.button}`}
          >
            <UserRound className="h-4 w-4" />
            {customer ? "حسابي" : "دخول"}
          </Link>
        </div>
        <div className={`${theme.nav} px-4 py-3`}>
          <div className="mx-auto max-w-6xl">
            <ThemeSearchBar slug={slug} theme={theme} previewThemeId={previewThemeId} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <section className={`rounded-sm p-6 ${theme.hero}`}>
          <p className="text-sm font-bold opacity-90">تسوق من {cafeSettings.cafeName}</p>
          <h1 className="mt-2 text-2xl font-black md:text-3xl">
            {cafeSettings.description?.slice(0, 80) || "كل المنتجات في مكان واحد"}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-sm px-4 py-2 text-sm font-bold ${theme.button}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        <ThemeCategoryStrip slug={slug} theme={theme} className="mt-6" variant="cards" />

        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} previewThemeId={previewThemeId} variant="wide" />
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between border-b border-[#d5d9d9] pb-2">
            <h2 className="text-xl font-black">الأكثر مبيعًا</h2>
            <Link href={getCafePath(slug, "products/popular", previewThemeId)} className={`text-sm font-bold ${theme.link}`}>
              عرض الكل ←
            </Link>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {popularProducts.map((p) => (
              <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} previewThemeId={previewThemeId} size="compact" />
            ))}
          </div>
        </section>

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}

```

# File: components/cafe/themes/mobile-first-cafe-theme.tsx

```tsx
"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function MobileFirstCafeTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers, customer } =
    props;
  const nav = buildCafeNavItems(slug);

  return (
    <main dir="rtl" className={`min-h-screen pb-24 ${theme.page}`}>
      <header className={`${theme.header} px-4 py-4`}>
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-3">
            <CafeLogo name={cafeSettings.cafeName} logoUrl={props.cafeLogoUrl} size="sm" />
            <div>
              <h1 className="font-black">{cafeSettings.cafeName}</h1>
              <p className={`text-xs ${theme.muted}`}>مرحبًا بك</p>
            </div>
          </div>
          <Link
            href={customer ? `/c/${slug}/account` : `/c/${slug}/login`}
            className={`rounded-2xl p-2.5 ${theme.button}`}
          >
            <UserRound className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <section className={`mx-auto max-w-lg px-4 py-6 ${theme.hero}`}>
        <h2 className="text-2xl font-black">ماذا تطلب اليوم؟</h2>
        <p className="mt-2 text-sm opacity-90">{cafeSettings.description?.slice(0, 60)}</p>
        <Link
          href={`/c/${slug}/products/popular`}
          className={`mt-4 inline-block rounded-2xl px-6 py-3 font-black ${theme.button}`}
        >
          ابدأ الطلب
        </Link>
      </section>

      <div className="mx-auto max-w-lg px-4">
        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} variant="strip" />
        ) : null}

        <ThemeCategoryStrip slug={slug} theme={theme} className="mt-4" />

        {popularProducts.length > 0 ? (
          <section className="mt-6">
            <h3 className="mb-3 font-black">الأكثر طلبًا</h3>
            <div className="grid grid-cols-3 gap-3">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="round" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>

      <nav
        className={`fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 px-2 py-2 safe-area-pb ${theme.nav}`}
      >
        {nav.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-black"
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

```

# File: components/cafe/themes/noon-commerce-theme.tsx

```tsx
"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function NoonCommerceTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, offers, popularProducts, bannerOffers } = props;
  const flashOffers = offers.filter((o) => o.status === "نشط").slice(0, 4);

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={props.cafeLogoUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <div className={`${theme.hero} px-4 py-6`}>
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-black">{cafeSettings.cafeName}</h1>
          <p className="mt-1 text-sm font-bold">عروض اليوم — تسوّق بسرعة</p>
        </div>
      </div>

      {flashOffers.length > 0 ? (
        <div className="border-b border-[#e7e8ef] bg-white py-3">
          <div className="mx-auto flex max-w-6xl gap-3 overflow-x-auto px-4">
            {flashOffers.map((o) => (
              <Link
                key={o.id}
                href={`/c/${slug}/products/offers`}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-black ${theme.badge}`}
              >
                {o.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-5 gap-2">
          {buildCafeNavItems(slug).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-lg py-3 text-center text-xs font-black ${theme.card}`}
            >
              {label}
            </Link>
          ))}
        </div>

        <ThemeCategoryStrip slug={slug} theme={theme} className="mt-4" variant="cards" />

        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} variant="strip" />
        ) : null}

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-black">منتجات مميزة</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {popularProducts.map((p) => (
              <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="compact" />
            ))}
          </div>
        </section>

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}

```

# File: components/cafe/themes/premium-apple-theme.tsx

```tsx
"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import {
  CafeIdentityBlock,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function PremiumAppleTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={props.cafeLogoUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <section className={`text-center ${theme.hero} rounded-3xl px-6 py-20`}>
          <CafeIdentityBlock
            cafeName={cafeSettings.cafeName}
            logoUrl={props.cafeLogoUrl}
            description={cafeSettings.description}
            theme={theme}
            size="lg"
          />
          <Link
            href={`/c/${slug}/products/popular`}
            className={`mt-10 inline-block rounded-full px-10 py-4 text-lg font-semibold ${theme.button}`}
          >
            استكشف المنيو
          </Link>
        </section>

        <nav className="mt-16 flex flex-wrap justify-center gap-8 text-sm font-medium">
          {buildCafeNavItems(slug).map(({ href, label }) => (
            <Link key={href} href={href} className={theme.link}>
              {label}
            </Link>
          ))}
        </nav>

        <ThemeCategoryStrip
          slug={slug}
          theme={theme}
          previewThemeId={props.previewThemeId}
          className="mt-8 justify-center"
        />

        {popularProducts.length > 0 ? (
          <section className="mt-20 space-y-12">
            <h2 className="text-center text-4xl font-semibold tracking-tight">مختاراتنا</h2>
            <div className="grid gap-8 md:grid-cols-2">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="large" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}

```

# File: components/cafe/themes/reservation-lounge-theme.tsx

```tsx
"use client";

import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
} from "./theme-shared";

export function ReservationLoungeTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={props.cafeLogoUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <section className={`${theme.hero} px-6 py-16 md:py-20`}>
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-bold opacity-80">احجز تجربتك</p>
          <h1 className="mt-3 break-words text-3xl font-black sm:text-4xl lg:text-5xl">
            {cafeSettings.cafeName}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base opacity-90">
            {cafeSettings.description || "جلسات هادئة، طاولات مريحة، وحجز بخطوة واحدة."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href={`/c/${slug}/reserve`}
              className={`inline-flex items-center gap-2 rounded-xl px-8 py-4 font-black ${theme.button}`}
            >
              <CalendarDays className="h-5 w-5" />
              احجز طاولة الآن
            </Link>
            <Link
              href={`/c/${slug}/products/branches`}
              className={`inline-flex items-center gap-2 rounded-xl px-8 py-4 font-black ${theme.buttonOutline}`}
            >
              <MapPin className="h-5 w-5" />
              الفروع
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        <ThemeCategoryStrip slug={slug} theme={theme} className="py-4" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} variant="wide" />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">قبل زيارتك — جرّب المنيو</h2>
              <Link href={`/c/${slug}/products/popular`} className={`text-sm font-black ${theme.link}`}>
                عرض الكل
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {popularProducts.slice(0, 4).map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="compact" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}

```

# File: components/cafe/themes/soft-cream-3d-theme.tsx

```tsx
"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import { getCafePath } from "@/lib/cafe/theme-links";
import {
  CafeIdentityBlock,
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function SoftCream3dTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers, previewThemeId } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={props.cafeLogoUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <div className="mx-auto max-w-5xl px-5 py-8">
        <section className={`rounded-3xl p-8 ${theme.hero}`}>
          <CafeIdentityBlock
            cafeName={cafeSettings.cafeName}
            logoUrl={props.cafeLogoUrl}
            description={cafeSettings.description}
            theme={theme}
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={getCafePath(slug, "products/popular", previewThemeId)} className={`rounded-2xl px-6 py-3 font-black ${theme.button}`}>
              تصفح المنيو
            </Link>
            <Link href={getCafePath(slug, "reserve", previewThemeId)} className={`rounded-2xl px-6 py-3 font-black ${theme.buttonOutline}`}>
              احجز طاولة
            </Link>
          </div>
        </section>

        <nav className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {buildCafeNavItems(slug, previewThemeId).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-2xl py-4 text-center text-xs font-black ${theme.card}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <ThemeCategoryStrip
          slug={slug}
          theme={theme}
          previewThemeId={previewThemeId}
          className="mt-6"
        />

        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} previewThemeId={previewThemeId} variant="soft" />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-black">مختارات الكوفي</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} previewThemeId={previewThemeId} size="compact" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}

```

# File: components/cafe/themes/theme-shared.tsx

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState, type ElementType } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Flame,
  Gift,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { formatSar } from "@/lib/format";
import { CafeFooter } from "@/components/cafe/cafe-footer";
import { OfferBannerImage } from "@/components/cafe/offer-banner-image";
import { ProductImage } from "@/components/cafe/product-image";
import { resolveProductCategoryLabel, getVisibleCategoryNames } from "@/lib/cafe/menu-category-utils";
import { mockMenuProducts, type MenuProduct } from "@/lib/mock/menu";
import { defaultMenuCategories, type MenuCategoryRecord } from "@/lib/mock/menu-categories";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import type { CafeOffer } from "@/lib/mock/offers";
import type { CafeThemeId, ThemeClasses } from "@/lib/mock/cafe-theme";
import { getCafePath } from "@/lib/cafe/theme-links";

export type NavItem = {
  href: string;
  icon: ElementType;
  label: string;
};

export function buildCafeNavItems(slug: string, previewThemeId?: string | null): NavItem[] {
  return [
    { href: getCafePath(slug, "products/offers", previewThemeId), icon: Gift, label: "العروض" },
    { href: getCafePath(slug, "products/latest", previewThemeId), icon: Sparkles, label: "أحدث" },
    { href: getCafePath(slug, "products/popular", previewThemeId), icon: Flame, label: "الأكثر طلبًا" },
    { href: getCafePath(slug, "reserve", previewThemeId), icon: CalendarDays, label: "حجز" },
    { href: getCafePath(slug, "products/branches", previewThemeId), icon: MapPin, label: "الفروع" },
  ];
}

export function useBannerCarousel(offers: CafeOffer[]) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (offers.length <= 1) return;
    const t = setInterval(() => setIndex((c) => (c + 1) % offers.length), 5000);
    return () => clearInterval(t);
  }, [offers.length]);

  return { index, current: offers[index], setIndex };
}

type BannerProps = {
  slug: string;
  offers: CafeOffer[];
  theme: ThemeClasses;
  previewThemeId?: string | null;
  variant?: "wide" | "strip" | "cinematic" | "neon" | "soft" | "editorial";
};

export function ThemeBannerCarousel({
  slug,
  offers,
  theme,
  previewThemeId,
  variant = "wide",
}: BannerProps) {
  const { index, current } = useBannerCarousel(offers);
  if (!current) return null;

  const shell =
    variant === "strip"
      ? "rounded-xl overflow-hidden"
      : variant === "cinematic"
        ? "rounded-none overflow-hidden min-h-[220px] sm:min-h-[280px] lg:min-h-[320px]"
        : variant === "neon"
          ? "rounded-lg border border-[#00e676]/20 overflow-hidden"
          : variant === "editorial"
            ? "border-2 border-[#1a1a1a] overflow-hidden"
            : "rounded-[28px] overflow-hidden border";

  return (
    <section className={`mt-6 animate-barndaksa-fade ${shell} ${theme.card}`}>
      <div
        className={
          variant === "strip"
            ? "flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
            : "grid min-h-[220px] md:grid-cols-2"
        }
      >
        <div
          className={`flex items-center justify-center p-4 ${
            variant === "strip" ? "sm:w-40 shrink-0" : "min-h-[180px]"
          }`}
        >
          <OfferBannerImage
            offer={current}
            className="max-h-[200px] w-full object-contain"
            fallbackSrc="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800&auto=format&fit=crop"
          />
        </div>
        <div className="flex flex-col justify-center p-4 md:p-6">
          <p className={`text-xs font-black ${theme.accent}`}>
            {current.promoProductCategory || current.type}
          </p>
          <h3 className="mt-1 text-xl font-black leading-snug md:text-2xl">
            {current.promoProductName || current.title}
          </h3>
          <p className={`mt-2 line-clamp-2 text-sm font-bold ${theme.muted}`}>
            {current.promoProductDescription || current.description}
          </p>
          <Link
            href={
              current.linkedProductId
                ? getCafePath(slug, `product/${current.linkedProductId}`, previewThemeId)
                : getCafePath(slug, "products/offers", previewThemeId)
            }
            className={`mt-4 inline-flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black ${theme.button}`}
          >
            {current.ctaText || "عرض التفاصيل"}
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {offers.length > 1 ? (
            <div className="mt-3 flex gap-1.5">
              {offers.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? `w-6 ${theme.badge}` : `w-1.5 opacity-40 ${theme.muted}`
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type ProductCardProps = {
  slug: string;
  product: MenuProduct;
  theme: ThemeClasses;
  previewThemeId?: string | null;
  className?: string;
  size?: "compact" | "large" | "round" | "kiosk" | "story";
};

export function ThemeProductCard({
  slug,
  product,
  theme,
  previewThemeId,
  className = "",
  size = "compact",
}: ProductCardProps) {
  const productHref = getCafePath(slug, `product/${product.id}`, previewThemeId);
  const categoryLabel = resolveProductCategoryLabel(product);
  const base = `${theme.card} ${theme.cardHover} group block overflow-hidden transition ${className}`;

  if (size === "kiosk") {
    return (
      <Link href={productHref} className={`${base} rounded-lg p-4`}>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-[#f5f5f5]">
            <ProductImage
              product={product}
              alt=""
              className="max-h-full object-contain"
              fallback={<Flame className="h-8 w-8 opacity-30" />}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black">{product.name}</h3>
            <p className={`text-2xl font-black ${theme.accent}`}>{formatSar(product.price)}</p>
          </div>
          <span className={`shrink-0 rounded-lg px-4 py-3 text-sm font-black ${theme.button}`}>
            طلب
          </span>
        </div>
      </Link>
    );
  }

  if (size === "large") {
    return (
      <Link href={productHref} className={`${base} rounded-3xl p-6`}>
        <div className="flex h-56 items-center justify-center">
          <ProductImage
            product={product}
            alt=""
            className="max-h-full object-contain transition group-hover:scale-105"
            fallback={<Flame className="h-16 w-16 opacity-20" />}
          />
        </div>
        <p className={`mt-4 text-sm ${theme.muted}`}>{categoryLabel}</p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight">{product.name}</h3>
        <p className={`mt-2 text-lg ${theme.accent}`}>{formatSar(product.price)}</p>
      </Link>
    );
  }

  if (size === "round") {
    return (
      <Link href={productHref} className={`${base} flex flex-col items-center rounded-2xl p-3 text-center`}>
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white shadow-md">
          <ProductImage
            product={product}
            alt=""
            className="h-full w-full object-cover"
            fallback={<Flame className="h-8 w-8 opacity-30" />}
          />
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-black">{product.name}</h3>
        <p className={`text-xs font-black ${theme.accent}`}>{formatSar(product.price)}</p>
      </Link>
    );
  }

  if (size === "story") {
    return (
      <Link href={productHref} className={`${base} grid gap-4 md:grid-cols-2`}>
        <div className="flex min-h-[200px] items-center justify-center p-4">
          <ProductImage
            product={product}
            alt=""
            className="max-h-[220px] object-contain"
            fallback={<Flame className="h-12 w-12 opacity-30" />}
          />
        </div>
        <div className="flex flex-col justify-center border-t border-[#e5e5e5] p-6 md:border-t-0 md:border-r">
          <p className={`text-xs font-black uppercase tracking-widest ${theme.accent}`}>
            {categoryLabel}
          </p>
          <h3 className="mt-2 text-3xl font-black leading-tight">{product.name}</h3>
          <p className={`mt-3 text-sm ${theme.muted}`}>
            {product.ingredients.slice(0, 4).join(" · ") || "منتج مختار بعناية"}
          </p>
          <p className="mt-4 text-xl font-black">{formatSar(product.price)}</p>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className={`${base} rounded-2xl p-4`}>
      <div className="flex h-36 items-center justify-center">
        <ProductImage
          product={product}
          alt=""
          className="max-h-full object-contain transition group-hover:scale-[1.03]"
          fallback={<Flame className="h-10 w-10 opacity-30" />}
        />
      </div>
      <p className={`mt-2 text-xs font-black ${theme.accent}`}>{categoryLabel}</p>
      <h3 className="line-clamp-1 font-black">{product.name}</h3>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-black">{formatSar(product.price)}</span>
        <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${theme.badge}`}>
          التفاصيل
        </span>
      </div>
    </Link>
  );
}

export function ThemeCategoryStrip({
  slug,
  theme,
  previewThemeId,
  className = "",
  variant = "chips",
  categories = defaultMenuCategories,
}: {
  slug: string;
  theme: ThemeClasses;
  previewThemeId?: string | null;
  className?: string;
  variant?: "chips" | "cards";
  categories?: MenuCategoryRecord[];
}) {
  const [names, setNames] = useState<string[]>(() => getVisibleCategoryNames(categories));

  useEffect(() => {
    setNames(getVisibleCategoryNames(categories));
  }, [categories]);

  if (!names.length) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {names.map((name) => (
        <Link
          key={name}
          href={getCafePath(
            slug,
            `products/popular?category=${encodeURIComponent(name)}`,
            previewThemeId
          )}
          className={
            variant === "cards"
              ? `min-w-[7rem] rounded-2xl px-4 py-3 text-center text-sm font-black ${theme.card} ${theme.cardHover}`
              : `rounded-full px-4 py-2 text-sm font-black ${theme.badge} ${theme.cardHover}`
          }
        >
          {name}
        </Link>
      ))}
    </div>
  );
}

export function ThemeSearchBar({
  slug,
  theme,
  previewThemeId,
  placeholder = "ابحث في المنيو...",
}: {
  slug: string;
  theme: ThemeClasses;
  previewThemeId?: string | null;
  placeholder?: string;
}) {
  return (
    <Link
      href={getCafePath(slug, "products/popular", previewThemeId)}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 ${theme.input} ${theme.card}`}
    >
      <Search className={`h-5 w-5 shrink-0 ${theme.muted}`} />
      <span className={`text-sm font-bold ${theme.muted}`}>{placeholder}</span>
    </Link>
  );
}

export function ThemePageFooter({
  slug,
  cafeName,
  themeId,
}: {
  slug: string;
  cafeName: string;
  themeId: CafeThemeId;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8">
      <CafeFooter slug={slug} cafeName={cafeName} themeId={themeId} />
    </div>
  );
}

export function CafeIdentityBlock({
  cafeName,
  logoUrl,
  description,
  theme,
  size = "md",
}: {
  cafeName: string;
  logoUrl?: string;
  description?: string;
  theme: ThemeClasses;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <CafeLogo name={cafeName} logoUrl={logoUrl} size={size === "lg" ? "lg" : "md"} />
      <div className="min-w-0">
        <h2 className="text-3xl font-black leading-tight md:text-4xl">{cafeName}</h2>
        {description ? (
          <p className={`mt-2 max-w-xl text-sm font-bold leading-7 ${theme.muted}`}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

```

# File: components/cafe/themes/themed-account-panel.tsx

```tsx
"use client";

import Link from "next/link";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  CreditCard,
  ImagePlus,
  LogOut,
  Receipt,
  Save,
  Settings,
  Sparkles,
  Star,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { formatSar } from "@/lib/format";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import type {
  CustomerInvoice,
  CustomerOrder,
  CustomerTransaction,
} from "@/lib/mock/customer-activity";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import { ThemedInput } from "./themed-auth-panel";

type TabKey = "orders" | "reservations" | "transactions" | "invoices";

type Reservation = {
  id: string;
  type: string;
  date: string;
  time: string;
  guests: number;
  status: string;
  notes?: string;
  createdAt: string;
};

type Activity = {
  id: string;
  title: string;
  desc: string;
  date: string;
  type: string;
};

export type ThemedAccountPanelProps = {
  slug: string;
  experience: ThemeExperience;
  cafeName: string;
  homeHref: string;
  customer: BarndaksaCustomerSession;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  myOrders: CustomerOrder[];
  myReservations: Reservation[];
  myTransactions: CustomerTransaction[];
  myInvoices: CustomerInvoice[];
  loyaltyBalance: number;
  totalInvoices: number;
  latestActivity: Activity[];
  onLogout: () => void;
  onOpenSettings: () => void;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  editName: string;
  editEmail: string;
  editAvatarPreview: string;
  avatarAssetId?: string;
  onEditName: (v: string) => void;
  onEditEmail: (v: string) => void;
  onPickAvatar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAvatar: () => void;
  onSaveSettings: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
};

const tabs: { key: TabKey; title: string; icon: ElementType }[] = [
  { key: "orders", title: "طلباتي", icon: ClipboardList },
  { key: "reservations", title: "حجوزاتي", icon: CalendarDays },
  { key: "transactions", title: "سجل العمليات", icon: WalletCards },
  { key: "invoices", title: "الفواتير", icon: Receipt },
];

export function ThemedAccountPanel(props: ThemedAccountPanelProps) {
  const { experience, customer } = props;
  const { theme, account } = experience;

  const heroClass =
    account === "boutique" || account === "lounge-reservations"
      ? `relative overflow-hidden ${theme.hero} py-10`
      : account === "glow-panels"
        ? `relative overflow-hidden border border-[#00e676]/15 ${theme.hero} py-8`
        : account === "minimal"
          ? `py-12 ${theme.page}`
          : `relative overflow-hidden border-b ${theme.hero} py-8`;

  const defaultTabOrder: TabKey[] =
    account === "lounge-reservations"
      ? ["reservations", "orders", "invoices", "transactions"]
      : ["orders", "reservations", "transactions", "invoices"];

  const orderedTabs = defaultTabOrder
    .map((k) => tabs.find((t) => t.key === k))
    .filter(Boolean) as typeof tabs;

  return (
    <>
      <section className={heroClass}>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href={props.homeHref}
              className={`inline-flex items-center gap-2 px-5 py-3 font-black ${theme.buttonOutline}`}
            >
              <ArrowRight className="h-5 w-5" />
              رجوع للكوفي
            </Link>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onOpenSettings}
                className={`inline-flex items-center gap-2 px-5 py-3 font-black ${theme.buttonOutline}`}
              >
                <Settings className="h-5 w-5" />
                إعدادات الحساب
              </button>
              <button
                type="button"
                onClick={props.onLogout}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-500/15 px-5 py-3 font-black text-red-600"
              >
                <LogOut className="h-5 w-5" />
                تسجيل خروج
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div>
              <div
                className={`mb-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-black ${theme.badge}`}
              >
                <Sparkles className="h-4 w-4" />
                حساب العميل
              </div>
              <h1
                className={`break-words font-black leading-tight ${
                  account === "kiosk-big"
                    ? "text-3xl sm:text-4xl lg:text-5xl"
                    : "text-3xl sm:text-4xl lg:text-5xl"
                } ${experience.headingTracking}`}
              >
                أهلًا {customer.fullName}
              </h1>
              <p className={`mt-4 max-w-2xl font-bold leading-8 ${theme.muted}`}>
                تابع طلباتك، حجوزاتك، نقاط الولاء، الفواتير، وسجل العمليات.
              </p>
            </div>

            <div className={`p-6 ${theme.card}`}>
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-24 w-24 overflow-hidden ${account === "boutique" ? "rounded-none" : "rounded-3xl"} ${theme.button}`}
                >
                  <LocalAssetImage
                    assetId={customer.avatarAssetId}
                    fallbackSrc={customer.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center">
                        <UserRound className="h-11 w-11" />
                      </div>
                    }
                  />
                </div>
                <div>
                  <p className={`text-sm font-black ${theme.accent}`}>بيانات الحساب</p>
                  <h2 className="mt-1 text-2xl font-black">{customer.fullName}</h2>
                  <p className={`mt-1 font-bold ${theme.muted}`}>{customer.phone}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div
          className={`mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 ${account === "kiosk-big" ? "lg:grid-cols-2" : "xl:grid-cols-4"}`}
        >
          <StatCard experience={experience} icon={ClipboardList} title="الطلبات" value={props.myOrders.length} />
          <StatCard experience={experience} icon={CalendarDays} title="الحجوزات" value={props.myReservations.length} highlight={account === "lounge-reservations"} />
          <StatCard experience={experience} icon={Star} title="نقاط الولاء" value={props.loyaltyBalance} />
          <StatCard experience={experience} icon={CreditCard} title="الفواتير" value={formatSar(props.totalInvoices)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className={`p-5 ${theme.card}`}>
            <div
              className={`mb-6 flex flex-wrap gap-2 ${
                account === "editorial-timeline" ? "border-b-2 border-inherit pb-4" : ""
              }`}
            >
              {orderedTabs.map((tab) => {
                const Icon = tab.icon;
                const active = props.activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => props.onTabChange(tab.key)}
                    className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-black transition ${
                      active ? theme.button : theme.buttonOutline
                    } ${account === "kiosk-big" ? "text-base py-4" : "rounded-2xl"}`}
                  >
                    <Icon className="h-5 w-5" />
                    {tab.title}
                  </button>
                );
              })}
            </div>

            {props.activeTab === "orders" && (
              <TabSection experience={experience} title="متابعة الطلبات">
                {props.myOrders.length ? (
                  props.myOrders.map((order) => (
                    <InfoCard
                      key={order.id}
                      experience={experience}
                      title={order.items.join("، ")}
                      badge={order.status}
                      desc={`${formatSar(order.total)} • ${order.createdAt}`}
                    />
                  ))
                ) : (
                  <EmptyState experience={experience} title="لا توجد طلبات" desc="أي طلب من صفحة الكوفي سيظهر هنا." />
                )}
              </TabSection>
            )}

            {props.activeTab === "reservations" && (
              <TabSection experience={experience} title="حجوزاتي">
                {props.myReservations.length ? (
                  props.myReservations.map((r) => (
                    <InfoCard
                      key={r.id}
                      experience={experience}
                      title={r.type}
                      badge={r.status}
                      desc={`${r.date} • ${r.time} • ${r.guests} أشخاص`}
                      footer={r.notes ? `ملاحظة: ${r.notes}` : undefined}
                    />
                  ))
                ) : (
                  <EmptyState experience={experience} title="لا توجد حجوزات" desc="احجز من صفحة الكوفي." />
                )}
              </TabSection>
            )}

            {props.activeTab === "transactions" && (
              <TabSection experience={experience} title="سجل العمليات">
                {props.myTransactions.length ? (
                  props.myTransactions.map((t) => (
                    <InfoCard
                      key={t.id}
                      experience={experience}
                      title={t.title}
                      badge={t.type}
                      desc={`${t.description} • ${t.createdAt}`}
                      value={
                        t.points
                          ? `+${t.points} نقطة`
                          : t.amount
                            ? formatSar(t.amount)
                            : undefined
                      }
                    />
                  ))
                ) : (
                  <EmptyState experience={experience} title="لا توجد عمليات" desc="ستظهر الطلبات والنقاط هنا." />
                )}
              </TabSection>
            )}

            {props.activeTab === "invoices" && (
              <TabSection experience={experience} title="الفواتير">
                {props.myInvoices.length ? (
                  props.myInvoices.map((inv) => (
                    <InfoCard
                      key={inv.id}
                      experience={experience}
                      title={inv.title}
                      badge={inv.status}
                      desc={inv.createdAt}
                      value={formatSar(inv.amount)}
                    />
                  ))
                ) : (
                  <EmptyState experience={experience} title="لا توجد فواتير" desc="الفواتير المرتبطة بحسابك تظهر هنا." />
                )}
              </TabSection>
            )}
          </div>

          <aside className="space-y-6">
            <div className={`p-6 ${theme.hero}`}>
              <p className={`text-sm font-bold opacity-80`}>رصيد الولاء</p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl lg:text-5xl">
                {props.loyaltyBalance}
              </h2>
              <p className={`mt-3 text-sm leading-7 opacity-80`}>
                يُحتسب تلقائيًا من عملياتك المسجلة.
              </p>
            </div>
            <div className={`p-6 ${theme.card}`}>
              <h2 className="mb-4 text-xl font-black">آخر النشاطات</h2>
              {props.latestActivity.length ? (
                <div className="space-y-3">
                  {props.latestActivity.map((item) => (
                    <div key={`${item.type}-${item.id}`} className={`rounded-2xl p-4 ${theme.buttonOutline}`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-black">{item.title}</h3>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>
                          {item.type}
                        </span>
                      </div>
                      <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState experience={experience} title="لا يوجد نشاط" desc="ابدأ بطلب أو حجز." />
              )}
            </div>
          </aside>
        </div>
      </section>

      {props.settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-2xl p-6 ${theme.card}`}>
            <div className="mb-6 flex items-center justify-between border-b border-inherit pb-4">
              <h2 className="text-2xl font-black">تعديل بيانات العميل</h2>
              <button type="button" onClick={props.onCloseSettings} className={`p-3 ${theme.buttonOutline}`}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5">
              <div className={`flex items-center gap-4 p-4 ${theme.buttonOutline}`}>
                <div className={`h-24 w-24 overflow-hidden ${theme.button}`}>
                  <LocalAssetImage
                    assetId={props.avatarAssetId}
                    previewUrl={props.editAvatarPreview || undefined}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center">
                        <UserRound className="h-10 w-10" />
                      </div>
                    }
                  />
                </div>
                <div>
                  <input
                    ref={props.fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={props.onPickAvatar}
                  />
                  <button
                    type="button"
                    onClick={() => props.fileRef.current?.click()}
                    className={`inline-flex items-center gap-2 px-5 py-3 font-black ${theme.buttonOutline}`}
                  >
                    <ImagePlus className="h-5 w-5" />
                    تغيير الصورة
                  </button>
                </div>
              </div>
              <ThemedFormField experience={experience} label="الاسم">
                <ThemedInput
                  experience={experience}
                  value={props.editName}
                  onChange={(e) => props.onEditName(e.target.value)}
                />
              </ThemedFormField>
              <ThemedFormField experience={experience} label="البريد">
                <ThemedInput
                  experience={experience}
                  value={props.editEmail}
                  onChange={(e) => props.onEditEmail(e.target.value)}
                  placeholder="example@email.com"
                />
              </ThemedFormField>
              <p className={`text-sm font-bold ${theme.muted}`}>الجوال: {customer.phone}</p>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-inherit pt-4">
              <button type="button" onClick={props.onCloseSettings} className={`px-6 py-3 font-black ${theme.buttonOutline}`}>
                إلغاء
              </button>
              <button type="button" onClick={props.onSaveSettings} className={`inline-flex items-center gap-2 px-6 py-3 font-black ${theme.button}`}>
                <Save className="h-5 w-5" />
                حفظ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ThemedFormField({
  experience,
  label,
  children,
}: {
  experience: ThemeExperience;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={`text-xs font-black ${experience.theme.muted}`}>{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function StatCard({
  experience,
  icon: Icon,
  title,
  value,
  highlight,
}: {
  experience: ThemeExperience;
  icon: ElementType;
  title: string;
  value: string | number;
  highlight?: boolean;
}) {
  const { theme } = experience;
  return (
    <div className={`p-6 ${highlight ? theme.hero : theme.card}`}>
      <Icon className={`mb-4 h-7 w-7 ${theme.accent}`} />
      <p className={`text-sm font-black ${theme.muted}`}>{title}</p>
      <h2 className="mt-2 text-3xl font-black md:text-4xl">{value}</h2>
    </div>
  );
}

function TabSection({
  experience,
  title,
  children,
}: {
  experience: ThemeExperience;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className={`mb-5 text-2xl font-black ${experience.headingTracking}`}>{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InfoCard({
  experience,
  title,
  desc,
  badge,
  value,
  footer,
}: {
  experience: ThemeExperience;
  title: string;
  desc: string;
  badge?: string;
  value?: string;
  footer?: string;
}) {
  const { theme } = experience;
  return (
    <article className={`p-5 ${theme.card}`}>
      <div className="flex flex-col gap-3 md:flex-row md:justify-between">
        <div>
          <h3 className="text-lg font-black">{title}</h3>
          <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {value ? <span className={`rounded-xl px-4 py-2 font-black ${theme.badge}`}>{value}</span> : null}
          {badge ? <span className={`rounded-xl px-4 py-2 text-sm font-black ${theme.buttonOutline}`}>{badge}</span> : null}
        </div>
      </div>
      {footer ? <p className={`mt-4 rounded-xl p-3 text-sm font-bold ${theme.muted}`}>{footer}</p> : null}
    </article>
  );
}

function EmptyState({
  experience,
  title,
  desc,
}: {
  experience: ThemeExperience;
  title: string;
  desc: string;
}) {
  const { theme } = experience;
  return (
    <div className={`border border-dashed p-8 text-center ${theme.card}`}>
      <UserRound className={`mx-auto mb-4 h-10 w-10 ${theme.muted}`} />
      <h3 className="text-xl font-black">{title}</h3>
      <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{desc}</p>
    </div>
  );
}

```

# File: components/cafe/themes/themed-auth-panel.tsx

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

type Props = {
  mode: "login" | "register";
  settings: CafeSettings;
  experience: ThemeExperience;
  registerHref: string;
  loginHref: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel: string;
};

export function ThemedAuthPanel({
  mode,
  settings,
  experience,
  registerHref,
  loginHref,
  children,
  onSubmit,
  submitLabel,
}: Props) {
  const { theme, auth } = experience;
  const logoUrl = useResolvedCafeLogoUrl(settings);

  const panelClass =
    auth === "minimal"
      ? `rounded-3xl p-8 md:p-10 ${theme.card}`
      : auth === "kiosk"
        ? `rounded-lg border-2 p-8 ${theme.card}`
        : auth === "boutique"
          ? `rounded-none border border-[#c9a227]/20 p-8 ${theme.card}`
          : auth === "neon"
            ? `rounded-lg border border-[#00e676]/20 p-8 backdrop-blur ${theme.card}`
            : auth === "app"
              ? `rounded-3xl p-6 shadow-xl ${theme.card}`
              : `rounded-[28px] p-8 ${theme.card}`;

  const title =
    mode === "login" ? "تسجيل دخول العميل" : "إنشاء حساب جديد";

  return (
    <div className={auth === "app" ? "mx-auto max-w-md" : "mx-auto max-w-lg"}>
      <div className="mb-8 flex flex-col items-center text-center">
        <CafeLogo
          name={settings.cafeName}
          logoUrl={logoUrl}
          size={auth === "kiosk" ? "md" : "lg"}
        />
        <h1
          className={`mt-6 font-black ${auth === "kiosk" ? "text-4xl" : "text-3xl"} ${experience.headingTracking}`}
        >
          {title}
        </h1>
        <p className={`mt-2 font-bold ${theme.muted}`}>
          {mode === "login"
            ? `ادخل رقم جوالك للمتابعة في ${settings.cafeName}`
            : `سجّل في ${settings.cafeName} لمتابعة الطلبات والحجوزات`}
        </p>
      </div>

      <div className={panelClass}>
        <div className="space-y-4">{children}</div>
        <button
          type="button"
          onClick={onSubmit}
          className={`mt-6 w-full font-black ${auth === "kiosk" ? "h-16 text-lg rounded-lg" : "h-14 rounded-2xl"} ${theme.button}`}
        >
          {submitLabel}
        </button>
        <p className={`mt-6 text-center text-sm font-bold ${theme.muted}`}>
          {mode === "login" ? (
            <>
              ما عندك حساب؟{" "}
              <Link href={registerHref} className={`font-black ${theme.link}`}>
                إنشاء حساب جديد
              </Link>
            </>
          ) : (
            <>
              عندك حساب؟{" "}
              <Link href={loginHref} className={`font-black ${theme.link}`}>
                تسجيل الدخول
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function ThemedFormField({
  label,
  experience,
  children,
}: {
  label: string;
  experience: ThemeExperience;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={`text-xs font-black ${experience.theme.muted}`}>{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export function ThemedInput({
  experience,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { experience: ThemeExperience }) {
  return (
    <input
      {...props}
      className={`w-full font-bold outline-none focus:ring-2 focus:ring-offset-1 ${experience.formInput} ${props.className ?? ""}`}
    />
  );
}

```

# File: components/cafe/themes/themed-cafe-footer.tsx

```tsx
"use client";

import { CafeFooter } from "@/components/cafe/cafe-footer";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";

export function ThemedCafeFooter({
  slug,
  cafeName,
  themeId,
}: {
  slug: string;
  cafeName: string;
  themeId: CafeThemeId;
}) {
  return <CafeFooter slug={slug} cafeName={cafeName} themeId={themeId} />;
}

```

# File: components/cafe/themes/themed-cafe-header.tsx

```tsx
"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { CustomerNotifications } from "@/components/cafe/customer-notifications";
import { getCafePath } from "@/lib/cafe/theme-links";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";

type Props = {
  slug: string;
  cafeName: string;
  logoUrl?: string;
  themeId: CafeThemeId;
  experience: ThemeExperience;
  customer: BarndaksaCustomerSession | null;
  previewThemeId?: string | null;
};

export function ThemedCafeHeader({
  slug,
  cafeName,
  logoUrl,
  themeId,
  experience,
  customer,
  previewThemeId,
}: Props) {
  const { theme } = experience;
  const home = getCafePath(slug, "", previewThemeId);
  const account = getCafePath(slug, "account", previewThemeId);
  const login = getCafePath(slug, "login", previewThemeId);
  const register = getCafePath(slug, "register", previewThemeId);

  const headerClass =
    themeId === "marketplace-amazon"
      ? `${theme.header} border-b`
      : themeId === "mobile-first-cafe"
        ? `${theme.header} shadow-sm`
        : `sticky top-0 z-50 border-b backdrop-blur-xl ${theme.nav}`;

  return (
    <header className={headerClass}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
        <Link href={home} className="flex min-w-0 items-center gap-3">
          <CafeLogo name={cafeName} logoUrl={logoUrl} size="sm" />
          <div className="min-w-0">
            <h1 className={`truncate text-lg font-black ${experience.headingTracking}`}>
              {cafeName}
            </h1>
            <p className={`truncate text-xs font-bold ${theme.muted}`}>منيو رقمي</p>
          </div>
        </Link>

        {customer ? (
          <div className="flex shrink-0 items-center gap-2">
            <CustomerNotifications
              slug={slug}
              customerId={customer.id}
              experience={experience}
            />
            <Link
              href={account}
              className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black ${theme.button}`}
            >
              <UserRound className="h-4 w-4" />
              حسابي
            </Link>
          </div>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Link
              href={login}
              className={`rounded-2xl border px-3 py-2.5 text-sm font-black sm:px-4 ${theme.card}`}
            >
              دخول
            </Link>
            <Link
              href={register}
              className={`rounded-2xl px-3 py-2.5 text-sm font-black sm:px-4 ${theme.button}`}
            >
              حساب جديد
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

```

# File: components/cafe/themes/themed-cafe-shell.tsx

```tsx
"use client";

import { Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Flame,
  Gift,
  MapPin,
  Sparkles,
} from "lucide-react";
import { getCustomerSession, type BarndaksaCustomerSession } from "@/lib/customer/session";
import { useCafeThemePage } from "@/lib/cafe/use-cafe-theme-page";
import { getCafePath } from "@/lib/cafe/theme-links";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import {
  buildCustomIdentityCssVars,
  defaultCustomIdentityTheme,
  OVERLAY_OPACITY,
} from "@/lib/mock/custom-identity-theme";
import { ThemedPreviewBanner } from "./themed-preview-banner";
import { ThemedCafeHeader } from "./themed-cafe-header";
import { ThemedCafeFooter } from "./themed-cafe-footer";

type Props = {
  slug: string;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
};

function ThemedCafeShellInner({ slug, children, className = "", maxWidth = "max-w-6xl" }: Props) {
  const ctx = useCafeThemePage(slug);
  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);

  const { theme, experience, settings, themeId, previewThemeId, isPreview, customIdentity, loadError } =
    ctx;
  const identityConfig = customIdentity ?? defaultCustomIdentityTheme();
  const cafeLogoUrl = useResolvedCafeLogoUrl(settings);
  const { logoUrl: identityLogoUrl, backgroundUrl } = useCustomIdentityVisuals(identityConfig);
  const identityStyle =
    themeId === "brand-identity-custom"
      ? (buildCustomIdentityCssVars(identityConfig.palette) as CSSProperties)
      : {};

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  if (loadError) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#e8e4df] px-4">
        <p className="text-center font-black text-[#4a4540]">{loadError}</p>
      </main>
    );
  }

  const isCustomIdentity = themeId === "brand-identity-custom";

  const pb = experience.showMobileBottomNav
    ? "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
    : "";

  const showPageBackground =
    themeId === "brand-identity-custom" &&
    backgroundUrl &&
    (identityConfig.backgroundScope === "all-customer-pages" ||
      identityConfig.backgroundScope === "home-only");

  const navItems = [
    { href: getCafePath(slug, "products/offers", previewThemeId), icon: Gift, label: "العروض" },
    { href: getCafePath(slug, "products/latest", previewThemeId), icon: Sparkles, label: "أحدث" },
    { href: getCafePath(slug, "products/popular", previewThemeId), icon: Flame, label: "شائع" },
    { href: getCafePath(slug, "reserve", previewThemeId), icon: CalendarDays, label: "حجز" },
    { href: getCafePath(slug, "", previewThemeId), icon: MapPin, label: "الرئيسية" },
  ];

  return (
    <main
      dir="rtl"
      className={`relative min-h-screen ${isCustomIdentity ? "brand-identity-custom-theme" : ""} ${theme.page} ${pb}`}
      style={identityStyle}
    >
      {showPageBackground ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: identityConfig.backgroundFit,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0"
            style={{
              backgroundColor: `rgba(0,0,0,${OVERLAY_OPACITY[identityConfig.overlayStrength]})`,
            }}
          />
        </>
      ) : null}

      <div className="relative z-10">
        <ThemedPreviewBanner themeId={themeId} visible={isPreview} />
        <ThemedCafeHeader
          slug={slug}
          cafeName={settings.cafeName}
          logoUrl={identityLogoUrl ?? cafeLogoUrl}
          themeId={themeId}
          experience={experience}
          customer={customer}
          previewThemeId={previewThemeId}
        />
        <div
          className={`brand-cafe-fields mx-auto ${maxWidth} px-4 py-6 sm:px-5 sm:py-8 ${className}`}
        >
          {children}
        </div>
        <div
          className={`mx-auto ${maxWidth} px-4 sm:px-5 ${experience.showMobileBottomNav ? "mb-4" : ""}`}
        >
          <ThemedCafeFooter slug={slug} cafeName={settings.cafeName} themeId={themeId} />
        </div>

        {experience.showMobileBottomNav ? (
          <nav
            className={`fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 border-t px-2 py-2 ${theme.nav}`}
          >
            {navItems.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-black"
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </main>
  );
}

export function ThemedCafeShell(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ThemedCafeShellInner {...props} />
    </Suspense>
  );
}

export { useCafeThemePage };

```

# File: components/cafe/themes/themed-filter-bar.tsx

```tsx
"use client";

import { RotateCcw, Search, Tag } from "lucide-react";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { PriceRangeFilter } from "@/lib/cafe/menu-category-utils";
import { isFilterActive } from "@/lib/cafe/menu-category-utils";

export type FilterBarState = {
  query: string;
  category: string;
  priceRange: PriceRangeFilter;
  onlyOffers: boolean;
  sort: "latest" | "popular" | "price-low" | "price-high" | "offers";
};

type Props = {
  experience: ThemeExperience;
  categories: string[];
  state: FilterBarState;
  onChange: (patch: Partial<FilterBarState>) => void;
  onReset?: () => void;
};

const SORT_OPTIONS: { value: FilterBarState["sort"]; label: string }[] = [
  { value: "popular", label: "الأكثر طلبًا" },
  { value: "latest", label: "الأحدث" },
  { value: "price-low", label: "السعر: الأقل أولًا" },
  { value: "price-high", label: "السعر: الأعلى أولًا" },
  { value: "offers", label: "المنتجات ذات العروض" },
];

const PRICE_OPTIONS: { value: PriceRangeFilter; label: string }[] = [
  { value: "all", label: "جميع الأسعار" },
  { value: "under-20", label: "أقل من 20 ر.س" },
  { value: "20-40", label: "20 إلى 40 ر.س" },
  { value: "over-40", label: "أكثر من 40 ر.س" },
];

function FilterSelect({
  label,
  value,
  onChange,
  options,
  fieldClass,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  fieldClass: string;
}) {
  return (
    <label className="block min-w-0 flex-1 sm:min-w-[140px] sm:flex-none">
      <span className="mb-1.5 block text-[11px] font-black opacity-80">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`brand-cafe-form-select ${fieldClass} cursor-pointer appearance-none bg-no-repeat`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B3A25' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundPosition: "left 0.85rem center",
          paddingLeft: "2.25rem",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ThemedFilterBar({
  experience,
  categories,
  state,
  onChange,
  onReset,
}: Props) {
  const { theme } = experience;
  const fieldClass = `${experience.formInput} h-11 w-full text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--ci-accent-bg,var(--ci-accent,#D9A33F))]/30`;
  const hasActive = isFilterActive(state);

  return (
    <div className={`rounded-2xl p-4 sm:p-5 ${theme.card}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag className={`h-4 w-4 ${theme.accent}`} />
          <h2 className="text-sm font-black">فلترة المنيو</h2>
        </div>
        {hasActive && onReset ? (
          <button
            type="button"
            onClick={onReset}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black ${theme.buttonOutline}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            مسح الفلاتر
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black opacity-80">بحث</span>
          <div className="relative">
            <Search className={`absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.muted}`} />
            <input
              value={state.query}
              onChange={(e) => onChange({ query: e.target.value })}
              placeholder="ابحث عن مشروب أو منتج..."
              className={`${fieldClass} pr-10`}
            />
          </div>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="التصنيف"
            value={state.category}
            onChange={(v) => onChange({ category: v })}
            options={categories.map((name) => ({ value: name, label: name }))}
            fieldClass={fieldClass}
          />
          <FilterSelect
            label="الترتيب"
            value={state.sort}
            onChange={(v) =>
              onChange({
                sort: v as FilterBarState["sort"],
                onlyOffers: v === "offers" ? true : state.onlyOffers,
              })
            }
            options={SORT_OPTIONS}
            fieldClass={fieldClass}
          />
          <FilterSelect
            label="السعر"
            value={state.priceRange}
            onChange={(v) => onChange({ priceRange: v as PriceRangeFilter })}
            options={PRICE_OPTIONS}
            fieldClass={fieldClass}
          />
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => onChange({ onlyOffers: !state.onlyOffers })}
              className={`h-11 w-full rounded-2xl text-sm font-black transition ${
                state.onlyOffers ? theme.button : theme.buttonOutline
              }`}
            >
              {state.onlyOffers ? "✓ العروض فقط" : "العروض فقط"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function defaultProductFilters(
  overrides?: Partial<FilterBarState>
): FilterBarState {
  return {
    query: "",
    category: "الكل",
    priceRange: "all",
    onlyOffers: false,
    sort: "popular",
    ...overrides,
  };
}

```

# File: components/cafe/themes/themed-preview-banner.tsx

```tsx
"use client";

import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import { getThemeDefinition } from "@/lib/mock/cafe-theme";

export function ThemedPreviewBanner({
  themeId,
  visible,
}: {
  themeId: CafeThemeId;
  visible: boolean;
}) {
  if (!visible) return null;
  const def = getThemeDefinition(themeId);
  return (
    <div className="sticky top-0 z-[100] border-b border-amber-600/30 bg-amber-400 px-4 py-2.5 text-center text-sm font-black text-[#241610] shadow-sm">
      وضع معاينة الثيم — {def.name} — لم يُحفظ بعد
    </div>
  );
}

```

# File: components/cafe/themes/themed-product-card.tsx

```tsx
"use client";

import Link from "next/link";
import { Coffee, Flame } from "lucide-react";
import { ProductImage } from "@/components/cafe/product-image";
import { formatSar } from "@/lib/format";
import type { MenuProduct } from "@/lib/mock/menu";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

type Props = {
  slug: string;
  product: MenuProduct;
  experience: ThemeExperience;
  href: string;
};

export function ThemedProductCard({ product, experience, href }: Props) {
  const { theme, collection } = experience;

  if (collection === "kiosk-grid") {
    return (
      <Link
        href={href}
        className={`block p-4 ${theme.card} ${theme.cardHover} rounded-lg`}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-black/5">
            <ProductImage
              product={product}
              alt=""
              className="max-h-full object-contain"
              fallback={<Flame className="h-8 w-8 opacity-30" />}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black">{product.name}</h3>
            <p className={`text-2xl font-black ${theme.accent}`}>{formatSar(product.price)}</p>
          </div>
          <span className={`shrink-0 rounded-lg px-4 py-3 text-sm font-black ${theme.button}`}>
            طلب
          </span>
        </div>
      </Link>
    );
  }

  if (collection === "mobile-scroll") {
    return (
      <Link
        href={href}
        className={`flex w-36 shrink-0 flex-col items-center p-3 ${theme.card} ${theme.cardHover} rounded-2xl`}
      >
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white shadow">
          <ProductImage
            product={product}
            alt=""
            className="h-full w-full object-cover"
            fallback={<Coffee className="h-8 w-8 opacity-30" />}
          />
        </div>
        <h3 className="mt-2 line-clamp-2 text-center text-sm font-black">{product.name}</h3>
        <p className={`text-xs font-black ${theme.accent}`}>{formatSar(product.price)}</p>
      </Link>
    );
  }

  if (collection === "gallery") {
    return (
      <Link
        href={href}
        className={`group block p-6 ${theme.card} ${theme.cardHover} rounded-3xl`}
      >
        <div className="flex h-56 items-center justify-center">
          <ProductImage
            product={product}
            alt=""
            className="max-h-full object-contain transition group-hover:scale-105"
            fallback={<Coffee className="h-16 w-16 opacity-20" />}
          />
        </div>
        <p className={`mt-4 text-sm ${theme.muted}`}>{product.category}</p>
        <h3 className="mt-1 text-2xl font-semibold">{product.name}</h3>
        <p className={`mt-2 text-lg ${theme.accent}`}>{formatSar(product.price)}</p>
      </Link>
    );
  }

  if (collection === "editorial") {
    return (
      <Link href={href} className={`grid gap-4 md:grid-cols-2 ${theme.card} ${theme.cardHover}`}>
        <div className="flex min-h-[180px] items-center justify-center p-4">
          <ProductImage
            product={product}
            alt=""
            className="max-h-[200px] object-contain"
            fallback={<Coffee className="h-12 w-12 opacity-30" />}
          />
        </div>
        <div className="flex flex-col justify-center border-t p-6 md:border-t-0 md:border-r border-inherit">
          <p className={`text-xs font-black uppercase ${theme.accent}`}>{product.category}</p>
          <h3 className="mt-2 text-2xl font-black">{product.name}</h3>
          <p className="mt-3 font-black">{formatSar(product.price)}</p>
        </div>
      </Link>
    );
  }

  const compact = collection === "sidebar-grid" || collection === "deal-strip" || collection === "neon-grid";

  return (
    <Link
      href={href}
      className={`group overflow-hidden transition ${theme.card} ${theme.cardHover} ${
        compact ? "rounded-xl p-3" : "rounded-[28px] p-4"
      }`}
    >
      <div
        className={`relative flex items-center justify-center ${
          compact ? "h-40" : "h-52"
        } rounded-2xl bg-black/5`}
      >
        <ProductImage
          product={product}
          alt=""
          className="max-h-full w-full object-contain p-3 transition group-hover:scale-[1.03]"
          fallback={<Coffee className="h-12 w-12 opacity-30" />}
        />
      </div>
      <p className={`mt-3 text-xs font-black ${theme.accent}`}>{product.category}</p>
      <h3 className={`line-clamp-1 font-black ${compact ? "text-base" : "text-xl"}`}>
        {product.name}
      </h3>
      {!compact ? (
        <p className={`mt-1 line-clamp-2 text-sm ${theme.muted}`}>{product.description}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between">
        <span className="font-black">{formatSar(product.price)}</span>
        <span className={`rounded-lg px-3 py-1.5 text-xs font-black ${theme.badge}`}>
          التفاصيل
        </span>
      </div>
    </Link>
  );
}

export function getCollectionGridClass(collection: ThemeExperience["collection"]) {
  switch (collection) {
    case "sidebar-grid":
    case "neon-grid":
    case "neumo-grid":
    case "deal-strip":
      return "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";
    case "gallery":
      return "grid gap-8 md:grid-cols-2";
    case "editorial":
      return "space-y-8";
    case "mobile-scroll":
      return "flex gap-3 overflow-x-auto pb-2";
    case "kiosk-grid":
      return "space-y-3";
    case "lounge-grid":
      return "grid gap-5 sm:grid-cols-2";
    default:
      return "grid gap-5 sm:grid-cols-2 xl:grid-cols-3";
  }
}

```

# File: components/cafe/themes/themed-product-detail.tsx

```tsx
"use client";

import type { ReactNode } from "react";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

type Props = {
  experience: ThemeExperience;
  imageSlot: ReactNode;
  infoSlot: ReactNode;
  reviewsSlot: ReactNode;
};

export function ThemedProductDetailLayout({
  experience,
  imageSlot,
  infoSlot,
  reviewsSlot,
}: Props) {
  const { theme, detail } = experience;

  if (detail === "kiosk") {
    return (
      <div className="space-y-6">
        <div className={`rounded-lg border-2 p-4 ${theme.card}`}>{imageSlot}</div>
        <div className={`rounded-lg border-2 p-6 ${theme.card}`}>{infoSlot}</div>
        <div className={theme.card}>{reviewsSlot}</div>
      </div>
    );
  }

  if (detail === "stack" || detail === "minimal") {
    return (
      <div className="space-y-8">
        <div className={`rounded-3xl p-4 ${theme.card}`}>{imageSlot}</div>
        <div className={`rounded-3xl p-6 md:p-8 ${theme.card}`}>{infoSlot}</div>
        <div>{reviewsSlot}</div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className={`rounded-[32px] p-4 md:p-5 ${theme.card}`}>{imageSlot}</div>
      <div className={`rounded-[32px] p-6 md:p-8 ${theme.card}`}>{infoSlot}</div>
      <div className="lg:col-span-2">{reviewsSlot}</div>
    </div>
  );
}

```

# File: components/cafe/themes/themed-reservation-panel.tsx

```tsx
"use client";

import type { ReactNode } from "react";
import { CalendarDays, MapPin, PartyPopper, Users } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import {
  isSpecialReservationEvent,
  RESERVATION_EVENT_TYPES,
  type ReservationEventType,
} from "@/lib/mock/reservations";
import { ThemedInput } from "./themed-auth-panel";

type Props = {
  settings: CafeSettings;
  experience: ThemeExperience;
  branchCount: number;
  formSlot: ReactNode;
  loginPromptSlot?: ReactNode;
};

export function ThemedReservationPanel({
  settings,
  experience,
  branchCount,
  formSlot,
  loginPromptSlot,
}: Props) {
  const { theme, reserve } = experience;
  const logoUrl = useResolvedCafeLogoUrl(settings);

  const heroClass =
    reserve === "lounge"
      ? `rounded-none md:rounded-2xl p-8 md:p-12 ${theme.hero}`
      : reserve === "kiosk"
        ? `rounded-lg p-6 ${theme.hero}`
        : `rounded-[32px] p-6 md:p-8 ${theme.hero}`;

  const formWrap =
    reserve === "kiosk"
      ? `rounded-lg border-2 p-6 ${theme.card}`
      : `rounded-[28px] p-6 ${theme.card}`;

  return (
    <>
      <section className={`mb-8 overflow-hidden ${heroClass}`}>
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <CafeLogo
            name={settings.cafeName}
            logoUrl={logoUrl}
            size={reserve === "kiosk" ? "md" : "lg"}
          />
          <div>
            <p className={`text-sm font-black ${theme.accent}`}>
              {reserve === "lounge" ? "احجز تجربتك" : "حجز الطاولات"}
            </p>
            <h1
              className={`mt-1 font-black ${reserve === "kiosk" ? "text-4xl" : "text-3xl md:text-4xl"} ${experience.headingTracking}`}
            >
              احجز في {settings.cafeName}
            </h1>
            <p className={`mt-2 font-bold ${theme.muted}`}>
              اختر نوع المناسبة، الفرع، والوقت المناسب — من طاولة عادية إلى حفلات خاصة.
            </p>
          </div>
        </div>
        <div
          className={`mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 ${reserve === "kiosk" ? "lg:grid-cols-3" : "lg:grid-cols-3"}`}
        >
          {[
            [MapPin, "فروع", branchCount],
            [CalendarDays, "أنواع", RESERVATION_EVENT_TYPES.length],
            [Users, "مناسبات", "خاصة"],
          ].map(([Icon, label, val]) => {
            const I = Icon as React.ElementType;
            return (
              <div
                key={label as string}
                className={`rounded-2xl border p-3 text-center ${theme.card}`}
              >
                <I className={`mx-auto h-5 w-5 ${theme.accent}`} />
                <p className={`mt-1 text-xs font-black ${theme.muted}`}>{label as string}</p>
                <p className="font-black">{val as string | number}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className={reserve === "lounge" ? "grid gap-6 lg:grid-cols-[1.2fr_320px]" : ""}>
        <div className={formWrap}>
          <h2 className={`mb-4 font-black ${reserve === "kiosk" ? "text-2xl" : "text-xl"}`}>
            بيانات الحجز
          </h2>
          {loginPromptSlot}
          {formSlot}
        </div>
      </div>
    </>
  );
}

type EventFieldsProps = {
  experience: ThemeExperience;
  theme: ThemeExperience["theme"];
  reservationType: ReservationEventType;
  eventTitle: string;
  onEventTitleChange: (v: string) => void;
  needsDecoration: boolean;
  onNeedsDecorationChange: (v: boolean) => void;
  needsCatering: boolean;
  onNeedsCateringChange: (v: boolean) => void;
  budgetEstimate: string;
  onBudgetEstimateChange: (v: string) => void;
};

export function ReservationEventFields({
  experience,
  theme,
  reservationType,
  eventTitle,
  onEventTitleChange,
  needsDecoration,
  onNeedsDecorationChange,
  needsCatering,
  onNeedsCateringChange,
  budgetEstimate,
  onBudgetEstimateChange,
}: EventFieldsProps) {
  if (!isSpecialReservationEvent(reservationType)) return null;

  return (
    <div className={`md:col-span-2 rounded-2xl border p-4 ${theme.card}`}>
      <div className="mb-3 flex items-center gap-2">
        <PartyPopper className={`h-5 w-5 ${theme.accent}`} />
        <p className="font-black">تفاصيل المناسبة — {reservationType}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ThemedInput
          experience={experience}
          value={eventTitle}
          onChange={(e) => onEventTitleChange(e.target.value)}
          placeholder="عنوان المناسبة (مثال: عيد ميلاد أحمد)"
          className="md:col-span-2"
        />
        <ThemedInput
          experience={experience}
          value={budgetEstimate}
          onChange={(e) => onBudgetEstimateChange(e.target.value)}
          placeholder="الميزانية التقديرية (ر.س)"
          type="number"
          min={0}
        />
        <label className={`flex items-center gap-2 rounded-2xl px-4 py-3 font-bold ${theme.muted}`}>
          <input
            type="checkbox"
            checked={needsDecoration}
            onChange={(e) => onNeedsDecorationChange(e.target.checked)}
            className="h-4 w-4"
          />
          أحتاج تنسيق/ديكور
        </label>
        <label className={`flex items-center gap-2 rounded-2xl px-4 py-3 font-bold ${theme.muted}`}>
          <input
            type="checkbox"
            checked={needsCatering}
            onChange={(e) => onNeedsCateringChange(e.target.checked)}
            className="h-4 w-4"
          />
          أحتاج ضيافة/تموين
        </label>
      </div>
    </div>
  );
}

export function ThemedSelect({
  experience,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { experience: ThemeExperience }) {
  return (
    <select
      {...props}
      className={`w-full font-bold ${experience.formInput} ${props.className ?? ""}`}
    />
  );
}

export function ThemedTextarea({
  experience,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  experience: ThemeExperience;
}) {
  return (
    <textarea
      {...props}
      className={`w-full font-bold ${experience.formInput} ${props.className ?? ""}`}
    />
  );
}

```

# File: components/dashboard/DashboardSidebar.tsx

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Gift,
  Home,
  MapPin,
  Megaphone,
  MessageSquareText,
  Newspaper,
  Package,
  Palette,
  Settings,
  LogOut,
  Share2,
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { logoutBarndaksaAuth } from "@/lib/platform/auth";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { fetchOwnerPlanIdAction, fetchPlatformPlansAction } from "@/app/actions/admin";
import { fetchOwnerSettingsAction } from "@/app/actions/settings";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import { getCafeDisplayDomain, getCafePublicUrl } from "@/lib/platform/cafe-domain";
import { cafeHasFeature } from "@/lib/platform/permissions";
import type { PlatformFeature, PlatformPlan } from "@/lib/platform/admin-data";
const cafeSlug = "qatrah";

const links: {
  title: string;
  href: string;
  icon: React.ElementType;
  feature: PlatformFeature;
  badge?: string;
}[] = [
  { title: "الرئيسية", href: "/dashboard", icon: Home, feature: "menu" },
  { title: "المنيو", href: "/dashboard/menu", icon: Package, feature: "menu" },
  { title: "العروض", href: "/dashboard/offers", icon: Gift, feature: "offers" },
  { title: "الحجوزات", href: "/dashboard/reservations", icon: CalendarDays, feature: "reservations" },
  { title: "العملاء", href: "/dashboard/customers", icon: Users, feature: "customers" },
  { title: "الولاء", href: "/dashboard/loyalty", icon: Star, feature: "loyalty" },
  { title: "الفروع", href: "/dashboard/branches", icon: MapPin, feature: "branches" },
  { title: "التقارير", href: "/dashboard/reports", icon: BarChart3, feature: "reports" },
  { title: "الأسئلة والتقييمات", href: "/dashboard/reviews", icon: MessageSquareText, feature: "reviews" },
  { title: "الصفحات التعريفية", href: "/dashboard/pages", icon: Newspaper, feature: "pages" },
  { title: "الأدوات التسويقية", href: "/dashboard/marketing", icon: Megaphone, feature: "marketing" },
  { title: "طلبات الكوفي", href: "/dashboard/orders", icon: ShoppingBag, feature: "orders", badge: "جديد" },
  { title: "إعدادات الكوفي", href: "/dashboard/settings", icon: Settings, feature: "settings" },
  { title: "ثيم الكوفي", href: "/dashboard/theme", icon: Palette, feature: "theme" },
  { title: "الاشتراك والباقات", href: "/dashboard/subscription", icon: CreditCard, feature: "settings" },
];

type SidebarProps = {
  onNavigate?: () => void;
};

export function DashboardSidebar({ onNavigate }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    logoutBarndaksaAuth();
    router.push("/login");
  }
  const [activePlanId, setActivePlanId] = useState("pro");
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [planName, setPlanName] = useState("Pro");
  const [cafeName, setCafeName] = useState("كوفي");
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>({
    cafeSlug: cafeSlug,
    cafeName: "كوفي",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    description: "",
    domainStatus: "غير مربوط",
  });
  const cafeLogoUrl = useResolvedCafeLogoUrl(cafeSettings);

  useEffect(() => {
    void (async () => {
      try {
        const [planId, plans, settings] = await Promise.all([
          fetchOwnerPlanIdAction(),
          fetchPlatformPlansAction(),
          fetchOwnerSettingsAction(),
        ]);
        setActivePlanId(planId);
        setPlans(plans);
        const plan = plans.find((p) => p.id === planId);
        if (plan) setPlanName(plan.name);
        setCafeSettings(settings);
        setCafeName(settings.cafeName || settings.cafeSlug);
      } catch {
        /* keep defaults */
      }
    })();
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const visibleLinks = links.filter((link) =>
    cafeHasFeature(link.feature, { planId: activePlanId, plans })
  );

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll flex h-full w-full flex-col overflow-y-auto border-l border-[#E7D7C6]/60 bg-gradient-to-b from-[#4A281D] via-[#311912] to-[#311912] text-[#FCF8F3] shadow-[-12px_0_40px_rgba(49,25,18,0.35)]"
    >
      <div className="border-b border-white/10 px-6 py-7">
        <BarndaksaLogo variant="dark" width={160} height={64} priority className="mx-auto" />
        <p className="mt-3 text-center text-xs font-bold text-[#F2E7D9]">
          لوحة تحكم الكوفي
        </p>
      </div>

      <div className="mx-5 mt-6 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#FCF8F3] shadow-lg">
            <CafeLogo name={cafeName} logoUrl={cafeLogoUrl} size="md" className="!shadow-none" />
          </div>

          <div className="min-w-0 flex-1 text-right">
            <p className="text-xs font-bold text-[#F2E7D9]">الكوفي الحالي</p>
            <h2 className="mt-1 truncate text-xl font-black">{cafeName}</h2>
            <Link
              href="/dashboard/subscription"
              onClick={onNavigate}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#D9A33F]/20 px-3 py-1 text-xs font-black text-[#F0C568] transition hover:bg-[#D9A33F]/30"
            >
              {planName}
            </Link>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <NotificationsPanel />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[#F0C568] transition hover:bg-white/10"
            aria-label="مشاركة"
          >
            <Share2 className="h-4 w-4" />
          </button>

          <Link
            href={getCafePublicUrl(cafeSettings.cafeSlug || cafeSlug)}
            target="_blank"
            className="flex h-10 flex-1 items-center justify-center rounded-xl border border-[#D9A33F]/30 bg-[#D9A33F]/15 text-sm font-black text-[#F0C568] transition hover:bg-[#D9A33F]/25"
          >
            زيارة الكوفي
          </Link>
        </div>

        <p className="mt-3 text-center text-[10px] font-bold text-[#806A5E]">
          {getCafeDisplayDomain(cafeSettings.cafeSlug || cafeSlug, cafeSettings)}
        </p>
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {visibleLinks.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex items-center justify-between rounded-2xl px-4 py-3.5 text-[15px] font-black transition ${
                active
                  ? "bg-gradient-to-l from-[#D9A33F]/25 to-white/10 text-[#F0C568] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "text-[#F2E7D9] hover:bg-white/5 hover:text-[#FCF8F3]"
              }`}
            >
              <span className="flex items-center gap-2">
                {item.badge ? (
                  <span className="rounded-full bg-[#D9A33F] px-2 py-0.5 text-[10px] font-black text-[#311912]">
                    {item.badge}
                  </span>
                ) : (
                  <span className="w-8" />
                )}
              </span>

              <span className="flex items-center gap-3">
                <span>{item.title}</span>
                <Icon
                  className={`h-5 w-5 ${active ? "text-[#F0C568]" : "text-[#F2E7D9] group-hover:text-[#FCF8F3]"}`}
                />
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-5">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-between rounded-2xl border border-[#D9A33F]/20 bg-white/5 px-4 py-3.5 text-sm font-black text-[#FCF8F3] transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200"
        >
          <span>تسجيل الخروج</span>
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}

```

# File: components/dashboard/dashboard-app-layout.tsx

```tsx
"use client";

import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { ResponsiveAppShell } from "@/components/ui/responsive-app-shell";

export function DashboardAppLayout({ children }: { children: ReactNode }) {
  return (
    <ResponsiveAppShell
      variant="dashboard"
      mobileTitle="لوحة الكوفي"
      sidebar={(close) => <DashboardSidebar onNavigate={close} />}
    >
      {children}
    </ResponsiveAppShell>
  );
}

```

# File: components/dashboard/dashboard-home-client.tsx

```tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  CalendarDays,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  LinkButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { getCafePublicUrl } from "@/lib/platform/cafe-domain";
import type { CustomerProfile } from "@/lib/mock/customer-activity";
import type { CafeReservation } from "@/lib/mock/reservations";
import type { CafeOrder } from "@/lib/mock/orders";

type Props = {
  customers: CustomerProfile[];
  orders: CafeOrder[];
  reservations: CafeReservation[];
  cafeSlug: string;
  configError?: string;
};

export function DashboardHomeClient({
  customers,
  orders,
  reservations,
  cafeSlug,
  configError,
}: Props) {
  const pendingReservations = reservations.filter((r) => r.status === "بانتظار الرد");
  const revenueFromAcceptedOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === "مقبول")
        .reduce((sum, o) => sum + o.total, 0),
    [orders]
  );

  const quickActions = [
    ["/dashboard/menu", "تعديل المنيو"],
    ["/dashboard/offers", "إضافة عرض"],
    ["/dashboard/reservations", "مراجعة الحجوزات"],
    ["/dashboard/subscription", "الاشتراك والباقات"],
    ["/dashboard/settings", "إعدادات الكوفي"],
  ] as const;

  return (
    <DashboardPageShell
      title="مرحبًا في لوحة قطرة"
      subtitle="أي تعديل هنا ينعكس مباشرة على صفحة الكوفي للعميل."
      action={
        <div className="flex flex-wrap items-center gap-3">
          <BarndaksaLogo variant="brown" width={120} height={48} />
          <LinkButton href={getCafePublicUrl(cafeSlug)} variant="primary" target="_blank">
            زيارة الكوفي
          </LinkButton>
        </div>
      }
    >
      {configError ? (
        <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          {configError}
        </SoftCard>
      ) : null}

      <BentoGrid className="mb-8">
        <BentoCard variant="gold" span="2" className="md:row-span-2">
          <div className="flex h-full flex-col justify-between">
            <div>
              <p className="text-sm font-black text-[#F6C35B]/90">قيمة الطلبات المقبولة المتوقعة</p>
              <p className="mt-3 text-3xl font-black sm:text-4xl lg:text-5xl">
                {formatSar(revenueFromAcceptedOrders)}
              </p>
              <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                {orders.filter((o) => o.status === "مقبول").length} طلب مقبول — الدفع عند الاستلام
              </p>
            </div>
            <div className="mt-8 flex h-40 items-end gap-2 sm:h-48">
              {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-xl bg-gradient-to-t from-[#F6C35B]/50 to-[#F6C35B]"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </BentoCard>

        <BentoCard variant="white">
          <ShoppingBag className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="طلبات اليوم" value={orders.length} />
        </BentoCard>

        <BentoCard variant="white">
          <CalendarDays className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label="حجوزات بانتظار الرد"
            value={pendingReservations.length}
            hint={`${reservations.length} إجمالي`}
          />
        </BentoCard>

        <BentoCard variant="white" span="2">
          <Users className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="عملاء الكوفي" value={customers.length} />
        </BentoCard>

        <BentoCard variant="white" span="2">
          <TrendingUp className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="طلبات مقبولة" value={orders.filter((o) => o.status === "مقبول").length} />
        </BentoCard>
      </BentoGrid>

      <BentoGrid>
        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#3A2117]">إجراءات سريعة</h2>
          <div className="mt-4 grid gap-2">
            {quickActions.map(([href, title]) => (
              <Link
                key={href}
                href={href}
                className="rounded-2xl bg-[#F8F4EF] px-5 py-4 font-black text-[#3A2117] transition hover:bg-[#EFE2D3]"
              >
                {title}
              </Link>
            ))}
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black text-[#3A2117]">آخر الحجوزات</h2>
            <Link href="/dashboard/reservations" className="font-black text-[#6B3A25]">
              عرض الكل
            </Link>
          </div>
          <div className="space-y-2">
            {reservations.slice(0, 4).map((r) => (
              <SoftCard key={r.id} className="p-3">
                <div className="flex justify-between gap-2">
                  <span className="font-black">{r.customerName}</span>
                  <span className="text-sm font-bold text-[#6B3A25]">{r.status}</span>
                </div>
                <p className="mt-1 text-xs font-bold text-[#7A6255]">
                  {r.type} • {r.date} • {r.time}
                </p>
              </SoftCard>
            ))}
            {!reservations.length ? (
              <p className="text-sm font-bold text-[#7A6255]">لا توجد حجوزات بعد.</p>
            ) : null}
          </div>
        </BentoCard>
      </BentoGrid>
    </DashboardPageShell>
  );
}

```

# File: components/dashboard/menu/category-manager.tsx

```tsx
"use client";

import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import {
  ImagePipelineError,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import { saveOptimizedImageAsset, revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import { BentoCard, PrimaryButton, SoftCard } from "@/components/ui/design-system";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";

type Props = {
  categories: MenuCategoryRecord[];
  products: MenuProduct[];
  cafeSlug?: string;
  onChange: (categories: MenuCategoryRecord[]) => void;
};

type FormState = {
  id?: string;
  name: string;
  description: string;
  visible: boolean;
  featured: boolean;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  visible: true,
  featured: false,
};

export function CategoryManager({
  categories,
  products,
  cafeSlug = "qatrah",
  onChange,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>();
  const [pendingImage, setPendingImage] = useState<OptimizedImageResult | null>(null);
  const [optimizingImage, setOptimizingImage] = useState(false);

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  function linkedCount(categoryId: string) {
    return products.filter((p) => p.categoryId === categoryId).length;
  }

  function openAdd() {
    setForm(emptyForm);
    setImagePreviewUrl(undefined);
    setPendingImage(null);
    setFormOpen(true);
  }

  function openEdit(category: MenuCategoryRecord) {
    setForm({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      visible: category.visible,
      featured: category.featured,
    });
    setImagePreviewUrl(undefined);
    setPendingImage(null);
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.name.trim()) {
      alert("اكتب اسم التصنيف");
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const categoryId = form.id ?? `cat_${Date.now()}`;

    let imageAssetId: string | undefined;
    if (pendingImage) {
      try {
        imageAssetId = await saveOptimizedImageAsset(
          "category-image",
          pendingImage,
          categoryId
        );
      } catch {
        alert("تعذر حفظ صورة التصنيف");
        return;
      }
    }

    if (form.id) {
      onChange(
        categories.map((c) =>
          c.id === form.id
            ? {
                ...c,
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                visible: form.visible,
                featured: form.featured,
                updatedAt: now,
                ...(imageAssetId ? { imageAssetId } : {}),
              }
            : c
        )
      );
    } else {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder), 0);
      const newCategory: MenuCategoryRecord = {
        id: categoryId,
        cafeSlug,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        sortOrder: maxOrder + 1,
        visible: form.visible,
        featured: form.featured,
        createdAt: now,
        updatedAt: now,
        imageAssetId,
      };
      onChange([...categories, newCategory]);
    }

    if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
    setFormOpen(false);
    setForm(emptyForm);
    setImagePreviewUrl(undefined);
    setPendingImage(null);
  }

  function removeCategory(id: string) {
    const count = linkedCount(id);
    if (count > 0) {
      alert(`لا يمكن حذف التصنيف — ${count} منتج مرتبط به`);
      return;
    }
    if (!confirm("حذف هذا التصنيف؟")) return;
    onChange(categories.filter((c) => c.id !== id));
  }

  function toggleField(id: string, field: "visible" | "featured") {
    const now = new Date().toISOString().slice(0, 10);
    onChange(
      categories.map((c) =>
        c.id === id ? { ...c, [field]: !c[field], updatedAt: now } : c
      )
    );
  }

  function moveCategory(id: string, direction: "up" | "down") {
    const list = [...sorted];
    const index = list.findIndex((c) => c.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;

    const current = list[index];
    const swap = list[swapIndex];
    const now = new Date().toISOString().slice(0, 10);

    onChange(
      categories.map((c) => {
        if (c.id === current.id) return { ...c, sortOrder: swap.sortOrder, updatedAt: now };
        if (c.id === swap.id) return { ...c, sortOrder: current.sortOrder, updatedAt: now };
        return c;
      })
    );
  }

  return (
    <BentoCard variant="white" span="4">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#3A2117]">تصنيفات المنيو</h2>
          <p className="mt-1 text-sm font-bold text-[#7A6255]">
            رتّب التصنيفات وتحكم في ظهورها للعميل.
          </p>
        </div>
        <PrimaryButton onClick={openAdd} className="inline-flex items-center gap-2">
          <Plus className="h-5 w-5" />
          تصنيف جديد
        </PrimaryButton>
      </div>

      {formOpen ? (
        <SoftCard className="mb-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-black text-[#3A2117]">
              {form.id ? "تعديل التصنيف" : "إضافة تصنيف"}
            </h3>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setForm(emptyForm);
              }}
              className="rounded-xl p-2 hover:bg-[#F8F4EF]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-black text-[#7A6255]">اسم التصنيف</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-black text-[#7A6255]">الوصف (اختياري)</span>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-black text-[#7A6255]">صورة التصنيف (اختياري)</span>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black">
                  <ImagePlus className="h-4 w-4" />
                  {optimizingImage ? "جاري تحسين الصورة..." : "رفع صورة"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      setOptimizingImage(true);
                      try {
                        const optimized = await optimizeImageForStorage(
                          file,
                          "category-image"
                        );
                        if (imagePreviewUrl?.startsWith("blob:")) {
                          revokeObjectUrl(imagePreviewUrl);
                        }
                        setImagePreviewUrl(URL.createObjectURL(optimized.blob));
                        setPendingImage(optimized);
                      } catch (err) {
                        alert(
                          err instanceof ImagePipelineError
                            ? err.message
                            : "تعذر قراءة الصورة"
                        );
                      } finally {
                        setOptimizingImage(false);
                      }
                    }}
                  />
                </label>
                {imagePreviewUrl ? (
                  <img src={imagePreviewUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : form.id ? (
                  <LocalAssetImage
                    assetId={categories.find((c) => c.id === form.id)?.imageAssetId}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : null}
              </div>
            </label>

            <label className="flex items-center gap-2 text-sm font-black">
              <input
                type="checkbox"
                checked={form.visible}
                onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))}
              />
              ظاهر للعميل
            </label>

            <label className="flex items-center gap-2 text-sm font-black">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              />
              تصنيف مميز
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={saveForm}
              className="rounded-2xl bg-[#3A2117] px-5 py-3 text-sm font-black text-[#F8E8D2]"
            >
              حفظ
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setForm(emptyForm);
              }}
              className="rounded-2xl bg-[#F8F4EF] px-5 py-3 text-sm font-black text-[#3A2117]"
            >
              إلغاء
            </button>
          </div>
        </SoftCard>
      ) : null}

      <div className="grid gap-3">
        {sorted.map((category, index) => (
          <SoftCard key={category.id} className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black text-[#3A2117]">{category.name}</h3>
                  {category.featured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                      <Star className="h-3.5 w-3.5" />
                      مميز
                    </span>
                  ) : null}
                  {!category.visible ? (
                    <span className="rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#7A6255]">
                      مخفي
                    </span>
                  ) : null}
                </div>
                {category.description ? (
                  <p className="mt-1 text-sm font-bold text-[#7A6255]">{category.description}</p>
                ) : null}
                <p className="mt-1 text-xs font-bold text-[#7A6255]">
                  {linkedCount(category.id)} منتج مرتبط
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => moveCategory(category.id, "up")}
                  disabled={index === 0}
                  className="rounded-2xl bg-[#F8F4EF] p-3 disabled:opacity-40"
                  title="تحريك لأعلى"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCategory(category.id, "down")}
                  disabled={index === sorted.length - 1}
                  className="rounded-2xl bg-[#F8F4EF] p-3 disabled:opacity-40"
                  title="تحريك لأسفل"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleField(category.id, "visible")}
                  className="rounded-2xl bg-[#F8F4EF] p-3"
                  title={category.visible ? "إخفاء" : "إظهار"}
                >
                  {category.visible ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleField(category.id, "featured")}
                  className={`rounded-2xl p-3 ${
                    category.featured ? "bg-amber-50 text-amber-700" : "bg-[#F8F4EF]"
                  }`}
                  title="تبديل مميز"
                >
                  <Star className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(category)}
                  className="rounded-2xl bg-[#F8F4EF] p-3"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeCategory(category.id)}
                  className="rounded-2xl bg-red-50 p-3 text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </SoftCard>
        ))}
      </div>
    </BentoCard>
  );
}

```

# File: components/dashboard/menu/product-card.tsx

```tsx
"use client";

import {
  Coffee,
  Flame,
  Gift,
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
} from "lucide-react";
import { ProductImage } from "@/components/cafe/product-image";
import { formatSar } from "@/lib/format";
import {
  isPromoActive,
  promoBadgeText,
  type MenuImageVariant,
  type MenuProduct,
} from "@/lib/mock/menu";

const variantGradient: Record<MenuImageVariant, string> = {
  latte: "from-[#3b2416] via-[#5c3d2e] to-[#c78a45]",
  cold: "from-[#1e3a4a] via-[#496b4a] to-[#7eb8b8]",
  cake: "from-[#4a2c3d] via-[#8b5a6b] to-[#d4a59a]",
  bakery: "from-[#5c4a3a] via-[#8b7355] to-[#e8dcc8]",
  tea: "from-[#3d4f3f] via-[#496b4a] to-[#a8c4a9]",
};

type Props = {
  product: MenuProduct;
  categoryLabel?: string;
  freeProductLabel?: string;
  onEdit: () => void;
  onToggleAvailability: () => void;
  onDelete: () => void;
};

export function MenuProductCard({
  product,
  categoryLabel,
  freeProductLabel,
  onEdit,
  onToggleAvailability,
  onDelete,
}: Props) {
  const promoOn = product.promo != null && isPromoActive(product.promo);

  return (
    <article className="overflow-hidden rounded-3xl border border-white bg-white/80 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F8F4EF]">
        <ProductImage
          product={product}
          alt=""
          className="h-full w-full object-contain bg-[#F8F4EF]"
          fallback={
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${variantGradient[product.imageVariant]}`}
            >
              <Coffee className="h-14 w-14 text-white/85" />
            </div>
          }
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#3A2117]/55 via-transparent to-transparent" />

        {product.promo ? (
          <span className="absolute right-3 top-3 flex max-w-[85%] items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#3A2117] shadow">
            <Gift className="h-3.5 w-3.5 text-[#8B5E3C]" />
            <span className="truncate">
              {promoOn ? promoBadgeText(product.promo) : "عرض غير نشط"}
            </span>
          </span>
        ) : null}

        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-black shadow ${
            product.available
              ? "bg-[#2E7D5B] text-white"
              : "bg-white text-[#3A2117]"
          }`}
        >
          {product.available ? "متاح" : "غير متاح"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-black text-[#8B5E3C]">
              {categoryLabel ?? product.category}
            </p>

            <h3 className="mt-1 text-lg font-black text-[#3A2117]">
              {product.name}
            </h3>
          </div>

          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F8F4EF]">
            <MoreHorizontal className="h-5 w-5 text-[#7A6255]" />
          </span>
        </div>

        <p className="line-clamp-2 text-sm font-bold leading-relaxed text-[#7A6255]">
          {product.description}
        </p>

        <div className="flex flex-wrap gap-2">
          {product.ingredients.slice(0, 4).map((ing) => (
            <span
              key={ing}
              className="rounded-full bg-[#EFE8DF] px-3 py-1 text-[11px] font-black text-[#3A2117]"
            >
              {ing}
            </span>
          ))}
        </div>

        <div className="mt-auto grid grid-cols-3 gap-3 border-t border-[#EFE8DF] pt-4 text-center">
          <div>
            <p className="text-[10px] font-black text-[#7A6255]">السعر</p>
            <p className="font-black text-[#3A2117]">
              {formatSar(product.price)}
            </p>
          </div>

          <div>
            <p className="flex items-center justify-center gap-1 text-[10px] font-black text-[#7A6255]">
              <Flame className="h-3 w-3 text-[#8B5E3C]" />
              سعرات
            </p>

            <p className="font-black text-[#3A2117]">
              {product.calories === undefined
                ? "غير محدد"
                : product.calories.toLocaleString("ar-SA")}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black text-[#7A6255]">ولاء</p>
            <p className="font-black text-[#8B5E3C]">
              +{product.loyaltyPoints.toLocaleString("ar-SA")}
            </p>
          </div>
        </div>

        {product.promo?.kind === "منتج مجاني مع الطلب" && freeProductLabel ? (
          <p className="rounded-2xl bg-[#2E7D5B]/10 px-3 py-2 text-xs font-bold text-[#2E7D5B]">
            يشمل: <span className="font-black">{freeProductLabel}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-[#EFE8DF] pt-4">
          <button
            type="button"
            onClick={onEdit}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#E5D8CD] bg-white py-2.5 text-xs font-black"
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </button>

          <button
            type="button"
            onClick={onToggleAvailability}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#3A2117]/10 py-2.5 text-xs font-black text-[#3A2117]"
          >
            <Power className="h-4 w-4" />
            {product.available ? "إيقاف" : "تفعيل"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-black text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </button>
        </div>
      </div>
    </article>
  );
}
```

# File: components/dashboard/menu/product-modal.tsx

```tsx
"use client";

import {
  Coffee,
  Flame,
  Gift,
  ImagePlus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProductImage } from "@/components/cafe/product-image";
import {
  ImagePipelineError,
  isHttpImageUrl,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import {
  revokeObjectUrl,
  saveOptimizedImageAsset,
} from "@/lib/cafe/local-asset-store";
import { Modal } from "@/components/dashboard/ui/modal";
import { formatSar } from "@/lib/format";
import {
  isPromoActive,
  PROMO_KINDS,
  promoBadgeText,
  type MenuImageVariant,
  type MenuProduct,
  type ProductPromo,
  type PromoKind,
} from "@/lib/mock/menu";
import {
  getCategoryNameById,
  type MenuCategoryRecord,
} from "@/lib/mock/menu-categories";

type Props = {
  open: boolean;
  mode: "add" | "edit";
  editingProduct: MenuProduct | null;
  productList: MenuProduct[];
  categories: MenuCategoryRecord[];
  onCategoriesChange: (categories: MenuCategoryRecord[]) => void;
  onClose: () => void;
  onSave: (product: MenuProduct) => void;
};

const VARIANT_OPTIONS: { id: MenuImageVariant; label: string }[] = [
  { id: "latte", label: "قهوة دافئة" },
  { id: "cold", label: "بارد" },
  { id: "cake", label: "حلويات" },
  { id: "bakery", label: "مخبوزات" },
  { id: "tea", label: "شاي / سبيشل" },
];

function buildPromoFromForm(
  linked: boolean,
  kind: PromoKind,
  discountPercent: string,
  freeProductId: string,
  customText: string,
  startDate: string,
  endDate: string
): ProductPromo | null {
  if (!linked || !startDate || !endDate) return null;

  if (kind === "خصم") {
    return {
      kind,
      discountPercent: Number(discountPercent) || 10,
      startDate,
      endDate,
    };
  }

  if (kind === "منتج مجاني مع الطلب") {
    return {
      kind,
      freeProductId: freeProductId || undefined,
      startDate,
      endDate,
    };
  }

  return {
    kind,
    customText: customText.trim() || "عرض خاص",
    startDate,
    endDate,
  };
}

export function MenuProductFormModal({
  open,
  mode,
  editingProduct,
  productList,
  categories,
  onCategoriesChange,
  onClose,
  onSave,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageAssetId, setImageAssetId] = useState<string | undefined>();
  const [legacyExternalImageUrl, setLegacyExternalImageUrl] = useState<string | null>(null);
  const [pendingOptimized, setPendingOptimized] = useState<OptimizedImageResult | null>(null);
  const [optimizingImage, setOptimizingImage] = useState(false);
  const [imageVariant, setImageVariant] = useState<MenuImageVariant>("latte");

  const [calories, setCalories] = useState("");
  const [price, setPrice] = useState("18");
  const [loyaltyPoints, setLoyaltyPoints] = useState("18");
  const [preparationTimeMinutes, setPreparationTimeMinutes] = useState("");
  const [redeemableWithPoints, setRedeemableWithPoints] = useState(false);
  const [redemptionPoints, setRedemptionPoints] = useState("");
  const [availableForPickup, setAvailableForPickup] = useState(true);
  const [pickupLeadTimeMinutes, setPickupLeadTimeMinutes] = useState("");

  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [available, setAvailable] = useState(true);

  const [promoLinked, setPromoLinked] = useState(false);
  const [promoKind, setPromoKind] = useState<PromoKind>("خصم");
  const [promoDiscount, setPromoDiscount] = useState("10");
  const [promoFreeId, setPromoFreeId] = useState("");
  const [promoCustom, setPromoCustom] = useState("");
  const [promoStart, setPromoStart] = useState("2026-05-10");
  const [promoEnd, setPromoEnd] = useState("2026-05-31");

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && editingProduct) {
      setName(editingProduct.name);
      setCategoryId(editingProduct.categoryId ?? "");
      setCreatingCategory(false);
      setNewCategoryName("");
      setDescription(editingProduct.description);
      setImagePreviewUrl(null);
      setImageAssetId(editingProduct.imageAssetId);
      setLegacyExternalImageUrl(
        isHttpImageUrl(editingProduct.imageDataUrl) ? editingProduct.imageDataUrl! : null
      );
      setPendingOptimized(null);
      setImageVariant(editingProduct.imageVariant);
      setPrice(String(editingProduct.price));
      setCalories(
        editingProduct.calories === undefined ? "" : String(editingProduct.calories)
      );
      setLoyaltyPoints(String(editingProduct.loyaltyPoints));
      setPreparationTimeMinutes(
        editingProduct.preparationTimeMinutes === undefined
          ? ""
          : String(editingProduct.preparationTimeMinutes)
      );
      setRedeemableWithPoints(!!editingProduct.redeemableWithPoints);
      setRedemptionPoints(
        editingProduct.redemptionPoints === undefined
          ? ""
          : String(editingProduct.redemptionPoints)
      );
      setAvailableForPickup(editingProduct.availableForPickup !== false);
      setPickupLeadTimeMinutes(
        editingProduct.pickupLeadTimeMinutes === undefined
          ? ""
          : String(editingProduct.pickupLeadTimeMinutes)
      );
      setIngredients([...editingProduct.ingredients]);
      setAvailable(editingProduct.available);

      const promo = editingProduct.promo;
      setPromoLinked(!!promo);

      if (promo) {
        setPromoKind(promo.kind);
        setPromoDiscount(String(promo.discountPercent ?? 10));
        setPromoFreeId(promo.freeProductId ?? "");
        setPromoCustom(promo.customText ?? "");
        setPromoStart(promo.startDate);
        setPromoEnd(promo.endDate);
      }
    } else {
      setName("");
      setCategoryId(categories[0]?.id ?? "");
      setCreatingCategory(false);
      setNewCategoryName("");
      setDescription("");
      setImagePreviewUrl(null);
      setImageAssetId(undefined);
      setLegacyExternalImageUrl(null);
      setPendingOptimized(null);
      setImageVariant("latte");
      setPrice("18");
      setCalories("");
      setLoyaltyPoints("18");
      setPreparationTimeMinutes("");
      setRedeemableWithPoints(false);
      setRedemptionPoints("");
      setAvailableForPickup(true);
      setPickupLeadTimeMinutes("");
      setIngredients([]);
      setIngredientDraft("");
      setAvailable(true);
      setPromoLinked(false);
      setPromoKind("خصم");
      setPromoDiscount("10");
      setPromoFreeId("");
      setPromoCustom("");
      setPromoStart("2026-05-10");
      setPromoEnd("2026-05-31");
    }
  }, [open, mode, editingProduct, categories]);

  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  function resolveCategoryId(): string | undefined {
    if (creatingCategory) {
      if (!newCategoryName.trim()) return undefined;
      const now = new Date().toISOString().slice(0, 10);
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder), 0);
      const newCat: MenuCategoryRecord = {
        id: `cat_${Date.now()}`,
        cafeSlug: "qatrah",
        name: newCategoryName.trim(),
        sortOrder: maxOrder + 1,
        visible: true,
        featured: false,
        createdAt: now,
        updatedAt: now,
      };
      onCategoriesChange([...categories, newCat]);
      return newCat.id;
    }
    return categoryId || undefined;
  }

  function addIngredient() {
    const value = ingredientDraft.trim();
    if (!value) return;

    setIngredients((prev) => [...prev, value]);
    setIngredientDraft("");
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOptimizingImage(true);
    try {
      const optimized = await optimizeImageForStorage(file, "product-image");
      if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
      setImagePreviewUrl(URL.createObjectURL(optimized.blob));
      setPendingOptimized(optimized);
      setLegacyExternalImageUrl(null);
    } catch (err) {
      alert(
        err instanceof ImagePipelineError
          ? err.message
          : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP"
      );
    } finally {
      setOptimizingImage(false);
    }
  }

  const resolvedCategoryId = creatingCategory
    ? undefined
    : categoryId || undefined;
  const displayCategory = getCategoryNameById(
    categories,
    resolvedCategoryId,
    creatingCategory ? newCategoryName.trim() || "أخرى" : "أخرى"
  );

  const previewProduct: MenuProduct = useMemo(() => {
    const promo = buildPromoFromForm(
      promoLinked,
      promoKind,
      promoDiscount,
      promoFreeId,
      promoCustom,
      promoStart,
      promoEnd
    );

    return {
      id: "preview",
      name: name.trim() || "اسم المنتج",
      category: displayCategory,
      categoryId: resolvedCategoryId,
      description: description.trim() || "وصف مختصر يظهر للعميل في صفحة المنتج.",
      imageAssetId,
      imageDataUrl: legacyExternalImageUrl,
      imageVariant,
      price: Number(price) || 0,
      calories: calories.trim() ? Number(calories) || 0 : undefined,
      loyaltyPoints: Number(loyaltyPoints) || 0,
      preparationTimeMinutes: preparationTimeMinutes.trim()
        ? Number(preparationTimeMinutes) || undefined
        : undefined,
      redeemableWithPoints,
      redemptionPoints:
        redeemableWithPoints && redemptionPoints.trim()
          ? Number(redemptionPoints) || undefined
          : undefined,
      availableForPickup,
      pickupLeadTimeMinutes: pickupLeadTimeMinutes.trim()
        ? Number(pickupLeadTimeMinutes) || undefined
        : undefined,
      ingredients: ingredients.length ? ingredients : ["مكون"],
      available,
      promo,
    };
  }, [
    name,
    displayCategory,
    resolvedCategoryId,
    description,
    imageAssetId,
    legacyExternalImageUrl,
    imagePreviewUrl,
    pendingOptimized,
    imageVariant,
    price,
    calories,
    loyaltyPoints,
    preparationTimeMinutes,
    redeemableWithPoints,
    redemptionPoints,
    availableForPickup,
    pickupLeadTimeMinutes,
    ingredients,
    available,
    promoLinked,
    promoKind,
    promoDiscount,
    promoFreeId,
    promoCustom,
    promoStart,
    promoEnd,
  ]);

  const freeProductOptions = productList.filter(
    (product) => product.id !== editingProduct?.id
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      alert("اكتب اسم المنتج");
      return;
    }

    if (!description.trim()) {
      alert("اكتب وصف المنتج");
      return;
    }

    if (!price || Number.isNaN(Number(price))) {
      alert("السعر مطلوب");
      return;
    }

    if (!loyaltyPoints || Number.isNaN(Number(loyaltyPoints))) {
      alert("نقاط الولاء مطلوبة");
      return;
    }

    if (creatingCategory && !newCategoryName.trim()) {
      alert("اكتب اسم التصنيف الجديد");
      return;
    }

    if (!creatingCategory && !categoryId) {
      alert("اختر تصنيفًا للمنتج");
      return;
    }

    const nextCategoryId = resolveCategoryId();
    if (!nextCategoryId) {
      alert("تعذر حفظ التصنيف");
      return;
    }

    const categoryName = getCategoryNameById(
      categories,
      nextCategoryId,
      newCategoryName.trim() || "أخرى"
    );

    if (promoLinked && promoKind === "منتج مجاني مع الطلب" && !promoFreeId) {
      alert("اختر المنتج المجاني");
      return;
    }

    const promo = buildPromoFromForm(
      promoLinked,
      promoKind,
      promoDiscount,
      promoFreeId,
      promoCustom,
      promoStart,
      promoEnd
    );

    const productId = editingProduct?.id || crypto.randomUUID();
    let finalAssetId = imageAssetId;

    try {
      if (pendingOptimized) {
        finalAssetId = await saveOptimizedImageAsset(
          "product-image",
          pendingOptimized,
          productId
        );
      }
    } catch {
      alert("تعذر حفظ صورة المنتج محليًا");
      return;
    }

    const payload: MenuProduct = {
      id: productId,
      name: name.trim(),
      category: categoryName,
      categoryId: nextCategoryId,
      description: description.trim(),
      imageAssetId: finalAssetId,
      imageDataUrl: legacyExternalImageUrl,
      imageVariant,
      price: Number(price),
      calories: calories.trim() ? Number(calories) || 0 : undefined,
      loyaltyPoints: Number(loyaltyPoints) || 0,
      preparationTimeMinutes: preparationTimeMinutes.trim()
        ? Number(preparationTimeMinutes) || undefined
        : undefined,
      redeemableWithPoints: redeemableWithPoints || undefined,
      redemptionPoints:
        redeemableWithPoints && redemptionPoints.trim()
          ? Number(redemptionPoints) || undefined
          : undefined,
      availableForPickup: availableForPickup || undefined,
      pickupLeadTimeMinutes: pickupLeadTimeMinutes.trim()
        ? Number(pickupLeadTimeMinutes) || undefined
        : undefined,
      ingredients,
      available,
      promo,
    };

    onSave(payload);
    if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
    onClose();
  }

  const variantGradient: Record<MenuImageVariant, string> = {
    latte: "from-[#3b2416] via-[#5c3d2e] to-[#c78a45]",
    cold: "from-[#1e3a4a] via-[#496b4a] to-[#7eb8b8]",
    cake: "from-[#4a2c3d] via-[#8b5a6b] to-[#d4a59a]",
    bakery: "from-[#5c4a3a] via-[#8b7355] to-[#e8dcc8]",
    tea: "from-[#3d4f3f] via-[#496b4a] to-[#a8c4a9]",
  };

  const promoPreviewActive =
    previewProduct.promo && isPromoActive(previewProduct.promo);

  return (
    <Modal
      open={open}
      title={mode === "add" ? "إضافة منتج جديد" : "تعديل المنتج"}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#E5D8CD] px-5 py-3 text-sm font-black text-[#3A2117] hover:bg-[#F8F4EF]"
          >
            إلغاء
          </button>

          <button
            type="submit"
            form="menu-product-form"
            className="rounded-2xl bg-[#3A2117] px-6 py-3 text-sm font-black text-[#F8E8D2]"
          >
            {mode === "add" ? "حفظ المنتج" : "تحديث المنتج"}
          </button>
        </>
      }
    >
      <form
        id="menu-product-form"
        onSubmit={handleSubmit}
        className="grid gap-8 lg:grid-cols-2"
      >
        <div className="space-y-5">
          <label className="block">
            <span className="text-xs font-black text-[#7A6255]">
              اسم المنتج
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: لاتيه فانيلا"
              className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black text-[#7A6255]">التصنيف</span>
            <select
              value={creatingCategory ? "__new__" : categoryId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setCreatingCategory(true);
                  setCategoryId("");
                } else {
                  setCreatingCategory(false);
                  setCategoryId(e.target.value);
                }
              }}
              className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            >
              {sortedCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option value="__new__">+ إنشاء تصنيف جديد</option>
            </select>
          </label>

          {creatingCategory ? (
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                اسم التصنيف الجديد
              </span>
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="اكتب اسم التصنيف"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-black text-[#7A6255]">
              وصف المنتج
            </span>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب وصف المنتج كما سيظهر للعميل"
              className="mt-2 w-full resize-none rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            />
          </label>

          <div className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <p className="text-xs font-black text-[#7A6255]">صورة المنتج</p>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={optimizingImage}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#3A2117] disabled:opacity-60"
              >
                <ImagePlus className="h-5 w-5" />
                {optimizingImage ? "جاري تحسين الصورة..." : "اختيار صورة"}
              </button>

              {imagePreviewUrl || imageAssetId || legacyExternalImageUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
                    setImagePreviewUrl(null);
                    setPendingOptimized(null);
                    setImageAssetId(undefined);
                    setLegacyExternalImageUrl(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  إزالة
                </button>
              ) : null}
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-black text-[#7A6255]">
                خلفية احتياطية عند عدم رفع صورة
              </span>
              <select
                value={imageVariant}
                onChange={(e) =>
                  setImageVariant(e.target.value as MenuImageVariant)
                }
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              >
                {VARIANT_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                السعرات الحرارية اختياري
              </span>
              <input
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="مثال: 220"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                السعر ر.س *
              </span>
              <input
                required
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="مثال: 18"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                نقاط الولاء *
              </span>
              <input
                required
                inputMode="numeric"
                value={loyaltyPoints}
                onChange={(e) => setLoyaltyPoints(e.target.value)}
                placeholder="مثال: 18"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                وقت التحضير (دقيقة) اختياري
              </span>
              <input
                inputMode="numeric"
                value={preparationTimeMinutes}
                onChange={(e) => setPreparationTimeMinutes(e.target.value)}
                placeholder="مثال: 5"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                مهلة الاستلام (دقيقة) اختياري
              </span>
              <input
                inputMode="numeric"
                value={pickupLeadTimeMinutes}
                onChange={(e) => setPickupLeadTimeMinutes(e.target.value)}
                placeholder="مثال: 15"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>
          </div>

          <fieldset className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <legend className="px-2 text-xs font-black text-[#3A2117]">
              الاستلام والاستبدال بالنقاط
            </legend>

            <label className="mt-3 flex items-center gap-2 text-sm font-black text-[#3A2117]">
              <input
                type="checkbox"
                checked={availableForPickup}
                onChange={(e) => setAvailableForPickup(e.target.checked)}
              />
              متاح للاستلام
            </label>

            <label className="mt-3 flex items-center gap-2 text-sm font-black text-[#3A2117]">
              <input
                type="checkbox"
                checked={redeemableWithPoints}
                onChange={(e) => setRedeemableWithPoints(e.target.checked)}
              />
              قابل للاستبدال بالنقاط
            </label>

            {redeemableWithPoints ? (
              <label className="mt-4 block">
                <span className="text-xs font-black text-[#7A6255]">نقاط الاستبدال</span>
                <input
                  inputMode="numeric"
                  value={redemptionPoints}
                  onChange={(e) => setRedemptionPoints(e.target.value)}
                  placeholder="مثال: 120"
                  className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold outline-none"
                />
              </label>
            ) : null}
          </fieldset>

          <div>
            <span className="text-xs font-black text-[#7A6255]">
              مكونات المنتج
            </span>

            <div className="mt-2 flex gap-2">
              <input
                value={ingredientDraft}
                onChange={(e) => setIngredientDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addIngredient();
                  }
                }}
                placeholder="مثال: حليب، قهوة..."
                className="min-w-0 flex-1 rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />

              <button
                type="button"
                onClick={addIngredient}
                className="rounded-2xl bg-[#3A2117] px-5 py-4 text-sm font-black text-[#F8E8D2]"
              >
                إضافة
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {ingredients.map((ingredient) => (
                <span
                  key={ingredient}
                  className="inline-flex items-center gap-1 rounded-full bg-[#EFE8DF] px-3 py-1 text-xs font-black text-[#3A2117]"
                >
                  {ingredient}
                  <button
                    type="button"
                    onClick={() =>
                      setIngredients((prev) =>
                        prev.filter((item) => item !== ingredient)
                      )
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <fieldset className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <legend className="px-2 text-xs font-black text-[#3A2117]">
              حالة المنتج
            </legend>

            <div className="mt-3 flex gap-5">
              <label className="flex items-center gap-2 text-sm font-black text-[#3A2117]">
                <input
                  type="radio"
                  checked={available}
                  onChange={() => setAvailable(true)}
                />
                متاح
              </label>

              <label className="flex items-center gap-2 text-sm font-black text-[#3A2117]">
                <input
                  type="radio"
                  checked={!available}
                  onChange={() => setAvailable(false)}
                />
                غير متاح
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <legend className="px-2 text-xs font-black text-[#3A2117]">
              هل يوجد عرض مرتبط؟
            </legend>

            <div className="mt-3 flex gap-5">
              <label className="flex items-center gap-2 text-sm font-black text-[#3A2117]">
                <input
                  type="radio"
                  checked={!promoLinked}
                  onChange={() => setPromoLinked(false)}
                />
                لا
              </label>

              <label className="flex items-center gap-2 text-sm font-black text-[#3A2117]">
                <input
                  type="radio"
                  checked={promoLinked}
                  onChange={() => setPromoLinked(true)}
                />
                نعم
              </label>
            </div>

            {promoLinked ? (
              <div className="mt-5 space-y-4 border-t border-[#E5D8CD] pt-4">
                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">
                    نوع العرض
                  </span>
                  <select
                    value={promoKind}
                    onChange={(e) =>
                      setPromoKind(e.target.value as PromoKind)
                    }
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none"
                  >
                    {PROMO_KINDS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                {promoKind === "خصم" ? (
                  <input
                    value={promoDiscount}
                    onChange={(e) => setPromoDiscount(e.target.value)}
                    placeholder="نسبة الخصم"
                    className="w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold outline-none"
                  />
                ) : null}

                {promoKind === "منتج مجاني مع الطلب" ? (
                  <select
                    value={promoFreeId}
                    onChange={(e) => setPromoFreeId(e.target.value)}
                    className="w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold outline-none"
                  >
                    <option value="">اختر منتج مجاني</option>
                    {freeProductOptions.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                ) : null}

                {promoKind === "عرض مخصص" ? (
                  <textarea
                    value={promoCustom}
                    onChange={(e) => setPromoCustom(e.target.value)}
                    placeholder="نص العرض"
                    className="h-24 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right text-sm font-bold outline-none"
                  />
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    type="date"
                    value={promoStart}
                    onChange={(e) => setPromoStart(e.target.value)}
                    className="rounded-2xl border border-[#E5D8CD] px-4 py-4 text-sm font-bold outline-none"
                  />

                  <input
                    type="date"
                    value={promoEnd}
                    onChange={(e) => setPromoEnd(e.target.value)}
                    className="rounded-2xl border border-[#E5D8CD] px-4 py-4 text-sm font-bold outline-none"
                  />
                </div>
              </div>
            ) : null}
          </fieldset>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#8B5E3C]" />
            <p className="font-black text-[#3A2117]">معاينة مباشرة</p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-[#E5D8CD] bg-white shadow-xl">
            <div className="relative aspect-[4/3] overflow-hidden bg-[#F8F4EF]">
              <ProductImage
                product={previewProduct}
                previewUrl={imagePreviewUrl ?? undefined}
                alt=""
                className="h-full w-full object-contain"
                fallback={
                  <div
                    className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${variantGradient[previewProduct.imageVariant]}`}
                  >
                    <Coffee className="h-12 w-12 text-white/85" />
                  </div>
                }
              />

              {previewProduct.promo ? (
                <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#3A2117] shadow">
                  <Gift className="h-3.5 w-3.5 text-[#8B5E3C]" />
                  {promoPreviewActive
                    ? promoBadgeText(previewProduct.promo)
                    : "عرض غير نشط"}
                </span>
              ) : null}

              <span
                className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-black shadow ${
                  previewProduct.available
                    ? "bg-green-600 text-white"
                    : "bg-white text-[#3A2117]"
                }`}
              >
                {previewProduct.available ? "متاح" : "غير متاح"}
              </span>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-xs font-black text-[#8B5E3C]">
                {previewProduct.category}
              </p>

              <h3 className="text-xl font-black text-[#3A2117]">
                {previewProduct.name}
              </h3>

              <p className="line-clamp-3 text-sm font-bold leading-7 text-[#7A6255]">
                {previewProduct.description}
              </p>

              <div className="flex flex-wrap gap-4 border-t border-[#E5D8CD] pt-4 text-sm">
                <div>
                  <p className="text-[10px] font-black text-[#7A6255]">
                    السعر
                  </p>
                  <p className="font-black text-[#3A2117]">
                    {formatSar(previewProduct.price)}
                  </p>
                </div>

                <div>
                  <p className="flex items-center gap-1 text-[10px] font-black text-[#7A6255]">
                    <Flame className="h-3 w-3 text-[#8B5E3C]" />
                    سعرات
                  </p>
                  <p className="font-black text-[#3A2117]">
                    {previewProduct.calories === undefined
                      ? "غير محدد"
                      : previewProduct.calories.toLocaleString("ar-SA")}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-[#7A6255]">
                    ولاء
                  </p>
                  <p className="font-black text-[#8B5E3C]">
                    +{previewProduct.loyaltyPoints.toLocaleString("ar-SA")}
                  </p>
                </div>
              </div>

              {previewProduct.promo ? (
                <p className="rounded-2xl bg-[#F8F4EF] px-3 py-2 text-xs font-bold text-[#3A2117]">
                  العرض:{" "}
                  <span className="font-black">
                    {promoBadgeText(previewProduct.promo)}
                  </span>
                </p>
              ) : (
                <p className="rounded-2xl bg-[#F8F4EF] px-3 py-2 text-xs font-bold text-[#7A6255]">
                  بدون عرض مرتبط
                </p>
              )}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
```

# File: components/dashboard/notifications-panel.tsx

```tsx
"use client";

import { Bell, Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOwnerNotificationsAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import type { AppNotification } from "@/lib/mock/notifications";

type Props = {
  className?: string;
};

export function NotificationsPanel({ className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchOwnerNotificationsAction();
      setNotifications(list);
    } catch {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  async function handleMarkRead(id: string) {
    await markNotificationReadAction(id);
    await refresh();
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markNotificationReadAction(n.id)));
    await refresh();
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[#F6C35B] transition hover:bg-white/10"
        aria-label="الإشعارات"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-[#E5D8CD] bg-[#FDFBF8] shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E5D8CD] px-4 py-3">
              <h3 className="font-black text-[#3A2117]">إشعارات الكوفي</h3>
              {unreadCount > 0 ? (
                <button
                  onClick={() => void markAllRead()}
                  className="text-xs font-black text-[#6B3A25]"
                >
                  قراءة الكل
                </button>
              ) : null}
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="p-6 text-center text-sm font-bold text-[#7A6255]">
                  لا توجد إشعارات
                </li>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <li
                    key={n.id}
                    className={`border-b border-[#E5D8CD]/60 px-4 py-3 ${n.read ? "opacity-60" : "bg-[#FFF8EF]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black text-[#3A2117]">{n.title}</p>
                        <p className="mt-1 text-xs font-bold text-[#7A6255]">{n.body}</p>
                        <p className="mt-1 text-[10px] text-[#7A6255]">
                          {new Date(n.createdAt).toLocaleString("ar-SA")}
                        </p>
                      </div>
                      {!n.read ? (
                        <button
                          onClick={() => void handleMarkRead(n.id)}
                          className="shrink-0 rounded-lg bg-green-50 p-1.5 text-green-700"
                          aria-label="قراءة"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
            <button
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-1 border-t border-[#E5D8CD] py-2 text-xs font-black text-[#7A6255]"
            >
              <X className="h-3 w-3" />
              إغلاق
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

```

# File: components/dashboard/offers/offer-card.tsx

```tsx
"use client";

import { CalendarDays, Eye, EyeOff, Pencil, Power, TicketPercent, Trash2 } from "lucide-react";
import type { CafeOffer } from "@/lib/mock/offers";

type Props = {
  offer: CafeOffer;
  onEdit: () => void;
  onToggleStatus: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
};

export function OfferCard({
  offer,
  onEdit,
  onToggleStatus,
  onToggleVisible,
  onDelete,
}: Props) {
  const isActive = offer.status === "نشط";

  return (
    <article className="rounded-3xl border border-white bg-white/80 p-6 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
            <TicketPercent className="h-7 w-7" />
          </div>

          <div>
            <p className="text-xs font-black text-[#8B5E3C]">{offer.type}</p>
            <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
              {offer.title}
            </h2>
            <p className="mt-2 max-w-xl text-sm font-bold leading-7 text-[#7A6255]">
              {offer.description}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-4 py-2 text-xs font-black ${
            isActive
              ? "bg-green-50 text-green-700"
              : offer.status === "مجدول"
              ? "bg-amber-50 text-amber-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {offer.status}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="text-xs font-black text-[#7A6255]">كود العرض</p>
          <h3 className="mt-1 font-black text-[#3A2117]">{offer.code || "بدون كود"}</h3>
        </div>

        <div className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="text-xs font-black text-[#7A6255]">قيمة الخصم</p>
          <h3 className="mt-1 font-black text-[#3A2117]">
            {offer.discountPercent ? `${offer.discountPercent}%` : "عرض خاص"}
          </h3>
        </div>

        <div className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
            <CalendarDays className="h-4 w-4" />
            المدة
          </p>
          <h3 className="mt-1 text-sm font-black text-[#3A2117]">
            {offer.startDate} - {offer.endDate}
          </h3>
        </div>

        <div className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="text-xs font-black text-[#7A6255]">ظهور للعميل</p>
          <h3 className="mt-1 font-black text-[#3A2117]">
            {offer.visibleInCafe ? "ظاهر" : "مخفي"}
          </h3>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-[#EFE8DF] pt-5">
        <button onClick={onEdit} className="flex items-center gap-2 rounded-2xl border border-[#E5D8CD] bg-white px-5 py-3 text-sm font-black">
          <Pencil className="h-4 w-4" />
          تعديل
        </button>

        <button onClick={onToggleStatus} className="flex items-center gap-2 rounded-2xl bg-[#3A2117]/10 px-5 py-3 text-sm font-black text-[#3A2117]">
          <Power className="h-4 w-4" />
          {isActive ? "إيقاف" : "تفعيل"}
        </button>

        <button onClick={onToggleVisible} className="flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-5 py-3 text-sm font-black">
          {offer.visibleInCafe ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {offer.visibleInCafe ? "إخفاء من صفحة الكوفي" : "إظهار في صفحة الكوفي"}
        </button>

        <button onClick={onDelete} className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700">
          <Trash2 className="h-4 w-4" />
          حذف
        </button>
      </div>
    </article>
  );
}
```

# File: components/dashboard/pages/branches-page.tsx

```tsx
"use client";

import { ExternalLink, LocateFixed, MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteBranchAction, saveBranchAction } from "@/app/actions/branches";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoInput,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { buildGoogleMapsUrl, type CafeBranch } from "@/lib/mock/branches";

type Props = {
  initialBranches: CafeBranch[];
  configError?: string;
};

export function BranchesPageClient({ initialBranches, configError }: Props) {
  const [branches, setBranches] = useState<CafeBranch[]>(initialBranches);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("جدة");
  const [distanceKm, setDistanceKm] = useState("");
  const [phone, setPhone] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [saving, setSaving] = useState(false);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      alert("المتصفح لا يدعم تحديد الموقع");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = position.coords.latitude.toFixed(7);
        const nextLng = position.coords.longitude.toFixed(7);
        const nextUrl = buildGoogleMapsUrl(Number(nextLat), Number(nextLng));

        setLat(nextLat);
        setLng(nextLng);
        setMapUrl(nextUrl);

        window.open(nextUrl, "_blank");
      },
      () => {
        alert("لم يتم السماح بالوصول للموقع");
      },
      {
        enableHighAccuracy: true,
      }
    );
  }

  function openGoogleMapsPicker() {
    const query = address || name || "Jeddah cafe";
    const url =
      lat && lng
        ? buildGoogleMapsUrl(Number(lat), Number(lng))
        : `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

    window.open(url, "_blank");
  }

  async function addBranch() {
    if (!name.trim() || !address.trim()) {
      alert("اكتب اسم الفرع والعنوان");
      return;
    }

    const finalLat = lat ? Number(lat) : undefined;
    const finalLng = lng ? Number(lng) : undefined;
    const finalMapUrl =
      mapUrl.trim() || buildGoogleMapsUrl(finalLat, finalLng, undefined);

    setSaving(true);
    try {
      const saved = await saveBranchAction({
        name: name.trim(),
        address: address.trim(),
        city: city.trim() || "جدة",
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
        phone: phone.trim() || undefined,
        workingHours: workingHours.trim() || "غير محدد",
        lat: finalLat,
        lng: finalLng,
        mapUrl: finalMapUrl,
        active: true,
        id: crypto.randomUUID(),
      });
      setBranches((prev) => [saved, ...prev]);
      setName("");
      setAddress("");
      setCity("جدة");
      setDistanceKm("");
      setPhone("");
      setWorkingHours("");
      setMapUrl("");
      setLat("");
      setLng("");
    } catch {
      alert("تعذر حفظ الفرع");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = branches.filter((b) => b.active).length;

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="فروع الكوفي"
        subtitle="حدّد موقع الفرع من خرائط قوقل، واحفظه ليظهر للعميل في صفحة الحجز والفروع."
      >
        {configError ? (
          <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            {configError}
          </SoftCard>
        ) : null}
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي الفروع" value={branches.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="فروع نشطة" value={activeCount} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill
              label="مدن مغطاة"
              value={new Set(branches.map((b) => b.city)).size}
              hint="فروع متعددة المدن"
            />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="2">
            <div className="grid gap-5">
              {branches.map((branch) => {
                const url = branch.mapUrl || buildGoogleMapsUrl(branch.lat, branch.lng);

                return (
                  <SoftCard key={branch.id}>
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                          <MapPin className="h-7 w-7" />
                        </div>

                        <div>
                          <h2 className="text-2xl font-black text-[#3A2117]">
                            {branch.name}
                          </h2>
                          <p className="mt-2 font-bold text-[#7A6255]">{branch.address}</p>
                          <p className="mt-1 text-sm font-bold text-[#7A6255]">
                            {branch.city} • {branch.workingHours}
                          </p>
                          {branch.lat && branch.lng ? (
                            <p className="mt-2 text-xs font-black text-[#6B3A25]">
                              {branch.lat}, {branch.lng}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a
                          href={url}
                          target="_blank"
                          className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-[#F8F4EF]"
                        >
                          <ExternalLink className="h-4 w-4" />
                          فتح الخريطة
                        </a>
                        <button
                          onClick={() =>
                            setBranches((prev) =>
                              prev.map((item) =>
                                item.id === branch.id
                                  ? { ...item, active: !item.active }
                                  : item
                              )
                            )
                          }
                          className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
                        >
                          {branch.active ? "إخفاء" : "إظهار"}
                        </button>
                        <button
                          onClick={() =>
                            setBranches((prev) =>
                              prev.filter((item) => item.id !== branch.id)
                            )
                          }
                          className="rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700"
                        >
                          <Trash2 className="inline h-4 w-4" /> حذف
                        </button>
                      </div>
                    </div>
                  </SoftCard>
                );
              })}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
              <Plus className="h-5 w-5" />
              إضافة فرع
            </h2>

            <div className="space-y-3">
              <NeumoInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم الفرع"
              />
              <NeumoInput
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="العنوان"
              />
              <NeumoInput
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="المدينة"
              />
              <NeumoInput
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="المسافة كم اختياري"
              />
              <NeumoInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="رقم الفرع"
              />
              <NeumoInput
                value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)}
                placeholder="أوقات العمل"
              />

              <SoftCard className="p-4">
                <p className="mb-3 font-black text-[#3A2117]">موقع الفرع</p>

                <div className="grid grid-cols-2 gap-2">
                  <NeumoInput
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="Latitude"
                  />
                  <NeumoInput
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="Longitude"
                  />
                </div>

                <NeumoInput
                  value={mapUrl}
                  onChange={(e) => setMapUrl(e.target.value)}
                  placeholder="رابط Google Maps يتولد تلقائيًا أو الصقه هنا"
                  className="mt-2"
                />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <PrimaryButton
                    onClick={useCurrentLocation}
                    className="inline-flex h-12 items-center justify-center gap-2"
                  >
                    <LocateFixed className="h-4 w-4" />
                    موقعي الحالي
                  </PrimaryButton>
                  <button
                    onClick={openGoogleMapsPicker}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#E5D8CD] bg-white font-black text-[#3A2117]"
                  >
                    <MapPin className="h-4 w-4" />
                    فتح قوقل ماب
                  </button>
                </div>

                <p className="mt-3 text-xs font-bold leading-6 text-[#7A6255]">
                  الأفضل: اضغط موقعي الحالي إذا كنت داخل الفرع. أو افتح قوقل ماب وحدد
                  الدبوس ثم انسخ الرابط والصقه.
                </p>
              </SoftCard>

              <PrimaryButton onClick={addBranch} className="w-full">
                حفظ الفرع والموقع
              </PrimaryButton>
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

```

# File: components/dashboard/pages/customers-page.tsx

```tsx
"use client";

import { Receipt, Search, ShoppingBag, Star, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import {
  type CustomerOrder,
  type CustomerProfile,
} from "@/lib/mock/customer-activity";
import { type CafeReservation } from "@/lib/mock/reservations";

type Props = {
  initialCustomers: CustomerProfile[];
  initialOrders: CustomerOrder[];
  initialReservations: CafeReservation[];
  configError?: string;
};

export function CustomersPageClient({
  initialCustomers,
  initialOrders,
  initialReservations,
  configError,
}: Props) {
  const [customers] = useState<CustomerProfile[]>(initialCustomers);
  const [orders] = useState<CustomerOrder[]>(initialOrders);
  const [reservations] = useState<CafeReservation[]>(initialReservations);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return customers.filter(
      (customer) =>
        customer.fullName.includes(query) ||
        customer.phone.includes(query) ||
        customer.email?.includes(query)
    );
  }, [customers, query]);

  function getCustomerData(customer: CustomerProfile) {
    const customerOrders = orders.filter((o) => o.customerId === customer.id);
    const customerReservations = reservations.filter(
      (r) => r.customerId === customer.id || r.phone === customer.phone
    );

    const totalSpent = customerOrders
      .filter((order) => order.status === "مقبول")
      .reduce((sum, order) => sum + order.total, 0);

    return {
      orders: customerOrders,
      invoices: [] as { id: string }[],
      transactions: [] as { id: string; title: string; createdAt: string; points?: number }[],
      reservations: customerReservations,
      points: 0,
      totalSpent,
    };
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="عملاء الكوفي"
        subtitle="هنا تشوف كل عميل، طلباته، حجوزاته، نقاطه، عملياته، وفواتيره."
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}
        {!customers.length && !configError ? (
          <div className="mb-6 rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] px-4 py-8 text-center font-bold text-[#7A6255]">
            لا يوجد عملاء مسجلون بعد.
          </div>
        ) : null}
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="عدد العملاء" value={customers.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="إجمالي الطلبات" value={orders.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="إجمالي الحجوزات" value={reservations.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="الفواتير" value={0} />
          </BentoCard>
        </BentoGrid>

        <FilterBar>
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
            <NeumoInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم العميل أو رقم الجوال..."
              className="pr-12"
            />
          </div>
        </FilterBar>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            <section className="grid gap-5">
              {filtered.map((customer) => {
                const data = getCustomerData(customer);

                return (
                  <SoftCard key={customer.id}>
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                      <UserRound className="h-7 w-7" />
                    </div>

                    <div>
                      <h2 className="text-2xl font-black text-[#3A2117]">
                        {customer.fullName}
                      </h2>
                      <p className="mt-1 font-bold text-[#7A6255]">{customer.phone}</p>
                      <p className="mt-1 text-sm font-bold text-[#7A6255]">
                        {customer.email || "بدون بريد"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                      <ShoppingBag className="mx-auto h-5 w-5 text-[#6B3A25]" />
                      <p className="mt-2 text-sm font-black">طلبات</p>
                      <h3 className="text-2xl font-black">{data.orders.length}</h3>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                      <Receipt className="mx-auto h-5 w-5 text-[#6B3A25]" />
                      <p className="mt-2 text-sm font-black">فواتير</p>
                      <h3 className="text-2xl font-black">{data.invoices.length}</h3>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                      <Star className="mx-auto h-5 w-5 text-[#6B3A25]" />
                      <p className="mt-2 text-sm font-black">نقاط</p>
                      <h3 className="text-2xl font-black">{data.points}</h3>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                      <p className="text-sm font-black">إنفاق</p>
                      <h3 className="mt-2 text-xl font-black text-[#6B3A25]">
                        {formatSar(data.totalSpent)}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <h3 className="mb-3 font-black">آخر الحجوزات</h3>
                    {data.reservations.slice(0, 3).map((r) => (
                      <p key={r.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                        {r.type} • {r.date} • {r.status}
                      </p>
                    ))}
                    {!data.reservations.length ? (
                      <p className="text-sm text-[#7A6255]">لا يوجد</p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <h3 className="mb-3 font-black">آخر الطلبات</h3>
                    {data.orders.slice(0, 3).map((o) => (
                      <p key={o.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                        {o.items.join("، ")} • {o.status}
                      </p>
                    ))}
                    {!data.orders.length ? (
                      <p className="text-sm text-[#7A6255]">لا يوجد</p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <h3 className="mb-3 font-black">سجل العمليات</h3>
                    {data.transactions.slice(0, 3).map((t) => (
                      <p key={t.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                        {t.title} • {t.createdAt}
                      </p>
                    ))}
                    {!data.transactions.length ? (
                      <p className="text-sm text-[#7A6255]">لا يوجد</p>
                    ) : null}
                  </div>
                </div>
                  </SoftCard>
                );
              })}
            </section>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

```

# File: components/dashboard/pages/loyalty-page.tsx

```tsx
"use client";

import {
  Gift,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { saveLoyaltySettingsAction } from "@/app/actions/loyalty";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoInput,
  NeumoSelect,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import {
  type LoyaltyEarnRule,
  type LoyaltyRedemptionRule,
  type LoyaltyReward,
  type LoyaltySettings,
} from "@/lib/mock/loyalty";

type Props = {
  initialSettings: LoyaltySettings;
  initialRewards: LoyaltyReward[];
  configError?: string;
};

const EXAMPLE_BALANCE = 150;

function redemptionRulesToRewards(rules: LoyaltyRedemptionRule[]): LoyaltyReward[] {
  return rules
    .filter((r) => r.enabled)
    .map((r) => ({
      id: r.id,
      title: r.title,
      points: r.pointsCost,
      description: r.description || r.title,
      active: true,
    }));
}

export function LoyaltyPageClient({ initialSettings, initialRewards, configError }: Props) {
  const [settings, setSettings] = useState<LoyaltySettings>(initialSettings);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  void initialRewards;

  const activeEarnRules = useMemo(
    () => settings.earnRules.filter((r) => r.enabled).length,
    [settings.earnRules]
  );

  const activeRedemptionRules = useMemo(
    () => settings.redemptionRules.filter((r) => r.enabled),
    [settings.redemptionRules]
  );

  const affordableRedemptions = useMemo(
    () => activeRedemptionRules.filter((r) => r.pointsCost <= EXAMPLE_BALANCE),
    [activeRedemptionRules]
  );

  function toggleEarnRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      earnRules: prev.earnRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    }));
  }

  function updateEarnRule(id: string, patch: Partial<LoyaltyEarnRule>) {
    setSettings((prev) => ({
      ...prev,
      earnRules: prev.earnRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function addEarnRule() {
    const rule: LoyaltyEarnRule = {
      id: crypto.randomUUID(),
      type: "product_bonus",
      title: "مكافأة منتج",
      enabled: true,
      bonusPoints: 10,
    };
    setSettings((prev) => ({
      ...prev,
      earnRules: [...prev.earnRules, rule],
    }));
  }

  function removeEarnRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      earnRules: prev.earnRules.filter((r) => r.id !== id),
    }));
  }

  function toggleRedemptionRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      redemptionRules: prev.redemptionRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    }));
  }

  function updateRedemptionRule(id: string, patch: Partial<LoyaltyRedemptionRule>) {
    setSettings((prev) => ({
      ...prev,
      redemptionRules: prev.redemptionRules.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));
  }

  function addRedemptionRule() {
    const rule: LoyaltyRedemptionRule = {
      id: crypto.randomUUID(),
      type: "percent_discount",
      title: "خصم جديد",
      enabled: true,
      pointsCost: 75,
      discountPercent: 5,
      description: "يستبدل العميل 75 نقطة ويحصل على خصم 5%.",
    };
    setSettings((prev) => ({
      ...prev,
      redemptionRules: [...prev.redemptionRules, rule],
    }));
  }

  function removeRedemptionRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      redemptionRules: prev.redemptionRules.filter((r) => r.id !== id),
    }));
  }

  async function saveAll() {
    setSaving(true);
    try {
      await saveLoyaltySettingsAction(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("تعذر حفظ إعدادات الولاء");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="نقاط الولاء"
        subtitle="بناء قواعد الكسب والاستبدال — مع معاينة لما يراه العميل."
        action={
          <PrimaryButton onClick={saveAll} className="inline-flex items-center gap-2">
            <Save className="h-5 w-5" />
            {saved ? "تم الحفظ" : "حفظ الإعدادات"}
          </PrimaryButton>
        }
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="كل 1 ريال" value={`${settings.pointsPerSar} نقطة`} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="نقاط الترحيب" value={settings.welcomePoints} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="قواعد كسب" value={activeEarnRules} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="قواعد استبدال" value={activeRedemptionRules.length} />
          </BentoCard>
        </BentoGrid>

        <BentoGrid className="mb-6">
          <BentoCard variant="white" span="2">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                <Star className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[#3A2117]">إعدادات عامة</h2>
                <p className="text-sm font-bold text-[#7A6255]">
                  النقاط الأساسية ونقاط الترحيب وحالة البرنامج.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">النقاط لكل 1 ر.س</span>
                <NeumoInput
                  value={settings.pointsPerSar}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      pointsPerSar: Number(e.target.value) || 1,
                    }))
                  }
                  className="mt-2"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">نقاط ترحيبية</span>
                <NeumoInput
                  value={settings.welcomePoints}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      welcomePoints: Number(e.target.value) || 0,
                    }))
                  }
                  className="mt-2"
                />
              </label>
              <button
                onClick={() =>
                  setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`mt-6 rounded-2xl px-4 py-3 font-black ${
                  settings.enabled ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
              >
                {settings.enabled ? "البرنامج مفعل" : "البرنامج متوقف"}
              </button>
            </div>
          </BentoCard>

          <BentoCard variant="gold" span="2">
            <div className="flex items-start gap-4">
              <UserRound className="mt-1 h-7 w-7 text-[#F6C35B]" />
              <div className="flex-1">
                <h2 className="text-2xl font-black">معاينة العميل</h2>
                <p className="mt-2 text-[#E5D8CD]">
                  رصيد تجريبي:{" "}
                  <span className="text-[#F6C35B]">{EXAMPLE_BALANCE} نقطة</span>
                </p>
                <div className="mt-4 space-y-2">
                  {affordableRedemptions.length > 0 ? (
                    affordableRedemptions.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold"
                      >
                        <span className="text-[#F6C35B]">{r.pointsCost} نقطة</span>
                        {" — "}
                        {r.description || r.title}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm font-bold text-[#CBB29C]">
                      لا توجد مكافآت متاحة بهذا الرصيد — أضف قواعد استبدال أقل.
                    </p>
                  )}
                </div>
                <p className="mt-4 text-xs font-bold text-[#CBB29C]">
                  قواعد الكسب النشطة:{" "}
                  {settings.earnRules
                    .filter((r) => r.enabled)
                    .map((r) => r.title)
                    .join(" • ") || "لا يوجد"}
                </p>
              </div>
            </div>
          </BentoCard>
        </BentoGrid>

        <BentoGrid className="mb-6">
          <BentoCard variant="white" span="2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">قواعد كسب النقاط</h2>
              <button
                onClick={addEarnRule}
                className="inline-flex items-center gap-1 rounded-2xl bg-[#F8F4EF] px-4 py-2 text-sm font-black"
              >
                <Plus className="h-4 w-4" />
                إضافة
              </button>
            </div>
            <div className="space-y-3">
              {settings.earnRules.map((rule) => (
                <SoftCard key={rule.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <NeumoInput
                        value={rule.title}
                        onChange={(e) => updateEarnRule(rule.id, { title: e.target.value })}
                      />
                      <NeumoSelect
                        value={rule.type}
                        onChange={(e) =>
                          updateEarnRule(rule.id, {
                            type: e.target.value as LoyaltyEarnRule["type"],
                          })
                        }
                      >
                        <option value="purchase_per_sar">لكل ريال</option>
                        <option value="product_bonus">مكافأة منتج</option>
                        <option value="first_order_bonus">أول طلب</option>
                        <option value="experience_bonus">وثّق تجربتك</option>
                      </NeumoSelect>
                      {rule.type === "purchase_per_sar" ? (
                        <NeumoInput
                          value={rule.pointsPerSar ?? 1}
                          onChange={(e) =>
                            updateEarnRule(rule.id, {
                              pointsPerSar: Number(e.target.value) || 1,
                            })
                          }
                          placeholder="نقاط لكل ريال"
                        />
                      ) : (
                        <NeumoInput
                          value={rule.bonusPoints ?? 0}
                          onChange={(e) =>
                            updateEarnRule(rule.id, {
                              bonusPoints: Number(e.target.value) || 0,
                            })
                          }
                          placeholder="نقاط المكافأة"
                        />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleEarnRule(rule.id)} aria-label="تفعيل">
                        {rule.enabled ? (
                          <ToggleRight className="h-8 w-8 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-8 w-8 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => removeEarnRule(rule.id)}
                        className="rounded-xl bg-red-50 p-2 text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </SoftCard>
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">قواعد الاستبدال</h2>
              <button
                onClick={addRedemptionRule}
                className="inline-flex items-center gap-1 rounded-2xl bg-[#F8F4EF] px-4 py-2 text-sm font-black"
              >
                <Plus className="h-4 w-4" />
                إضافة
              </button>
            </div>
            <div className="space-y-3">
              {settings.redemptionRules.map((rule) => (
                <SoftCard key={rule.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <NeumoInput
                        value={rule.title}
                        onChange={(e) =>
                          updateRedemptionRule(rule.id, { title: e.target.value })
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <NeumoInput
                          value={rule.pointsCost}
                          onChange={(e) =>
                            updateRedemptionRule(rule.id, {
                              pointsCost: Number(e.target.value) || 0,
                            })
                          }
                          placeholder="تكلفة النقاط"
                        />
                        {rule.type === "percent_discount" ? (
                          <NeumoInput
                            value={rule.discountPercent ?? 0}
                            onChange={(e) =>
                              updateRedemptionRule(rule.id, {
                                discountPercent: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="نسبة الخصم %"
                          />
                        ) : null}
                      </div>
                      <NeumoTextarea
                        value={rule.description ?? ""}
                        onChange={(e) =>
                          updateRedemptionRule(rule.id, { description: e.target.value })
                        }
                        placeholder="نص يظهر للعميل عند الاستبدال"
                        className="h-20"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleRedemptionRule(rule.id)}>
                        {rule.enabled ? (
                          <ToggleRight className="h-8 w-8 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-8 w-8 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => removeRedemptionRule(rule.id)}
                        className="rounded-xl bg-red-50 p-2 text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </SoftCard>
              ))}
            </div>
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="gold" span="4">
          <div className="flex items-start gap-4">
            <Sparkles className="mt-1 h-7 w-7 text-[#F6C35B]" />
            <div>
              <h2 className="text-2xl font-black">تظهر المكافآت في صفحة الكوفي</h2>
              <p className="mt-2 text-[#E5D8CD]">
                عند الحفظ تُخزَّن الإعدادات في Supabase وتُحدَّث المكافآت في جدول loyalty_rewards.
              </p>
            </div>
            <Gift className="ml-auto h-10 w-10 text-[#F6C35B]/50" />
          </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

```

# File: components/dashboard/pages/marketing-page.tsx

```tsx
"use client";

import {
  BarChart3,
  Camera,
  Check,
  Copy,
  Megaphone,
  Plus,
  QrCode,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  LinkButton,
  NeumoInput,
  NeumoSelect,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { getCafePublicUrl } from "@/lib/platform/cafe-domain";
import {
  MARKETING_KEY,
  mockMarketingCampaigns,
  type MarketingCampaign,
  type MarketingCampaignStatus,
} from "@/lib/mock/marketing";
import {
  EXPERIENCE_CAMPAIGNS_KEY,
  EXPERIENCE_SUBMISSIONS_KEY,
  calculateExperiencePoints,
  mockExperienceCampaigns,
  mockExperienceSubmissions,
  platformLabels,
  type ExperienceCampaign,
  type ExperiencePlatform,
  type ExperienceSubmission,
} from "@/lib/mock/experience-campaigns";
import {
  approveExperienceSubmissionAction,
  rejectExperienceSubmissionAction,
  saveExperienceCampaignAction,
  updateExperienceMetricsAction,
} from "@/app/actions/experience";
import {
  fetchOwnerMarketingAction,
  saveMarketingCampaignAction,
} from "@/app/actions/marketing";

const channels: MarketingCampaign["channel"][] = [
  "واتساب",
  "انستقرام",
  "سناب",
  "رابط مباشر",
  "QR",
];

const platformOptions: ExperiencePlatform[] = [
  "tiktok",
  "instagram",
  "snapchat",
  "youtube_shorts",
  "x",
];

type Tab = "marketing" | "experience";

type Props = {
  initialCampaigns?: MarketingCampaign[];
  initialExpCampaigns?: ExperienceCampaign[];
  initialSubmissions?: ExperienceSubmission[];
  configError?: string;
};

export function MarketingPageClient({
  initialCampaigns = [],
  initialExpCampaigns = [],
  initialSubmissions = [],
  configError,
}: Props = {}) {
  const [tab, setTab] = useState<Tab>("marketing");
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>(initialCampaigns);
  const [expCampaigns, setExpCampaigns] = useState<ExperienceCampaign[]>(initialExpCampaigns);
  const [submissions, setSubmissions] = useState<ExperienceSubmission[]>(initialSubmissions);

  const [title, setTitle] = useState("");
  const [channel, setChannel] =
    useState<MarketingCampaign["channel"]>("واتساب");
  const [audience, setAudience] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [influencerName, setInfluencerName] = useState("");
  const [influencerPhone, setInfluencerPhone] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [expTitle, setExpTitle] = useState("وثّق تجربتك");
  const [expDescription, setExpDescription] = useState(
    "صوّر تجربتك في الكوفي وانشرها واحصل على نقاط ولاء."
  );
  const [expTerms, setExpTerms] = useState(
    "يجب أن يظهر اسم الكوفي في الفيديو. المحتوى المسيء مرفوض."
  );
  const [expStart, setExpStart] = useState("");
  const [expEnd, setExpEnd] = useState("");
  const [expBasePoints, setExpBasePoints] = useState("25");
  const [expMaxPoints, setExpMaxPoints] = useState("200");
  const [expPlatforms, setExpPlatforms] = useState<ExperiencePlatform[]>([
    "tiktok",
    "instagram",
  ]);

  const [metricsDraft, setMetricsDraft] = useState<
    Record<string, { views: string; likes: string; comments: string }>
  >({});
  const [reviewTarget, setReviewTarget] = useState<{
    id: string;
    kind: "approve" | "reject";
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [awardPoints, setAwardPoints] = useState("");

  useEffect(() => {
    if (initialCampaigns.length || initialExpCampaigns.length || initialSubmissions.length) return;
    void (async () => {
      try {
        const [marketing, experience] = await Promise.all([
          fetchOwnerMarketingAction(),
          (await import("@/app/actions/experience")).fetchOwnerExperienceAction(),
        ]);
        setCampaigns(marketing);
        setExpCampaigns(experience.campaigns);
        setSubmissions(experience.submissions);
      } catch {
        /* empty state */
      }
    })();
  }, [initialCampaigns.length, initialExpCampaigns.length, initialSubmissions.length]);

  const activeExpCampaign = useMemo(
    () => expCampaigns.find((c) => c.cafeSlug === "qatrah" && c.status === "active"),
    [expCampaigns]
  );

  const pendingSubmissions = useMemo(
    () =>
      submissions.filter(
        (s) =>
          s.status === "pending" &&
          (!activeExpCampaign || s.campaignId === activeExpCampaign.id)
      ),
    [submissions, activeExpCampaign]
  );

  const totalVisits = useMemo(
    () => campaigns.reduce((sum, item) => sum + item.visits, 0),
    [campaigns]
  );

  const totalConversions = useMemo(
    () => campaigns.reduce((sum, item) => sum + item.conversions, 0),
    [campaigns]
  );

  function addCampaign() {
    if (!title.trim()) {
      alert("اكتب اسم الحملة");
      return;
    }

    const campaign: MarketingCampaign = {
      id: crypto.randomUUID(),
      title: title.trim(),
      channel,
      audience: audience.trim() || "كل العملاء",
      message:
        message.trim() ||
        "عرض خاص من الكوفي، اكتشف المنيو واحجز طاولتك عبر برندة.",
      code: code.trim() || undefined,
      discountPercent: discountPercent ? Number(discountPercent) : undefined,
      influencerName: influencerName.trim() || undefined,
      influencerPhone: influencerPhone.trim() || undefined,
      commissionPercent: commissionPercent
        ? Number(commissionPercent)
        : undefined,
      status: startDate ? "مجدولة" : "نشطة",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      visits: 0,
      conversions: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setCampaigns((prev) => [campaign, ...prev]);
    setTitle("");
    setAudience("");
    setMessage("");
    setCode("");
    setDiscountPercent("");
    setInfluencerName("");
    setInfluencerPhone("");
    setCommissionPercent("");
    setStartDate("");
    setEndDate("");
  }

  function setStatus(id: string, status: MarketingCampaignStatus) {
    setCampaigns((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
  }

  function shareUrl(campaign: MarketingCampaign) {
    const base = getCafePublicUrl("qatrah", {
      origin: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    const sep = base.includes("?") ? "&" : "?";
    const codeParam = campaign.code ? `${sep}code=${encodeURIComponent(campaign.code)}` : "";
    return `${base}${codeParam}`;
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    alert("تم النسخ");
  }

  function togglePlatform(p: ExperiencePlatform) {
    setExpPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function createExperienceCampaign() {
    if (!expTitle.trim() || expPlatforms.length === 0) {
      alert("أكمل عنوان الحملة واختر منصة واحدة على الأقل");
      return;
    }

    const campaign: ExperienceCampaign = {
      id: crypto.randomUUID(),
      cafeSlug: "qatrah",
      title: expTitle.trim(),
      description: expDescription.trim(),
      startDate: expStart || new Date().toISOString().slice(0, 10),
      endDate: expEnd || "2026-12-31",
      terms: expTerms.trim(),
      platforms: expPlatforms,
      basePoints: Number(expBasePoints) || 25,
      pointsPerView: 2,
      pointsPerLike: 1,
      pointsPerComment: 3,
      maxPointsPerSubmission: Number(expMaxPoints) || 200,
      requiresManualApproval: true,
      status: "active",
      createdAt: new Date().toISOString().slice(0, 10),
    };

    const next = expCampaigns.map((c) =>
      c.cafeSlug === "qatrah" && c.status === "active"
        ? { ...c, status: "ended" as const }
        : c
    );
    await saveExperienceCampaignAction(campaign);
    setExpCampaigns([campaign, ...next]);
    alert("تم إنشاء حملة وثّق تجربتك");
  }

  async function saveMetrics(submissionId: string) {
    const draft = metricsDraft[submissionId];
    if (!draft) return;
    try {
      const submission = await updateExperienceMetricsAction(submissionId, {
        views: Number(draft.views) || 0,
        likes: Number(draft.likes) || 0,
        comments: Number(draft.comments) || 0,
      });
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? submission : s))
      );
    } catch {
      alert("تعذر حفظ المقاييس");
    }
  }

  function openReview(id: string, kind: "approve" | "reject") {
    const sub = submissions.find((s) => s.id === id);
    const campaign = activeExpCampaign;
    const suggested =
      sub && campaign
        ? calculateExperiencePoints(campaign, {
            views: sub.views,
            likes: sub.likes,
            comments: sub.comments,
          })
        : sub?.suggestedPoints ?? 25;
    setReviewTarget({ id, kind });
    setReviewNote("");
    setAwardPoints(String(suggested));
  }

  async function confirmReview() {
    if (!reviewTarget) return;
    try {
      if (reviewTarget.kind === "approve") {
        const submission = await approveExperienceSubmissionAction(
          reviewTarget.id,
          Number(awardPoints) || 0
        );
        setSubmissions((prev) =>
          prev.map((s) => (s.id === reviewTarget.id ? submission : s))
        );
      } else {
        const submission = await rejectExperienceSubmissionAction(reviewTarget.id, reviewNote);
        setSubmissions((prev) =>
          prev.map((s) => (s.id === reviewTarget.id ? submission : s))
        );
      }
    } catch {
      alert("تعذر تحديث المشاركة");
    }
    setReviewTarget(null);
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الأدوات التسويقية"
        subtitle="حملات ترويجية، روابط مشاركة، وحملة وثّق تجربتك مع مراجعة المشاركات."
        action={
          <LinkButton href={getCafePublicUrl("qatrah")} variant="outline" target="_blank">
            صفحة الكوفي
          </LinkButton>
        }
      >
        <div className="mb-6 flex flex-wrap gap-2">
          {(
            [
              ["marketing", "حملات تسويقية", Megaphone],
              ["experience", "وثّق تجربتك", Camera],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black ${
                tab === key ? "bg-[#3A2117] text-[#F8F4EF]" : "bg-[#F8F4EF] text-[#3A2117]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "marketing" ? (
          <>
            <BentoGrid className="mb-6">
              <BentoCard variant="white">
                <Megaphone className="mb-4 h-7 w-7 text-[#6B3A25]" />
                <StatPill label="الحملات" value={campaigns.length} />
              </BentoCard>
              <BentoCard variant="white">
                <BarChart3 className="mb-4 h-7 w-7 text-[#6B3A25]" />
                <StatPill label="الزيارات" value={totalVisits} />
              </BentoCard>
              <BentoCard variant="white" span="2">
                <QrCode className="mb-4 h-7 w-7 text-[#6B3A25]" />
                <StatPill label="التحويلات" value={totalConversions} />
              </BentoCard>
            </BentoGrid>

            <BentoGrid>
              <BentoCard variant="white" span="2">
                <div className="grid gap-5">
                  {campaigns.map((campaign) => {
                    const url = shareUrl(campaign);
                    return (
                      <SoftCard key={campaign.id}>
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                              <Megaphone className="h-7 w-7" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-[#6B3A25]">
                                {campaign.channel}
                              </p>
                              <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                                {campaign.title}
                              </h2>
                              <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-[#7A6255]">
                                {campaign.message}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-4 py-2 text-xs font-black ${
                              campaign.status === "نشطة"
                                ? "bg-green-50 text-green-700"
                                : campaign.status === "مجدولة"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-red-50 text-red-700"
                            }`}
                          >
                            {campaign.status}
                          </span>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <PrimaryButton
                            onClick={() => copy(url)}
                            className="inline-flex items-center gap-2 px-5 py-3"
                          >
                            <Copy className="h-4 w-4" />
                            نسخ الرابط
                          </PrimaryButton>
                          <button
                            onClick={() =>
                              setStatus(
                                campaign.id,
                                campaign.status === "نشطة" ? "متوقفة" : "نشطة"
                              )
                            }
                            className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
                          >
                            {campaign.status === "نشطة" ? "إيقاف" : "تفعيل"}
                          </button>
                          <button
                            onClick={() =>
                              setCampaigns((prev) =>
                                prev.filter((item) => item.id !== campaign.id)
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف
                          </button>
                        </div>
                      </SoftCard>
                    );
                  })}
                </div>
              </BentoCard>

              <BentoCard variant="white" span="2">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
                  <Plus className="h-5 w-5" />
                  حملة جديدة
                </h2>
                <div className="space-y-3">
                  <NeumoInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم الحملة" />
                  <NeumoSelect value={channel} onChange={(e) => setChannel(e.target.value as MarketingCampaign["channel"])}>
                    {channels.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </NeumoSelect>
                  <NeumoTextarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="رسالة الحملة" className="h-24" />
                  <PrimaryButton onClick={addCampaign} className="w-full">
                    إنشاء الحملة
                  </PrimaryButton>
                </div>
              </BentoCard>
            </BentoGrid>
          </>
        ) : (
          <>
            <BentoGrid className="mb-6">
              <BentoCard variant="white">
                <StatPill label="حملة نشطة" value={activeExpCampaign?.title ?? "—"} />
              </BentoCard>
              <BentoCard variant="white">
                <StatPill label="مشاركات معلقة" value={pendingSubmissions.length} />
              </BentoCard>
              <BentoCard variant="white" span="2">
                <StatPill label="إجمالي المشاركات" value={submissions.length} />
              </BentoCard>
            </BentoGrid>

            <BentoGrid className="mb-6">
              <BentoCard variant="white" span="2">
                <h2 className="mb-4 text-xl font-black">إنشاء حملة وثّق تجربتك</h2>
                <div className="space-y-3">
                  <NeumoInput value={expTitle} onChange={(e) => setExpTitle(e.target.value)} placeholder="عنوان الحملة" />
                  <NeumoTextarea value={expDescription} onChange={(e) => setExpDescription(e.target.value)} placeholder="الوصف" className="h-20" />
                  <NeumoTextarea value={expTerms} onChange={(e) => setExpTerms(e.target.value)} placeholder="الشروط" className="h-20" />
                  <div className="grid grid-cols-2 gap-2">
                    <NeumoInput type="date" value={expStart} onChange={(e) => setExpStart(e.target.value)} />
                    <NeumoInput type="date" value={expEnd} onChange={(e) => setExpEnd(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NeumoInput value={expBasePoints} onChange={(e) => setExpBasePoints(e.target.value)} placeholder="نقاط أساسية" />
                    <NeumoInput value={expMaxPoints} onChange={(e) => setExpMaxPoints(e.target.value)} placeholder="حد أقصى للنقاط" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {platformOptions.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePlatform(p)}
                        className={`rounded-2xl px-4 py-2 text-sm font-black ${
                          expPlatforms.includes(p)
                            ? "bg-[#3A2117] text-[#F8F4EF]"
                            : "bg-[#F8F4EF] text-[#3A2117]"
                        }`}
                      >
                        {platformLabels[p]}
                      </button>
                    ))}
                  </div>
                  <PrimaryButton onClick={createExperienceCampaign} className="w-full">
                    نشر الحملة
                  </PrimaryButton>
                </div>
              </BentoCard>

              <BentoCard variant="white" span="2">
                <h2 className="mb-4 text-xl font-black">مراجعة المشاركات</h2>
                <div className="space-y-4">
                  {pendingSubmissions.length === 0 ? (
                    <p className="font-bold text-[#7A6255]">لا توجد مشاركات بانتظار المراجعة.</p>
                  ) : (
                    pendingSubmissions.map((sub) => {
                      const draft = metricsDraft[sub.id] ?? {
                        views: String(sub.views ?? ""),
                        likes: String(sub.likes ?? ""),
                        comments: String(sub.comments ?? ""),
                      };
                      const suggested =
                        activeExpCampaign &&
                        calculateExperiencePoints(activeExpCampaign, {
                          views: Number(draft.views) || 0,
                          likes: Number(draft.likes) || 0,
                          comments: Number(draft.comments) || 0,
                        });

                      return (
                        <SoftCard key={sub.id}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-black">{sub.customerName}</h3>
                              <p className="text-sm font-bold text-[#7A6255]">
                                {platformLabels[sub.platform]} • {sub.videoUrl}
                              </p>
                            </div>
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                              بانتظار المراجعة
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            {(["views", "likes", "comments"] as const).map((key) => (
                              <NeumoInput
                                key={key}
                                value={draft[key]}
                                onChange={(e) =>
                                  setMetricsDraft((prev) => ({
                                    ...prev,
                                    [sub.id]: {
                                      ...draft,
                                      [key]: e.target.value,
                                    },
                                  }))
                                }
                                placeholder={
                                  key === "views"
                                    ? "مشاهدات"
                                    : key === "likes"
                                      ? "إعجابات"
                                      : "تعليقات"
                                }
                              />
                            ))}
                          </div>

                          {suggested !== undefined ? (
                            <p className="mt-2 text-sm font-black text-[#6B3A25]">
                              نقاط مقترحة: {suggested}
                            </p>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() => saveMetrics(sub.id)}
                              className="rounded-2xl bg-[#F8F4EF] px-4 py-2 text-sm font-black"
                            >
                              حفظ المقاييس
                            </button>
                            <button
                              onClick={() => openReview(sub.id, "approve")}
                              className="inline-flex items-center gap-1 rounded-2xl bg-green-50 px-4 py-2 text-sm font-black text-green-700"
                            >
                              <Check className="h-4 w-4" />
                              موافقة + نقاط
                            </button>
                            <button
                              onClick={() => openReview(sub.id, "reject")}
                              className="inline-flex items-center gap-1 rounded-2xl bg-red-50 px-4 py-2 text-sm font-black text-red-700"
                            >
                              <X className="h-4 w-4" />
                              رفض
                            </button>
                          </div>
                        </SoftCard>
                      );
                    })
                  )}
                </div>
              </BentoCard>
            </BentoGrid>
          </>
        )}
      </DashboardPageShell>

      {reviewTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-[#FDFBF8] p-6 shadow-xl">
            <h3 className="text-xl font-black">
              {reviewTarget.kind === "approve" ? "موافقة ومنح النقاط" : "رفض المشاركة"}
            </h3>
            {reviewTarget.kind === "approve" ? (
              <NeumoInput
                value={awardPoints}
                onChange={(e) => setAwardPoints(e.target.value)}
                placeholder="عدد النقاط"
                className="mt-4"
              />
            ) : (
              <NeumoTextarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="سبب الرفض"
                className="mt-4 h-24"
              />
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmReview}
                className="flex-1 rounded-2xl bg-[#3A2117] px-4 py-3 font-black text-[#F8F4EF]"
              >
                تأكيد
              </button>
              <button
                onClick={() => setReviewTarget(null)}
                className="rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F8F4EF] p-4">
      <p className="text-xs font-black text-[#7A6255]">{label}</p>
      <h3 className="mt-1 font-black text-[#3A2117]">{value}</h3>
    </div>
  );
}

```

# File: components/dashboard/pages/menu-page.tsx

```tsx
"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  deleteMenuProductAction,
  saveMenuCategoriesAction,
  saveMenuProductAction,
} from "@/app/actions/menu";
import { CategoryManager } from "@/components/dashboard/menu/category-manager";
import { MenuProductCard } from "@/components/dashboard/menu/product-card";
import { MenuProductFormModal } from "@/components/dashboard/menu/product-modal";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  PrimaryButton,
  StatPill,
} from "@/components/ui/design-system";
import { getCategoryNameById, type MenuCategoryRecord } from "@/lib/mock/menu-categories";
import { AppToast, useAppToast } from "@/components/ui/app-toast";
import { type MenuProduct } from "@/lib/mock/menu";

type Props = {
  initialProducts: MenuProduct[];
  initialCategories: MenuCategoryRecord[];
  configError?: string;
};

export function MenuPageClient({ initialProducts, initialCategories, configError }: Props) {
  const [products, setProducts] = useState<MenuProduct[]>(initialProducts);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>(initialCategories);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("الكل");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useAppToast();

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const categoryName = getCategoryNameById(categories, p.categoryId, p.category);
      const matchQuery =
        p.name.includes(query) ||
        p.description.includes(query) ||
        categoryName.includes(query) ||
        p.category.includes(query);

      const matchCategory =
        categoryFilter === "الكل" ||
        p.categoryId === categoryFilter ||
        (!p.categoryId && p.category === categoryFilter);

      return matchQuery && matchCategory;
    });
  }, [products, query, categoryFilter, categories]);

  const availableCount = products.filter((p) => p.available).length;

  async function saveProduct(product: MenuProduct) {
    setSaving(true);
    try {
      const categoryName = getCategoryNameById(categories, product.categoryId, product.category);
      const normalized = { ...product, category: categoryName };
      const id = await saveMenuProductAction(normalized);
      const saved = { ...normalized, id: id || normalized.id };

      if (product.id) {
        setProducts((prev) => prev.map((p) => (p.id === product.id ? saved : p)));
      } else {
        setProducts((prev) => [saved, ...prev]);
      }
      showToast({ type: "success", message: "تم حفظ المنتج" });
    } catch {
      showToast({ type: "error", message: "تعذر حفظ المنتج" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCategoriesChange(next: MenuCategoryRecord[]) {
    setSaving(true);
    try {
      const saved = await saveMenuCategoriesAction(next);
      setCategories(saved);
      showToast({ type: "success", message: "تم حفظ تصنيفات المنيو" });
    } catch {
      showToast({ type: "error", message: "تعذر حفظ التصنيفات" });
    } finally {
      setSaving(false);
    }
  }

  if (configError) {
    return (
      <DashboardPageShell title="المنيو الرقمي" subtitle={configError}>
        <BentoCard variant="white" span="4">
          <p className="font-bold text-[#806A5E]">{configError}</p>
        </BentoCard>
      </DashboardPageShell>
    );
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="المنيو الرقمي"
        subtitle="أي منتج تضيفه هنا يظهر في صفحة الكوفي للعميل."
        action={
          <PrimaryButton
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            disabled={saving}
            className="inline-flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            إضافة منتج
          </PrimaryButton>
        }
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي المنتجات" value={products.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="متاح للبيع" value={availableCount} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="التصنيفات" value={categories.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="نتائج البحث" value={filtered.length} hint="حسب الفلتر الحالي" />
          </BentoCard>
        </BentoGrid>

        <BentoGrid className="mb-6">
          <CategoryManager
            categories={categories}
            products={products}
            onChange={handleCategoriesChange}
          />
        </BentoGrid>

        <FilterBar>
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
            <NeumoInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم المنتج أو التصنيف..."
              className="pr-12"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter("الكل")}
              className={`rounded-2xl px-5 py-3 text-sm font-black ${
                categoryFilter === "الكل"
                  ? "bg-[#3A2117] text-[#F8F4EF]"
                  : "bg-[#F8F4EF] text-[#3A2117]"
              }`}
            >
              الكل
            </button>
            {sortedCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`rounded-2xl px-5 py-3 text-sm font-black ${
                  categoryFilter === c.id
                    ? "bg-[#3A2117] text-[#F8F4EF]"
                    : "bg-[#F8F4EF] text-[#3A2117]"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </FilterBar>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            {filtered.length === 0 ? (
              <p className="py-12 text-center font-bold text-[#806A5E]">لا توجد منتجات بعد</p>
            ) : (
              <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((product) => (
                  <MenuProductCard
                    key={product.id}
                    product={product}
                    categoryLabel={getCategoryNameById(
                      categories,
                      product.categoryId,
                      product.category
                    )}
                    freeProductLabel={
                      product.promo?.freeProductId
                        ? products.find((p) => p.id === product.promo?.freeProductId)?.name
                        : undefined
                    }
                    onEdit={() => {
                      setEditing(product);
                      setOpen(true);
                    }}
                    onToggleAvailability={() => {
                      void saveProduct({ ...product, available: !product.available });
                    }}
                    onDelete={() => {
                      void deleteMenuProductAction(product.id).then(() => {
                        setProducts((prev) => prev.filter((p) => p.id !== product.id));
                        showToast({ type: "success", message: "تم حذف المنتج" });
                      });
                    }}
                  />
                ))}
              </section>
            )}
          </BentoCard>
        </BentoGrid>

        <MenuProductFormModal
          open={open}
          mode={editing ? "edit" : "add"}
          editingProduct={editing}
          productList={products}
          categories={categories}
          onCategoriesChange={handleCategoriesChange}
          onClose={() => setOpen(false)}
          onSave={saveProduct}
        />
      </DashboardPageShell>
      <AppToast toast={toast} />
    </div>
  );
}

```

# File: components/dashboard/pages/offers-page.tsx

```tsx
"use client";

import { ImagePlus, Megaphone, Plus, Search, TicketPercent, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  NeumoSelect,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { deleteOfferAction, saveOfferAction } from "@/app/actions/offers";
import { uploadImageAction } from "@/app/actions/upload";
import {
  ImagePipelineError,
  isHttpImageUrl,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import { revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import { formatSar } from "@/lib/format";
import {
  type CafeOffer,
  type OfferPlacement,
  type OfferStatus,
  type OfferType,
} from "@/lib/mock/offers";
import { type MenuProduct } from "@/lib/mock/menu";

type Props = {
  initialOffers: CafeOffer[];
  initialProducts: MenuProduct[];
  configError?: string;
};

const OFFER_TYPES: OfferType[] = [
  "خصم",
  "اشتر واحصل",
  "منتج مجاني مع الطلب",
  "كود مسوق",
  "إطلاق منتج",
  "عرض موسمي",
  "عرض مخصص",
];

const PLACEMENTS: OfferPlacement[] = ["قائمة العروض", "بانر الكوفي", "كلاهما"];

export function OffersPageClient({ initialOffers, initialProducts, configError }: Props) {
  const [offers, setOffers] = useState<CafeOffer[]>(initialOffers);
  const [products] = useState<MenuProduct[]>(initialProducts);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<OfferType | "الكل">("الكل");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [offerType, setOfferType] = useState<OfferType>("خصم");
  const [placement, setPlacement] = useState<OfferPlacement>("كلاهما");
  const [discountPercent, setDiscountPercent] = useState("");
  const [code, setCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [codeOwnerName, setCodeOwnerName] = useState("");
  const [codeOwnerPhone, setCodeOwnerPhone] = useState("");
  const [codeOwnerNationalId, setCodeOwnerNationalId] = useState("");
  const [codeOwnerEmail, setCodeOwnerEmail] = useState("");
  const [codeOwnerBankAccount, setCodeOwnerBankAccount] = useState("");
  const [codeOwnerCommissionPercent, setCodeOwnerCommissionPercent] = useState("");

  const [linkedProductId, setLinkedProductId] = useState("");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [pendingBanner, setPendingBanner] = useState<OptimizedImageResult | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | undefined>();
  const [optimizingBanner, setOptimizingBanner] = useState(false);
  const [ctaText, setCtaText] = useState("");

  const [promoProductName, setPromoProductName] = useState("");
  const [promoProductPrice, setPromoProductPrice] = useState("");
  const [promoProductCategory, setPromoProductCategory] = useState("");
  const [promoProductDescription, setPromoProductDescription] = useState("");

  const filtered = useMemo(() => {
    return offers.filter((offer) => {
      const matchQuery =
        offer.title.includes(query) ||
        offer.description.includes(query) ||
        offer.code?.includes(query) ||
        offer.codeOwnerName?.includes(query) ||
        offer.promoProductName?.includes(query);

      const matchType = typeFilter === "الكل" || offer.type === typeFilter;

      return matchQuery && matchType;
    });
  }, [offers, query, typeFilter]);

  const activeOffers = offers.filter((o) => o.status === "نشط").length;

  function resetForm() {
    setTitle("");
    setDescription("");
    setOfferType("خصم");
    setPlacement("كلاهما");
    setDiscountPercent("");
    setCode("");
    setStartDate("");
    setEndDate("");
    setCodeOwnerName("");
    setCodeOwnerPhone("");
    setCodeOwnerNationalId("");
    setCodeOwnerEmail("");
    setCodeOwnerBankAccount("");
    setCodeOwnerCommissionPercent("");
    setLinkedProductId("");
    setBannerImageUrl("");
    if (bannerPreviewUrl?.startsWith("blob:")) revokeObjectUrl(bannerPreviewUrl);
    setBannerPreviewUrl(undefined);
    setPendingBanner(null);
    setCtaText("");
    setPromoProductName("");
    setPromoProductPrice("");
    setPromoProductCategory("");
    setPromoProductDescription("");
  }

  async function addOffer() {
    if (!title.trim()) {
      alert("اكتب عنوان العرض");
      return;
    }

    const linkedProduct = products.find((product) => product.id === linkedProductId);
    const offerId = crypto.randomUUID();

    let bannerAssetId: string | undefined;
    if (pendingBanner) {
      try {
        const formData = new FormData();
        formData.append("file", pendingBanner.blob, "banner.webp");
        const uploaded = await uploadImageAction(
          "offer-banners",
          formData,
          "offer-banner",
          offerId
        );
        bannerAssetId = uploaded.storagePath;
      } catch {
        alert("تعذر حفظ صورة البانر");
        return;
      }
    }

    const offer: CafeOffer = {
      id: offerId,
      title: title.trim(),
      description:
        description.trim() ||
        promoProductDescription.trim() ||
        "عرض ترويجي يظهر مباشرة في صفحة الكوفي.",
      type: offerType,
      status: startDate ? "مجدول" : "نشط",
      placement,
      visibleInCafe: true,

      discountPercent: discountPercent ? Number(discountPercent) : undefined,
      code: code.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,

      codeOwnerName: codeOwnerName.trim() || undefined,
      codeOwnerPhone: codeOwnerPhone.trim() || undefined,
      codeOwnerNationalId: codeOwnerNationalId.trim() || undefined,
      codeOwnerEmail: codeOwnerEmail.trim() || undefined,
      codeOwnerBankAccount: codeOwnerBankAccount.trim() || undefined,
      codeOwnerCommissionPercent: codeOwnerCommissionPercent
        ? Number(codeOwnerCommissionPercent)
        : undefined,

      linkedProductId: linkedProductId || undefined,
      bannerAssetId,
      bannerImageUrl:
        bannerImageUrl.trim() && isHttpImageUrl(bannerImageUrl.trim())
          ? bannerImageUrl.trim()
          : linkedProduct?.imageDataUrl && isHttpImageUrl(linkedProduct.imageDataUrl)
            ? linkedProduct.imageDataUrl
            : "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1200&auto=format&fit=crop",
      ctaText: ctaText.trim() || "شاهد المنتج",

      promoProductName:
        promoProductName.trim() || linkedProduct?.name || undefined,
      promoProductPrice: promoProductPrice
        ? Number(promoProductPrice)
        : linkedProduct?.price,
      promoProductCategory:
        promoProductCategory.trim() || linkedProduct?.category || undefined,
      promoProductDescription:
        promoProductDescription.trim() || linkedProduct?.description || undefined,
    };

    try {
      const saved = await saveOfferAction(offer);
      setOffers((prev) => [saved, ...prev]);
      resetForm();
    } catch {
      alert("تعذر حفظ العرض");
    }
  }

  async function toggleStatus(id: string) {
    const offer = offers.find((item) => item.id === id);
    if (!offer) return;
    const next = {
      ...offer,
      status: offer.status === "نشط" ? ("متوقف" as const) : ("نشط" as const),
    };
    try {
      const saved = await saveOfferAction(next);
      setOffers((prev) => prev.map((item) => (item.id === id ? saved : item)));
    } catch {
      alert("تعذر تحديث حالة العرض");
    }
  }

  async function toggleVisible(id: string) {
    const offer = offers.find((item) => item.id === id);
    if (!offer) return;
    const next = { ...offer, visibleInCafe: !offer.visibleInCafe };
    try {
      const saved = await saveOfferAction(next);
      setOffers((prev) => prev.map((item) => (item.id === id ? saved : item)));
    } catch {
      alert("تعذر تحديث ظهور العرض");
    }
  }

  async function deleteOffer(id: string) {
    try {
      await deleteOfferAction(id);
      setOffers((prev) => prev.filter((offer) => offer.id !== id));
    } catch {
      alert("تعذر حذف العرض");
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="العروض والخصومات"
        subtitle="أضف خصومات، أكواد مسوقين، إعلانات بانر، أو إطلاق منتجات جديدة وتظهر مباشرة في صفحة الكوفي."
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي العروض" value={offers.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="عروض نشطة" value={activeOffers} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill label="نتائج البحث" value={filtered.length} />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="2">
            <FilterBar>
              <div className="relative flex-1">
                <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
                <NeumoInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث باسم العرض أو الكود أو صاحب الكود..."
                  className="pr-12"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {["الكل", ...OFFER_TYPES].map((item) => (
                  <button
                    key={item}
                    onClick={() => setTypeFilter(item as OfferType | "الكل")}
                    className={`rounded-2xl px-5 py-3 text-sm font-black ${
                      typeFilter === item
                        ? "bg-[#3A2117] text-[#F8F4EF]"
                        : "bg-[#F8F4EF] text-[#3A2117]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </FilterBar>

            <div className="grid gap-5">
              {filtered.map((offer) => (
                <SoftCard key={offer.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                        {offer.placement === "بانر الكوفي" ? (
                          <Megaphone className="h-7 w-7" />
                        ) : (
                          <TicketPercent className="h-7 w-7" />
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-black text-[#6B3A25]">
                          {offer.type} • {offer.placement}
                        </p>
                        <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                          {offer.title}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-[#7A6255]">
                          {offer.description}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-4 py-2 text-xs font-black ${
                        offer.status === "نشط"
                          ? "bg-green-50 text-green-700"
                          : offer.status === "مجدول"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {offer.status}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="الكود" value={offer.code || "بدون كود"} />
                    <Info
                      label="خصم"
                      value={
                        offer.discountPercent ? `${offer.discountPercent}%` : "غير محدد"
                      }
                    />
                    <Info
                      label="صاحب الكود"
                      value={offer.codeOwnerName || "غير محدد"}
                    />
                    <Info
                      label="نسبة صاحب الكود"
                      value={
                        offer.codeOwnerCommissionPercent
                          ? `${offer.codeOwnerCommissionPercent}%`
                          : "غير محدد"
                      }
                    />
                  </div>

                  {offer.placement !== "قائمة العروض" ? (
                    <div className="mt-4 rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="text-xs font-black text-[#6B3A25]">
                        إعلان بانر الكوفي
                      </p>
                      <div className="mt-3 grid gap-4 md:grid-cols-[160px_1fr]">
                        <img
                          src={offer.bannerImageUrl}
                          alt=""
                          className="h-28 w-full rounded-2xl bg-white object-contain"
                        />
                        <div>
                          <h3 className="font-black text-[#3A2117]">
                            {offer.promoProductName || offer.title}
                          </h3>
                          <p className="mt-1 text-sm font-bold text-[#7A6255]">
                            {offer.promoProductDescription || offer.description}
                          </p>
                          <p className="mt-2 font-black text-[#6B3A25]">
                            {offer.promoProductPrice
                              ? formatSar(offer.promoProductPrice)
                              : "بدون سعر"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleStatus(offer.id)}
                      className="rounded-2xl bg-[#3A2117]/10 px-5 py-3 text-sm font-black text-[#3A2117]"
                    >
                      {offer.status === "نشط" ? "إيقاف" : "تفعيل"}
                    </button>

                    <button
                      onClick={() => toggleVisible(offer.id)}
                      className="rounded-2xl bg-[#F8F4EF] px-5 py-3 text-sm font-black text-[#3A2117]"
                    >
                      {offer.visibleInCafe
                        ? "إخفاء من صفحة الكوفي"
                        : "إظهار في صفحة الكوفي"}
                    </button>

                    <button
                      onClick={() => deleteOffer(offer.id)}
                      className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                    >
                      <Trash2 className="inline h-4 w-4" /> حذف
                    </button>
                  </div>
                </SoftCard>
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
              <Plus className="h-5 w-5" />
              إضافة عرض سريع
            </h2>

            <div className="space-y-3">
              <NeumoInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="عنوان العرض"
              />
              <NeumoTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف العرض"
                className="h-24"
              />

              <div className="grid grid-cols-2 gap-2">
                <NeumoSelect
                  value={offerType}
                  onChange={(e) => setOfferType(e.target.value as OfferType)}
                >
                  {OFFER_TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </NeumoSelect>

                <NeumoSelect
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as OfferPlacement)}
                >
                  {PLACEMENTS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </NeumoSelect>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NeumoInput
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="نسبة الخصم"
                />
                <NeumoInput
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="كود الخصم"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NeumoInput
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <NeumoInput
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <SoftCard className="p-4">
                <p className="mb-3 font-black text-[#3A2117]">
                  بيانات صاحب الكود اختيارية
                </p>

                <div className="space-y-2">
                  <NeumoInput
                    value={codeOwnerName}
                    onChange={(e) => setCodeOwnerName(e.target.value)}
                    placeholder="الاسم الكامل"
                  />
                  <NeumoInput
                    value={codeOwnerPhone}
                    onChange={(e) => setCodeOwnerPhone(e.target.value)}
                    placeholder="رقم الجوال"
                  />
                  <NeumoInput
                    value={codeOwnerNationalId}
                    onChange={(e) => setCodeOwnerNationalId(e.target.value)}
                    placeholder="رقم الهوية"
                  />
                  <NeumoInput
                    value={codeOwnerEmail}
                    onChange={(e) => setCodeOwnerEmail(e.target.value)}
                    placeholder="الإيميل"
                  />
                  <NeumoInput
                    value={codeOwnerBankAccount}
                    onChange={(e) => setCodeOwnerBankAccount(e.target.value)}
                    placeholder="الحساب البنكي / IBAN"
                  />
                  <NeumoInput
                    value={codeOwnerCommissionPercent}
                    onChange={(e) => setCodeOwnerCommissionPercent(e.target.value)}
                    placeholder="نسبة صاحب الكود %"
                  />
                </div>
              </SoftCard>

              <SoftCard className="p-4">
                <p className="mb-3 flex items-center gap-2 font-black text-[#3A2117]">
                  <ImagePlus className="h-5 w-5" />
                  العروض الترويجية في بانر الكوفي
                </p>

                <div className="space-y-2">
                  <NeumoSelect
                    value={linkedProductId}
                    onChange={(e) => setLinkedProductId(e.target.value)}
                  >
                    <option value="">ربط بمنتج من المنيو</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </NeumoSelect>

                  <NeumoInput
                    value={bannerImageUrl}
                    onChange={(e) => setBannerImageUrl(e.target.value)}
                    placeholder="رابط صورة البانر (اختياري)"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="offer-banner-file"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      setOptimizingBanner(true);
                      try {
                        const optimized = await optimizeImageForStorage(file, "offer-banner");
                        if (bannerPreviewUrl?.startsWith("blob:")) {
                          revokeObjectUrl(bannerPreviewUrl);
                        }
                        setBannerPreviewUrl(URL.createObjectURL(optimized.blob));
                        setPendingBanner(optimized);
                        setBannerImageUrl("");
                      } catch (err) {
                        alert(
                          err instanceof ImagePipelineError
                            ? err.message
                            : "تعذر قراءة الصورة"
                        );
                      } finally {
                        setOptimizingBanner(false);
                      }
                    }}
                  />
                  <label
                    htmlFor="offer-banner-file"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#3A2117]"
                  >
                    <ImagePlus className="h-5 w-5" />
                    {optimizingBanner ? "جاري تحسين الصورة..." : "رفع صورة بانر"}
                  </label>
                  {bannerPreviewUrl ? (
                    <img
                      src={bannerPreviewUrl}
                      alt=""
                      className="h-20 w-full rounded-2xl object-cover"
                    />
                  ) : null}
                  <NeumoInput
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder="نص الزر مثل: شاهد المنتج"
                  />
                  <NeumoInput
                    value={promoProductName}
                    onChange={(e) => setPromoProductName(e.target.value)}
                    placeholder="اسم المنتج الترويجي"
                  />
                  <NeumoInput
                    value={promoProductPrice}
                    onChange={(e) => setPromoProductPrice(e.target.value)}
                    placeholder="سعر المنتج الترويجي"
                  />
                  <NeumoInput
                    value={promoProductCategory}
                    onChange={(e) => setPromoProductCategory(e.target.value)}
                    placeholder="تصنيف المنتج"
                  />
                  <NeumoTextarea
                    value={promoProductDescription}
                    onChange={(e) => setPromoProductDescription(e.target.value)}
                    placeholder="وصف المنتج الترويجي"
                    className="h-24"
                  />
                </div>
              </SoftCard>

              <PrimaryButton onClick={addOffer} className="w-full">
                إضافة العرض وربطه بالكوفي
              </PrimaryButton>
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F8F4EF] p-4">
      <p className="text-xs font-black text-[#7A6255]">{label}</p>
      <h3 className="mt-1 font-black text-[#3A2117]">{value}</h3>
    </div>
  );
}

```

# File: components/dashboard/pages/orders-page.tsx

```tsx
"use client";

import { Receipt, UserRound, Check, X, Clock, MapPin } from "lucide-react";
import { useState } from "react";
import {
  acceptPickupOrderAction,
  fetchOwnerOrdersAction,
  rejectPickupOrderAction,
} from "@/app/actions/orders";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { type CafeOrder, type OrderStatus } from "@/lib/mock/orders";

const statusStyle: Record<OrderStatus, string> = {
  "بانتظار موافقة الكوفي": "bg-amber-50 text-amber-700",
  مقبول: "bg-green-50 text-green-700",
  مرفوض: "bg-red-50 text-red-700",
  "ملغي من العميل": "bg-[#F8F4EF] text-[#7A6255]",
};

type Props = {
  initialOrders: CafeOrder[];
  configError?: string;
};

export function OrdersPageClient({ initialOrders, configError }: Props) {
  const [orders, setOrders] = useState<CafeOrder[]>(initialOrders);
  const [selected, setSelected] = useState<CafeOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshOrders() {
    try {
      const next = await fetchOwnerOrdersAction();
      setOrders(next);
    } catch {
      /* keep current list */
    }
  }

  async function handleAccept(orderId: string) {
    setBusy(true);
    try {
      const result = await acceptPickupOrderAction(orderId);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      await refreshOrders();
      setSelected((prev) => (prev?.id === orderId ? result.order : prev));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(orderId: string) {
    if (!rejectReason.trim()) {
      alert("اكتب سبب الرفض");
      return;
    }
    setBusy(true);
    try {
      const result = await rejectPickupOrderAction(orderId, rejectReason);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setRejectReason("");
      setShowRejectForm(null);
      await refreshOrders();
      setSelected((prev) => (prev?.id === orderId ? result.order : prev));
    } finally {
      setBusy(false);
    }
  }

  const pendingOrders = orders.filter((o) => o.status === "بانتظار موافقة الكوفي").length;
  const acceptedOrders = orders.filter((o) => o.status === "مقبول").length;
  const acceptedRevenue = orders
    .filter((o) => o.status === "مقبول")
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="طلبات الاستلام"
        subtitle="طلبات الاستلام من صفحة الكوفي — قبول أو رفض مع سبب واضح."
      >
        {configError ? (
          <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            {configError}
          </SoftCard>
        ) : null}
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي الطلبات" value={orders.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="بانتظار الموافقة" value={pendingOrders} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="طلبات مقبولة" value={acceptedOrders} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="قيمة الطلبات المقبولة المتوقعة" value={formatSar(acceptedRevenue)} />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="2">
            <div className="grid gap-5">
              {orders.map((order) => (
                <SoftCard key={order.id}>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                        <Receipt className="h-7 w-7" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-black">{order.id}</h2>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${statusStyle[order.status]}`}
                          >
                            {order.status}
                          </span>
                        </div>
                        <p className="mt-1 font-bold text-[#7A6255]">
                          {order.customerName} • {order.customerPhone}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[#7A6255]">
                          {order.type} • {order.createdAt}
                        </p>
                      </div>
                    </div>

                    <div className="text-left">
                      <p className="text-2xl font-black text-[#6B3A25]">
                        {formatSar(order.total)}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#7A6255]">
                        {order.paymentStatus}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                        <MapPin className="h-4 w-4" />
                        الفرع
                      </p>
                      <p className="mt-1 font-black">{order.branchName || "غير محدد"}</p>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                        <Clock className="h-4 w-4" />
                        وقت الاستلام
                      </p>
                      <p className="mt-1 font-black">{order.pickupAt || "غير محدد"}</p>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="text-xs font-black text-[#7A6255]">الدفع</p>
                      <p className="mt-1 font-black">{order.paymentStatus}</p>
                    </div>
                  </div>

                  {order.status === "بانتظار موافقة الكوفي" ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        onClick={() => void handleAccept(order.id)}
                        disabled={busy}
                        className="flex items-center gap-2 rounded-2xl bg-green-50 px-5 py-3 text-sm font-black text-green-700"
                      >
                        <Check className="h-4 w-4" />
                        قبول الطلب
                      </button>
                      <button
                        onClick={() =>
                          setShowRejectForm((prev) => (prev === order.id ? null : order.id))
                        }
                        className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                      >
                        <X className="h-4 w-4" />
                        رفض الطلب
                      </button>
                    </div>
                  ) : null}

                  {showRejectForm === order.id ? (
                    <div className="mt-4 rounded-2xl bg-red-50/50 p-4">
                      <label className="block">
                        <span className="text-xs font-black text-[#7A6255]">سبب الرفض</span>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={2}
                          placeholder="مثال: المنتج غير متوفر حاليًا"
                          className="mt-2 w-full resize-none rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold outline-none"
                        />
                      </label>
                      <button
                        onClick={() => void handleReject(order.id)}
                        disabled={busy}
                        className="mt-3 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white"
                      >
                        تأكيد الرفض
                      </button>
                    </div>
                  ) : null}

                  {order.rejectionReason ? (
                    <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                      سبب الرفض: {order.rejectionReason}
                    </div>
                  ) : null}

                  <div className="mt-5">
                    <button
                      onClick={() => setSelected(order)}
                      className="rounded-2xl bg-[#F8F4EF] px-5 py-2 font-black text-[#3A2117]"
                    >
                      تفاصيل الطلب
                    </button>
                  </div>
                </SoftCard>
              ))}

              {orders.length === 0 ? (
                <SoftCard className="text-center">
                  <h2 className="text-2xl font-black">لا توجد طلبات</h2>
                  <p className="mt-2 text-[#7A6255]">ستظهر طلبات الاستلام هنا عند إنشائها.</p>
                </SoftCard>
              ) : null}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="row2">
            {selected ? (
              <>
                <h2 className="text-2xl font-black text-[#3A2117]">تفاصيل الطلب</h2>

                <SoftCard className="mt-5 p-4">
                  <p className="flex items-center gap-2 font-black">
                    <UserRound className="h-5 w-5" />
                    بيانات العميل
                  </p>
                  <p className="mt-2 text-[#7A6255]">{selected.customerName}</p>
                  <p className="text-[#7A6255]">{selected.customerPhone}</p>
                  <p className="text-[#7A6255]">
                    {selected.customerEmail || "بدون بريد"}
                  </p>
                </SoftCard>

                <SoftCard className="mt-5 p-4">
                  <p className="font-black">تفاصيل الاستلام</p>
                  <p className="mt-2 text-[#7A6255]">الفرع: {selected.branchName || "—"}</p>
                  <p className="text-[#7A6255]">وقت الاستلام: {selected.pickupAt || "—"}</p>
                  <p className="text-[#7A6255]">الدفع: {selected.paymentStatus}</p>
                  <p className="text-[#7A6255]">الحالة: {selected.status}</p>
                </SoftCard>

                <div className="mt-5 space-y-3">
                  {selected.items.map((item) => (
                    <SoftCard key={item.id} className="p-4">
                      <div className="flex justify-between gap-3">
                        <h3 className="font-black">{item.name}</h3>
                        <span className="font-black">{item.quantity}x</span>
                      </div>
                      <p className="mt-1 text-sm text-[#7A6255]">
                        {formatSar(item.unitPrice)}
                      </p>
                      {item.notes ? (
                        <p className="mt-2 text-xs font-bold text-[#7A6255]">
                          ملاحظات: {item.notes}
                        </p>
                      ) : null}
                    </SoftCard>
                  ))}
                </div>

                <SoftCard className="mt-5 p-4">
                  <p>المجموع: {formatSar(selected.subtotal)}</p>
                  <p>الخصم: {formatSar(selected.discountAmount)}</p>
                  <p>الضريبة: {formatSar(selected.taxAmount)}</p>
                  <p className="mt-2 text-xl font-black text-[#6B3A25]">
                    الإجمالي: {formatSar(selected.total)}
                  </p>
                </SoftCard>

                {selected.notes ? (
                  <div className="mt-5 rounded-2xl bg-[#FFF8EF] p-4 font-bold text-[#7A6255]">
                    ملاحظات الطلب: {selected.notes}
                  </div>
                ) : null}
              </>
            ) : (
              <SoftCard className="text-center">
                <h2 className="text-xl font-black">اختر طلبًا</h2>
                <p className="mt-2 text-[#7A6255]">
                  اضغط تفاصيل الطلب لعرض كامل البيانات.
                </p>
              </SoftCard>
            )}
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

```

# File: components/dashboard/pages/pages-manager-page.tsx

```tsx
"use client";

import { Eye, FileText, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deletePageAction, savePageAction } from "@/app/actions/pages";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoInput,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
} from "@/components/ui/design-system";
import { type CafeInfoPage } from "@/lib/mock/cafe-pages";

type Props = {
  initialPages: CafeInfoPage[];
  configError?: string;
};

export function PagesManagerPageClient({ initialPages, configError }: Props) {
  const [pages, setPages] = useState<CafeInfoPage[]>(initialPages);
  const [selectedId, setSelectedId] = useState(initialPages[0]?.id || "");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const page = pages.find((item) => item.id === selectedId);
    if (!page) return;

    setTitle(page.title);
    setSlug(page.slug);
    setDescription(page.description);
    setContent(page.content);
    setVisible(page.visible);
  }, [selectedId, pages]);

  async function savePage() {
    if (!title.trim()) {
      alert("اكتب عنوان الصفحة");
      return;
    }

    const nextPage: CafeInfoPage = {
      id: selectedId || crypto.randomUUID(),
      title: title.trim(),
      slug: slug.trim() || title.trim().replaceAll(" ", "-"),
      description: description.trim(),
      content: content.trim(),
      visible,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    try {
      const saved = await savePageAction(nextPage);
      setPages((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        return exists
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...prev];
      });
      setSelectedId(saved.id);
      alert("تم حفظ الصفحة");
    } catch {
      alert("تعذر حفظ الصفحة");
    }
  }

  function newPage() {
    setSelectedId("");
    setTitle("");
    setSlug("");
    setDescription("");
    setContent("");
    setVisible(true);
  }

  async function deletePage(id: string) {
    try {
      await deletePageAction(id);
      setPages((prev) => prev.filter((item) => item.id !== id));
      if (selectedId === id) setSelectedId("");
    } catch {
      alert("تعذر حذف الصفحة");
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الصفحات التعريفية"
        subtitle="أنشئ صفحات تظهر للعميل مثل: من نحن، سياسة الحجز، الأسئلة الشائعة."
        action={
          <PrimaryButton onClick={newPage} className="inline-flex items-center gap-2">
            <Plus className="h-5 w-5" />
            صفحة جديدة
          </PrimaryButton>
        }
      >
        {configError ? (
          <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            {configError}
          </SoftCard>
        ) : null}
        <BentoGrid>
          <BentoCard variant="white" span="1">
            <h2 className="mb-5 text-2xl font-black text-[#3A2117]">الصفحات</h2>

            <div className="space-y-3">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setSelectedId(page.id)}
                  className={`w-full rounded-3xl border p-4 text-right transition ${
                    selectedId === page.id
                      ? "border-[#3A2117] bg-[#F8F4EF]"
                      : "border-[#E5D8CD] bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-[#3A2117]">{page.title}</h3>
                      <p className="mt-1 text-sm font-bold text-[#7A6255]">/{page.slug}</p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        page.visible
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {page.visible ? "ظاهر" : "مخفي"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="3">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                <FileText className="h-7 w-7" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-[#3A2117]">تحرير الصفحة</h2>
                <p className="text-sm font-bold text-[#7A6255]">
                  المحتوى هنا يستخدم لاحقًا في صفحة الكوفي.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="عنوان الصفحة" value={title} onChange={setTitle} />
              <Field label="الرابط المختصر" value={slug} onChange={setSlug} />
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-black text-[#7A6255]">وصف مختصر</span>
              <NeumoInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-2"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-black text-[#7A6255]">محتوى الصفحة</span>
              <NeumoTextarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="mt-2 h-72"
              />
            </label>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => setVisible((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
              >
                <Eye className="h-5 w-5" />
                {visible ? "الصفحة ظاهرة" : "الصفحة مخفية"}
              </button>

              <div className="flex gap-2">
                {selectedId ? (
                  <button
                    onClick={() => deletePage(selectedId)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700"
                  >
                    <Trash2 className="h-5 w-5" />
                    حذف
                  </button>
                ) : null}

                <PrimaryButton
                  onClick={savePage}
                  className="inline-flex items-center gap-2 px-6 py-3"
                >
                  <Save className="h-5 w-5" />
                  حفظ الصفحة
                </PrimaryButton>
              </div>
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#7A6255]">{label}</span>
      <NeumoInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
    </label>
  );
}

```

# File: components/dashboard/pages/reports-page.tsx

```tsx
"use client";

import { BarChart3, CalendarDays, Receipt, Star, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { type CafeOrder } from "@/lib/mock/orders";
import { type CustomerProfile } from "@/lib/mock/customer-activity";
import { type CafeReview } from "@/lib/mock/reviews";
import { type CafeReservation } from "@/lib/mock/reservations";

type Props = {
  initialOrders: CafeOrder[];
  initialCustomers: CustomerProfile[];
  initialReviews: CafeReview[];
  initialReservations: CafeReservation[];
  configError?: string;
};

export function ReportsPageClient({
  initialOrders,
  initialCustomers,
  initialReviews,
  initialReservations,
  configError,
}: Props) {
  const [orders] = useState<CafeOrder[]>(initialOrders);
  const [customers] = useState<CustomerProfile[]>(initialCustomers);
  const [reviews] = useState<CafeReview[]>(initialReviews);
  const [reservations] = useState<CafeReservation[]>(initialReservations);

  const totalSales = useMemo(() => orders.reduce((sum, order) => sum + order.total, 0), [orders]);
  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  }, [reviews]);

  const stats = [
    { title: "إجمالي المبيعات", value: formatSar(totalSales), icon: Receipt },
    { title: "عدد الطلبات", value: orders.length, icon: BarChart3 },
    { title: "العملاء", value: customers.length, icon: Users },
    { title: "الحجوزات", value: reservations.length, icon: CalendarDays },
    { title: "متوسط التقييم", value: avgRating.toFixed(1), icon: Star },
  ];

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="التقارير"
        subtitle="نظرة شاملة على أداء الكوفي والمبيعات والعملاء والتقييمات."
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}
        <BentoGrid className="mb-6">
          {stats.map((item, index) => {
            const Icon = item.icon;
            return (
              <BentoCard
                key={item.title}
                variant="white"
                span={index === 0 ? "2" : "1"}
              >
                <Icon className="mb-4 h-7 w-7 text-[#6B3A25]" />
                <StatPill label={item.title} value={item.value} />
              </BentoCard>
            );
          })}
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="row2">
            <h2 className="text-2xl font-black text-[#3A2117]">أداء المبيعات</h2>
            <div className="mt-8 flex h-80 items-end gap-4 rounded-3xl bg-[#F8F4EF] p-6">
              {[45, 72, 58, 88, 64, 79, 51].map((height, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-3xl bg-[#6B3A25]"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="text-2xl font-black text-[#3A2117]">أحدث الطلبات</h2>
            <div className="mt-5 space-y-3">
              {orders.slice(0, 5).map((order) => (
                <SoftCard key={order.id} className="p-4">
                  <div className="flex justify-between gap-3">
                    <h3 className="font-black">{order.customerName}</h3>
                    <span className="font-black text-[#6B3A25]">
                      {formatSar(order.total)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-[#7A6255]">
                    {order.status} • {order.createdAt}
                  </p>
                </SoftCard>
              ))}
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

```

# File: components/dashboard/pages/reservations-page.tsx

```tsx
"use client";

import {
  CalendarDays,
  Check,
  Clock,
  MessageSquare,
  Search,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { updateReservationStatusAction } from "@/app/actions/reservations";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  NeumoTextarea,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { type CafeReservation, type ReservationStatus } from "@/lib/mock/reservations";

const statusStyle: Record<ReservationStatus, string> = {
  "بانتظار الرد": "bg-amber-50 text-amber-700",
  "مقبول": "bg-green-50 text-green-700",
  "مرفوض": "bg-red-50 text-red-700",
  "طلب تعديل": "bg-blue-50 text-blue-700",
};

type ActionKind = "accept" | "reject" | "modify";

type Props = {
  initialReservations: CafeReservation[];
  configError?: string;
};

export function ReservationsPageClient({ initialReservations, configError }: Props) {
  const [reservations, setReservations] = useState<CafeReservation[]>(initialReservations);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ReservationStatus | "الكل">("الكل");
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    kind: ActionKind;
  } | null>(null);
  const [cafeMessage, setCafeMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    return reservations.filter((r) => {
      const matchQuery =
        r.customerName.includes(query) ||
        r.phone.includes(query) ||
        r.type.includes(query) ||
        (r.eventTitle?.includes(query) ?? false);

      const matchStatus = status === "الكل" || r.status === status;

      return matchQuery && matchStatus;
    });
  }, [reservations, query, status]);

  const pendingCount = reservations.filter((r) => r.status === "بانتظار الرد").length;
  const acceptedCount = reservations.filter((r) => r.status === "مقبول").length;
  const totalGuests = reservations.reduce((sum, r) => sum + r.guests, 0);

  function openAction(id: string, kind: ActionKind) {
    setActionTarget({ id, kind });
    setCafeMessage("");
  }

  async function confirmAction() {
    if (!actionTarget) return;

    const statusMap: Record<ActionKind, ReservationStatus> = {
      accept: "مقبول",
      reject: "مرفوض",
      modify: "طلب تعديل",
    };

    const nextStatus = statusMap[actionTarget.kind];
    setBusy(true);
    try {
      const result = await updateReservationStatusAction(
        actionTarget.id,
        nextStatus,
        cafeMessage,
        actionTarget.kind === "reject" ? cafeMessage : undefined
      );

      if (result.ok) {
        setReservations((prev) =>
          prev.map((r) => (r.id === actionTarget.id ? result.reservation : r))
        );
      }
    } finally {
      setBusy(false);
      setActionTarget(null);
      setCafeMessage("");
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="إدارة الحجوزات"
        subtitle="الحجوزات القادمة من صفحة الكوفي — قبول، رفض، أو طلب تعديل مع رسالة للعميل."
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="بانتظار الرد" value={pendingCount} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="حجوزات مقبولة" value={acceptedCount} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill label="إجمالي الضيوف" value={totalGuests} />
          </BentoCard>
        </BentoGrid>

        <FilterBar>
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
            <NeumoInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم العميل أو رقم الجوال أو نوع الحجز..."
              className="pr-12"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["الكل", "بانتظار الرد", "مقبول", "مرفوض", "طلب تعديل"] as const).map(
              (item) => (
                <button
                  key={item}
                  onClick={() => setStatus(item as ReservationStatus | "الكل")}
                  className={`rounded-2xl px-5 py-3 text-sm font-black ${
                    status === item
                      ? "bg-[#3A2117] text-[#F8F4EF]"
                      : "bg-[#F8F4EF] text-[#3A2117]"
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </div>
        </FilterBar>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            <section className="grid gap-5">
              {filtered.map((r) => (
                <SoftCard key={r.id} className="transition hover:-translate-y-0.5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black text-[#3A2117]">{r.customerName}</h2>
                        <span
                          className={`rounded-full px-4 py-2 text-xs font-black ${statusStyle[r.status]}`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-[#7A6255]">{r.phone}</p>
                      {r.branchName ? (
                        <p className="mt-1 text-sm font-bold text-[#7A6255]">الفرع: {r.branchName}</p>
                      ) : null}
                    </div>

                    {r.status === "بانتظار الرد" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openAction(r.id, "accept")}
                          className="flex items-center gap-2 rounded-2xl bg-green-50 px-5 py-3 text-sm font-black text-green-700"
                        >
                          <Check className="h-4 w-4" />
                          قبول
                        </button>
                        <button
                          onClick={() => openAction(r.id, "modify")}
                          className="flex items-center gap-2 rounded-2xl bg-blue-50 px-5 py-3 text-sm font-black text-blue-700"
                        >
                          <MessageSquare className="h-4 w-4" />
                          طلب تعديل
                        </button>
                        <button
                          onClick={() => openAction(r.id, "reject")}
                          className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                        >
                          <X className="h-4 w-4" />
                          رفض
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="نوع الحجز" value={r.type} />
                    <Info label="عدد الأشخاص" value={String(r.guests)} icon={Users} />
                    <Info label="التاريخ" value={r.date} icon={CalendarDays} />
                    <Info label="الوقت" value={r.time} icon={Clock} />
                  </div>

                  {(r.eventTitle || r.needsDecoration || r.needsCatering || r.budgetEstimate) && (
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {r.eventTitle ? <Info label="عنوان المناسبة" value={r.eventTitle} /> : null}
                      {r.budgetEstimate ? (
                        <Info label="الميزانية" value={`${r.budgetEstimate} ر.س`} />
                      ) : null}
                      {r.needsDecoration ? <Info label="ديكور" value="مطلوب" /> : null}
                      {r.needsCatering ? <Info label="ضيافة" value="مطلوبة" /> : null}
                    </div>
                  )}

                  {r.notes ? (
                    <div className="mt-4 rounded-2xl bg-[#FFF8EF] p-4 text-sm font-bold text-[#7A6255]">
                      ملاحظات: {r.notes}
                    </div>
                  ) : null}

                  {r.cafeMessage ? (
                    <div className="mt-4 rounded-2xl bg-[#EEF4FF] p-4 text-sm font-bold text-blue-800">
                      رسالة الكوفي: {r.cafeMessage}
                    </div>
                  ) : null}

                  {r.rejectionReason ? (
                    <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                      سبب الرفض: {r.rejectionReason}
                    </div>
                  ) : null}
                </SoftCard>
              ))}

              {filtered.length === 0 ? (
                <SoftCard className="text-center">
                  <h2 className="text-2xl font-black">لا توجد حجوزات</h2>
                  <p className="mt-2 text-[#7A6255]">جرّب تغيير البحث أو الفلتر.</p>
                </SoftCard>
              ) : null}
            </section>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>

      {actionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-[#FDFBF8] p-6 shadow-xl">
            <h3 className="text-xl font-black text-[#3A2117]">
              {actionTarget.kind === "accept"
                ? "تأكيد قبول الحجز"
                : actionTarget.kind === "reject"
                  ? "رفض الحجز"
                  : "طلب تعديل من العميل"}
            </h3>
            <p className="mt-2 text-sm font-bold text-[#7A6255]">
              {actionTarget.kind === "accept"
                ? "رسالة اختيارية للعميل (وقت بديل، تعليمات...)"
                : "اكتب رسالة للعميل تشرح السبب أو التعديل المطلوب"}
            </p>
            <NeumoTextarea
              value={cafeMessage}
              onChange={(e) => setCafeMessage(e.target.value)}
              placeholder="رسالة الكوفي للعميل..."
              className="mt-4 h-28"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmAction}
                className="flex-1 rounded-2xl bg-[#3A2117] px-4 py-3 font-black text-[#F8F4EF]"
              >
                تأكيد
              </button>
              <button
                onClick={() => setActionTarget(null)}
                className="rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117]"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="rounded-2xl bg-[#F8F4EF] p-4">
      <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </p>
      <h3 className="mt-1 font-black text-[#3A2117]">{value}</h3>
    </div>
  );
}

```

# File: components/dashboard/pages/reviews-page.tsx

```tsx
"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { replyToReviewAction } from "@/app/actions/reviews";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { type CafeReview } from "@/lib/mock/reviews";

type Props = {
  initialReviews: CafeReview[];
  configError?: string;
};

export function ReviewsPageClient({ initialReviews, configError }: Props) {
  const [reviews, setReviews] = useState<CafeReview[]>(initialReviews);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    return reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length;
  }, [reviews]);

  async function saveReply(id: string) {
    const answer = replyDrafts[id]?.trim();
    if (!answer) return;

    try {
      await replyToReviewAction(id, answer);
      setReviews((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, answer, status: "ظاهر" } : item
        )
      );
    } catch {
      alert("تعذر حفظ الرد");
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الأسئلة والتقييمات"
        subtitle="إدارة تعليقات العملاء وأسئلتهم تحت المنتجات."
      >
        {configError ? (
          <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            {configError}
          </SoftCard>
        ) : null}
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="عدد التقييمات" value={reviews.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="متوسط التقييم" value={avgRating.toFixed(1)} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill
              label="بانتظار الرد"
              value={reviews.filter((r) => !r.answer).length}
            />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            <section className="grid gap-5">
              {reviews.map((review) => (
                <SoftCard key={review.id}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-black text-[#6B3A25]">{review.productName}</p>
                  <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                    {review.customerName}
                  </h2>
                  <div className="mt-2 flex gap-1 text-[#6B3A25]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-5 w-5 ${i < review.rating ? "fill-current" : ""}`}
                      />
                    ))}
                  </div>
                </div>

                <span className="rounded-full bg-[#F8F4EF] px-4 py-2 text-xs font-black text-[#6B3A25]">
                  {review.status}
                </span>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="mb-2 flex items-center gap-2 font-black">
                    <MessageSquareText className="h-5 w-5" />
                    تعليق العميل
                  </p>
                  <p className="text-[#7A6255]">{review.comment}</p>
                  {review.question ? (
                    <p className="mt-3 font-bold text-[#3A2117]">
                      سؤال: {review.question}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="mb-2 font-black">رد الكوفي</p>
                  <NeumoTextarea
                    value={replyDrafts[review.id] ?? review.answer ?? ""}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))
                    }
                    placeholder="اكتب رد الكوفي..."
                    className="h-24"
                  />
                  <PrimaryButton
                    onClick={() => saveReply(review.id)}
                    className="mt-3 px-5 py-3"
                  >
                    حفظ الرد
                  </PrimaryButton>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() =>
                    setReviews((prev) =>
                      prev.map((item) =>
                        item.id === review.id
                          ? {
                              ...item,
                              status: item.status === "ظاهر" ? "مخفي" : "ظاهر",
                            }
                          : item
                      )
                    )
                  }
                  className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
                >
                  {review.status === "ظاهر" ? "إخفاء" : "إظهار"}
                </button>
              </div>
                </SoftCard>
              ))}
            </section>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

```

# File: components/dashboard/pages/settings-page.tsx

```tsx
"use client";

import { Copy, ExternalLink, Globe, ImagePlus, Save, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { saveSettingsAction } from "@/app/actions/settings";
import { uploadImageAction } from "@/app/actions/upload";
import {
  ImagePipelineError,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import {
  deleteLocalAsset,
  FIXED_ASSET_IDS,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import { AppToast, useAppToast } from "@/components/ui/app-toast";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  LinkButton,
  NeumoInput,
  NeumoSelect,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { type CafeSettings } from "@/lib/mock/cafe-settings";
import type { CafeDomainLinkStatus } from "@/lib/platform/cafe-domain";
import {
  getCafeDisplayDomain,
  getCafePublicUrl,
  getCafeSubdomainHost,
  getDomainSetupInstructions,
  normalizeCafeDomainInput,
  resolveCafeDomainSource,
  VERCEL_CNAME_TARGET,
} from "@/lib/platform/cafe-domain";
import {
  normalizeDomain,
  type CafePurchasedDomain,
  type DomainAvailabilityResult,
  type DomainPriceResult,
} from "@/lib/platform/domain-purchase";

type Props = {
  initialSettings: CafeSettings;
  configError?: string;
};

export function SettingsPageClient({ initialSettings, configError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CafeSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const { toast, showToast, setToast } = useAppToast();
  const [domainQuery, setDomainQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [domainYears, setDomainYears] = useState(1);
  const [autoRenew, setAutoRenew] = useState(true);
  const [availability, setAvailability] = useState<DomainAvailabilityResult | null>(null);
  const [pricing, setPricing] = useState<DomainPriceResult | null>(null);
  const [purchase, setPurchase] = useState<CafePurchasedDomain | null>(null);
  const [domainMessage, setDomainMessage] = useState<string>("");

  const [pendingLogo, setPendingLogo] = useState<OptimizedImageResult | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | undefined>();
  const resolvedLogoUrl = useResolvedCafeLogoUrl(settings, logoPreviewUrl);
  const displayLogoUrl = logoPreviewUrl ?? resolvedLogoUrl;

  useEffect(() => {
    setSettings(initialSettings);
    if (initialSettings.purchasedDomain) {
      setPurchase({
        id: initialSettings.purchasedDomain,
        cafeSlug: initialSettings.cafeSlug,
        domain: initialSettings.purchasedDomain,
        tld: initialSettings.purchasedDomain.split(".").pop() ?? "sa",
        status:
          initialSettings.purchasedDomainStatus === "مربوط" ? "connected" : "purchased",
        price: 0,
        currency: "SAR",
        years: 1,
        autoRenew: true,
        createdAt: initialSettings.purchasedDomainCreatedAt ?? new Date().toISOString(),
      });
    }
  }, [initialSettings]);

  useEffect(() => {
    return () => revokeObjectUrl(logoPreviewUrl);
  }, [logoPreviewUrl]);

  async function save() {
    try {
      setSaving(true);
      setToast({ type: "loading", message: "جاري الحفظ..." });
      const next: CafeSettings = { ...settings };
      delete next.logoDataUrl;

      if (pendingLogo) {
        const formData = new FormData();
        formData.append("file", pendingLogo.blob, "logo.webp");
        const uploaded = await uploadImageAction(
          "cafe-logos",
          formData,
          "logo",
          "logo"
        );
        next.logoAssetId = uploaded.storagePath;
        setPendingLogo(null);
        revokeObjectUrl(logoPreviewUrl);
        setLogoPreviewUrl(undefined);
      }

      await saveSettingsAction(next);
      setSettings(next);
      showToast({ type: "success", message: "تم حفظ إعدادات الكوفي بنجاح" });
    } catch (err) {
      showToast({
        type: "error",
        message:
          err instanceof Error ? err.message : "تعذر حفظ الإعدادات، حاول مرة أخرى",
      });
    } finally {
      setSaving(false);
    }
  }

  const slug = settings.cafeSlug || "qatrah";
  const displayDomain = getCafeDisplayDomain(slug, settings);
  const domainSource = resolveCafeDomainSource(settings);
  const publicUrl =
    typeof window !== "undefined"
      ? getCafePublicUrl(slug, { origin: window.location.origin, settings })
      : getCafePublicUrl(slug, { settings });
  const subdomainPreview = getCafeSubdomainHost(slug);

  function copyPublicUrl() {
    void navigator.clipboard.writeText(publicUrl);
    showToast({ type: "success", message: "تم نسخ رابط الكوفي" });
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setLogoUploading(true);
    showToast({ type: "loading", message: "جاري تحسين الصورة..." });
    try {
      const optimized = await optimizeImageForStorage(file, "cafe-logo");
      revokeObjectUrl(logoPreviewUrl);
      setLogoPreviewUrl(URL.createObjectURL(optimized.blob));
      setPendingLogo(optimized);
      showToast({
        type: "success",
        message: "تم تجهيز الصورة بنجاح — اضغط حفظ الإعدادات لتثبيتها",
      });
    } catch (err) {
      showToast({
        type: "error",
        message:
          err instanceof ImagePipelineError
            ? err.message
            : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP",
      });
    } finally {
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    await deleteLocalAsset(FIXED_ASSET_IDS["cafe-logo"]!);
    revokeObjectUrl(logoPreviewUrl);
    setLogoPreviewUrl(undefined);
    setPendingLogo(null);
    setSettings((prev) => {
      const next = { ...prev };
      delete next.logoDataUrl;
      delete next.logoAssetId;
      return next;
    });
    showToast({
      type: "success",
      message: "تم حذف اللوجو، اضغط حفظ الإعدادات لتثبيت الحذف",
    });
  }

  async function checkDomainAvailability() {
    const candidate = normalizeDomain(domainQuery);
    if (!candidate) {
      setDomainMessage("اكتب دومين صحيح مثل qatrah.sa");
      return;
    }
    setSearching(true);
    setDomainMessage("");
    try {
      const [availabilityRes, priceRes] = await Promise.all([
        fetch("/api/domains/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: candidate }),
        }),
        fetch("/api/domains/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: candidate, years: domainYears }),
        }),
      ]);

      const availabilityData = (await availabilityRes.json()) as DomainAvailabilityResult & {
        error?: string;
      };
      const priceData = (await priceRes.json()) as DomainPriceResult & { error?: string };
      if (!availabilityRes.ok) throw new Error(availabilityData.error || "تعذر فحص التوفر");
      if (!priceRes.ok) throw new Error(priceData.error || "تعذر قراءة السعر");

      setAvailability(availabilityData);
      setPricing(priceData);

      if (availabilityData.message) {
        setDomainMessage(availabilityData.message);
      } else if (availabilityData.available) {
        setDomainMessage("الدومين متاح. يمكنك المتابعة للدفع والشراء.");
      } else {
        setDomainMessage("الدومين غير متاح حاليًا.");
      }
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : "حدث خطأ أثناء الفحص");
    } finally {
      setSearching(false);
    }
  }

  async function persistDomainSettings(next: CafeSettings) {
    await saveSettingsAction(next);
    setSettings(next);
  }

  async function payAndBuyDomain() {
    if (!availability?.available || !pricing) return;
    setBuying(true);
    setDomainMessage("");
    try {
      const res = await fetch("/api/domains/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cafeSlug: slug,
          domain: availability.domain,
          years: domainYears,
          autoRenew,
          price: pricing.price,
          currency: pricing.currency,
        }),
      });
      const data = (await res.json()) as CafePurchasedDomain & { error?: string };
      if (!res.ok) throw new Error(data.error || "فشل شراء الدومين");
      setPurchase(data);

      const nextSettings: CafeSettings = {
        ...settings,
        purchasedDomain: data.domain,
        purchasedDomainStatus: "بانتظار التحقق",
        purchasedDomainCreatedAt: data.createdAt,
      };
      await persistDomainSettings(nextSettings);
      setDomainMessage(
        data.status === "purchase_pending"
          ? "تم تسجيل طلب النطاق — قيد المراجعة من الإدارة. لن يُفعَّل الشراء تلقائيًا حتى اكتمال التكامل."
          : "تم تنفيذ شراء الدومين. انتقل الآن إلى خطوة الربط بالمشروع."
      );
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : "فشل شراء الدومين");
    } finally {
      setBuying(false);
    }
  }

  async function connectPurchasedDomain() {
    if (!purchase) return;
    setConnecting(true);
    setDomainMessage("");
    try {
      const res = await fetch("/api/domains/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: purchase.domain, cafeSlug: slug }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "فشل ربط الدومين");
      const connectedAt = new Date().toISOString();
      const nextPurchase: CafePurchasedDomain = {
        ...purchase,
        status: "connected",
        purchasedAt: purchase.purchasedAt || connectedAt,
      };
      setPurchase(nextPurchase);
      const nextSettings: CafeSettings = {
        ...settings,
        purchasedDomain: purchase.domain,
        purchasedDomainStatus: "مربوط",
        domainStatus: settings.domainStatus === "مربوط" ? "بانتظار التحقق" : settings.domainStatus,
        purchasedDomainConnectedAt: connectedAt,
      };
      await persistDomainSettings(nextSettings);
      setDomainMessage("تم ربط الدومين بصفحة الكوفي بنجاح.");
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : "فشل ربط الدومين");
    } finally {
      setConnecting(false);
    }
  }

  function copyDisplayDomain() {
    const source =
      domainSource === "purchased_domain"
        ? settings.purchasedDomain
        : domainSource === "external_custom_domain"
          ? settings.customDomain
          : subdomainPreview;
    if (!source) return;
    void navigator.clipboard.writeText(`https://${source}`);
    showToast({ type: "success", message: "تم نسخ الرابط" });
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="إعدادات الكوفي"
        subtitle="الشعار، بيانات الحساب، والوثائق الحكومية الاختيارية."
        action={
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/c/qatrah" variant="outline">
              معاينة الكوفي
            </LinkButton>
            <PrimaryButton
              onClick={save}
              disabled={saving || logoUploading}
              className="inline-flex items-center gap-2"
            >
              <Save className="h-5 w-5" />
              {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </PrimaryButton>
          </div>
        }
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="اسم الكوفي" value={settings.cafeName} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="المسؤول" value={settings.ownerName} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill
              label="التواصل"
              value={settings.ownerPhone}
              hint={settings.ownerEmail || "بدون بريد"}
            />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="2">
            <h2 className="text-2xl font-black text-[#3A2117]">هوية الكوفي</h2>

            <SoftCard className="mt-6 text-center">
              <div className="mx-auto flex h-32 w-full max-w-[220px] items-center justify-center overflow-hidden rounded-3xl bg-[#F8F4EF]">
                {displayLogoUrl ? (
                  <img
                    src={displayLogoUrl}
                    alt=""
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <CafeLogo name={settings.cafeName} size="lg" className="!shadow-none" />
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickLogo}
              />

              <PrimaryButton
                onClick={() => fileRef.current?.click()}
                disabled={logoUploading}
                className="mt-5 inline-flex items-center gap-2"
              >
                <ImagePlus className="h-5 w-5" />
                {logoUploading ? "جاري رفع اللوجو..." : "رفع لوجو الكوفي"}
              </PrimaryButton>
              {displayLogoUrl ? (
                <button
                  type="button"
                  onClick={() => void removeLogo()}
                  className="mt-3 inline-flex rounded-2xl border border-[#E5D8CD] px-5 py-3 text-sm font-black text-[#7A6255] hover:bg-[#F8F4EF]"
                >
                  حذف اللوجو
                </button>
              ) : null}
            </SoftCard>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="text-2xl font-black text-[#3A2117]">بيانات الحساب</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field
                label="اسم الكوفي"
                value={settings.cafeName}
                onChange={(v) => setSettings((p) => ({ ...p, cafeName: v }))}
              />
              <Field
                label="اسم المسؤول"
                value={settings.ownerName}
                onChange={(v) => setSettings((p) => ({ ...p, ownerName: v }))}
              />
              <Field
                label="بريد المسؤول"
                value={settings.ownerEmail}
                onChange={(v) => setSettings((p) => ({ ...p, ownerEmail: v }))}
              />
              <Field
                label="رقم المسؤول"
                value={settings.ownerPhone}
                onChange={(v) => setSettings((p) => ({ ...p, ownerPhone: v }))}
              />
              <Field
                label="واتساب"
                value={settings.whatsapp || ""}
                onChange={(v) => setSettings((p) => ({ ...p, whatsapp: v }))}
              />
              <Field
                label="انستقرام"
                value={settings.instagram || ""}
                onChange={(v) => setSettings((p) => ({ ...p, instagram: v }))}
              />
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-black text-[#7A6255]">وصف الكوفي</span>
              <NeumoTextarea
                value={settings.description || ""}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="وصف الكوفي"
                className="mt-2 h-28"
              />
            </label>
          </BentoCard>

          <BentoCard variant="white" span="4">
            <h2 className="flex items-center gap-2 text-2xl font-black text-[#3A2117]">
              <Globe className="h-6 w-6" />
              رابط الكوفي
            </h2>
            <p className="mt-2 text-sm font-bold text-[#7A6255]">
              يعرض للعميل كدومين احترافي. المسار الحالي يعمل دائمًا كـ fallback.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field
                label="معرّف الكوفي (slug)"
                value={settings.cafeSlug}
                onChange={(v) =>
                  setSettings((p) => ({
                    ...p,
                    cafeSlug: v.trim().toLowerCase().replace(/\s+/g, "-"),
                  }))
                }
              />
              <div className="block">
                <span className="text-xs font-black text-[#7A6255]">معاينة الساب دومين</span>
                <p className="mt-2 rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117]">
                  {subdomainPreview}
                </p>
              </div>
              <Field
                label="دومين خاص (اختياري)"
                value={settings.customDomain || ""}
                onChange={(v) =>
                  setSettings((p) => ({
                    ...p,
                    customDomain: normalizeCafeDomainInput(v),
                  }))
                }
              />
              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">حالة الربط</span>
                <NeumoSelect
                  value={settings.domainStatus || "غير مربوط"}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      domainStatus: e.target.value as CafeDomainLinkStatus,
                    }))
                  }
                  className="mt-2"
                >
                  <option value="غير مربوط">غير مربوط</option>
                  <option value="بانتظار التحقق">بانتظار التحقق</option>
                  <option value="مربوط">مربوط</option>
                </NeumoSelect>
              </label>
            </div>

            <SoftCard className="mt-5 space-y-3 p-5 text-sm font-bold text-[#7A6255]">
              <p>
                <span className="text-[#3A2117]">مصدر الدومين:</span>{" "}
                {domainSource === "purchased_domain"
                  ? "Purchased domain"
                  : domainSource === "external_custom_domain"
                    ? "External custom domain"
                    : "Platform subdomain"}
              </p>
              <p>
                <span className="text-[#3A2117]">يعرض للعميل:</span> {displayDomain}
              </p>
              <p>
                <span className="text-[#3A2117]">رابط فعلي (fallback):</span> {publicUrl}
              </p>
              <p className="text-xs leading-7">
                {getDomainSetupInstructions(slug).note}
                <br />
                CNAME: <span className="font-black text-[#3A2117]">{VERCEL_CNAME_TARGET}</span>
              </p>
            </SoftCard>

            <div className="mt-4 flex flex-wrap gap-3">
              <PrimaryButton type="button" onClick={copyPublicUrl} className="inline-flex items-center gap-2">
                <Copy className="h-4 w-4" />
                نسخ رابط الكوفي
              </PrimaryButton>
              <PrimaryButton type="button" onClick={copyDisplayDomain} className="inline-flex items-center gap-2">
                <Copy className="h-4 w-4" />
                نسخ الدومين المعروض
              </PrimaryButton>
              <LinkButton href={publicUrl} target="_blank" variant="outline" className="inline-flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                فتح صفحة الكوفي
              </LinkButton>
            </div>

            <div className="mt-8 grid gap-5 border-t border-[#E5D8CD] pt-6">
              <div className="rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] p-4">
                <p className="text-sm font-black text-[#3A2117]">1) الرابط الافتراضي</p>
                <p className="mt-1 text-sm font-bold text-[#7A6255]">{subdomainPreview}</p>
              </div>

              <div className="rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] p-4">
                <p className="text-sm font-black text-[#3A2117]">2) ربط دومين يملكه الكوفي</p>
                <p className="mt-1 text-xs font-bold text-[#7A6255]">
                  أضف CNAME/A Records ثم غيّر الحالة إلى مربوط بعد التحقق.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5D8CD] bg-white p-4">
                <h3 className="text-xl font-black text-[#3A2117]">3) شراء دومين من برندة</h3>
                <p className="mt-1 text-sm font-bold text-[#7A6255]">
                  ابحث عن دومين، افحص توفره، ثم أكمل الدفع والشراء والربط.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <NeumoInput
                    value={domainQuery}
                    onChange={(e) => setDomainQuery(e.target.value)}
                    placeholder="qatrah.sa أو qatrah.com"
                  />
                  <PrimaryButton onClick={checkDomainAvailability} disabled={searching}>
                    {searching ? "جاري الفحص..." : "فحص التوفر"}
                  </PrimaryButton>
                </div>

                {availability ? (
                  <div className="mt-4 rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] p-4">
                    <p className="font-black text-[#3A2117]">{availability.domain}</p>
                    <p className="mt-1 text-sm font-bold text-[#7A6255]">
                      الحالة: {availability.available ? "متاح" : "غير متاح"}
                    </p>
                    {!availability.supportedTld ? (
                      <p className="mt-2 text-sm font-black text-amber-700">
                        هذا الامتداد غير مدعوم للشراء المباشر حاليًا، يمكنك ربطه يدويًا من خيار
                        الدومين الخارجي.
                      </p>
                    ) : null}

                    {availability.available && pricing ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-black text-[#7A6255]">سنوات التسجيل</span>
                          <NeumoSelect
                            value={String(domainYears)}
                            onChange={(e) => setDomainYears(Number(e.target.value))}
                            className="mt-2"
                          >
                            <option value="1">سنة</option>
                            <option value="2">سنتان</option>
                            <option value="3">3 سنوات</option>
                          </NeumoSelect>
                        </label>

                        <div className="flex items-center gap-3 pt-6">
                          <input
                            id="autoRenew"
                            type="checkbox"
                            checked={autoRenew}
                            onChange={(e) => setAutoRenew(e.target.checked)}
                            className="h-4 w-4"
                          />
                          <label htmlFor="autoRenew" className="text-sm font-black text-[#3A2117]">
                            تجديد تلقائي
                          </label>
                        </div>

                        <div className="sm:col-span-2 rounded-xl border border-[#E5D8CD] bg-white p-3 text-sm font-bold text-[#7A6255]">
                          <p>
                            ملخص الدفع: {pricing.price} {pricing.currency} لمدة {domainYears} سنة
                          </p>
                          <p>رسوم برندة: 0 (Placeholder)</p>
                        </div>

                        <div className="sm:col-span-2 flex flex-wrap gap-3">
                          <PrimaryButton onClick={payAndBuyDomain} disabled={buying}>
                            {buying ? "جاري الشراء..." : "الدفع وشراء الدومين"}
                          </PrimaryButton>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {purchase ? (
                  <div className="mt-4 rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] p-4">
                    <p className="font-black text-[#3A2117]">
                      الدومين: {purchase.domain} ({purchase.status})
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#7A6255]">
                      رقم الطلب: {purchase.vercelOrderId || "—"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <PrimaryButton
                        onClick={connectPurchasedDomain}
                        disabled={connecting || purchase.status === "connected"}
                      >
                        {purchase.status === "connected"
                          ? "تم الربط"
                          : connecting
                            ? "جاري الربط..."
                            : "ربط الدومين بصفحة الكوفي"}
                      </PrimaryButton>
                      <LinkButton
                        href={`https://${purchase.domain}`}
                        target="_blank"
                        variant="outline"
                        className="inline-flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        فتح الدومين
                      </LinkButton>
                    </div>
                  </div>
                ) : null}

                {domainMessage ? (
                  <p className="mt-3 text-sm font-black text-[#6B3A25]">{domainMessage}</p>
                ) : null}
              </div>
            </div>
          </BentoCard>

          <BentoCard variant="white" span="4">
            <h2 className="flex items-center gap-2 text-2xl font-black text-[#3A2117]">
              <ShieldCheck className="h-6 w-6" />
              مستندات حكومية اختيارية
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="الرقم الضريبي"
                value={settings.taxNumber || ""}
                onChange={(v) => setSettings((p) => ({ ...p, taxNumber: v }))}
              />
              <Field
                label="السجل التجاري"
                value={settings.commercialRegister || ""}
                onChange={(v) => setSettings((p) => ({ ...p, commercialRegister: v }))}
              />
              <Field
                label="شهادة معروف"
                value={settings.maroofCertificate || ""}
                onChange={(v) => setSettings((p) => ({ ...p, maroofCertificate: v }))}
              />
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
      <AppToast toast={toast} />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#7A6255]">{label}</span>
      <NeumoInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
    </label>
  );
}

```

# File: components/dashboard/pages/subscription-page.tsx

```tsx
"use client";

import { Check, CreditCard, Crown, Layers3, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  PrimaryButton,
  SoftCard,
  StatPill,
  StatusBadge,
} from "@/components/ui/design-system";
import {
  allPlatformFeatures,
  type PlatformPlan,
} from "@/lib/platform/admin-data";
import {
  completePlanPaymentAction,
  failPlanPaymentAction,
  fetchOwnerPendingSubscriptionAction,
  fetchOwnerSubscriptionHistoryAction,
  startPlanCheckoutAction,
} from "@/app/actions/subscription";
import type {
  PendingSubscription,
  SubscriptionRecord,
} from "@/lib/platform/subscription";

type Step = "select" | "invoice" | "done";

type Props = {
  initialPlans: PlatformPlan[];
  initialActivePlanId: string;
  initialHistory: SubscriptionRecord[];
  initialPending: PendingSubscription | null;
  configError?: string;
};

export function SubscriptionPageClient({
  initialPlans,
  initialActivePlanId,
  initialHistory,
  initialPending,
  configError,
}: Props) {
  const [plans, setPlans] = useState<PlatformPlan[]>(initialPlans);
  const [activePlanId, setActivePlanId] = useState(initialActivePlanId);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    initialPending?.paymentStatus === "pending" ? initialPending.planId : null
  );
  const [step, setStep] = useState<Step>(
    initialPending?.paymentStatus === "pending" ? "invoice" : "select"
  );
  const [paying, setPaying] = useState(false);
  const [history, setHistory] = useState<SubscriptionRecord[]>(initialHistory);
  const [pending, setPending] = useState<PendingSubscription | null>(initialPending);

  const activePlan = plans.find((plan) => plan.id === activePlanId);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);

  const vat = useMemo(() => {
    if (!selectedPlan) return 0;
    return Math.round(selectedPlan.priceMonthly * 0.15 * 100) / 100;
  }, [selectedPlan]);

  const total = useMemo(() => {
    if (!selectedPlan) return 0;
    return selectedPlan.priceMonthly + vat;
  }, [selectedPlan, vat]);

  async function choosePlan(planId: string) {
    if (planId === activePlanId) return;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    try {
      await startPlanCheckoutAction(plan.id);
      const nextPending: PendingSubscription = {
        planId: plan.id,
        planName: plan.name,
        amount: plan.priceMonthly,
        paymentStatus: "pending",
        createdAt: new Date().toISOString(),
      };
      setPending(nextPending);
      setSelectedPlanId(planId);
      setStep("invoice");
      const nextHistory = await fetchOwnerSubscriptionHistoryAction();
      setHistory(nextHistory);
    } catch {
      alert("تعذر بدء عملية الاشتراك");
    }
  }

  async function payAndActivate() {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const ok = await completePlanPaymentAction();
      if (ok) {
        setActivePlanId(selectedPlan.id);
        setPending(null);
        setStep("done");
        setHistory(await fetchOwnerSubscriptionHistoryAction());
        alert("تم الدفع وتفعيل الباقة بنجاح");
        window.location.reload();
      } else {
        alert("تعذر إتمام الدفع");
      }
    } finally {
      setPaying(false);
    }
  }

  async function simulateFailedPayment() {
    await failPlanPaymentAction();
    setHistory(await fetchOwnerSubscriptionHistoryAction());
    setPending(await fetchOwnerPendingSubscriptionAction());
    alert("فشل الدفع — لم يتم تغيير الباقة الحالية");
    setStep("select");
    setSelectedPlanId(null);
  }

  const statusLabel: Record<string, string> = {
    pending: "بانتظار الدفع",
    paid: "مدفوع",
    failed: "فشل",
  };

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الاشتراك والباقات"
        subtitle="اختر الباقة، راجع الفاتورة، ثم ادفع لتفعيل المميزات. الباقة الحالية لا تتغير قبل تأكيد الدفع."
        action={<BarndaksaLogo variant="brown" width={140} height={56} />}
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}
        {activePlan ? (
          <BentoGrid className="mb-8">
            <BentoCard variant="gold" span="2" className="md:row-span-2">
              <div className="flex h-full flex-col justify-between">
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
                    <Crown className="h-8 w-8 text-[#F0C568]" />
                  </div>
                  <div>
                    <p className="font-bold text-[#F2E7D9]">الباقة الحالية (مفعّلة)</p>
                    <h2 className="mt-1 text-4xl font-black">{activePlan.name}</h2>
                    <p className="mt-2 max-w-xl text-sm font-bold text-[#F2E7D9]">
                      {activePlan.description}
                    </p>
                  </div>
                </div>
                <div className="mt-8 rounded-3xl bg-white/10 px-6 py-5 text-center">
                  <p className="text-sm text-[#F2E7D9]">السعر الشهري</p>
                  <p className="mt-1 text-4xl font-black">{activePlan.priceMonthly} ر.س</p>
                </div>
              </div>
            </BentoCard>

            <BentoCard variant="white" span="2">
              <StatPill
                label="خطوة الاشتراك"
                value={
                  step === "select"
                    ? "1 — اختيار الباقة"
                    : step === "invoice"
                      ? "2 — ملخص الفاتورة"
                      : "3 — مكتمل"
                }
                hint={
                  pending?.paymentStatus === "pending"
                    ? "لديك باقة بانتظار الدفع"
                    : undefined
                }
              />
            </BentoCard>
          </BentoGrid>
        ) : null}

        {step === "select" ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {plans
              .filter((plan) => plan.active)
              .map((plan) => {
                const isCurrent = plan.id === activePlanId;

                return (
                  <article
                    key={plan.id}
                    className={`flex min-w-0 flex-col rounded-[24px] border p-4 sm:rounded-[32px] sm:p-6 ${
                      isCurrent
                        ? "border-[#D9A33F]/40 bg-gradient-to-br from-[#4A281D] via-[#6B3A25] to-[#311912] text-[#FCF8F3] shadow-[0_0_40px_rgba(217,163,63,0.15),inset_0_1px_0_rgba(255,255,255,0.08)] ring-2 ring-[#D9A33F]/50"
                        : "border-[#E7D7C6] bg-[#FCF8F3] text-[#311912] shadow-[8px_8px_24px_rgba(49,25,18,0.06)]"
                    }`}
                  >
                    {isCurrent ? (
                      <span className="mb-3 inline-flex w-fit rounded-xl bg-[#D9A33F]/25 px-3 py-1 text-xs font-black text-[#F0C568]">
                        الباقة الحالية
                      </span>
                    ) : null}

                    <div
                      className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
                        isCurrent ? "bg-white/10 text-[#F0C568]" : "bg-[#4A281D] text-[#FCF8F3]"
                      }`}
                    >
                      <Layers3 className="h-6 w-6" />
                    </div>

                    <h2 className="text-2xl font-black">{plan.name}</h2>
                    <p className={`mt-2 text-sm font-bold ${isCurrent ? "text-[#F2E7D9]" : "text-[#806A5E]"}`}>
                      {plan.description}
                    </p>
                    <p
                      className={`mt-4 text-3xl font-black ${isCurrent ? "text-[#F0C568]" : "text-[#6B3A25]"}`}
                    >
                      {plan.priceMonthly} ر.س
                    </p>

                    <ul className="mt-4 flex-1 space-y-1.5">
                      {allPlatformFeatures.map((feature) => {
                        const on = plan.features.includes(feature.id);
                        return (
                          <li
                            key={feature.id}
                            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-black ${
                              on
                                ? isCurrent
                                  ? "bg-white/10 text-[#FCF8F3]"
                                  : "bg-emerald-50 text-emerald-700"
                                : isCurrent
                                  ? "bg-white/5 text-[#806A5E]"
                                  : "bg-[#F2E7D9] text-[#806A5E]"
                            }`}
                          >
                            <span>{feature.title}</span>
                            {on ? (
                              <Check className={`h-4 w-4 shrink-0 ${isCurrent ? "text-[#F0C568]" : "text-emerald-600"}`} />
                            ) : (
                              <span className="shrink-0 opacity-40">—</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    <PrimaryButton
                      onClick={() => choosePlan(plan.id)}
                      disabled={isCurrent}
                      className="mt-5 w-full"
                    >
                      {isCurrent ? "مفعّلة حاليًا" : "اختيار والمتابعة للفاتورة"}
                    </PrimaryButton>
                  </article>
                );
              })}
          </div>
        ) : null}

        {step === "invoice" && selectedPlan ? (
          <BentoGrid>
            <BentoCard variant="white" span="2">
              <div className="flex items-center gap-3">
                <Receipt className="h-8 w-8 text-[#6B3A25]" />
                <div>
                  <h2 className="text-2xl font-black text-[#311912]">ملخص الفاتورة</h2>
                  <p className="text-sm font-bold text-[#806A5E]">
                    الباقة المختارة: {selectedPlan.name}
                  </p>
                </div>
              </div>

              <SoftCard className="mt-6 space-y-4">
                <div className="flex justify-between font-bold">
                  <span>الاشتراك الشهري</span>
                  <span>{selectedPlan.priceMonthly} ر.س</span>
                </div>
                <div className="flex justify-between font-bold text-[#806A5E]">
                  <span>ضريبة القيمة المضافة (15%)</span>
                  <span>{vat} ر.س</span>
                </div>
                <div className="flex justify-between border-t border-[#E7D7C6] pt-4 text-xl font-black text-[#311912]">
                  <span>الإجمالي</span>
                  <span>{total} ر.س</span>
                </div>
              </SoftCard>

              <p className="mt-4 text-sm font-bold text-[#806A5E]">
                لن يتم تغيير الباقة الحالية ({activePlan?.name}) حتى تضغط «الدفع وتفعيل
                الباقة» وتنجح العملية.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <PrimaryButton
                  onClick={payAndActivate}
                  disabled={paying}
                  className="inline-flex w-full min-w-0 flex-1 items-center justify-center gap-2 sm:min-w-[200px]"
                >
                  <CreditCard className="h-5 w-5" />
                  {paying ? "جاري الدفع..." : "الدفع وتفعيل الباقة"}
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="rounded-2xl border border-[#E7D7C6] px-6 py-4 font-black text-[#806A5E]"
                >
                  تغيير الباقة
                </button>
                <button
                  type="button"
                  onClick={simulateFailedPayment}
                  className="rounded-2xl bg-red-50 px-6 py-4 font-black text-red-700"
                >
                  محاكاة فشل الدفع
                </button>
              </div>
            </BentoCard>

            <BentoCard variant="white" span="2">
              <h3 className="text-lg font-black text-[#311912]">مميزات الباقة</h3>
              <div className="mt-4 grid gap-2">
                {allPlatformFeatures.map((feature) => {
                  const on = selectedPlan.features.includes(feature.id);
                  return (
                    <div
                      key={feature.id}
                      className={`flex justify-between rounded-xl px-4 py-3 text-sm font-black ${
                        on ? "bg-emerald-50 text-emerald-700" : "bg-[#F2E7D9] text-[#806A5E]"
                      }`}
                    >
                      <span>{feature.title}</span>
                      {on ? <Check className="h-5 w-5" /> : <span>—</span>}
                    </div>
                  );
                })}
              </div>
            </BentoCard>
          </BentoGrid>
        ) : null}

        <section className="mt-10">
          <h2 className="mb-5 text-2xl font-black text-[#311912]">سجل الاشتراكات</h2>
          <BentoGrid className="xl:grid-cols-1">
            {history.length ? (
              history.map((record) => (
                <BentoCard key={record.id} variant="white" span="4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-black">{record.planName}</h3>
                      <p className="mt-1 text-sm font-bold text-[#806A5E]">
                        {record.amount} ر.س • {record.createdAt.slice(0, 10)}
                        {record.paidAt ? ` • دُفع: ${record.paidAt.slice(0, 10)}` : ""}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        record.paymentStatus === "paid"
                          ? "success"
                          : record.paymentStatus === "failed"
                            ? "danger"
                            : "gold"
                      }
                    >
                      {statusLabel[record.paymentStatus]}
                    </StatusBadge>
                  </div>
                </BentoCard>
              ))
            ) : (
              <BentoCard variant="white" span="4">
                <p className="font-bold text-[#806A5E]">لا يوجد سجل اشتراكات بعد.</p>
              </BentoCard>
            )}
          </BentoGrid>
        </section>
      </DashboardPageShell>
    </div>
  );
}

```

# File: components/dashboard/pages/theme-page.tsx

```tsx
"use client";

import { Check, ExternalLink, Eye, Palette } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  LinkButton,
  PrimaryButton,
  StatPill,
} from "@/components/ui/design-system";
import { CafeThemeRenderer } from "@/components/cafe/themes/cafe-theme-renderer";
import { CustomIdentityBuilder } from "@/components/dashboard/theme/custom-identity-builder";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { adoptCafeTheme } from "@/lib/cafe/theme-storage-sync";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import {
  cafeThemes,
  getThemeClasses,
  getThemeDefinition,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { getCafePublicUrl } from "@/lib/platform/cafe-domain";

const CAFE_SLUG = "qatrah";

type Props = {
  initialThemeId: CafeThemeId;
  initialSettings: CafeSettings;
  initialProducts: MenuProduct[];
  initialCategories: MenuCategoryRecord[];
  initialOffers: CafeOffer[];
  initialLoyaltySettings: LoyaltySettings;
  initialLoyaltyRewards: LoyaltyReward[];
  initialCustomIdentity: CustomIdentityTheme;
  configError?: string;
};

function ThemePageInner({
  initialThemeId,
  initialSettings,
  initialProducts,
  initialCategories,
  initialOffers,
  initialLoyaltySettings,
  initialLoyaltyRewards,
  initialCustomIdentity,
  configError,
}: Props) {
  const [activeTheme, setActiveTheme] = useState<CafeThemeId>(initialThemeId);
  const [previewTheme, setPreviewTheme] = useState<CafeThemeId | null>(null);
  const [cafeSettings] = useState<CafeSettings>(initialSettings);
  const [products] = useState(initialProducts);
  const [offers] = useState(initialOffers);
  const [saved, setSaved] = useState(false);

  const selected = previewTheme ?? activeTheme;
  const theme = getThemeClasses(selected);
  const definition = getThemeDefinition(selected);
  const cafeLogoUrl = useResolvedCafeLogoUrl(cafeSettings);

  const availableProducts = products.filter((p) => p.available);
  const popularProducts = useMemo(
    () => [...availableProducts].slice(0, 4),
    [availableProducts]
  );
  const latestProducts = useMemo(
    () => [...availableProducts].slice(-4).reverse(),
    [availableProducts]
  );
  const bannerOffers = offers.filter(
    (o) =>
      o.status === "نشط" &&
      o.visibleInCafe &&
      ((o.placement ?? "كلاهما") === "بانر الكوفي" ||
        (o.placement ?? "كلاهما") === "كلاهما")
  );
  const activeRewards = initialLoyaltyRewards.filter((r) => r.active);

  async function adoptTheme(id: CafeThemeId) {
    await adoptCafeTheme(id);
    setActiveTheme(id);
    setPreviewTheme(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const previewProps = {
    slug: CAFE_SLUG,
    cafeSettings,
    cafeLogoUrl,
    themeId: selected,
    theme,
    customer: null,
    products,
    offers,
    availableProducts,
    popularProducts,
    latestProducts,
    bannerOffers,
    activeRewards,
    loyaltySettings: initialLoyaltySettings,
    isPreview: previewTheme !== null && previewTheme !== activeTheme,
  };

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="ثيم الكوفي"
        subtitle="اختر ثيمًا، عاينه داخل اللوحة، ثم اعتمده ليظهر على صفحة الكوفي العامة."
        action={
          <LinkButton
            href={getCafePublicUrl(CAFE_SLUG, {
              origin: typeof window !== "undefined" ? window.location.origin : undefined,
            })}
            variant="outline"
          >
            معاينة صفحة الكوفي الحية
          </LinkButton>
        }
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}

        {saved ? (
          <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-center font-black text-green-800">
            تم اعتماد الثيم بنجاح — صفحة الكوفي ستستخدمه الآن
          </div>
        ) : null}

        <BentoGrid className="mb-6">
          <BentoCard variant="gold" span="2">
            <StatPill
              label="الثيم المعتمد"
              value={getThemeDefinition(activeTheme).name}
              hint="محفوظ في Supabase"
            />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill
              label="ثيمات متاحة"
              value={cafeThemes.length}
              hint="تخطيطات مختلفة — ليس ألوانًا فقط"
            />
          </BentoCard>
        </BentoGrid>

        <CustomIdentityBuilder
          preview={{
            slug: CAFE_SLUG,
            cafeSettings,
            products,
            offers,
            availableProducts,
            popularProducts,
            latestProducts,
            bannerOffers,
            activeRewards,
            loyaltySettings: initialLoyaltySettings,
          }}
          initialIdentity={initialCustomIdentity}
          initialCategories={initialCategories}
          initialIsActiveTheme={activeTheme === "brand-identity-custom"}
          onAdopted={(id) => {
            setActiveTheme(id);
            setPreviewTheme(null);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
        />

        {previewTheme ? (
          <BentoCard variant="white" span="4" className="mb-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-[#3A2117]">
                  معاينة: {definition.name}
                </h2>
                <p className="text-sm font-bold text-[#7A6255]">{definition.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={() => void adoptTheme(previewTheme)}>
                  <Check className="h-4 w-4" />
                  اعتماد الثيم
                </PrimaryButton>
                <LinkButton
                  href={getCafePublicUrl(CAFE_SLUG, {
                    previewTheme,
                    origin: typeof window !== "undefined" ? window.location.origin : undefined,
                  })}
                  variant="outline"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                  فتح صفحة الكوفي بهذا الثيم
                </LinkButton>
              </div>
            </div>
            <div className="overflow-hidden rounded-3xl border border-[#E5D8CD] bg-[#F8F4EF]">
              <div className="max-h-[min(70vh,640px)] overflow-x-hidden overflow-y-auto overscroll-contain">
                <div className="pointer-events-none origin-top scale-[0.52] sm:scale-[0.62] md:scale-[0.75] lg:scale-[0.85]">
                  <CafeThemeRenderer {...previewProps} />
                </div>
              </div>
            </div>
          </BentoCard>
        ) : null}

        <BentoGrid>
          {cafeThemes.map((t) => {
            const isActive = activeTheme === t.id;
            const isPreviewing = previewTheme === t.id;

            return (
              <BentoCard key={t.id} variant="white" span="2">
                <div
                  className={`h-36 rounded-3xl bg-gradient-to-br ${t.previewGradient} border border-[#E5D8CD]`}
                />

                <div className="mt-5">
                  <p className="text-xs font-bold text-[#7A6255]">{t.recommendedFor}</p>
                  <h2 className="mt-1 text-2xl font-black text-[#3A2117]">{t.name}</h2>
                  <p className="mt-2 min-h-12 text-sm font-bold text-[#7A6255]">
                    {t.description}
                  </p>
                  <p className="mt-1 text-[10px] font-bold text-[#CBB29C]">
                    {t.layoutType} · {t.density}
                  </p>

                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewTheme(t.id)}
                      className={`flex h-11 items-center justify-center gap-2 rounded-2xl font-black ${
                        isPreviewing
                          ? "bg-[#3A2117] text-[#F8E8D2]"
                          : "border border-[#E5D8CD] bg-white text-[#3A2117] hover:bg-[#F8F4EF]"
                      }`}
                    >
                      <Eye className="h-4 w-4" />
                      معاينة
                    </button>

                    {isActive ? (
                      <div className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-green-50 font-black text-green-700">
                        <Check className="h-5 w-5" />
                        معتمد حاليًا
                      </div>
                    ) : (
                      <PrimaryButton
                        onClick={() => void adoptTheme(t.id)}
                        className="flex h-11 items-center justify-center gap-2"
                      >
                        <Palette className="h-4 w-4" />
                        اعتماد الثيم
                      </PrimaryButton>
                    )}

                    <LinkButton
                      href={getCafePublicUrl(CAFE_SLUG, { previewTheme: t.id })}
                      variant="outline"
                      className="h-10 text-center text-xs"
                      target="_blank"
                    >
                      فتح صفحة الكوفي بهذا الثيم
                    </LinkButton>
                  </div>
                </div>
              </BentoCard>
            );
          })}
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

export function ThemePageClient(props: Props) {
  return (
    <Suspense fallback={<div className="p-8 font-black">جاري التحميل...</div>}>
      <ThemePageInner {...props} />
    </Suspense>
  );
}

```

# File: components/dashboard/theme/custom-identity-builder.tsx

```tsx
"use client";

import { Check, ImagePlus, Loader2, Palette, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CafeThemeRenderer } from "@/components/cafe/themes/cafe-theme-renderer";
import {
  BentoCard,
  NeumoInput,
  PrimaryButton,
  SoftCard,
} from "@/components/ui/design-system";
import { AppToast, useAppToast } from "@/components/ui/app-toast";
import { extractPaletteFromImage } from "@/lib/cafe/color-extract";
import {
  buildCustomIdentityContrastTokens,
  paletteTextWasAutoCorrected,
  THEME_BUILDER_FIELD_CLASS,
  THEME_BUILDER_LABEL_CLASS,
} from "@/lib/cafe/color-contrast";
import {
  ImagePipelineError,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import {
  deleteLocalAsset,
  FIXED_ASSET_IDS,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { uploadImageAction } from "@/app/actions/upload";
import {
  adoptCafeTheme,
  persistCustomIdentityTheme,
  subscribeBarndaksaStorageEvents,
} from "@/lib/cafe/theme-storage-sync";
import {
  getThemeClasses,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import {
  buildCustomIdentityCssVars,
  defaultCustomIdentityTheme,
  FEATURED_SECTION_LABELS,
  isValidHex,
  type BackgroundFit,
  type BackgroundScope,
  type CustomIdentityPalette,
  type CustomIdentityTheme,
  type FeaturedSectionMode,
  type OverlayStrength,
} from "@/lib/mock/custom-identity-theme";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";

const BRAND_THEME_ID: CafeThemeId = "brand-identity-custom";
const CAFE_PUBLIC_PATH = "/c/qatrah";

const PALETTE_FIELDS: { key: keyof CustomIdentityPalette; label: string }[] = [
  { key: "primary", label: "أساسي" },
  { key: "secondary", label: "ثانوي" },
  { key: "button", label: "أزرار" },
  { key: "background", label: "خلفية" },
  { key: "text", label: "نص" },
  { key: "accent", label: "تمييز" },
];

const SCOPE_OPTIONS: { value: BackgroundScope; label: string }[] = [
  { value: "home-only", label: "الصفحة الرئيسية فقط" },
  { value: "all-customer-pages", label: "كل صفحات العميل" },
  { value: "hero-only", label: "قسم الهيرو فقط" },
  { value: "top-banner", label: "شريط علوي" },
];

const FIT_OPTIONS: { value: BackgroundFit; label: string }[] = [
  { value: "cover", label: "تغطية" },
  { value: "contain", label: "احتواء" },
];

const OVERLAY_OPTIONS: { value: OverlayStrength; label: string }[] = [
  { value: "light", label: "خفيف" },
  { value: "medium", label: "متوسط" },
  { value: "strong", label: "قوي" },
];

const FEATURED_MODES = Object.entries(FEATURED_SECTION_LABELS) as [
  FeaturedSectionMode,
  string,
][];

type PreviewBundle = {
  slug: string;
  cafeSettings: CafeSettings;
  products: MenuProduct[];
  offers: CafeOffer[];
  availableProducts: MenuProduct[];
  popularProducts: MenuProduct[];
  latestProducts: MenuProduct[];
  bannerOffers: CafeOffer[];
  activeRewards: LoyaltyReward[];
  loyaltySettings: LoyaltySettings;
};

type Props = {
  preview: PreviewBundle;
  initialIdentity: CustomIdentityTheme;
  initialCategories: MenuCategoryRecord[];
  initialIsActiveTheme?: boolean;
  onAdopted?: (themeId: CafeThemeId) => void;
};

type FlowStatus = "idle" | "savingAsset" | "saving" | "applying" | "success" | "error";

function palettesEqual(a: CustomIdentityPalette, b: CustomIdentityPalette) {
  return PALETTE_FIELDS.every(({ key }) => a[key] === b[key]);
}

function draftsEqual(
  a: CustomIdentityTheme,
  b: CustomIdentityTheme,
  pending: { logo: boolean; background: boolean }
) {
  return (
    a.logoAssetId === b.logoAssetId &&
    a.backgroundAssetId === b.backgroundAssetId &&
    !pending.logo &&
    !pending.background &&
    a.backgroundScope === b.backgroundScope &&
    a.backgroundFit === b.backgroundFit &&
    a.overlayStrength === b.overlayStrength &&
    a.featuredSectionMode === b.featuredSectionMode &&
    a.featuredCategoryId === b.featuredCategoryId &&
    palettesEqual(a.palette, b.palette)
  );
}

function isQuotaError(err: unknown) {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.code === 22)
  );
}

export function CustomIdentityBuilder({
  preview,
  initialIdentity,
  initialCategories,
  initialIsActiveTheme = false,
  onAdopted,
}: Props) {
  const [draft, setDraft] = useState<CustomIdentityTheme>(() => initialIdentity);
  const [savedSnapshot, setSavedSnapshot] = useState<CustomIdentityTheme>(() => initialIdentity);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>(() =>
    initialCategories.filter((c) => c.visible)
  );
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle");
  const [hexErrors, setHexErrors] = useState<
    Partial<Record<keyof CustomIdentityPalette, boolean>>
  >({});
  const [pendingLogo, setPendingLogo] = useState<OptimizedImageResult | null>(null);
  const [pendingBackground, setPendingBackground] = useState<OptimizedImageResult | null>(null);
  const [optimizingLogo, setOptimizingLogo] = useState(false);
  const [optimizingBackground, setOptimizingBackground] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | undefined>();
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | undefined>();
  const [showRepair, setShowRepair] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const { toast, showToast, setToast } = useAppToast();
  const [isActiveTheme, setIsActiveTheme] = useState(initialIsActiveTheme);
  const cafeLogoFallback = useResolvedCafeLogoUrl(preview.cafeSettings);
  const { logoUrl: savedIdentityLogoUrl, backgroundUrl: savedBackgroundUrl } =
    useCustomIdentityVisuals(draft);

  useEffect(() => {
    setDraft(initialIdentity);
    setSavedSnapshot(initialIdentity);
    setCategories(initialCategories.filter((c) => c.visible));
    setIsActiveTheme(initialIsActiveTheme);

    return subscribeBarndaksaStorageEvents({
      onThemeUpdated: () => {
        setIsActiveTheme(initialIsActiveTheme);
      },
    });
  }, [initialIdentity, initialCategories, initialIsActiveTheme]);

  useEffect(() => {
    return () => {
      revokeObjectUrl(logoPreviewUrl);
      revokeObjectUrl(backgroundPreviewUrl);
    };
  }, [logoPreviewUrl, backgroundPreviewUrl]);

  const theme = getThemeClasses(BRAND_THEME_ID);
  const cssVars = buildCustomIdentityCssVars(draft.palette) as CSSProperties;
  const contrastTokens = useMemo(
    () => buildCustomIdentityContrastTokens(draft.palette),
    [draft.palette]
  );
  const showContrastNotice = useMemo(
    () => paletteTextWasAutoCorrected(draft.palette),
    [draft.palette]
  );

  const hasUnsavedChanges = useMemo(
    () =>
      !draftsEqual(draft, savedSnapshot, {
        logo: Boolean(pendingLogo),
        background: Boolean(pendingBackground),
      }),
    [draft, savedSnapshot, pendingLogo, pendingBackground]
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.visible),
    [categories]
  );

  const displayLogoUrl = logoPreviewUrl ?? savedIdentityLogoUrl ?? cafeLogoFallback;

  const validatePalette = useCallback(() => {
    const hasInvalid = PALETTE_FIELDS.some(({ key }) => !isValidHex(draft.palette[key]));
    if (hasInvalid) {
      const next: Partial<Record<keyof CustomIdentityPalette, boolean>> = {};
      for (const { key } of PALETTE_FIELDS) {
        next[key] = !isValidHex(draft.palette[key]);
      }
      setHexErrors(next);
      return false;
    }
    setHexErrors({});
    return true;
  }, [draft.palette]);

  function updatePalette(key: keyof CustomIdentityPalette, value: string) {
    const valid = isValidHex(value);
    setHexErrors((prev) => ({ ...prev, [key]: value.length > 0 && !valid }));
    setDraft((prev) => ({
      ...prev,
      palette: { ...prev.palette, [key]: value },
    }));
  }

  function setLogoPreview(next?: string) {
    setLogoPreviewUrl((prev) => {
      if (prev && prev !== next) revokeObjectUrl(prev);
      return next;
    });
  }

  function setBackgroundPreview(next?: string) {
    setBackgroundPreviewUrl((prev) => {
      if (prev && prev !== next) revokeObjectUrl(prev);
      return next;
    });
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOptimizingLogo(true);
    showToast({ type: "loading", message: "جاري تحسين الصورة..." });
    try {
      const optimized = await optimizeImageForStorage(file, "custom-theme-logo");
      setLogoPreview(URL.createObjectURL(optimized.blob));
      setPendingLogo(optimized);
      showToast({
        type: "success",
        message: "تم تجهيز الصورة تلقائيًا بجودة مناسبة للعرض السريع",
      });
    } catch (err) {
      showToast({
        type: "error",
        message:
          err instanceof ImagePipelineError
            ? err.message
            : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP",
      });
    } finally {
      setOptimizingLogo(false);
    }
  }

  async function pickBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOptimizingBackground(true);
    showToast({ type: "loading", message: "جاري تحسين الصورة..." });
    try {
      const optimized = await optimizeImageForStorage(file, "custom-theme-background");
      setBackgroundPreview(URL.createObjectURL(optimized.blob));
      setPendingBackground(optimized);
      showToast({
        type: "success",
        message: "تم تجهيز الصورة تلقائيًا بجودة مناسبة للعرض السريع",
      });
    } catch (err) {
      showToast({
        type: "error",
        message:
          err instanceof ImagePipelineError
            ? err.message
            : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP",
      });
    } finally {
      setOptimizingBackground(false);
    }
  }

  function removeLogo() {
    setPendingLogo(null);
    setLogoPreview(undefined);
    setDraft((prev) => ({ ...prev, logoAssetId: undefined }));
  }

  function removeBackground() {
    setPendingBackground(null);
    setBackgroundPreview(undefined);
    setDraft((prev) => ({ ...prev, backgroundAssetId: undefined }));
  }

  async function handleExtractColors() {
    const src = logoPreviewUrl ?? cafeLogoFallback;
    if (!src) {
      setExtractError("ارفع شعارًا أولًا لاستخراج الألوان");
      return;
    }
    setExtracting(true);
    setExtractError("");
    try {
      const palette = await extractPaletteFromImage(src);
      setDraft((prev) => ({ ...prev, palette }));
      setHexErrors({});
    } catch {
      setExtractError("تعذر قراءة الشعار — جرّب صورة أخرى");
    } finally {
      setExtracting(false);
    }
  }

  async function handleRepairStorage() {
    showToast({
      type: "success",
      message: "لا حاجة لإصلاح التخزين — البيانات محفوظة في Supabase",
    });
  }

  async function persistDraft(showMessages = true): Promise<boolean> {
    if (!validatePalette()) {
      if (showMessages) {
        showToast({ type: "error", message: "صحّح ألوان الهوية قبل الحفظ" });
      }
      return false;
    }

    if (showMessages) {
      setFlowStatus(pendingLogo || pendingBackground ? "savingAsset" : "saving");
      setToast({
        type: "loading",
        message:
          pendingLogo || pendingBackground ? "جاري حفظ الصور..." : "جاري حفظ الهوية...",
      });
    }

    try {
      const next: CustomIdentityTheme = { ...draft };

      if (pendingLogo) {
        const formData = new FormData();
        formData.append("file", pendingLogo.blob, "logo.webp");
        const uploaded = await uploadImageAction(
          "cafe-logos",
          formData,
          "logo",
          "custom-identity/logo"
        );
        next.logoAssetId = uploaded.storagePath;
        delete next.legacyLogoDataUrl;
      }

      if (pendingBackground) {
        const formData = new FormData();
        formData.append("file", pendingBackground.blob, "background.webp");
        const uploaded = await uploadImageAction(
          "cafe-backgrounds",
          formData,
          "background",
          "custom-identity/background"
        );
        next.backgroundAssetId = uploaded.storagePath;
        delete next.legacyBackgroundImageDataUrl;
      }

      if (showMessages && (pendingLogo || pendingBackground)) {
        setFlowStatus("saving");
        setToast({ type: "loading", message: "جاري حفظ الهوية..." });
      }

      await persistCustomIdentityTheme(next);
      setDraft(next);
      setSavedSnapshot(next);
      setPendingLogo(null);
      setPendingBackground(null);
      setShowRepair(false);

      if (showMessages) {
        setFlowStatus("success");
        showToast({ type: "success", message: "تم حفظ هوية الكوفي بنجاح" });
      }
      return true;
    } catch (err) {
      console.error("[custom-identity] save failed", err);
      if (showMessages) {
        setFlowStatus("error");
        showToast({
          type: "error",
          message: isQuotaError(err)
            ? "تعذر الحفظ محليًا بسبب حجم الملفات. أعد رفع صورة أصغر."
            : err instanceof Error &&
                err.message.includes("IndexedDB")
              ? "تعذر حفظ الصورة محليًا. جرّب صورة أصغر."
              : "تعذر تطبيق الثيم، حاول مرة أخرى",
        });
      }
      return false;
    }
  }

  async function handleSaveIdentity() {
    await persistDraft(true);
  }

  async function handleApplyTheme() {
    setFlowStatus("applying");
    setToast({ type: "loading", message: "جاري تطبيق الثيم على صفحة الكوفي..." });

    try {
      const saved =
        hasUnsavedChanges || pendingLogo || pendingBackground
          ? await persistDraft(false)
          : true;
      if (!saved) {
        setFlowStatus("error");
        showToast({ type: "error", message: "تعذر تطبيق الثيم، حاول مرة أخرى" });
        return;
      }

      await adoptCafeTheme(BRAND_THEME_ID);
      onAdopted?.(BRAND_THEME_ID);
      setIsActiveTheme(true);
      setFlowStatus("success");
      showToast({
        type: "success",
        message: "تم تطبيق ثيم الهوية على صفحة الكوفي",
        action: { label: "عرض صفحة الكوفي", href: CAFE_PUBLIC_PATH },
      });
    } catch (err) {
      console.error("[custom-identity] apply failed", err);
      setFlowStatus("error");
      showToast({ type: "error", message: "تعذر تطبيق الثيم، حاول مرة أخرى" });
    }
  }

  async function handleRemoveSavedLogo() {
    await deleteLocalAsset(FIXED_ASSET_IDS["custom-theme-logo"]!);
    removeLogo();
  }

  async function handleRemoveSavedBackground() {
    await deleteLocalAsset(FIXED_ASSET_IDS["custom-theme-background"]!);
    removeBackground();
  }

  const isBusy =
    flowStatus === "saving" ||
    flowStatus === "savingAsset" ||
    flowStatus === "applying" ||
    repairing ||
    optimizingLogo ||
    optimizingBackground;

  const rendererProps = {
    slug: preview.slug,
    cafeSettings: preview.cafeSettings,
    themeId: BRAND_THEME_ID,
    theme,
    customer: null,
    products: preview.products,
    offers: preview.offers,
    availableProducts: preview.availableProducts,
    popularProducts: preview.popularProducts,
    latestProducts: preview.latestProducts,
    bannerOffers: preview.bannerOffers,
    activeRewards: preview.activeRewards,
    loyaltySettings: preview.loyaltySettings,
    isPreview: true,
    customIdentityOverride: draft,
    customIdentityPreviewUrls: {
      logoUrl: logoPreviewUrl ?? savedIdentityLogoUrl,
      backgroundUrl: backgroundPreviewUrl ?? savedBackgroundUrl,
    },
    cafeLogoUrl: cafeLogoFallback,
  };

  return (
    <>
      <BentoCard variant="gold" span="4" className="mt-2">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-[#F6C35B]/80">بناء مخصص</p>
            <h2 className="mt-1 text-2xl font-black">أنشئ ثيم بهوية كوفيك</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold text-[#E5D8CD]/90">
              الألوان والإعدادات في{" "}
              <span className="font-mono text-xs">cafe_custom_identity</span> — الصور
              في IndexedDB محليًا (mock) وليس base64.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasUnsavedChanges ? (
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-100">
                تغييرات غير محفوظة
              </span>
            ) : null}
            {isActiveTheme ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-100">
                <Check className="h-3.5 w-3.5" />
                ثيم معتمد حاليًا
              </span>
            ) : null}
            {showRepair ? (
              <button
                type="button"
                onClick={() => void handleRepairStorage()}
                disabled={repairing}
                className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-black text-red-100"
              >
                {repairing ? "جاري الإصلاح..." : "إصلاح وتحسين الصور القديمة"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_minmax(280px,360px)]">
          <div className="theme-builder-form-fields space-y-5">
            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#3A2117]">
                <ImagePlus className="h-5 w-5 text-[#6B3A25]" />
                الشعار
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                {displayLogoUrl ? (
                  <img
                    src={displayLogoUrl}
                    alt=""
                    className="h-20 w-20 rounded-2xl border border-[#E5D8CD] bg-white object-contain p-2"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-[#CBB29C] bg-[#F8F4EF] text-xs font-bold text-[#7A6255]">
                    بدون شعار
                  </div>
                )}
                <label className="cursor-pointer">
                  <span className="inline-flex h-11 items-center rounded-2xl border border-[#E5D8CD] bg-white px-4 text-sm font-black text-[#3A2117] hover:bg-[#F8F4EF]">
                    رفع شعار
                  </span>
                  <input type="file" accept="image/*" className="sr-only" onChange={pickLogo} />
                </label>
                <button
                  type="button"
                  onClick={() => void handleExtractColors()}
                  disabled={extracting || isBusy}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#3A2117] px-4 text-sm font-black text-[#F8E8D2] disabled:opacity-60"
                >
                  {extracting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  استخراج الألوان
                </button>
                {logoPreviewUrl || draft.logoAssetId ? (
                  <button
                    type="button"
                    onClick={() => void handleRemoveSavedLogo()}
                    className="text-xs font-bold text-[#7A6255] underline"
                  >
                    إزالة الشعار
                  </button>
                ) : null}
              </div>
              {extractError ? (
                <p className="mt-2 text-sm font-bold text-red-600">{extractError}</p>
              ) : null}
            </SoftCard>

            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#3A2117]">
                <Palette className="h-5 w-5 text-[#6B3A25]" />
                لوحة الألوان
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {PALETTE_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-black text-[#7A6255]">{label}</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={isValidHex(draft.palette[key]) ? draft.palette[key] : "#6B3A25"}
                        onChange={(e) => updatePalette(key, e.target.value)}
                        className="h-12 w-12 shrink-0 cursor-pointer rounded-xl border border-[#E5D8CD]"
                        aria-label={label}
                      />
                      <NeumoInput
                        value={draft.palette[key]}
                        onChange={(e) => updatePalette(key, e.target.value)}
                        placeholder="#RRGGBB"
                        className={`font-mono text-sm ${hexErrors[key] ? "border-red-400 ring-red-200" : ""}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SoftCard>

            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-4 text-lg font-black text-[#3A2117]">خلفية الصفحة</h3>
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer">
                  <span className="inline-flex h-11 items-center rounded-2xl border border-[#E5D8CD] bg-white px-4 text-sm font-black">
                    رفع خلفية
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={pickBackground}
                  />
                </label>
                {backgroundPreviewUrl ?? savedBackgroundUrl ? (
                  <>
                    <img
                      src={backgroundPreviewUrl ?? savedBackgroundUrl}
                      alt=""
                      className="h-14 w-24 rounded-xl border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => void handleRemoveSavedBackground()}
                      className="text-xs font-bold text-[#7A6255] underline"
                    >
                      إزالة الخلفية
                    </button>
                  </>
                ) : null}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={THEME_BUILDER_LABEL_CLASS}>النطاق</label>
                  <select
                    value={draft.backgroundScope}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        backgroundScope: e.target.value as CustomIdentityTheme["backgroundScope"],
                      }))
                    }
                    className={THEME_BUILDER_FIELD_CLASS}
                  >
                    {SCOPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={THEME_BUILDER_LABEL_CLASS}>ملاءمة</label>
                  <select
                    value={draft.backgroundFit}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        backgroundFit: e.target.value as CustomIdentityTheme["backgroundFit"],
                      }))
                    }
                    className={THEME_BUILDER_FIELD_CLASS}
                  >
                    {FIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={THEME_BUILDER_LABEL_CLASS}>تعتيم</label>
                  <select
                    value={draft.overlayStrength}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        overlayStrength: e.target.value as CustomIdentityTheme["overlayStrength"],
                      }))
                    }
                    className={THEME_BUILDER_FIELD_CLASS}
                  >
                    {OVERLAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </SoftCard>

            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#3A2117]">
                <Sparkles className="h-5 w-5 text-[#6B3A25]" />
                ماذا يرى العميل أولًا؟
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={THEME_BUILDER_LABEL_CLASS}>الوضع</label>
                  <select
                    value={draft.featuredSectionMode}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        featuredSectionMode: e.target.value as FeaturedSectionMode,
                      }))
                    }
                    className={THEME_BUILDER_FIELD_CLASS}
                  >
                    {FEATURED_MODES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                {draft.featuredSectionMode === "category" ? (
                  <div>
                    <label className={THEME_BUILDER_LABEL_CLASS}>القسم</label>
                    <select
                      value={draft.featuredCategoryId ?? ""}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          featuredCategoryId: e.target.value || undefined,
                        }))
                      }
                      className={THEME_BUILDER_FIELD_CLASS}
                    >
                      <option value="">اختر قسمًا</option>
                      {visibleCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </SoftCard>

            <div className="flex flex-wrap gap-3">
              <PrimaryButton
                onClick={() => void handleSaveIdentity()}
                disabled={isBusy}
                className="inline-flex min-w-[200px] items-center justify-center gap-2"
              >
                {flowStatus === "savingAsset" || flowStatus === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {flowStatus === "savingAsset"
                  ? "جاري حفظ الصور..."
                  : flowStatus === "saving"
                    ? "جاري حفظ الهوية..."
                    : "حفظ إعدادات الهوية"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => void handleApplyTheme()}
                disabled={isBusy}
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-[#D9A33F] px-6 py-3 text-sm font-black text-[#311912] hover:bg-[#F0C568] disabled:opacity-60"
              >
                {flowStatus === "applying" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {flowStatus === "applying"
                  ? "جاري تطبيق الثيم على صفحة الكوفي..."
                  : "اعتماد الثيم وتطبيقه"}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-3 text-sm font-black text-[#3A2117]">فحص وضوح الهوية</h3>
              {showContrastNotice ? (
                <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                  تم تحسين لون النص تلقائيًا لضمان وضوح القراءة
                </p>
              ) : null}
              <div
                className="space-y-3 rounded-2xl border border-[#E5D8CD] p-4"
                style={{
                  backgroundColor: contrastTokens.pageBackground,
                  color: contrastTokens.pageForeground,
                }}
              >
                <p className="text-lg font-black">عنوان رئيسي</p>
                <p className="text-sm font-bold" style={{ color: contrastTokens.mutedForeground }}>
                  نص عادي للوصف والتفاصيل
                </p>
                <div
                  className="rounded-2xl border p-3"
                  style={{
                    backgroundColor: contrastTokens.surfaceBackground,
                    color: contrastTokens.surfaceForeground,
                    borderColor: contrastTokens.borderColor,
                  }}
                >
                  بطاقة فاتحة مع نص واضح
                </div>
                <button
                  type="button"
                  className="rounded-2xl px-4 py-2 text-sm font-black"
                  style={{
                    backgroundColor: contrastTokens.buttonBackground,
                    color: contrastTokens.buttonForeground,
                  }}
                >
                  زر رئيسي
                </button>
                <input
                  readOnly
                  placeholder="حقل إدخال"
                  className="w-full rounded-2xl border px-3 py-2 text-sm font-bold outline-none"
                  style={{
                    backgroundColor: contrastTokens.inputBackground,
                    color: contrastTokens.inputForeground,
                    borderColor: contrastTokens.inputBorder,
                  }}
                />
                <select
                  className="w-full rounded-2xl border px-3 py-2 text-sm font-bold outline-none"
                  style={{
                    backgroundColor: contrastTokens.dropdownBackground,
                    color: contrastTokens.dropdownForeground,
                    borderColor: contrastTokens.inputBorder,
                  }}
                  defaultValue="a"
                >
                  <option value="a">قائمة منسدلة — خيار ١</option>
                  <option value="b">قائمة منسدلة — خيار ٢</option>
                </select>
              </div>
            </SoftCard>

            <p className="text-xs font-black text-[#F6C35B]/90">معاينة مباشرة</p>
            <div
              className="overflow-hidden rounded-3xl border border-[#F6C35B]/20 bg-[#F8F4EF]"
              style={cssVars}
            >
              <div className="max-h-[420px] overflow-x-hidden overflow-y-auto overscroll-contain">
                <div className="pointer-events-none origin-top scale-[0.48]">
                  <CafeThemeRenderer {...rendererProps} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </BentoCard>
      <AppToast toast={toast} />
    </>
  );
}

```

# File: components/dashboard/ui/modal.tsx

```tsx
"use client";

import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  panelClassName?: string;
};

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  panelClassName,
}: Props) {
  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div
        className={
          panelClassName ||
          "flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        }
      >
        <div className="shrink-0 flex items-center justify-between border-b border-[#EFE8DF] px-6 py-5">
          <h2 className="text-2xl font-black text-[#3A2117]">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-[#F8F4EF] p-3 text-[#3A2117]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 flex items-center justify-end gap-3 border-t border-[#EFE8DF] bg-white px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

# File: components/ui/app-toast.tsx

```tsx
"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

export type AppToastState = {
  type: "success" | "error" | "loading";
  message: string;
  action?: { label: string; href: string };
};

type Props = {
  toast: AppToastState | null;
};

export function AppToast({ toast }: Props) {
  if (!toast) return null;

  const styles: Record<AppToastState["type"], string> = {
    success:
      "border-[#D9A33F]/40 bg-[#311912] text-[#FCF8F3] shadow-[0_12px_40px_rgba(49,25,18,0.25)]",
    error: "border-red-300 bg-red-50 text-red-800",
    loading: "border-[#E7D7C6] bg-[#FCF8F3] text-[#311912]",
  };

  const icons: Record<AppToastState["type"], ReactNode> = {
    success: <CheckCircle2 className="h-5 w-5 shrink-0 text-[#D9A33F]" />,
    error: <XCircle className="h-5 w-5 shrink-0 text-red-600" />,
    loading: <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#6B3A25]" />,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 z-[100] flex w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-black shadow-xl ${styles[toast.type]}`}
    >
      {icons[toast.type]}
      <span className="flex-1 text-right">{toast.message}</span>
      {toast.action ? (
        <Link
          href={toast.action.href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-xl bg-[#D9A33F] px-3 py-1.5 text-xs font-black text-[#311912] hover:bg-[#F0C568]"
        >
          {toast.action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function useAppToast(autoHideMs = 3500) {
  const [toast, setToast] = useState<AppToastState | null>(null);

  function showToast(next: AppToastState) {
    setToast(next);
    if (next.type !== "loading") {
      window.setTimeout(() => setToast(null), autoHideMs);
    }
  }

  function clearToast() {
    setToast(null);
  }

  return { toast, showToast, clearToast, setToast };
}

```

# File: components/ui/barndaksa-logo.tsx

```tsx
"use client";

import Image from "next/image";

export type BarndaksaLogoVariant = "dark" | "brown" | "brown-bg";

const LOGO_PATHS: Record<BarndaksaLogoVariant, string> = {
  dark: "/brand/barndaksa-logo-dark.png",
  brown: "/brand/barndaksa-logo-brown.png",
  "brown-bg": "/brand/barndaksa-logo-brown-bg.png",
};

type Props = {
  variant?: BarndaksaLogoVariant;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

export function BarndaksaLogo({
  variant = "brown",
  className = "",
  width = 180,
  height = 72,
  priority = false,
}: Props) {
  const src = LOGO_PATHS[variant];

  return (
    <Image
      src={src}
      alt="شعار برندة"
      width={width}
      height={height}
      priority={priority}
      className={`h-auto w-auto max-w-full object-contain ${className}`}
      style={{ width, height: "auto" }}
    />
  );
}

```

# File: components/ui/design-system.tsx

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/* ─── Bento ─── */

type BentoSpan = "1" | "2" | "3" | "4" | "row2";

const spanClasses: Record<BentoSpan, string> = {
  "1": "md:col-span-1",
  "2": "md:col-span-2",
  "3": "md:col-span-3",
  "4": "md:col-span-4",
  row2: "md:col-span-2 md:row-span-2",
};

type BentoVariant = "white" | "gold" | "cyber" | "dark";

const bentoVariants: Record<BentoVariant, string> = {
  white:
    "bg-[#FCF8F3] border-[#E7D7C6] text-[#311912] shadow-[8px_8px_24px_rgba(49,25,18,0.06),-6px_-6px_20px_rgba(255,255,255,0.9)]",
  gold:
    "bg-gradient-to-br from-[#4A281D] via-[#6B3A25] to-[#311912] border-[#D9A33F]/25 text-[#FCF8F3] shadow-[0_0_40px_rgba(217,163,63,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]",
  cyber:
    "bg-[#1a1210]/90 border-white/10 text-[#F8F4EF] shadow-[0_0_32px_rgba(217,163,63,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm",
  dark:
    "bg-[#0f0c0a] border-white/10 text-[#F8F4EF] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),4px_8px_28px_rgba(0,0,0,0.45)]",
};

export function BentoGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  children,
  variant = "white",
  span = "1",
  className = "",
}: {
  children: ReactNode;
  variant?: BentoVariant;
  span?: BentoSpan;
  className?: string;
}) {
  return (
    <article
      className={`min-w-0 rounded-[24px] border p-4 transition sm:rounded-[32px] sm:p-6 ${bentoVariants[variant]} ${spanClasses[span]} ${className}`}
    >
      {children}
    </article>
  );
}

/* ─── Shells ─── */

export function DashboardPageShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">لوحة برندة</p>
          <h1 className="mt-2 break-words text-2xl font-black text-[#311912] sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl font-bold text-[#806A5E]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function AdminPageShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#D9A33F]">Barndaksa Admin</p>
          <h1 className="mt-2 break-words text-2xl font-black text-[#F8F4EF] sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl font-bold text-[#CBB29C]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

/* ─── Stats & badges ─── */

export function StatPill({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-sm font-black text-[#806A5E]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#311912]">{value}</p>
      {hint ? <p className="mt-1 text-xs font-bold text-[#806A5E]">{hint}</p> : null}
    </div>
  );
}

export function AdminStatPill({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-sm font-black text-[#CBB29C]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#F8F4EF]">{value}</p>
      {hint ? <p className="mt-1 text-xs font-bold text-[#7A6255]">{hint}</p> : null}
    </div>
  );
}

type BadgeTone = "gold" | "success" | "danger" | "muted" | "warning" | "neutral";

const badgeTones: Record<BadgeTone, string> = {
  gold: "bg-[#D9A33F]/20 text-[#D9A33F] border-[#D9A33F]/30",
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  danger: "bg-red-500/15 text-red-300 border-red-500/25",
  muted: "bg-white/10 text-[#CBB29C] border-white/15",
  warning: "bg-amber-500/15 text-amber-200 border-amber-500/25",
  neutral: "bg-white/10 text-[#CBB29C] border-white/15",
};

export function StatusBadge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex rounded-xl border px-3 py-1 text-xs font-black ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ─── Soft UI cards ─── */

export function SoftCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[24px] border border-[#E7D7C6] bg-[#FCF8F3] p-5 shadow-[inset_2px_2px_6px_rgba(255,255,255,0.9),6px_8px_20px_rgba(49,25,18,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function FilterBar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-6 flex min-w-0 flex-col gap-4 rounded-[24px] border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)] sm:rounded-[28px] sm:p-5 lg:flex-row lg:items-center ${className}`}
    >
      {children}
    </div>
  );
}

export function AdminFilterBar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-6 flex min-w-0 flex-col gap-4 rounded-[24px] border border-white/10 bg-[#1a1210]/80 p-4 shadow-[0_0_24px_rgba(217,163,63,0.06)] sm:rounded-[28px] sm:p-5 lg:flex-row lg:items-center ${className}`}
    >
      {children}
    </div>
  );
}

/* ─── Inputs (unified light / dark) ─── */

export const inputLightClass =
  "h-14 w-full rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] px-4 text-right font-bold text-[#311912] outline-none placeholder:text-[#806A5E] shadow-[inset_3px_3px_8px_rgba(49,25,18,0.06),inset_-2px_-2px_6px_rgba(255,255,255,0.95)] focus:border-[#6B3A25]/50 focus:ring-2 focus:ring-[#6B3A25]/15";

export const inputDarkClass =
  "h-14 w-full rounded-2xl border border-[#D9A33F]/25 bg-[#211711] px-4 text-right font-bold text-[#FCF8F3] outline-none placeholder:text-[#F2E7D9]/80 shadow-[inset_2px_2px_8px_rgba(0,0,0,0.4)] focus:border-[#D9A33F]/55 focus:ring-2 focus:ring-[#D9A33F]/25 [&_option]:bg-[#211711] [&_option]:text-[#FCF8F3]";

export const textareaLightClass =
  "min-h-28 w-full resize-none rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] px-4 py-3 text-right font-bold text-[#311912] outline-none placeholder:text-[#806A5E] shadow-[inset_3px_3px_8px_rgba(49,25,18,0.06)] focus:border-[#6B3A25]/50 focus:ring-2 focus:ring-[#6B3A25]/15";

export const textareaDarkClass =
  "min-h-28 w-full resize-none rounded-2xl border border-[#D9A33F]/25 bg-[#211711] px-4 py-3 text-right font-bold text-[#FCF8F3] outline-none placeholder:text-[#F2E7D9]/80 shadow-[inset_2px_2px_8px_rgba(0,0,0,0.4)] focus:border-[#D9A33F]/55 focus:ring-2 focus:ring-[#D9A33F]/25";

type FieldTone = "light" | "dark";

function resolveTone(dark?: boolean, tone?: FieldTone): FieldTone {
  if (tone) return tone;
  return dark ? "dark" : "light";
}

export function NeumoInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    dark?: boolean;
    tone?: FieldTone;
  }
) {
  const { dark, tone, className = "", ...rest } = props;
  const t = resolveTone(dark, tone);
  return (
    <input
      {...rest}
      className={`${t === "dark" ? inputDarkClass : inputLightClass} ${className}`}
    />
  );
}

export function NeumoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    dark?: boolean;
    tone?: FieldTone;
  }
) {
  const { dark, tone, className = "", ...rest } = props;
  const t = resolveTone(dark, tone);
  return (
    <textarea
      {...rest}
      className={`${t === "dark" ? textareaDarkClass : textareaLightClass} ${className}`}
    />
  );
}

export function NeumoSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    dark?: boolean;
    tone?: FieldTone;
  }
) {
  const { dark, tone, className = "", children, ...rest } = props;
  const t = resolveTone(dark, tone);
  return (
    <select
      {...rest}
      className={`${t === "dark" ? inputDarkClass : inputLightClass} ${className}`}
    >
      {children}
    </select>
  );
}

/** حقول داخل لوحة الأدمن — استخدمها بدل تكرار dark */
export function AdminInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  return <NeumoInput tone="dark" {...props} />;
}

export function AdminTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return <NeumoTextarea tone="dark" {...props} />;
}

export function AdminSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
  return <NeumoSelect tone="dark" {...props} />;
}

/* ─── Buttons ─── */

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-2xl bg-[#4A281D] px-6 py-4 font-black text-[#FCF8F3] shadow-[6px_8px_20px_rgba(49,25,18,0.25),inset_0_1px_0_rgba(255,255,255,0.1)] transition hover:bg-[#311912] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GoldButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-2xl bg-gradient-to-l from-[#D9A33F] to-[#F0C568] px-6 py-4 font-black text-[#311912] shadow-[0_0_24px_rgba(217,163,63,0.35)] transition hover:brightness-105 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
  target,
  rel,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline";
  className?: string;
  target?: string;
  rel?: string;
}) {
  const styles =
    variant === "outline"
      ? "border border-[#E7D7C6] bg-white text-[#311912] shadow-[4px_6px_16px_rgba(49,25,18,0.06)]"
      : "bg-[#4A281D] text-[#FCF8F3] shadow-[6px_8px_20px_rgba(49,25,18,0.2)]";

  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className={`inline-flex items-center justify-center rounded-2xl px-6 py-4 font-black transition hover:opacity-90 ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}

```

# File: components/ui/local-asset-image.tsx

```tsx
"use client";

import { useLocalAssetUrl } from "@/lib/cafe/use-local-asset-url";

type Props = {
  assetId?: string;
  fallbackSrc?: string | null;
  previewUrl?: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

export function LocalAssetImage({
  assetId,
  fallbackSrc,
  previewUrl,
  alt,
  className = "",
  fallback = null,
}: Props) {
  const src = useLocalAssetUrl(assetId, fallbackSrc, previewUrl);

  if (!src) return <>{fallback}</>;

  return <img src={src} alt={alt} className={className} />;
}

```

# File: components/ui/responsive-app-shell.tsx

```tsx
"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  sidebar: ReactNode | ((close: () => void) => ReactNode);
  mobileTitle?: string;
  variant?: "dashboard" | "admin";
};

export function ResponsiveAppShell({
  children,
  sidebar,
  mobileTitle = "برندة",
  variant = "dashboard",
}: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const headerClass =
    variant === "admin"
      ? "border-white/10 bg-[#0f0c0a] text-[#F8E8D2]"
      : "border-[#E5D8CD]/60 bg-[#3A2117] text-[#F8E8D2]";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b px-4 lg:hidden ${headerClass}`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"
          aria-label="فتح القائمة"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate px-3 text-center text-sm font-black">
          {mobileTitle}
        </span>
        <span className="w-10" aria-hidden />
      </header>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px] lg:hidden"
          aria-label="إغلاق القائمة"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div
        className={`fixed right-0 top-0 z-[60] h-[100dvh] w-[min(280px,88vw)] transition-transform duration-300 ease-out lg:w-[280px] lg:!translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute left-3 top-3 z-[70] flex h-9 w-9 items-center justify-center rounded-lg bg-black/40 text-white lg:hidden"
          aria-label="إغلاق"
        >
          <X className="h-5 w-5" />
        </button>
        {typeof sidebar === "function" ? sidebar(() => setOpen(false)) : sidebar}
      </div>

      <section className="min-h-[100dvh] min-w-0 overflow-x-hidden pt-14 lg:mr-[280px] lg:pt-0">
        {children}
      </section>
    </>
  );
}

```

