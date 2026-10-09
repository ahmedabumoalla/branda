"use client";

import { BrandDetailsDialog, BrandDialog, BrandFeatureControls } from "@/components/admin/brand-details-dialog";
import styles from "@/components/admin/brand-details.module.css";

import {
  Building2,
  Settings2,
  SlidersHorizontal,
  Search,
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

type Props = {
  initialCafes: PlatformCafe[];
  initialPlans: PlatformPlan[];
  initialCustomers: PlatformCustomer[];
  initialOperations: PlatformOperation[];
  configError?: string;
};

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
      return matchesQuery && matchesStatus;
    });
  }, [cafes, query, statusFilter]);


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

    setUpdatingPlanCafeId(id);
    startPlanUpdateTransition(() => {
      void (async () => {
        try {
          const subscription = await updateCafePlanAction(id, planId);
          setCafes((prev) =>
            prev.map((cafe) =>
              cafe.id === id
                ? {
                    ...cafe,
                    ...subscription,
                  }
                : cafe,
            ),
          );
          setModalCafe((current) =>
            current?.id === id
              ? {
                  ...current,
                  ...subscription,
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
      subtitle="إدارة جميع العلامات التجارية المسجلة وتفاصيلها التشغيلية والمالية والدعم والصيانة"
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


      <AdminFilterBar>
        <div className="relative min-w-0 w-full flex-1 sm:min-w-[240px]">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
          <AdminInput
            aria-label="البحث عن علامة تجارية"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العلامة، المالك، الجوال، رقم الصيانة"
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
        <button type="button" className={styles.textButton} onClick={() => { setQuery(""); setStatusFilter("all"); }}>مسح التصفية</button>
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
                    "رقم الصيانة",
                    "الباقة",
                    "المنتجات",
                    "العروض",
                    "التوثيقات",
                    "المكافآت",
                    "الدعم",
                    "حالة العلامة",
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

                    <td className="px-3 py-4 font-mono text-xs">
                      {cafe.maintenanceAccountNumber}
                    </td>
                    <td className="px-3 py-4 text-[#CBB29C]">
                      <p>{cafe.planName || resolvePlanName(plans, cafe.planId)}</p>
                      <div className="mt-2"><StatusBadge tone={cafe.hasActivePlan ? "success" : "danger"}>{cafe.planId ? `الاشتراك ${cafe.subscriptionStatus ?? (cafe.hasActivePlan ? "فعال" : "غير فعال")}` : "بدون اشتراك"}</StatusBadge></div>
                      <p className="mt-1.5 whitespace-nowrap text-xs text-[#B7AEA2]">{cafe.planExpiresAt && Number.isFinite(Date.parse(cafe.planExpiresAt)) ? `تاريخ الانتهاء: ${new Date(cafe.planExpiresAt).toLocaleDateString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh" })}` : cafe.planId ? "بدون تاريخ انتهاء محدد" : "لم يتم تفعيل باقة"}</p>
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
