"use client";

import Link from "next/link";
import {
  Armchair,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Coffee,
  Copy,
  Dumbbell,
  ExternalLink,
  Eye,
  Gift,
  Globe,
  HeartPulse,
  KeyRound,
  Layers3,
  MessageSquareText,
  Package,
  Power,
  Scissors,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  TicketCheck,
  Utensils,
  Users,
  X,
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
  GoldButton,
  StatusBadge,
} from "@/components/ui/design-system";
import {
  getCafeDisplayDomain,
  getCafePublicUrl,
  resolveCafeDomainSource,
} from "@/lib/platform/cafe-domain";
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

function info(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "غير متوفر";
  return String(value);
}

function resolvePlanName(plans: PlatformPlan[], planId?: string | null) {
  if (!planId) return "بدون باقة";
  return plans.find((plan) => plan.id === planId)?.name ?? planId;
}

function copy(text?: string | null) {
  if (!text) return;
  void navigator.clipboard?.writeText(text);
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

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-3 last:border-b-0">
      <span className="text-sm font-bold text-[#CBB29C]">{label}</span>
      <span className="max-w-full break-words text-left text-sm font-black text-[#F8F4EF]">
        {info(value)}
      </span>
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
          alert("طھط¹ط°ط± ط­ظپط¸ طھط­ظƒظ… ط®ط¯ظ…ط§طھ ط§ظ„ط¹ظ„ط§ظ…ط©");
        } finally {
          setSavingFeatureOverridesCafeId(null);
        }
      })();
    });
  }

  function renderFeatureOverridesPanel(cafe: PlatformCafe) {
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

    return (
      <div className={softPanel}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-[#F8F4EF]">ط§ظ„طھط­ظƒظ… ظپظٹ ط®ط¯ظ…ط§طھ ط§ظ„ط¹ظ„ط§ظ…ط©</h3>
            <p className="mt-1 text-sm font-bold text-[#CBB29C]">
              ط§ظ„ط¨ط§ظ‚ط© ط§ظ„ط­ط§ظ„ظٹط©: {cafe.planName || resolvePlanName(plans, cafe.planId)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-black sm:grid-cols-4">
            <span className="rounded-xl bg-white/5 px-3 py-2 text-[#F8F4EF]">ظ…ط´ظ…ظˆظ„ط©: {includedCount}</span>
            <span className="rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-300">ظ…ظپط¹ظ„ط© ظٹط¯ظˆظٹظ‹ط§: {manuallyEnabledCount}</span>
            <span className="rounded-xl bg-red-500/10 px-3 py-2 text-red-300">ظ…ظ‚ظپظ„ط© ظٹط¯ظˆظٹظ‹ط§: {manuallyDisabledCount}</span>
            <span className="rounded-xl bg-[#F6C35B]/10 px-3 py-2 text-[#F6C35B]">ط§ظ„ظ†طھظٹط¬ط©: {effectiveRows.filter((row) => row.effectiveEnabled).length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full text-right text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[#CBB29C]">
                <th className="px-3 py-3 font-black">ط§ظ„ط®ط¯ظ…ط©</th>
                <th className="px-3 py-3 font-black">ط§ظ„طھطµظ†ظٹظپ</th>
                <th className="px-3 py-3 font-black">ط¶ظ…ظ† ط§ظ„ط¨ط§ظ‚ط©</th>
                <th className="px-3 py-3 font-black">ط§ظ„طھط¬ط§ظˆط²</th>
                <th className="px-3 py-3 font-black">ط§ظ„ط­ط§ظ„ط© ط§ظ„ظپط¹ظ„ظٹط©</th>
                <th className="px-3 py-3 font-black">طھط­ظƒظ… ط§ظ„ط£ط¯ظ…ظ†</th>
              </tr>
            </thead>
            <tbody>
              {effectiveRows.map((row) => {
                const selectedOverride = draft[row.feature.id] ?? row.override;
                const cannotManuallyEnable = row.feature.status === "coming_soon" || row.feature.status === "hidden";
                return (
                  <tr key={row.feature.id} className="border-b border-white/5 text-[#F8F4EF]">
                    <td className="px-3 py-3">
                      <p className="font-black">{row.feature.titleAr}</p>
                      <p className="mt-1 text-xs font-bold text-[#CBB29C]">{row.feature.descriptionAr}</p>
                      <p className="mt-1 font-mono text-xs text-[#7A6255]">{row.feature.route}</p>
                    </td>
                    <td className="px-3 py-3 text-[#CBB29C]">{featureCategoryLabels[row.feature.category] ?? row.feature.category}</td>
                    <td className="px-3 py-3">{row.planIncluded ? "ظ†ط¹ظ…" : "ظ„ط§"}</td>
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
                        <option value="default">ط­ط³ط¨ ط§ظ„ط¨ط§ظ‚ط©</option>
                        <option value="enabled" disabled={cannotManuallyEnable}>
                          ظ…ظپط¹ظ„ط© ظٹط¯ظˆظٹظ‹ط§
                        </option>
                        <option value="disabled">ظ…ظ‚ظپظ„ط© ظٹط¯ظˆظٹظ‹ط§</option>
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
            ط§ظ„ط§ط³طھط«ظ†ط§ط، ظٹط·ط¨ظ‚ ط¹ظ„ظ‰ ظ‡ط°ظ‡ ط§ظ„ط¹ظ„ط§ظ…ط© ظپظ‚ط· ظˆظ„ط§ ظٹط؛ظٹط± ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¨ط§ظ‚ط©.
          </p>
          <button
            type="button"
            onClick={() => saveFeatureOverrides(cafe, effectiveRows)}
            disabled={saving || !hasDraft}
            className="rounded-2xl bg-[#F6C35B] px-5 py-3 text-sm font-black text-[#241610] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "ط¬ط§ط±ظٹ ط§ظ„ط­ظپط¸" : "ط­ظپط¸ طھط­ظƒظ… ط§ظ„ط®ط¯ظ…ط§طھ"}
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

      {modalCafe ? (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setModalCafe(null)}
        >
          <div
            className="mx-auto my-8 max-w-6xl rounded-[32px] border border-white/10 bg-[#15100d] p-5 text-[#F8F4EF] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {modalCafe.logoUrl ? (
                  <img
                    src={modalCafe.logoUrl}
                    alt={modalCafe.name}
                    className="h-20 w-20 rounded-3xl bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F6C35B]/15">
                    <Building2 className="h-9 w-9 text-[#F6C35B]" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-black text-[#F6C35B]">
                    {modalCafe.businessCategoryLabel}
                  </p>
                  <h2 className="text-3xl font-black">{modalCafe.name}</h2>
                  <p className="mt-1 font-mono text-sm text-[#CBB29C]">
                    {modalCafe.maintenanceAccountNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalCafe(null)}
                className="rounded-2xl bg-white/10 p-3"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <StatBox
                icon={Package}
                label="عدد المنتجات"
                value={modalCafe.productsCount ?? 0}
              />
              <StatBox
                icon={Gift}
                label="كل العروض"
                value={modalCafe.offersCount ?? 0}
              />
              <StatBox
                icon={MessageSquareText}
                label="كل التوثيقات"
                value={modalCafe.experienceSubmissionsCount ?? 0}
              />
              <StatBox
                icon={TicketCheck}
                label="كل المكافآت"
                value={modalCafe.experienceRewardsCount ?? 0}
              />
              <StatBox
                icon={Users}
                label="العملاء"
                value={modalCafe.customersCount ?? 0}
              />
              <StatBox
                icon={ShoppingBag}
                label="الطلبات"
                value={modalCafe.totalOrders}
              />
              <StatBox
                icon={CalendarDays}
                label="الحجوزات"
                value={modalCafe.reservationsCount ?? 0}
              />
              <StatBox
                icon={CircleDollarSign}
                label="إيراد الطلبات"
                value={formatSar(modalCafe.totalRevenue)}
              />
            </div>

            <div className="mt-5">
              {renderFeatureOverridesPanel(modalCafe)}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className={softPanel}>
                <h3 className="mb-3 text-lg font-black text-[#F6C35B]">
                  بيانات العلامة والحساب
                </h3>
                <DetailRow label="اسم العلامة" value={modalCafe.name} />
                <DetailRow label="الرابط المختصر" value={modalCafe.slug} />
                <DetailRow
                  label="رقم حساب الصيانة"
                  value={modalCafe.maintenanceAccountNumber}
                />
                <DetailRow label="اسم المالك" value={modalCafe.ownerName} />
                <DetailRow label="إيميل المالك" value={modalCafe.ownerEmail} />
                <DetailRow
                  label="إيميل الدخول"
                  value={modalCafe.ownerLoginEmail}
                />
                <DetailRow
                  label="كلمة المرور"
                  value={modalCafe.passwordAccessNote}
                />
                <DetailRow label="جوال المالك" value={modalCafe.ownerPhone} />
                <DetailRow label="تاريخ الانضمام" value={modalCafe.createdAt} />
              </div>

              <div className={softPanel}>
                <h3 className="mb-3 text-lg font-black text-[#F6C35B]">
                  الدومين والروابط
                </h3>
                <DetailRow
                  label="رابط العلامة"
                  value={getCafePublicUrl(modalCafe.slug, {
                    settings: {
                      customDomain: modalCafe.customDomain,
                      domainStatus: modalCafe.customDomainStatus || "غير مربوط",
                      purchasedDomain: modalCafe.purchasedDomain,
                      purchasedDomainStatus:
                        modalCafe.purchasedDomainStatus || "غير مربوط",
                    },
                  })}
                />
                <DetailRow
                  label="مصدر الدومين"
                  value={getCafeDisplayDomain(modalCafe.slug, {
                    customDomain: modalCafe.customDomain,
                    domainStatus: modalCafe.customDomainStatus || "غير مربوط",
                    purchasedDomain: modalCafe.purchasedDomain,
                    purchasedDomainStatus:
                      modalCafe.purchasedDomainStatus || "غير مربوط",
                  })}
                />
                <DetailRow label="دومين مخصص" value={modalCafe.customDomain} />
                <DetailRow
                  label="حالة الدومين المخصص"
                  value={modalCafe.customDomainStatus}
                />
                <DetailRow
                  label="دومين مشتراة"
                  value={modalCafe.purchasedDomain}
                />
                <DetailRow
                  label="حالة الدومين المشتراة"
                  value={modalCafe.purchasedDomainStatus}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={getCafePublicUrl(modalCafe.slug, {
                      settings: {
                        customDomain: modalCafe.customDomain,
                        domainStatus:
                          modalCafe.customDomainStatus || "غير مربوط",
                        purchasedDomain: modalCafe.purchasedDomain,
                        purchasedDomainStatus:
                          modalCafe.purchasedDomainStatus || "غير مربوط",
                      },
                    })}
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#F6C35B] px-4 py-3 font-black text-[#241610]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    فتح العلامة
                  </Link>
                  <button
                    type="button"
                    onClick={() => copy(modalCafe.maintenanceAccountNumber)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 font-black"
                  >
                    <Copy className="h-4 w-4" />
                    نسخ رقم الصيانة
                  </button>
                </div>
              </div>

              <div className={softPanel}>
                <h3 className="mb-3 text-lg font-black text-[#F6C35B]">
                  الباقة والاشتراكات
                </h3>
                <DetailRow
                  label="هل لديها باقة؟"
                  value={modalCafe.hasActivePlan ? "نعم" : "لا"}
                />
                <DetailRow
                  label="الباقة الحالية"
                  value={modalCafe.planName || resolvePlanName(plans, modalCafe.planId)}
                />
                <div className="mt-4 rounded-2xl border border-[#F6C35B]/20 bg-[#F6C35B]/10 p-4">
                  <p className="mb-2 text-xs font-black text-[#F6C35B]">
                    تغيير الباقة الحالية مباشرة من الأدمن
                  </p>
                  <AdminSelect
                    value={modalCafe.planId || ""}
                    disabled={isPlanUpdatePending && updatingPlanCafeId === modalCafe.id}
                    onChange={(event) => updatePlan(modalCafe.id, event.target.value)}
                  >
                    <option value="" disabled>اختر الباقة الجديدة</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </AdminSelect>
                  <p className="mt-2 text-xs font-bold text-[#CBB29C]">
                    عند تغيير الباقة يتم تعطيل الاشتراك الحالي وإنشاء اشتراك إداري جديد للعلامة.
                  </p>
                </div>
                <DetailRow
                  label="تاريخ بداية الباقة"
                  value={modalCafe.planStartedAt}
                />
                <DetailRow
                  label="تاريخ نهاية الباقة"
                  value={modalCafe.planExpiresAt}
                />
                <DetailRow
                  label="المتبقي في الباقة"
                  value={
                    modalCafe.planRemainingDays == null
                      ? "غير محدد"
                      : `${modalCafe.planRemainingDays} يوم`
                  }
                />
                <DetailRow
                  label="عدد الاشتراكات"
                  value={modalCafe.subscriptionsCount ?? 0}
                />
                <DetailRow
                  label="عدد التجديدات"
                  value={modalCafe.renewalsCount ?? 0}
                />
              </div>

              <div className={softPanel}>
                <h3 className="mb-3 text-lg font-black text-[#F6C35B]">
                  الدعم والصيانة
                </h3>
                <DetailRow
                  label="تذاكر الدعم"
                  value={modalCafe.supportTicketsCount ?? 0}
                />
                <DetailRow
                  label="رقم حساب العلامة للصيانة"
                  value={modalCafe.maintenanceAccountNumber}
                />
                <DetailRow label="الرقم الضريبي" value={modalCafe.taxNumber} />
                <DetailRow
                  label="السجل التجاري"
                  value={modalCafe.commercialRegister}
                />
                <DetailRow label="معروف" value={modalCafe.maroofCertificate} />
                <DetailRow label="واتساب" value={modalCafe.whatsapp} />
                <DetailRow label="انستجرام" value={modalCafe.instagram} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
