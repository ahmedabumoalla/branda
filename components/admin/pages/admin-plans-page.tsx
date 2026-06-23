"use client";

import { Check, Clock3, Layers3, Plus, Receipt, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  approveSubscriptionRequestAction,
  rejectSubscriptionRequestAction,
  savePlatformPlansAction,
} from "@/app/actions/admin";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminInput,
  AdminPageShell,
  AdminSelect,
  AdminStatPill,
  AdminTextarea,
  BentoCard,
  BentoGrid,
  GoldButton,
  StatusBadge,
} from "@/components/ui/design-system";
import { BUSINESS_CATEGORIES, type BusinessCategoryId } from "@/lib/platform/business-categories";
import {
  allPlatformFeatures,
  type PlatformFeature,
  type PlatformPlan,
  type PlanDurationUnit,
} from "@/lib/platform/admin-data";
import type { SubscriptionPaymentRequest } from "@/lib/platform/subscription";

type Props = {
  initialPlans: PlatformPlan[];
  initialRequests: SubscriptionPaymentRequest[];
  configError?: string;
};

const durationLabels: Record<PlanDurationUnit, string> = {
  day: "يوم",
  month: "شهر",
  year: "سنة",
};

const requestStatusLabels: Record<SubscriptionPaymentRequest["status"], string> = {
  awaiting_receipt: "بانتظار الإيصال",
  pending_review: "بانتظار المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

const PLAN_CATEGORY_IDS: BusinessCategoryId[] = ["cafes_coffee", "restaurants", "events_conferences"];
const PLAN_CATEGORIES = BUSINESS_CATEGORIES.filter((category) =>
  PLAN_CATEGORY_IDS.includes(category.id)
);

function createPlan(categoryId: BusinessCategoryId): PlatformPlan {
  return {
    id: `plan-${crypto.randomUUID().slice(0, 8)}`,
    name: "باقة جديدة",
    priceMonthly: 0,
    offerEnabled: false,
    durationUnit: "month",
    durationCount: 1,
    description: "",
    active: true,
    isDefault: false,
    features: ["home", "menu", "settings", "subscription"],
    categoryId,
    maxOrdersMonthly: 30,
    maxProductsMonthly: 20,
    maxReservationsMonthly: 10,
    maxBranches: 1,
    trialDays: 15,
    freeAfterTrial: false,
    offerLabel: "عرض خاص",
    offerEndsAt: null,
    durationOptions: [1, 2, 12, 24],
  };
}

export function AdminPlansPage({
  initialPlans,
  initialRequests,
  configError,
}: Props) {
  const [plans, setPlans] = useState(initialPlans);
  const [requests, setRequests] = useState(initialRequests);
  const [selectedCategoryId, setSelectedCategoryId] = useState<BusinessCategoryId>("cafes_coffee");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const activeCount = useMemo(() => plans.filter((plan) => plan.active).length, [plans]);
  const visiblePlans = useMemo(
    () => plans.filter((plan) => (plan.categoryId ?? "cafes_coffee") === selectedCategoryId),
    [plans, selectedCategoryId]
  );
  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "pending_review").length,
    [requests]
  );

  function updatePlan(planId: string, patch: Partial<PlatformPlan>) {
    setPlans((current) =>
      current.map((plan) => (plan.id === planId ? { ...plan, ...patch } : plan))
    );
    setDirty(true);
  }

  function selectDefault(planId: string) {
    const target = plans.find((plan) => plan.id === planId);
    const targetCategoryId = target?.categoryId ?? "cafes_coffee";
    setPlans((current) =>
      current.map((plan) => ({
        ...plan,
        active: plan.id === planId ? true : plan.active,
        isDefault: (plan.categoryId ?? "cafes_coffee") === targetCategoryId
          ? plan.id === planId
          : plan.isDefault,
      }))
    );
    setDirty(true);
  }

  function toggleFeature(planId: string, feature: PlatformFeature) {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return;
    const features = plan.features.includes(feature)
      ? plan.features.filter((item) => item !== feature)
      : [...plan.features, feature];
    updatePlan(planId, { features });
  }

  function addPlan() {
    setPlans((current) => [createPlan(selectedCategoryId), ...current]);
    setDirty(true);
  }

  function removePlan(planId: string) {
    const plan = plans.find((item) => item.id === planId);
    if (!plan || plan.isDefault) {
      alert("لا يمكن حذف الباقة الأساسية");
      return;
    }
    setPlans((current) => current.filter((item) => item.id !== planId));
    setDirty(true);
  }

  async function savePlans() {
    setSaving(true);
    try {
      const savedPlans = await savePlatformPlansAction(plans);
      setPlans(savedPlans);
      setDirty(false);
      alert("تم حفظ الباقات وتحديد الباقة الأساسية");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ الباقات");
    } finally {
      setSaving(false);
    }
  }

  async function approveRequest(requestId: string) {
    try {
      setRequests(await approveSubscriptionRequestAction(requestId));
      alert("تم اعتماد الطلب وتفعيل الباقة");
    } catch {
      alert("تعذر اعتماد الطلب");
    }
  }

  async function rejectRequest(requestId: string) {
    const response = window.prompt("اكتب سبب الرفض", "تعذر اعتماد الدفع") ?? "";
    if (!response.trim()) return;
    try {
      setRequests(await rejectSubscriptionRequestAction(requestId, response));
      alert("تم رفض الطلب");
    } catch {
      alert("تعذر رفض الطلب");
    }
  }

  return (
    <AdminPageShell
      title="الباقات والاشتراكات"
      subtitle="إدارة الباقة الأساسية والأسعار الشاملة للضريبة والعروض وطلبات الدفع اليدوي."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      {configError ? (
        <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center font-black text-amber-200">
          {configError}
        </div>
      ) : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="cyber">
          <AdminStatPill label="إجمالي الباقات" value={plans.length} />
        </BentoCard>
        <BentoCard variant="cyber">
          <AdminStatPill label="الباقات المفعلة" value={activeCount} />
        </BentoCard>
        <BentoCard variant="gold">
          <AdminStatPill label="طلبات بانتظار المراجعة" value={pendingCount} />
        </BentoCard>
        <BentoCard variant="dark">
          <AdminStatPill
            label="الباقة الأساسية"
            value={plans.find((plan) => plan.isDefault)?.name ?? "غير محددة"}
          />
        </BentoCard>
      </BentoGrid>

      <div className="mb-6 flex flex-wrap justify-end gap-3">
        <div className="flex flex-1 flex-wrap gap-2">
          {PLAN_CATEGORIES.map((category) => {
            const selected = selectedCategoryId === category.id;
            const count = plans.filter((plan) => (plan.categoryId ?? "cafes_coffee") === category.id).length;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                  selected
                    ? "border-[#F6C35B] bg-[#F6C35B] text-[#22130D]"
                    : "border-white/10 bg-white/5 text-[#F8F4EF]"
                }`}
              >
                {category.id === "cafes_coffee"
                  ? "باقات المقاهي والكوفيهات"
                  : category.id === "restaurants"
                    ? "باقات المطاعم"
                    : "باقات الفعاليات والمؤتمرات"}
                <span className="ms-2 rounded-full bg-black/15 px-2 py-0.5 text-xs">{count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addPlan}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 font-black text-[#F8F4EF]"
        >
          <Plus className="h-5 w-5" />
          إضافة باقة
        </button>
        <GoldButton
          type="button"
          onClick={savePlans}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2"
        >
          <Save className="h-5 w-5" />
          {saving ? "جاري الحفظ..." : "حفظ جميع التعديلات"}
        </GoldButton>
      </div>

      <BentoGrid className="mb-7 xl:grid-cols-3">
        {visiblePlans.map((plan) => (
          <BentoCard key={plan.id} variant={plan.isDefault ? "gold" : "cyber"}>
            <div className="mb-5 flex items-center justify-between gap-2">
              <Layers3 className="h-7 w-7 text-[#F6C35B]" />
              <div className="flex flex-wrap gap-2">
                {plan.isDefault ? <StatusBadge tone="gold">الأساسية</StatusBadge> : null}
                <StatusBadge tone={plan.active ? "success" : "danger"}>
                  {plan.active ? "مفعلة" : "متوقفة"}
                </StatusBadge>
              </div>
            </div>

            <div className="space-y-4">
              <AdminInput
                value={plan.name}
                placeholder="اسم الباقة"
                onChange={(event) => updatePlan(plan.id, { name: event.target.value })}
              />
              <AdminTextarea
                value={plan.description}
                placeholder="وصف الباقة"
                className="h-20"
                onChange={(event) =>
                  updatePlan(plan.id, { description: event.target.value })
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-2 block text-xs font-black text-[#CBB29C]">
                    السعر شامل الضريبة
                  </span>
                  <AdminInput
                    type="number"
                    min="0"
                    value={plan.priceMonthly}
                    onChange={(event) =>
                      updatePlan(plan.id, { priceMonthly: Number(event.target.value) || 0 })
                    }
                  />
                </label>
                <label>
                  <span className="mb-2 block text-xs font-black text-[#CBB29C]">
                    سعر العرض شامل الضريبة
                  </span>
                  <AdminInput
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="أدخل سعر العرض شامل الضريبة"
                    value={plan.offerPrice ?? ""}
                    className="text-[#FCF8F3] placeholder:text-[#CBB29C]"
                    onChange={(event) => {
                      const value = event.target.value;

                      if (value === "") {
                        updatePlan(plan.id, { offerPrice: undefined });
                        return;
                      }

                      updatePlan(plan.id, {
                        offerEnabled: true,
                        offerPrice: Number(value),
                      });
                    }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-2 block text-xs font-black text-[#CBB29C]">اسم العرض</span>
                  <AdminInput value={plan.offerLabel ?? ""} placeholder="مثال: خصم الإطلاق" onChange={(event) => updatePlan(plan.id, { offerLabel: event.target.value || null })} />
                </label>
                <label>
                  <span className="mb-2 block text-xs font-black text-[#CBB29C]">تاريخ انتهاء العرض</span>
                  <AdminInput type="date" value={plan.offerEndsAt ?? ""} onChange={(event) => updatePlan(plan.id, { offerEndsAt: event.target.value || null })} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <AdminInput
                  type="number"
                  min="1"
                  value={plan.durationCount}
                  onChange={(event) =>
                    updatePlan(plan.id, {
                      durationCount: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                />
                <AdminSelect
                  value={plan.durationUnit}
                  onChange={(event) =>
                    updatePlan(plan.id, {
                      durationUnit: event.target.value as PlanDurationUnit,
                    })
                  }
                >
                  <option value="day">يوم</option>
                  <option value="month">شهر</option>
                  <option value="year">سنة</option>
                </AdminSelect>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="mb-3 text-sm font-black text-[#CBB29C]">مدد الاشتراك المتاحة للعميل</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[1, 2, 12, 24].map((months) => {
                    const checked = (plan.durationOptions?.length ? plan.durationOptions : [1, 2, 12, 24]).includes(months);
                    return (
                      <label key={months} className="flex items-center gap-2 rounded-xl bg-black/20 p-3 text-xs font-black text-[#F8F4EF]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const current = plan.durationOptions?.length ? plan.durationOptions : [1, 2, 12, 24];
                            const next = event.target.checked ? [...current, months] : current.filter((item) => item !== months);
                            updatePlan(plan.id, { durationOptions: next.length ? Array.from(new Set(next)).sort((a, b) => a - b) : [1] });
                          }}
                        />
                        {months === 1 ? "شهر" : months === 2 ? "شهرين" : months === 12 ? "سنة" : "سنتين"}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="mb-3 text-sm font-black text-[#CBB29C]">تصنيف الباقة وحدود الاستخدام الشهرية</p>
                <div className="grid grid-cols-2 gap-3">
                  <AdminSelect
                    value={plan.categoryId ?? "cafes_coffee"}
                    onChange={(event) => updatePlan(plan.id, { categoryId: event.target.value })}
                  >
                    {PLAN_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </AdminSelect>
                  <AdminInput type="number" min="0" placeholder="عدد الطلبات شهريًا" value={plan.maxOrdersMonthly ?? ""} onChange={(event) => updatePlan(plan.id, { maxOrdersMonthly: event.target.value ? Number(event.target.value) : null })} />
                  <AdminInput type="number" min="0" placeholder="عدد المنتجات شهريًا" value={plan.maxProductsMonthly ?? ""} onChange={(event) => updatePlan(plan.id, { maxProductsMonthly: event.target.value ? Number(event.target.value) : null })} />
                  <AdminInput type="number" min="0" placeholder="عدد الحجوزات شهريًا" value={plan.maxReservationsMonthly ?? ""} onChange={(event) => updatePlan(plan.id, { maxReservationsMonthly: event.target.value ? Number(event.target.value) : null })} />
                  <AdminInput type="number" min="0" placeholder="عدد الفروع" value={plan.maxBranches ?? ""} onChange={(event) => updatePlan(plan.id, { maxBranches: event.target.value ? Number(event.target.value) : null })} />
                  <AdminInput type="number" min="0" placeholder="أيام التجربة" value={plan.trialDays ?? ""} onChange={(event) => updatePlan(plan.id, { trialDays: event.target.value ? Number(event.target.value) : null })} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                  <button type="button" onClick={() => updatePlan(plan.id, { maxOrdersMonthly: null })} className="rounded-xl bg-white/10 px-3 py-2 text-[#F8F4EF]">الطلبات Unlimited</button>
                  <button type="button" onClick={() => updatePlan(plan.id, { maxProductsMonthly: null })} className="rounded-xl bg-white/10 px-3 py-2 text-[#F8F4EF]">المنتجات Unlimited</button>
                  <button type="button" onClick={() => updatePlan(plan.id, { maxReservationsMonthly: null })} className="rounded-xl bg-white/10 px-3 py-2 text-[#F8F4EF]">الحجوزات Unlimited</button>
                  <button type="button" onClick={() => updatePlan(plan.id, { maxBranches: null })} className="rounded-xl bg-white/10 px-3 py-2 text-[#F8F4EF]">الفروع Unlimited</button>
                </div>
                <label className="mt-3 flex items-center gap-3 rounded-xl bg-black/20 p-3 text-xs font-black text-[#F8F4EF]">
                  <input type="checkbox" checked={Boolean(plan.freeAfterTrial)} onChange={(event) => updatePlan(plan.id, { freeAfterTrial: event.target.checked })} />
                  هذه هي الباقة المجانية التي يرجع لها الحساب بعد انتهاء التجربة
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updatePlan(plan.id, { active: !plan.active })}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-black text-[#F8F4EF]"
                >
                  {plan.active ? "إيقاف الباقة" : "تفعيل الباقة"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updatePlan(plan.id, {
                      offerEnabled: !plan.offerEnabled,
                      offerPrice: plan.offerEnabled ? undefined : plan.offerPrice,
                    })
                  }
                  className="rounded-xl border border-[#D9A33F]/30 bg-[#D9A33F]/10 px-3 py-2 text-xs font-black text-[#F6C35B]"
                >
                  {plan.offerEnabled ? "إلغاء العرض" : "تفعيل عرض"}
                </button>
                {!plan.isDefault ? (
                  <button
                    type="button"
                    onClick={() => selectDefault(plan.id)}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-300"
                  >
                    جعلها الأساسية
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              {allPlatformFeatures.map((feature) => {
                const enabled = plan.features.includes(feature.id);
                return (
                  <button
                    type="button"
                    key={feature.id}
                    onClick={() => toggleFeature(plan.id, feature.id)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-black ${
                      enabled
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 bg-white/5 text-[#CBB29C]"
                    }`}
                  >
                    <span>{feature.title}</span>
                    {enabled ? <Check className="h-4 w-4" /> : <span>—</span>}
                  </button>
                );
              })}
            </div>

            {!plan.isDefault ? (
              <button
                type="button"
                onClick={() => removePlan(plan.id)}
                className="mt-5 inline-flex items-center gap-2 text-sm font-black text-red-300"
              >
                <Trash2 className="h-4 w-4" />
                حذف من القائمة
              </button>
            ) : null}

            <p className="mt-4 text-xs font-bold text-[#CBB29C]">
              المدة: {plan.durationCount} {durationLabels[plan.durationUnit]}
            </p>
          </BentoCard>
        ))}
      </BentoGrid>

      <BentoCard variant="dark" span="4">
        <div className="mb-5 flex items-center gap-3">
          <Receipt className="h-7 w-7 text-[#F6C35B]" />
          <div>
            <h2 className="text-xl font-black text-[#F8F4EF]">طلبات الدفع اليدوي</h2>
            <p className="text-sm font-bold text-[#CBB29C]">
              اعتماد الحوالات البنكية وطلبات تحصيل الكاش.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black text-[#F8F4EF]">
                    {request.cafeName} — {request.planName}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#CBB29C]">
                    {request.paymentMethod === "card_paypal"
                      ? "دفع بالبطاقة"
                      : request.paymentMethod === "bank_transfer"
                        ? "حوالة بنكية"
                        : "حوالة بنكية"}
                    {request.branchName ? ` • ${request.branchName}` : ""}
                    {" • "}
                    {request.amount} ر.س
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs font-bold text-[#CBB29C]">
                    <Clock3 className="h-4 w-4" />
                    {new Date(request.createdAt).toLocaleString("ar-SA")}
                  </p>
                </div>
                <StatusBadge
                  tone={request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "gold"}
                >
                  {requestStatusLabels[request.status]}
                </StatusBadge>
              </div>

              {request.status === "pending_review" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <GoldButton type="button" onClick={() => approveRequest(request.id)}>
                    اعتماد وتفعيل الباقة
                  </GoldButton>
                  <button
                    type="button"
                    onClick={() => rejectRequest(request.id)}
                    className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 font-black text-red-300"
                  >
                    رفض الطلب
                  </button>
                </div>
              ) : null}
            </div>
          ))}

          {!requests.length ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center font-bold text-[#CBB29C]">
              لا توجد طلبات اشتراك بعد.
            </p>
          ) : null}
        </div>
      </BentoCard>
    </AdminPageShell>
  );
}
