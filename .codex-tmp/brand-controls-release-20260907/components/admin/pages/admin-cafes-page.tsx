"use client";

import { BrandDetailsDialog, BrandDialog, BrandFeatureControls } from "@/components/admin/brand-details-dialog";
import styles from "@/components/admin/brand-details.module.css";

import {
  Armchair,
  Building2,
  CalendarDays,
  Coffee,
  Dumbbell,
  Settings2,
  SlidersHorizontal,
  HeartPulse,
  Scissors,
  Search,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  Utensils,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "نشط" | "موقوف">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
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

  const categoryStats = countByCategory(cafes);

  const cafeCustomers = useMemo(
    () => (modalCafe ? customers.filter((c) => c.cafeId === modalCafe.id) : []),
    [customers, modalCafe],
  );

  const cafeOperations = useMemo(
    () =>
      modalCafe
        ? operations.filter((o) => o.cafeId === modalCafe.id).slice(0, 8)
        : [],
    [operations, modalCafe],
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
      setModalCafe(current => current?.id === id ? { ...current, status: nextActive ? "نشط" : "موقوف" } : current);
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

  function renderFeatureOverridesPanel(cafe: PlatformCafe) {
    const rows = getBrandFeatureRows(cafe, plans);
    const draft = getFeatureDraft(cafe, rows);
    const draftOverrides = draftToOverrides(draft);
    const effectiveRows = getEffectiveBrandFeatureAccess(
      getPlanIncludedFeatures(cafe.planId, plans),
      draftOverrides,
    );
    const hasDraft = Boolean(featureOverrideDrafts[cafe.id]);
    const saving = isFeatureOverridePending && savingFeatureOverridesCafeId === cafe.id;

    return <BrandFeatureControls rows={effectiveRows} draft={draft} saving={saving} dirty={hasDraft} change={(id, value) => updateFeatureOverrideDraft(cafe, effectiveRows, id, value)} save={() => saveFeatureOverrides(cafe, effectiveRows)} />;
  }

  return (
    <div className={styles.page}>
    <AdminPageShell
      title="العلامات التجارية"
      subtitle="إدارة جميع العلامات التجارية المسجلة وتفاصيلها التشغيلية والمالية والدعم والصيانة."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      {configError ? (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center font-semibold text-amber-200">
          {configError}
        </div>
      ) : null}

      <div className={styles.filters}>
        <button type="button" className={styles.filterToggle} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-label="البحث وتصفية العلامات" title="البحث وتصفية العلامات"><SlidersHorizontal aria-hidden="true" /></button>
      </div>
      {filtersOpen && <BrandDialog title="البحث وتصفية العلامات" close={() => setFiltersOpen(false)}>
      <div className={styles.panelBody}>
      <section className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#F6C35B]">
              تصنيفات العلامات التجارية
            </p>
            <h2 className="text-xl font-semibold text-[#F8F4EF]">
              حسب تصنيفات التسجيل
            </h2>
          </div>
          <span className="rounded-2xl bg-[#F6C35B]/15 px-4 py-2 text-sm font-semibold text-[#F6C35B]">
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
                  <span className="rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-[#F8F4EF]">
                    {category.count}
                  </span>
                </div>
                <p className="mt-3 font-semibold text-[#F8F4EF]">
                  {category.label}
                </p>
                <p className="mt-1 text-xs font-medium text-[#B7AEA2]">
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
            aria-label="البحث عن علامة تجارية"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العلامة، المالك، الجوال، رقم الصيانة..."
            className="pr-12"
          />
        </div>
        <AdminSelect
          aria-label="حالة العلامة"
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
          aria-label="تصنيف العلامة"
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
      <div className={styles.filterActions}>
        <button type="button" className={styles.textButton} onClick={() => { setQuery(""); setStatusFilter("all"); setCategoryFilter("all"); }}>مسح التصفية</button>
        <button type="button" className={styles.primaryButton} onClick={() => setFiltersOpen(false)}>عرض النتائج ({filtered.length})</button>
      </div>
      </div>
      </BrandDialog>}

      <BentoGrid className="mt-6">
        <BentoCard variant="dark" span="4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-[#F8F4EF]">
              جدول العلامات التجارية
            </h2>
            <span className="text-sm font-medium text-[#CBB29C]">
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
                    <th key={head} className="px-3 py-3 font-semibold">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((cafe) => (
                  <tr
                    key={cafe.id}
                    className="border-b border-white/5 text-[#F8F4EF] transition hover:bg-white/[0.04]"
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
                          <p className="font-semibold">{cafe.name}</p>
                          <p className="text-xs font-medium text-[#B7AEA2]">
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
                    <td className="px-3 py-4 text-[#CBB29C]">
                      {cafe.planName || resolvePlanName(plans, cafe.planId)}
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
                        className={styles.manageButton}
                        onClick={() => setModalCafe(cafe)}
                        aria-label={`إدارة ${cafe.name}`}
                        title={`إدارة ${cafe.name}`}
                        aria-haspopup="dialog"
                      >
                        <Settings2 aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-10 text-center font-medium text-[#B7AEA2]"
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

      {modalCafe && (
        <BrandDetailsDialog
          key={modalCafe.id}
          cafe={modalCafe}
          plans={plans}
          services={renderFeatureOverridesPanel(modalCafe)}
          activity={<div className="space-y-5">          <BentoCard variant="dark" span="2">
            <h3 className="mb-4 text-xl font-semibold text-[#F8F4EF]">
              آخر العمليات المرتبطة
            </h3>
            <div className="space-y-2">
              {cafeOperations.map((operation) => (
                <div
                  key={operation.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#F8F4EF]">
                      {operation.title}
                    </p>
                    <span className="text-xs font-medium text-[#CBB29C]">
                      {operation.createdAt}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-[#B7AEA2]">
                    {operation.type}{" "}
                    {operation.amount ? `• ${formatSar(operation.amount)}` : ""}
                  </p>
                </div>
              ))}
              {!cafeOperations.length ? (
                <p className="py-6 text-center font-medium text-[#B7AEA2]">
                  لا توجد عمليات حديثة
                </p>
              ) : null}
            </div>
          </BentoCard>

          <BentoCard variant="dark" span="2">
            <h3 className="mb-4 text-xl font-semibold text-[#F8F4EF]">
              عملاء العلامة
            </h3>
            <div className="space-y-2">
              {cafeCustomers.slice(0, 8).map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div>
                    <p className="font-semibold text-[#F8F4EF]">
                      {customer.fullName}
                    </p>
                    <p className="text-xs font-medium text-[#B7AEA2]">
                      {customer.phone}{" "}
                      {customer.email ? `• ${customer.email}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[#F6C35B]">
                    {formatSar(customer.totalSpent)}
                  </span>
                </div>
              ))}
              {!cafeCustomers.length ? (
                <p className="py-6 text-center font-medium text-[#B7AEA2]">
                  لا يوجد عملاء مسجلون
                </p>
              ) : null}
            </div>
          </BentoCard>
</div>}
          toggleStatus={() => toggleCafe(modalCafe.id)}
          planPending={isPlanUpdatePending && updatingPlanCafeId === modalCafe.id}
          updatePlan={updatePlan}
          close={() => setModalCafe(null)}
        />
      )}
    </AdminPageShell>
    </div>
  );
}
