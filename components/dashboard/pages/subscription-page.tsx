"use client";

import { Banknote, Check, Clock3, Crown, Landmark, Layers3, Receipt } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { submitSubscriptionRequestAction } from "@/app/actions/subscription";
import { BrandaLogo } from "@/components/ui/branda-logo";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  PrimaryButton,
  SoftCard,
  StatPill,
  StatusBadge,
} from "@/components/ui/design-system";
import type { PlatformPlan, PlanDurationUnit } from "@/lib/platform/admin-data";
import type {
  ActiveSubscription,
  SubscriptionPaymentMethod,
  SubscriptionPaymentRequest,
  SubscriptionRecord,
} from "@/lib/platform/subscription";

type BranchOption = { id: string; name: string; active: boolean };

type Props = {
  initialPlans: PlatformPlan[];
  initialActiveSubscription: ActiveSubscription | null;
  initialHistory: SubscriptionRecord[];
  initialRequests: SubscriptionPaymentRequest[];
  initialBranches: BranchOption[];
  configError?: string;
};

const durationLabels: Record<PlanDurationUnit, string> = {
  day: "يوم",
  month: "شهر",
  year: "سنة",
};

const requestStatusLabels: Record<SubscriptionPaymentRequest["status"], string> = {
  awaiting_receipt: "بانتظار رفع الإيصال",
  pending_review: "قيد المراجعة",
  approved: "تم الاعتماد",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

function remainingLabel(expiresAt?: string) {
  if (!expiresAt) return "مستمرة";
  const difference = new Date(expiresAt).getTime() - Date.now();
  if (difference <= 0) return "منتهية";
  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((difference / (1000 * 60)) % 60);
  return `${days} يوم و ${hours} ساعة و ${minutes} دقيقة`;
}

export function SubscriptionPageClient({
  initialPlans,
  initialActiveSubscription,
  initialHistory,
  initialRequests,
  initialBranches,
  configError,
}: Props) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<SubscriptionPaymentMethod>("bank_transfer");
  const [branchId, setBranchId] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState(initialRequests);
  const [remaining, setRemaining] = useState(remainingLabel(initialActiveSubscription?.expiresAt));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(remainingLabel(initialActiveSubscription?.expiresAt));
    }, 60000);
    return () => window.clearInterval(interval);
  }, [initialActiveSubscription?.expiresAt]);

  const selectedPlan = initialPlans.find((plan) => plan.id === selectedPlanId);
  const activePlanId = initialActiveSubscription?.planId;
  const activeRequest = requests.find(
    (request) =>
      request.status === "pending_review" || request.status === "awaiting_receipt"
  );

  const selectedPrice = selectedPlan
    ? selectedPlan.offerEnabled && selectedPlan.offerPrice != null
      ? selectedPlan.offerPrice
      : selectedPlan.priceMonthly
    : 0;

  const tax = useMemo(() => Number((selectedPrice * 0.15).toFixed(2)), [selectedPrice]);
  const total = selectedPrice + tax;

  async function submitRequest() {
    if (!selectedPlan) return;
    if (paymentMethod === "cash" && !branchId) {
      alert("حدد فرع الكوفي لطلب حضور المندوب");
      return;
    }
    if (paymentMethod === "bank_transfer" && !receipt) {
      alert("أرفق إيصال التحويل البنكي");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("planId", selectedPlan.id);
      formData.set("paymentMethod", paymentMethod);
      if (branchId) formData.set("branchId", branchId);
      if (receipt) formData.set("receipt", receipt);
      const id = await submitSubscriptionRequestAction(formData);

      setRequests((current) => [
        {
          id,
          cafeId: "",
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          baseAmount: selectedPlan.priceMonthly,
          amount: selectedPrice,
          durationUnit: selectedPlan.durationUnit,
          durationCount: selectedPlan.durationCount,
          paymentMethod,
          branchId: branchId || undefined,
          branchName: initialBranches.find((branch) => branch.id === branchId)?.name,
          status: "pending_review",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);

      setSelectedPlanId(null);
      setReceipt(null);
      alert("تم إرسال طلب الاشتراك للإدارة");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر إرسال طلب الاشتراك");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardPageShell
      title="الاشتراك والباقات"
      subtitle="اختر الباقة وطريقة السداد، ثم تابع حالة الطلب من لوحة الكوفي."
      action={<BrandaLogo variant="brown" width={140} height={56} />}
    >
      {configError ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center font-black text-amber-800">
          {configError}
        </div>
      ) : null}

      {initialActiveSubscription ? (
        <BentoGrid className="mb-7">
          <BentoCard variant="gold" span="2">
            <div className="flex items-center gap-4">
              <Crown className="h-9 w-9 text-[#F0C568]" />
              <div>
                <p className="text-sm font-bold text-[#F2E7D9]">الباقة الحالية</p>
                <h2 className="text-3xl font-black">{initialActiveSubscription.planName}</h2>
              </div>
            </div>
            <p className="mt-5 text-sm font-bold text-[#F2E7D9]">
              المدة: {initialActiveSubscription.durationCount}{" "}
              {durationLabels[initialActiveSubscription.durationUnit]}
            </p>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <Clock3 className="mb-3 h-7 w-7 text-[#6B3A25]" />
            <StatPill
              label="الوقت المتبقي في الباقة"
              value={remaining}
              hint={
                initialActiveSubscription.expiresAt
                  ? `تنتهي في ${new Date(initialActiveSubscription.expiresAt).toLocaleDateString("ar-SA")}`
                  : undefined
              }
            />
          </BentoCard>
        </BentoGrid>
      ) : null}

      {activeRequest ? (
        <SoftCard className="mb-7 border border-amber-200 bg-amber-50 p-5">
          <p className="font-black text-amber-900">
            لديك طلب اشتراك قيد المعالجة: {activeRequest.planName}
          </p>
          <p className="mt-2 text-sm font-bold text-amber-700">
            الحالة: {requestStatusLabels[activeRequest.status]}
          </p>
        </SoftCard>
      ) : null}

      <div className="mb-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {initialPlans.map((plan) => {
          const isCurrent = plan.id === activePlanId;
          const price =
            plan.offerEnabled && plan.offerPrice != null
              ? plan.offerPrice
              : plan.priceMonthly;

          return (
            <article
              key={plan.id}
              className={`rounded-3xl border p-6 ${
                isCurrent
                  ? "border-[#D9A33F]/40 bg-[#4A281D] text-white"
                  : "border-[#E7D7C6] bg-white text-[#311912]"
              }`}
            >
              <Layers3 className={`mb-4 h-7 w-7 ${isCurrent ? "text-[#F0C568]" : "text-[#6B3A25]"}`} />
              <h2 className="text-2xl font-black">{plan.name}</h2>
              <p className={`mt-2 text-sm font-bold ${isCurrent ? "text-[#F2E7D9]" : "text-[#806A5E]"}`}>
                {plan.description}
              </p>

              <div className="mt-5">
                {plan.offerEnabled && plan.offerPrice != null ? (
                  <p className="text-sm font-bold line-through opacity-60">
                    {plan.priceMonthly} ر.س
                  </p>
                ) : null}
                <p className="text-3xl font-black text-[#D9A33F]">{price} ر.س</p>
                <p className="mt-1 text-xs font-bold opacity-70">
                  لمدة {plan.durationCount} {durationLabels[plan.durationUnit]}
                </p>
              </div>

              <PrimaryButton
                disabled={isCurrent || Boolean(activeRequest)}
                onClick={() => setSelectedPlanId(plan.id)}
                className="mt-6 w-full"
              >
                {isCurrent ? "الباقة الحالية" : "طلب الاشتراك"}
              </PrimaryButton>
            </article>
          );
        })}
      </div>

      {selectedPlan ? (
        <BentoGrid className="mb-8">
          <BentoCard variant="white" span="2">
            <h2 className="mb-4 text-xl font-black text-[#311912]">طريقة السداد</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("bank_transfer")}
                className={`rounded-2xl border p-4 font-black ${
                  paymentMethod === "bank_transfer"
                    ? "border-[#6B3A25] bg-[#F2E7D9] text-[#311912]"
                    : "border-[#E7D7C6] text-[#806A5E]"
                }`}
              >
                <Landmark className="mx-auto mb-2 h-6 w-6" />
                حوالة بنكية
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`rounded-2xl border p-4 font-black ${
                  paymentMethod === "cash"
                    ? "border-[#6B3A25] bg-[#F2E7D9] text-[#311912]"
                    : "border-[#E7D7C6] text-[#806A5E]"
                }`}
              >
                <Banknote className="mx-auto mb-2 h-6 w-6" />
                كاش بواسطة مندوب
              </button>
            </div>

            {paymentMethod === "bank_transfer" ? (
              <label className="mt-5 block rounded-2xl border border-dashed border-[#D9A33F]/40 bg-[#FCF8F3] p-5">
                <Receipt className="mb-2 h-6 w-6 text-[#6B3A25]" />
                <span className="block font-black text-[#311912]">إرفاق إيصال التحويل</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="mt-3 block w-full text-sm"
                  onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <label className="mt-5 block">
                <span className="mb-2 block font-black text-[#311912]">
                  الفرع المطلوب زيارة المندوب له
                </span>
                <select
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                  className="h-14 w-full rounded-2xl border border-[#E7D7C6] bg-white px-4 font-bold"
                >
                  <option value="">اختر الفرع</option>
                  {initialBranches
                    .filter((branch) => branch.active)
                    .map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </BentoCard>

          <BentoCard variant="gold" span="2">
            <h2 className="text-xl font-black">ملخص الطلب</h2>
            <div className="mt-5 space-y-3 text-sm font-bold text-[#F2E7D9]">
              <div className="flex justify-between">
                <span>الباقة</span>
                <span>{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between">
                <span>المدة</span>
                <span>
                  {selectedPlan.durationCount} {durationLabels[selectedPlan.durationUnit]}
                </span>
              </div>
              <div className="flex justify-between">
                <span>قيمة الاشتراك</span>
                <span>{selectedPrice} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span>الضريبة</span>
                <span>{tax} ر.س</span>
              </div>
              <div className="flex justify-between border-t border-white/15 pt-3 text-lg text-white">
                <span>الإجمالي</span>
                <span>{total} ر.س</span>
              </div>
            </div>

            <PrimaryButton
              type="button"
              onClick={submitRequest}
              disabled={submitting}
              className="mt-6 w-full bg-[#F0C568] text-[#311912]"
            >
              {submitting ? "جاري الإرسال..." : "إرسال طلب الاشتراك"}
            </PrimaryButton>
          </BentoCard>
        </BentoGrid>
      ) : null}

      <BentoCard variant="white" span="4">
        <h2 className="mb-5 text-xl font-black text-[#311912]">سجل الاشتراكات</h2>
        <div className="space-y-3">
          {initialHistory.map((record) => (
            <SoftCard key={record.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black text-[#311912]">{record.planName}</p>
                  <p className="mt-1 text-sm font-bold text-[#806A5E]">
                    {record.amount} ر.س • {record.durationCount}{" "}
                    {durationLabels[record.durationUnit]}
                  </p>
                </div>
                <StatusBadge tone={record.paymentStatus === "active" ? "success" : "danger"}>
                  {record.paymentStatus === "active" ? "مفعلة" : "منتهية"}
                </StatusBadge>
              </div>
            </SoftCard>
          ))}
          {!initialHistory.length ? (
            <p className="text-sm font-bold text-[#806A5E]">لا يوجد سجل اشتراكات بعد.</p>
          ) : null}
        </div>
      </BentoCard>
    </DashboardPageShell>
  );
}
