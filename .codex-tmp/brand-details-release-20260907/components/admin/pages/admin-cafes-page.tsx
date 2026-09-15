"use client";

import { BrandDetailsDialog, BrandFeatureControls } from "@/components/admin/brand-details-dialog";
import { StandaloneMenuControl } from "@/components/admin/standalone-menu-control";

import {
  Armchair,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Coffee,
  Dumbbell,
  Eye,
  HeartPulse,
  Layers3,
  Scissors,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  Utensils,
} from "lucide-react";
import { useMemo, useState, useTransition, type ElementType } from "react";
import {
  saveCafeFeatureOverridesAction,
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
  StatusBadge,
} from "@/components/ui/design-system";
import { BUSINESS_CATEGORIES } from "@/lib/platform/business-categories";
import type {
  PlatformCafe,
  PlatformCustomer,
  PlatformOperation,
  PlatformPlan,
} from "@/lib/platform/admin-data";
import {
  type BrandFeatureOverride,
  type EffectiveBrandFeatureAccess,
  getBrandFeatureOverrides,
  getEffectiveBrandFeatureAccess,
  getPlanIncludedFeatures,
} from "@/lib/platform/feature-access";
import type { PlatformFeatureId } from "@/lib/platform/feature-registry";
import { formatSar } from "@/lib/format";

const iconMap = {
  Coffee,
  Utensils,
  Sparkles,
  Scissors,
  HeartPulse,
  Dumbbell,
  ShoppingBag,
  Shirt,
  Armchair,
  CalendarDays,
} as const;

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

type Props = {
  initialCafes: PlatformCafe[];
  initialPlans: PlatformPlan[];
  initialCustomers: PlatformCustomer[];
  initialOperations: PlatformOperation[];
  configError?: string;
};

function countByCategory(cafes: PlatformCafe[]) {
  return BUSINESS_CATEGORIES.map((category) => ({
    ...category,
    count: cafes.filter(
      (cafe) => (cafe.businessCategory ?? "cafes_coffee") === category.id,
    ).length,
  }));
}

function resolvePlanName(plans: PlatformPlan[], planId?: string | null) {
  if (!planId) return "بدون باقة";
  return plans.find((plan) => plan.id === planId)?.name ?? planId;
}

function StatBox({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <Icon className="mb-3 h-5 w-5 text-[#F6C35B]" />
      <p className="text-xs font-bold text-[#CBB29C]">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#F8F4EF]">{value}</p>
    </div>
  );
}

const featureCategoryLabels: Record<string, string> = {
  core: "أساسية",
  commerce: "تجارية",
  operations: "تشغيلية",
  growth: "نمو وتسويق",
  experience: "تجربة العملاء",
  settings: "إعدادات",
  finance: "مالية",
};

const overrideLabels = {
  default: "إعدادات الباقة",
  enabled: "مفعلة يدويًا",
  disabled: "مقفلة يدويًا",
} as const;

const effectiveResultLabels = {
  active: "فعالة",
  locked: "مقفلة",
  disabled_by_admin: "معطلة من الأدمن",
  coming_soon: "قريبًا",
} as const;

type FeatureOverrideChoice = EffectiveBrandFeatureAccess["override"];
type FeatureOverrideDraft = Record<string, FeatureOverrideChoice>;

function getBrandFeatureRows(cafe: PlatformCafe | null, plans: PlatformPlan[]) {
  if (!cafe) return [];
  const planFeatures = getPlanIncludedFeatures(cafe.planId, plans);
  return getEffectiveBrandFeatureAccess(planFeatures, getBrandFeatureOverrides(cafe));
}

function buildFeatureOverrideDraft(rows: EffectiveBrandFeatureAccess[]) {
  return Object.fromEntries(
    rows.map((row) => [row.feature.id, row.override])
  ) as FeatureOverrideDraft;
}

function draftToOverrides(draft: FeatureOverrideDraft): BrandFeatureOverride[] {
  return Object.entries(draft)
    .filter(([, override]) => override !== "default")
    .map(([featureId, override]) => ({
      featureId: featureId as PlatformFeatureId,
      enabled: override === "enabled",
    }));
}

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
  const [statusFilter, setStatusFilter] = useState<"all" | "نشط" | "موقوف">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCafes[0]?.id ?? null,
  );
  const [modalCafe, setModalCafe] = useState<PlatformCafe | null>(null);
  const [updatingPlanCafeId, setUpdatingPlanCafeId] = useState<string | null>(null);
  const [featureOverrideDrafts, setFeatureOverrideDrafts] = useState<Record<string, FeatureOverrideDraft>>({});
  const [savingFeatureOverridesCafeId, setSavingFeatureOverridesCafeId] = useState<string | null>(null);
  const [isPlanUpdatePending, startPlanUpdateTransition] = useTransition();
  const [isFeatureOverridePending, startFeatureOverrideTransition] = useTransition();

  const filtered = useMemo(() => {
    return cafes.filter((cafe) => {
      const q = query.trim();
      const matchesQuery =
        !q ||
        cafe.name.includes(q) ||
        cafe.ownerName.includes(q) ||
        cafe.ownerPhone.includes(q) ||
        cafe.ownerEmail.includes(q) ||
        cafe.slug.includes(q) ||
        String(cafe.maintenanceAccountNumber ?? "").includes(q);
      const matchesStatus =
        statusFilter === "all" || cafe.status === statusFilter;
      const matchesCategory =
        categoryFilter === "all" || cafe.businessCategory === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [cafes, query, statusFilter, categoryFilter]);

  const selected =
    cafes.find((c) => c.id === selectedId) ?? filtered[0] ?? null;
  const selectedFeatureRows = useMemo(
    () => getBrandFeatureRows(selected, plans),
    [plans, selected],
  );
  const selectedIncludedCount = selectedFeatureRows.filter((row) => row.planIncluded).length;
  const selectedManuallyEnabledCount = selectedFeatureRows.filter((row) => row.override === "enabled").length;
  const selectedManuallyDisabledCount = selectedFeatureRows.filter((row) => row.override === "disabled").length;
  const categoryStats = countByCategory(cafes);

  const cafeCustomers = useMemo(
    () => (selected ? customers.filter((c) => c.cafeId === selected.id) : []),
    [customers, selected],
  );

  const cafeOperations = useMemo(
    () =>
      selected
        ? operations.filter((o) => o.cafeId === selected.id).slice(0, 8)
        : [],
    [operations, selected],
  );

  async function toggleCafe(id: string) {
    const cafe = cafes.find((item) => item.id === id);
    if (!cafe) return;
    const nextActive = cafe.status !== "نشط";
    try {
      await updateCafeStatusAction(id, nextActive);
      setCafes((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: nextActive ? "نشط" : "موقوف" }
            : item,
        ),
      );
    } catch {
      alert("تعذر تحديث حالة العلامة التجارية");
    }
  }

  function updatePlan(id: string, planId: string) {
    if (!planId) {
      alert("اختر الباقة الجديدة أولًا");
      return;
    }

    const nextPlanName = resolvePlanName(plans, planId);
    const today = new Date().toISOString().slice(0, 10);

    setUpdatingPlanCafeId(id);
    startPlanUpdateTransition(() => {
      void (async () => {
        try {
          await updateCafePlanAction(id, planId);
          setCafes((prev) =>
            prev.map((cafe) =>
              cafe.id === id
                ? {
                    ...cafe,
                    planId,
                    planName: nextPlanName,
                    hasActivePlan: true,
                    planStartedAt: today,
                    planExpiresAt: undefined,
                    planRemainingDays: null,
                  }
                : cafe,
            ),
          );
          setModalCafe((current) =>
            current?.id === id
              ? {
                  ...current,
                  planId,
                  planName: nextPlanName,
                  hasActivePlan: true,
                  planStartedAt: today,
                  planExpiresAt: undefined,
                  planRemainingDays: null,
                }
              : current,
          );
        } catch (error) {
          console.error("[AdminCafesPage:updatePlan]", error);
          alert("تعذر تحديث الباقة الحالية للعلامة التجارية");
        } finally {
          setUpdatingPlanCafeId(null);
        }
      })();
    });
  }

  function getFeatureDraft(cafe: PlatformCafe, rows: EffectiveBrandFeatureAccess[]) {
    return featureOverrideDrafts[cafe.id] ?? buildFeatureOverrideDraft(rows);
  }

  function updateFeatureOverrideDraft(
    cafe: PlatformCafe,
    rows: EffectiveBrandFeatureAccess[],
    featureId: PlatformFeatureId,
    override: FeatureOverrideChoice,
  ) {
    const baseDraft = getFeatureDraft(cafe, rows);
    setFeatureOverrideDrafts((prev) => ({
      ...prev,
      [cafe.id]: {
        ...baseDraft,
        [featureId]: override,
      },
    }));
  }

  function saveFeatureOverrides(cafe: PlatformCafe, rows: EffectiveBrandFeatureAccess[]) {
    const draft = getFeatureDraft(cafe, rows);
    const payload = rows.map((row) => ({
      featureId: row.feature.id,
      override: draft[row.feature.id] ?? row.override,
    }));

    setSavingFeatureOverridesCafeId(cafe.id);
    startFeatureOverrideTransition(() => {
      void (async () => {
        try {
          const saved = await saveCafeFeatureOverridesAction(cafe.id, payload);
          setCafes((prev) =>
            prev.map((item) =>
              item.id === cafe.id ? { ...item, featureOverrides: saved } : item,
            ),
          );
          setModalCafe((current) =>
            current?.id === cafe.id ? { ...current, featureOverrides: saved } : current,
          );
          setFeatureOverrideDrafts((prev) => {
            const next = { ...prev };
            delete next[cafe.id];
            return next;
          });
        } catch (error) {
          console.error("[AdminCafesPage:saveFeatureOverrides]", error);
          alert("تعذر حفظ تحكم خدمات العلامة");
        } finally {
          setSavingFeatureOverridesCafeId(null);
        }
      })();
    });
  }

  function renderFeatureOverridesPanel(cafe: PlatformCafe, compact = false) {
    const rows = getBrandFeatureRows(cafe, plans);
    const draft = getFeatureDraft(cafe, rows);
    const draftOverrides = draftToOverrides(draft);
    const effectiveRows = getEffectiveBrandFeatureAccess(
      getPlanIncludedFeatures(cafe.planId, plans),
      draftOverrides,
    );
    const includedCount = effectiveRows.filter((row) => row.planIncluded).length;
    const manuallyEnabledCount = Object.values(draft).filter((item) => item === "enabled").length;
    const manuallyDisabledCount = Object.values(draft).filter((item) => item === "disabled").length;
    const hasDraft = Boolean(featureOverrideDrafts[cafe.id]);
    const saving = isFeatureOverridePending && savingFeatureOverridesCafeId === cafe.id;

    if (compact) return <BrandFeatureControls rows={effectiveRows} draft={draft} saving={saving} dirty={hasDraft} change={(id, value) => updateFeatureOverrideDraft(cafe, effectiveRows, id, value)} save={() => saveFeatureOverrides(cafe, effectiveRows)} />;

    return (
      <div className={softPanel}>
        <StandaloneMenuControl key={cafe.id} cafeId={cafe.id} slug={cafe.slug} />
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-[#F8F4EF]">التحكم في خدمات العلامة</h3>
            <p className="mt-1 text-sm font-bold text-[#CBB29C]">
              الباقة الحالية: {cafe.planName || resolvePlanName(plans, cafe.planId)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-black sm:grid-cols-4">
            <span className="rounded-xl bg-white/5 px-3 py-2 text-[#F8F4EF]">مشمولة: {includedCount}</span>
            <span className="rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-300">مفعلة يدويًا: {manuallyEnabledCount}</span>
            <span className="rounded-xl bg-red-500/10 px-3 py-2 text-red-300">مقفلة يدويًا: {manuallyDisabledCount}</span>
            <span className="rounded-xl bg-[#F6C35B]/10 px-3 py-2 text-[#F6C35B]">النتيجة: {effectiveRows.filter((row) => row.effectiveEnabled).length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full text-right text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[#CBB29C]">
                <th className="px-3 py-3 font-black">الخدمة</th>
                <th className="px-3 py-3 font-black">التصنيف</th>
                <th className="px-3 py-3 font-black">ضمن الباقة</th>
                <th className="px-3 py-3 font-black">التجاوز</th>
                <th className="px-3 py-3 font-black">الحالة الفعلية</th>
                <th className="px-3 py-3 font-black">تحكم الأدمن</th>
              </tr>
            </thead>
            <tbody>
              {effectiveRows.map((row) => {
                const selectedOverride = draft[row.feature.id] ?? row.override;
                const cannotManuallyEnable = row.feature.status === "hidden";
                return (
                  <tr key={row.feature.id} className="border-b border-white/5 text-[#F8F4EF]">
                    <td className="px-3 py-3">
                      <p className="font-black">{row.feature.titleAr}</p>
                      <p className="mt-1 text-xs font-bold text-[#CBB29C]">{row.feature.descriptionAr}</p>
                      <p className="mt-1 font-mono text-xs text-[#7A6255]">{row.feature.route || "بدون صفحة حاليًا"}</p>
                    </td>
                    <td className="px-3 py-3 text-[#CBB29C]">{featureCategoryLabels[row.feature.category] ?? row.feature.category}</td>
                    <td className="px-3 py-3">{row.planIncluded ? "نعم" : "لا"}</td>
                    <td className="px-3 py-3">{overrideLabels[selectedOverride]}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-xl px-3 py-1 text-xs font-black ${
                        row.result === "active"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : row.result === "disabled_by_admin"
                            ? "bg-red-500/10 text-red-300"
                            : "bg-white/5 text-[#CBB29C]"
                      }`}>
                        {effectiveResultLabels[row.result]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <AdminSelect
                        value={selectedOverride}
                        disabled={saving}
                        onChange={(event) =>
                          updateFeatureOverrideDraft(
                            cafe,
                            effectiveRows,
                            row.feature.id,
                            event.target.value as FeatureOverrideChoice,
                          )
                        }
                        className="h-11 min-w-[190px] text-xs"
                      >
                        <option value="default">حسب الباقة</option>
                        <option value="enabled" disabled={cannotManuallyEnable}>
                          مفعلة يدويًا
                        </option>
                        <option value="disabled">مقفلة يدويًا</option>
                      </AdminSelect>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold text-[#CBB29C]">
            الاستثناء يطبق على هذه العلامة فقط ولا يغير إعدادات الباقة.
          </p>
          <button
            type="button"
            onClick={() => saveFeatureOverrides(cafe, effectiveRows)}
            disabled={saving || !hasDraft}
            className="rounded-2xl bg-[#F6C35B] px-5 py-3 text-sm font-black text-[#241610] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "جاري الحفظ" : "حفظ تحكم الخدمات"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminPageShell
      title="العلامات التجارية"
      subtitle="إدارة جميع العلامات التجارية المسجلة وتفاصيلها التشغيلية والمالية والدعم والصيانة."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      {configError ? (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center font-black text-amber-200">
          {configError}
        </div>
      ) : null}

      <section className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-[#F6C35B]">
              تصنيفات العلامات التجارية
            </p>
            <h2 className="text-xl font-black text-[#F8F4EF]">
              حسب تصنيفات التسجيل
            </h2>
          </div>
          <span className="rounded-2xl bg-[#F6C35B]/15 px-4 py-2 text-sm font-black text-[#F6C35B]">
            {cafes.length} علامة
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {categoryStats.map((category) => {
            const Icon =
              iconMap[category.icon as keyof typeof iconMap] ?? Store;
            const active = categoryFilter === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryFilter(active ? "all" : category.id)}
                className={`rounded-2xl border p-4 text-right transition ${
                  active
                    ? "border-[#F6C35B]/60 bg-[#F6C35B]/15"
                    : "border-white/10 bg-[#0f0c0a]/50 hover:border-[#F6C35B]/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <Icon className="h-6 w-6 text-[#F6C35B]" />
                  <span className="rounded-xl bg-white/10 px-3 py-1 text-xs font-black text-[#F8F4EF]">
                    {category.count}
                  </span>
                </div>
                <p className="mt-3 font-black text-[#F8F4EF]">
                  {category.label}
                </p>
                <p className="mt-1 text-xs font-bold text-[#7A6255]">
                  {category.available ? "متاح حاليًا" : "قريبًا"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <AdminFilterBar>
        <div className="relative min-w-0 w-full flex-1 sm:min-w-[240px]">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
          <AdminInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العلامة، المالك، الجوال، رقم الصيانة..."
            className="pr-12"
          />
        </div>
        <AdminSelect
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | "نشط" | "موقوف")
          }
          className="max-w-xs"
        >
          <option value="all">كل الحالات</option>
          <option value="نشط">نشط فقط</option>
          <option value="موقوف">موقوف فقط</option>
        </AdminSelect>
        <AdminSelect
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="max-w-xs"
        >
          <option value="all">كل التصنيفات</option>
          {BUSINESS_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </AdminSelect>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AdminStatPill label="العلامات" value={cafes.length} />
          <AdminStatPill
            label="النشطة"
            value={cafes.filter((c) => c.status === "نشط").length}
          />
          <AdminStatPill
            label="اشتراكات فعالة"
            value={cafes.filter((c) => c.hasActivePlan).length}
          />
          <AdminStatPill
            label="إيراد الطلبات"
            value={formatSar(cafes.reduce((s, c) => s + c.totalRevenue, 0))}
          />
        </div>
      </AdminFilterBar>

      <BentoGrid className="mt-6">
        <BentoCard variant="dark" span="4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black text-[#F8F4EF]">
              جدول العلامات التجارية
            </h2>
            <span className="text-sm font-bold text-[#CBB29C]">
              {filtered.length} نتيجة
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-right text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[#CBB29C]">
                  {[
                    "العلامة",
                    "التصنيف",
                    "رقم الصيانة",
                    "الباقة",
                    "المنتجات",
                    "العروض",
                    "التوثيقات",
                    "المكافآت",
                    "الدعم",
                    "الحالة",
                    "تفاصيل",
                  ].map((head) => (
                    <th key={head} className="px-3 py-3 font-black">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((cafe) => (
                  <tr
                    key={cafe.id}
                    onClick={() => {
                      setSelectedId(cafe.id);
                      setModalCafe(cafe);
                    }}
                    className="cursor-pointer border-b border-white/5 text-[#F8F4EF] transition hover:bg-white/[0.04]"
                  >
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-3">
                        {cafe.logoUrl ? (
                          <img
                            src={cafe.logoUrl}
                            alt={cafe.name}
                            className="h-11 w-11 rounded-2xl object-contain bg-white"
                          />
                        ) : (
                          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F6C35B]/15">
                            <Building2 className="h-5 w-5 text-[#F6C35B]" />
                          </span>
                        )}
                        <div>
                          <p className="font-black">{cafe.name}</p>
                          <p className="text-xs font-bold text-[#7A6255]">
                            /{cafe.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[#CBB29C]">
                      {cafe.businessCategoryLabel}
                    </td>
                    <td className="px-3 py-4 font-mono text-xs">
                      {cafe.maintenanceAccountNumber}
                    </td>
                    <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}>
                      <div className="min-w-[220px] space-y-2">
                        <AdminSelect
                          value={cafe.planId || ""}
                          disabled={isPlanUpdatePending && updatingPlanCafeId === cafe.id}
                          onChange={(event) => updatePlan(cafe.id, event.target.value)}
                          className="h-11 text-xs"
                        >
                          <option value="" disabled>
                            اختر الباقة الحالية
                          </option>
                          {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name}
                            </option>
                          ))}
                        </AdminSelect>
                        <p className="text-xs font-bold text-[#7A6255]">
                          الحالية: {cafe.planName || resolvePlanName(plans, cafe.planId)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-4">{cafe.productsCount ?? 0}</td>
                    <td className="px-3 py-4">{cafe.offersCount ?? 0}</td>
                    <td className="px-3 py-4">
                      {cafe.experienceSubmissionsCount ?? 0}
                    </td>
                    <td className="px-3 py-4">
                      {cafe.experienceRewardsCount ?? 0}
                    </td>
                    <td className="px-3 py-4">
                      {cafe.supportTicketsCount ?? 0}
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge
                        tone={cafe.status === "نشط" ? "success" : "danger"}
                      >
                        {cafe.status}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl bg-[#F6C35B]/15 px-3 py-2 font-black text-[#F6C35B]"
                      >
                        <Eye className="h-4 w-4" /> عرض
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-10 text-center font-bold text-[#7A6255]"
                    >
                      لا توجد علامات تجارية مطابقة
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </BentoCard>
      </BentoGrid>

      {selected ? (
        <BentoGrid className="mt-6">
          <BentoCard variant="dark" span="4">
            {renderFeatureOverridesPanel(selected)}
            {false ? (
              <>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-[#F8F4EF]">صلاحيات وخدمات العلامة</h3>
                <p className="mt-1 text-sm font-bold text-[#CBB29C]">
                  الباقة الحالية: {selected.planName || resolvePlanName(plans, selected.planId)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-black sm:grid-cols-4">
                <span className="rounded-xl bg-white/5 px-3 py-2 text-[#F8F4EF]">مشمولة: {selectedIncludedCount}</span>
                <span className="rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-300">مفعلة يدويًا: {selectedManuallyEnabledCount}</span>
                <span className="rounded-xl bg-red-500/10 px-3 py-2 text-red-300">مقفلة يدويًا: {selectedManuallyDisabledCount}</span>
                <span className="rounded-xl bg-[#F6C35B]/10 px-3 py-2 text-[#F6C35B]">النتيجة: {selectedFeatureRows.filter((row) => row.effectiveEnabled).length}</span>
              </div>
            </div>
            <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm font-bold text-amber-100">
              التحكم اليدوي لكل علامة ظاهر كمعاينة فقط لأن قاعدة البيانات الحالية لا تحتوي دعمًا محفوظًا لتجاوزات الخدمات لكل علامة.
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1040px] w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[#CBB29C]">
                    <th className="px-3 py-3 font-black">الخدمة</th>
                    <th className="px-3 py-3 font-black">التصنيف</th>
                    <th className="px-3 py-3 font-black">ضمن الباقة</th>
                    <th className="px-3 py-3 font-black">التجاوز</th>
                    <th className="px-3 py-3 font-black">النتيجة النهائية</th>
                    <th className="px-3 py-3 font-black">تحكم الأدمن</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFeatureRows.map((row) => (
                    <tr key={row.feature.id} className="border-b border-white/5 text-[#F8F4EF]">
                      <td className="px-3 py-3">
                        <p className="font-black">{row.feature.titleAr}</p>
                        <p className="mt-1 font-mono text-xs text-[#7A6255]">{row.feature.route}</p>
                      </td>
                      <td className="px-3 py-3 text-[#CBB29C]">{featureCategoryLabels[row.feature.category] ?? row.feature.category}</td>
                      <td className="px-3 py-3">{row.planIncluded ? "نعم" : "لا"}</td>
                      <td className="px-3 py-3">{overrideLabels[row.override]}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-xl px-3 py-1 text-xs font-black ${
                          row.result === "active"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : row.result === "disabled_by_admin"
                              ? "bg-red-500/10 text-red-300"
                              : "bg-white/5 text-[#CBB29C]"
                        }`}>
                          {effectiveResultLabels[row.result]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-[#7A6255] disabled:cursor-not-allowed">
                            تفعيل لهذه العلامة
                          </button>
                          <button type="button" disabled className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-[#7A6255] disabled:cursor-not-allowed">
                            إيقاف لهذه العلامة
                          </button>
                          <button type="button" disabled className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-[#7A6255] disabled:cursor-not-allowed">
                            العودة لإعدادات الباقة
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            ) : null}
          </BentoCard>

          <BentoCard variant="dark" span="2">
            <h3 className="mb-4 text-xl font-black text-[#F8F4EF]">
              التحكم بالباقة والحالة
            </h3>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <p className="text-xs font-black text-[#CBB29C]">
                  تغيير الباقة الحالية للعلامة التجارية
                </p>
                <AdminSelect
                  value={selected.planId || ""}
                  disabled={isPlanUpdatePending && updatingPlanCafeId === selected.id}
                  onChange={(e) => updatePlan(selected.id, e.target.value)}
                >
                  <option value="" disabled>اختر الباقة الجديدة</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </AdminSelect>
                <p className="text-xs font-bold text-[#7A6255]">
                  الحالية الآن: {selected.planName || resolvePlanName(plans, selected.planId)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleCafe(selected.id)}
                className="rounded-2xl bg-[#F6C35B] px-5 py-3 font-black text-[#241610]"
              >
                {selected.status === "نشط" ? "إيقاف العلامة" : "تفعيل العلامة"}
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatBox
                icon={Layers3}
                label="عدد الاشتراكات"
                value={selected.subscriptionsCount ?? 0}
              />
              <StatBox
                icon={CircleDollarSign}
                label="عدد التجديدات"
                value={selected.renewalsCount ?? 0}
              />
              <StatBox
                icon={ShieldCheck}
                label="لها باقة؟"
                value={selected.hasActivePlan ? "نعم" : "لا"}
              />
            </div>
          </BentoCard>

          <BentoCard variant="dark" span="2">
            <h3 className="mb-4 text-xl font-black text-[#F8F4EF]">
              آخر العمليات المرتبطة
            </h3>
            <div className="space-y-2">
              {cafeOperations.map((operation) => (
                <div
                  key={operation.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-[#F8F4EF]">
                      {operation.title}
                    </p>
                    <span className="text-xs font-bold text-[#CBB29C]">
                      {operation.createdAt}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[#7A6255]">
                    {operation.type}{" "}
                    {operation.amount ? `• ${formatSar(operation.amount)}` : ""}
                  </p>
                </div>
              ))}
              {!cafeOperations.length ? (
                <p className="py-6 text-center font-bold text-[#7A6255]">
                  لا توجد عمليات حديثة
                </p>
              ) : null}
            </div>
          </BentoCard>

          <BentoCard variant="dark" span="2">
            <h3 className="mb-4 text-xl font-black text-[#F8F4EF]">
              عملاء العلامة
            </h3>
            <div className="space-y-2">
              {cafeCustomers.slice(0, 8).map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div>
                    <p className="font-black text-[#F8F4EF]">
                      {customer.fullName}
                    </p>
                    <p className="text-xs font-bold text-[#7A6255]">
                      {customer.phone}{" "}
                      {customer.email ? `• ${customer.email}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-black text-[#F6C35B]">
                    {formatSar(customer.totalSpent)}
                  </span>
                </div>
              ))}
              {!cafeCustomers.length ? (
                <p className="py-6 text-center font-bold text-[#7A6255]">
                  لا يوجد عملاء مسجلون
                </p>
              ) : null}
            </div>
          </BentoCard>
        </BentoGrid>
      ) : null}

      {modalCafe && (
        <BrandDetailsDialog
          key={modalCafe.id}
          cafe={modalCafe}
          plans={plans}
          services={renderFeatureOverridesPanel(modalCafe, true)}
          planPending={isPlanUpdatePending && updatingPlanCafeId === modalCafe.id}
          updatePlan={updatePlan}
          close={() => setModalCafe(null)}
        />
      )}
    </AdminPageShell>
  );
}
