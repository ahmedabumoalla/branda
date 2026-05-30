"use client";

import { Check, CreditCard, Crown, Layers3, Receipt } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  PLATFORM_PLANS_KEY,
  allPlatformFeatures,
  mockPlatformPlans,
  type PlatformPlan,
} from "@/lib/platform/admin-data";
import { getActiveCafePlanId } from "@/lib/platform/permissions";
import {
  completePlanPayment,
  failPlanPayment,
  getPendingSubscription,
  getSubscriptionHistory,
  startPlanCheckout,
  type SubscriptionRecord,
} from "@/lib/platform/subscription";

type Step = "select" | "invoice" | "done";

export function SubscriptionPageClient() {
  const [plans, setPlans] = useState<PlatformPlan[]>(mockPlatformPlans);
  const [activePlanId, setActivePlanId] = useState("pro");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [paying, setPaying] = useState(false);
  const [history, setHistory] = useState<SubscriptionRecord[]>([]);

  useEffect(() => {
    const savedPlans = localStorage.getItem(PLATFORM_PLANS_KEY);
    if (savedPlans) setPlans(JSON.parse(savedPlans));
    setActivePlanId(getActiveCafePlanId());
    setHistory(getSubscriptionHistory());

    const pending = getPendingSubscription();
    if (pending?.paymentStatus === "pending") {
      setSelectedPlanId(pending.planId);
      setStep("invoice");
    }
  }, []);

  const activePlan = plans.find((plan) => plan.id === activePlanId);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const pending = getPendingSubscription();

  const vat = useMemo(() => {
    if (!selectedPlan) return 0;
    return Math.round(selectedPlan.priceMonthly * 0.15 * 100) / 100;
  }, [selectedPlan]);

  const total = useMemo(() => {
    if (!selectedPlan) return 0;
    return selectedPlan.priceMonthly + vat;
  }, [selectedPlan, vat]);

  function choosePlan(planId: string) {
    if (planId === activePlanId) return;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    startPlanCheckout(plan.id, plan.name, plan.priceMonthly);
    setSelectedPlanId(planId);
    setStep("invoice");
    setHistory(getSubscriptionHistory());
  }

  function payAndActivate() {
    if (!selectedPlan) return;
    setPaying(true);

    setTimeout(() => {
      const ok = completePlanPayment();
      setPaying(false);

      if (ok) {
        setActivePlanId(selectedPlan.id);
        setStep("done");
        setHistory(getSubscriptionHistory());
        alert("تم الدفع وتفعيل الباقة بنجاح");
        window.location.reload();
      } else {
        alert("تعذر إتمام الدفع");
      }
    }, 1200);
  }

  function simulateFailedPayment() {
    failPlanPayment();
    setHistory(getSubscriptionHistory());
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
        action={<BrandaLogo variant="brown" width={140} height={56} />}
      >
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
