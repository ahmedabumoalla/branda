"use client";

import { BrandDetailsDialog, BrandFeatureControls } from "@/components/admin/brand-details-dialog";

import { BrandDirectory } from "@/components/admin/brand-directory";
import { useMemo, useState, useTransition } from "react";
import {
  saveCafeFeatureOverridesAction,
  updateCafePlanAction,
  updateCafeStatusAction,
} from "@/app/actions/admin";
import { BentoCard } from "@/components/ui/design-system";
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

  const [modalCafe, setModalCafe] = useState<PlatformCafe | null>(null);
  const [updatingPlanCafeId, setUpdatingPlanCafeId] = useState<string | null>(null);
  const [featureOverrideDrafts, setFeatureOverrideDrafts] = useState<Record<string, FeatureOverrideDraft>>({});
  const [savingFeatureOverridesCafeId, setSavingFeatureOverridesCafeId] = useState<string | null>(null);
  const [isPlanUpdatePending, startPlanUpdateTransition] = useTransition();
  const [isFeatureOverridePending, startFeatureOverrideTransition] = useTransition();

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
    <div>
      <BrandDirectory cafes={cafes} plans={plans} onManage={setModalCafe} configError={configError} />

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
    </div>
  );
}
