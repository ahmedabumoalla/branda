"use client";

import dynamic from "next/dynamic";
import type { BrandActivityCache } from "@/components/admin/brand-activity-panel";

import { BrandDirectory } from "@/components/admin/brand-directory";
import { PendingBrandDeletionCleanup } from "@/components/admin/brand-deletion-control";
import type { BrandDeletionResult, PendingBrandDeletion } from "@/lib/data/brand-deletion";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type SetStateAction } from "react";
import {
  saveCafeFeatureOverridesAction,
  addCafePlansAction,
  removeCafePlansAction,
  updateCafeStatusAction,
} from "@/app/actions/admin";
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

const BrandDetailsDialog = dynamic(() => import("@/components/admin/brand-details-dialog").then(module => module.BrandDetailsDialog));
const BrandFeatureControls = dynamic(() => import("@/components/admin/brand-details-dialog").then(module => module.BrandFeatureControls));
const BrandAccountCreate = dynamic(() => import("@/components/admin/brand-account-create").then(module => module.BrandAccountCreate));
const BrandActivityPanel = dynamic(() => import("@/components/admin/brand-activity-panel").then(module => module.BrandActivityPanel));

type Props = {
  initialCafes: PlatformCafe[];
  initialPlans: PlatformPlan[];
  initialCustomers?: PlatformCustomer[];
  initialOperations?: PlatformOperation[];
  configError?: string;
  pendingDeletions?: PendingBrandDeletion[];
};

type FeatureOverrideChoice = EffectiveBrandFeatureAccess["override"];
type FeatureOverrideDraft = Record<string, FeatureOverrideChoice>;

function getBrandFeatureRows(cafe: PlatformCafe | null, plans: PlatformPlan[]) {
  if (!cafe) return [];
  const planIds = cafe.activePlanIds ?? (cafe.hasActivePlan && cafe.planId ? [cafe.planId] : []);
  const planFeatures = [...new Set(planIds.flatMap(id => getPlanIncludedFeatures(id, plans)))];
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
  pendingDeletions = [],
}: Props) {
  const router = useRouter();
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [deletionNotice, setDeletionNotice] = useState("");
  const [localPendingDeletions, setLocalPendingDeletions] = useState<PendingBrandDeletion[]>([]);
  const [finishedDeletionIds, setFinishedDeletionIds] = useState<string[]>([]);
  // A router refresh supplies a new server snapshot without remounting this page.
  // Keep local successful mutations until that snapshot changes, while leaving drafts alone.
  const [cafeSnapshot, setCafeSnapshot] = useState({ source: initialCafes, value: initialCafes });
  const cafes = cafeSnapshot.source === initialCafes ? cafeSnapshot.value : initialCafes;
  const plans = initialPlans;
  const activityCache = useMemo<BrandActivityCache>(() => new Map(), [initialCafes]);

  const [modalCafeId, setModalCafeId] = useState<string | null>(null);
  const modalCafe = cafes.find(cafe => cafe.id === modalCafeId) ?? null;
  const [updatingPlanCafeId, setUpdatingPlanCafeId] = useState<string | null>(null);
  const [featureOverrideDrafts, setFeatureOverrideDrafts] = useState<Record<string, FeatureOverrideDraft>>({});
  const [savingFeatureOverridesCafeId, setSavingFeatureOverridesCafeId] = useState<string | null>(null);
  const [isFeatureOverridePending, startFeatureOverrideTransition] = useTransition();

  if (cafeSnapshot.source !== initialCafes) {
    setCafeSnapshot({ source: initialCafes, value: initialCafes });
    if (modalCafeId && !initialCafes.some(cafe => cafe.id === modalCafeId)) setModalCafeId(null);
  }

  function setCafes(update: SetStateAction<PlatformCafe[]>) {
    setCafeSnapshot(current => ({ ...current, value: typeof update === "function" ? update(current.value) : update }));
  }

  function setModalCafe(cafe: PlatformCafe | null) {
    setModalCafeId(cafe?.id ?? null);
  }

  function onBrandDeleted(result: BrandDeletionResult) {
    setCafes(previous => previous.filter(cafe => cafe.id !== result.cafeId));
    setModalCafe(null);
    setDeletionNotice(result.cleanupPending ? "حُذفت بيانات العلامة وتبقى استكمال حذف ملفاتها" : "تم حذف العلامة وبياناتها وملفاتها نهائيًا");
    if (result.cleanupPending) setLocalPendingDeletions(previous => [...previous.filter(job => job.cafeId !== result.cafeId), result]);
    router.refresh();
  }
  const deletionJobs = [...new Map([...pendingDeletions, ...localPendingDeletions].map(job => [job.cafeId, job])).values()]
    .filter(job => !finishedDeletionIds.includes(job.cafeId));

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

  async function updatePlan(id: string, planIds: string[], expectedRevision: string) {
    setUpdatingPlanCafeId(id);
    try {
      const result = await addCafePlansAction(id, planIds, expectedRevision);
      if (!result.ok) throw new Error(result.message);
      const subscription = result.data;
      setCafes(prev => prev.map(cafe => cafe.id === id ? { ...cafe, ...subscription } : cafe));
    } finally {
      setUpdatingPlanCafeId(null);
    }
  }

  async function removePlans(id: string, planIds: string[], expectedRevision: string) {
    setUpdatingPlanCafeId(id);
    try {
      const result = await removeCafePlansAction(id, planIds, expectedRevision);
      if (!result.ok) throw new Error(result.message);
      const subscription = result.data;
      setCafes(prev => prev.map(cafe => cafe.id === id ? { ...cafe, ...subscription } : cafe));
    } finally {
      setUpdatingPlanCafeId(null);
    }
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
      rows.filter(row => row.planIncluded).map(row => row.feature.id),
      draftOverrides,
    );
    const hasDraft = Boolean(featureOverrideDrafts[cafe.id]);
    const saving = isFeatureOverridePending && savingFeatureOverridesCafeId === cafe.id;

    return <BrandFeatureControls rows={effectiveRows} draft={draft} saving={saving} dirty={hasDraft} change={(id, value) => updateFeatureOverrideDraft(cafe, effectiveRows, id, value)} save={() => saveFeatureOverrides(cafe, effectiveRows)} />;
  }

  return (
    <div>
      {deletionNotice && <p role="status" className="mb-4 text-sm text-[#e5bd76]">{deletionNotice}</p>}
      <PendingBrandDeletionCleanup jobs={deletionJobs} onCompleted={id => { setFinishedDeletionIds(previous => [...previous, id]); setDeletionNotice("اكتمل حذف ملفات العلامة نهائيًا"); router.refresh(); }} />
      <BrandDirectory cafes={cafes} plans={plans} onManage={setModalCafe} onCreate={() => setCreatingBrand(true)} configError={configError} />
      {creatingBrand && <BrandAccountCreate close={() => setCreatingBrand(false)} onCreated={cafe => { setCafes(previous => [cafe, ...previous.filter(item => item.id !== cafe.id)]); setCreatingBrand(false); setModalCafe(cafe); setDeletionNotice("تم إنشاء حساب العلامة وصلاحيات التجربة جاهزة تبدأ مدة تجربة الباقات بعد إرسال تفاصيل الدخول"); router.refresh(); }} />}

      {modalCafe && (
        <BrandDetailsDialog
          key={modalCafe.id}
          cafe={modalCafe}
          plans={plans}
          services={renderFeatureOverridesPanel(modalCafe)}
          activity={<BrandActivityPanel
            key={modalCafe.id}
            cafeId={modalCafe.id}
            cache={activityCache}
            preview={configError && initialCustomers && initialOperations ? {
              customers: initialCustomers.filter(customer => customer.cafeId === modalCafe.id).slice(0, 8).map(customer => ({ ...customer, email: customer.email })),
              operations: initialOperations.filter(operation => operation.cafeId === modalCafe.id).slice(0, 8).map(operation => ({ ...operation, amount: operation.amount ?? 0 })),
            } : undefined}
          />}
          toggleStatus={() => toggleCafe(modalCafe.id)}
          planPending={updatingPlanCafeId === modalCafe.id}
          updatePlan={updatePlan}
          removePlans={removePlans}
          close={() => setModalCafe(null)}
          onDeleted={onBrandDeleted}
          onUpdated={cafe => { setCafes(previous => previous.map(item => item.id === cafe.id ? cafe : item)); setModalCafe(cafe); }}
        />
      )}
    </div>
  );
}
