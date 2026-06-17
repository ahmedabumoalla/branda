"use client";

import { Check, Crown, Layers3, Receipt, X } from "lucide-react";
import { useMemo, useState } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { BarndaksaCardPaymentButton } from "@/components/payments/barndaksa-card-payment-button";
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
  fetchOwnerPendingSubscriptionAction,
  fetchOwnerSubscriptionHistoryAction,
  startPlanCheckoutAction,
  validatePlanCouponAction,
} from "@/app/actions/subscription";
import type {
  PendingSubscription,
  SubscriptionRecord,
} from "@/lib/platform/subscription";
import {
  calculateSubscriptionAmount,
  formatSubscriptionDuration,
  getPlanDurationOptions,
  isPlanOfferActive,
  getPlanMonthlyAmount,
} from "@/lib/platform/subscription-durations";

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
  const [paying] = useState(false);
  const [history, setHistory] = useState<SubscriptionRecord[]>(initialHistory);
  const [pending, setPending] = useState<PendingSubscription | null>(initialPending);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState<string | undefined>();
  const [selectedHistoryRecordId, setSelectedHistoryRecordId] = useState<string | null>(null);
  const [selectedDurationMonths, setSelectedDurationMonths] = useState(1);

  const activePlan = plans.find((plan) => plan.id === activePlanId);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const selectedHistoryRecord = history.find((record) => record.id === selectedHistoryRecordId) ?? null;
  const selectedHistoryPlan = selectedHistoryRecord ? plans.find((plan) => plan.id === selectedHistoryRecord.planId) : null;

  const selectedPlanAmount = useMemo(() => {
    if (!selectedPlan) return 0;
    return calculateSubscriptionAmount(selectedPlan, selectedDurationMonths);
  }, [selectedDurationMonths, selectedPlan]);

  const selectedPlanMonthlyAmount = useMemo(() => {
    if (!selectedPlan) return 0;
    return getPlanMonthlyAmount(selectedPlan);
  }, [selectedPlan]);

  const total = useMemo(() => {
    if (!selectedPlan) return 0;
    return Math.max(0, Math.round((selectedPlanAmount - couponDiscount) * 100) / 100);
  }, [couponDiscount, selectedPlan, selectedPlanAmount]);

  async function applyCoupon() {
    if (!selectedPlan || !couponCode.trim()) {
      setCouponApplied(undefined);
      setCouponDiscount(0);
      setCouponMessage("اكتب كوبون الخصم أولًا");
      return;
    }

    try {
      const preview = await validatePlanCouponAction(selectedPlan.id, couponCode, selectedDurationMonths);
      setCouponMessage(preview.message);
      if (!preview.ok) {
        setCouponApplied(undefined);
        setCouponDiscount(0);
        return;
      }
      setCouponApplied(preview.code);
      setCouponDiscount(preview.discountAmount ?? 0);
      if (pending?.id) {
        const subscriptionId = await startPlanCheckoutAction(selectedPlan.id, preview.code, selectedDurationMonths);
        setPending({
          id: subscriptionId,
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          amount: preview.totalAmount ?? Math.max(0, selectedPlanAmount - (preview.discountAmount ?? 0)),
          paymentStatus: "pending",
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      setCouponMessage("تعذر التحقق من الكوبون");
      setCouponApplied(undefined);
      setCouponDiscount(0);
    }
  }

  async function choosePlan(planId: string) {
    if (planId === activePlanId) return;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    try {
      const subscriptionId = await startPlanCheckoutAction(plan.id, couponApplied ?? couponCode, selectedDurationMonths);
      const nextPending: PendingSubscription = {
        id: subscriptionId,
        planId: plan.id,
        planName: plan.name,
        amount: Math.max(0, Math.round((calculateSubscriptionAmount(plan, selectedDurationMonths) - couponDiscount) * 100) / 100),
        paymentStatus: "pending",
        createdAt: new Date().toISOString(),
      };
      setPending(nextPending);
      setSelectedPlanId(planId);
      setStep("invoice");
    } catch {
      alert("تعذر بدء عملية الاشتراك");
    }
  }

  async function refreshAfterPayment() {
    if (!selectedPlan) return;
    setActivePlanId(selectedPlan.id);
    setPending(null);
    setStep("done");
    setHistory(await fetchOwnerSubscriptionHistoryAction());
    window.setTimeout(() => window.location.reload(), 800);
  }

  const statusLabel: Record<string, string> = {
    pending: "لم يكتمل الدفع",
    paid: "مدفوع",
    failed: "فشل",
  };

  function formatLimit(value?: number | null, unit = "") {
    if (value == null || value <= 0) return "غير محدود";
    return `${value.toLocaleString("ar-SA")} ${unit}`.trim();
  }

  function getPlanLimits(plan?: PlatformPlan | null) {
    if (!plan) return [];
    return [
      { label: "الطلبات الشهرية", value: formatLimit(plan.maxOrdersMonthly, "طلب") },
      { label: "المنتجات المعروضة", value: formatLimit(plan.maxProductsMonthly, "منتج") },
      { label: "الحجوزات الشهرية", value: formatLimit(plan.maxReservationsMonthly, "حجز") },
      { label: "الفروع", value: formatLimit(plan.maxBranches, "فرع") },
      { label: "مدة التجربة", value: plan.trialDays && plan.trialDays > 0 ? `${plan.trialDays} يوم` : "بدون تجربة" },
    ];
  }

  async function refreshRecordAfterPayment(record: SubscriptionRecord) {
    setActivePlanId(record.planId);
    setPending(null);
    setSelectedHistoryRecordId(null);
    setStep("done");
    setHistory(await fetchOwnerSubscriptionHistoryAction());
    window.setTimeout(() => window.location.reload(), 800);
  }

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
                  <p className="text-sm text-[#F2E7D9]">السعر شامل الضريبة</p>
                  <p className="mt-1 text-4xl font-black">{activePlan.priceMonthly} ر.س</p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {getPlanLimits(activePlan).map((limit) => (
                    <div key={limit.label} className="rounded-2xl bg-white/10 px-4 py-3">
                      <p className="text-xs font-black text-[#F2E7D9]">{limit.label}</p>
                      <p className="mt-1 text-sm font-black text-[#F0C568]">{limit.value}</p>
                    </div>
                  ))}
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
                  undefined
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
                const offerActive = isPlanOfferActive(plan);
                const monthlyAmount = getPlanMonthlyAmount(plan);
                const durationOptions = getPlanDurationOptions(plan);

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
                    <div className="mt-4">
                      <p className={`text-xs font-black ${isCurrent ? "text-[#F2E7D9]" : "text-[#806A5E]"}`}>السعر الأساسي شامل الضريبة</p>
                      <p className={`${offerActive ? "text-sm line-through opacity-70" : "text-3xl"} font-black ${isCurrent ? "text-[#F0C568]" : "text-[#6B3A25]"}`}>
                        {plan.priceMonthly} ر.س / شهر
                      </p>
                      {offerActive ? (
                        <div className="mt-2 rounded-2xl bg-[#D9A33F]/15 px-3 py-2">
                          <p className={`text-3xl font-black ${isCurrent ? "text-[#F0C568]" : "text-[#6B3A25]"}`}>{monthlyAmount} ر.س / شهر</p>
                          <p className={`text-xs font-black ${isCurrent ? "text-[#F2E7D9]" : "text-[#806A5E]"}`}>
                            {plan.offerLabel || "عرض على الباقة"}{plan.offerEndsAt ? ` ينتهي في ${plan.offerEndsAt}` : " لفترة محدودة"}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2">
                      {getPlanLimits(plan).map((limit) => (
                        <div
                          key={limit.label}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-black ${
                            isCurrent ? "bg-white/10 text-[#FCF8F3]" : "bg-white text-[#6B3A25]"
                          }`}
                        >
                          <span>{limit.label}</span>
                          <span>{limit.value}</span>
                        </div>
                      ))}
                    </div>

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

                    {!isCurrent ? (
                      <div className="mt-5 rounded-2xl bg-white/70 p-3">
                        <label className="mb-2 block text-xs font-black text-[#806A5E]">مدة الاشتراك</label>
                        <select
                          value={selectedPlanId === plan.id ? selectedDurationMonths : 1}
                          onChange={(event) => {
                            setSelectedPlanId(plan.id);
                            setSelectedDurationMonths(Number(event.target.value));
                            setCouponApplied(undefined);
                            setCouponDiscount(0);
                            setCouponMessage("");
                          }}
                          className="h-12 w-full rounded-xl border border-[#E7D7C6] bg-white px-3 font-black text-[#311912]"
                        >
                          {durationOptions.map((option) => (
                            <option key={option.months} value={option.months}>
                              {option.label}{option.badge ? ` — ${option.badge}` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-sm font-black text-[#6B3A25]">
                          الإجمالي: {calculateSubscriptionAmount(plan, selectedPlanId === plan.id ? selectedDurationMonths : 1)} ر.س قبل الكوبون
                        </p>
                      </div>
                    ) : null}

                    <PrimaryButton
                      onClick={() => {
                        if (selectedPlanId !== plan.id) {
                          setSelectedPlanId(plan.id);
                          setSelectedDurationMonths(1);
                        }
                        choosePlan(plan.id);
                      }}
                      disabled={isCurrent}
                      className="mt-5 w-full"
                    >
                      {isCurrent ? "مفعّلة حاليًا" : "اختيار الباقة"}
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
                    الباقة المختارة: {selectedPlan.name} — مدة الاشتراك {formatSubscriptionDuration(selectedDurationMonths)}
                  </p>
                </div>
              </div>

              <SoftCard className="mt-6 space-y-4">
                <div className="flex justify-between font-bold">
                  <span>سعر الباقة شامل الضريبة ({formatSubscriptionDuration(selectedDurationMonths)})</span>
                  <span>{selectedPlanAmount} ر.س</span>
                </div>
                <div className="rounded-2xl border border-[#E7D7C6] bg-white p-3">
                  <label className="mb-2 block text-xs font-black text-[#806A5E]">كوبون خصم اختياري</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={couponCode}
                      onChange={(event) => {
                        setCouponCode(event.target.value.toUpperCase());
                        setCouponApplied(undefined);
                        setCouponDiscount(0);
                        setCouponMessage("");
                      }}
                      placeholder="اكتب كوبون الخصم"
                      className="min-h-12 flex-1 rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] px-4 font-black text-[#311912] outline-none"
                    />
                    <button
                      type="button"
                      onClick={applyCoupon}
                      className="rounded-xl bg-[#3A2117] px-5 py-3 font-black text-white"
                    >
                      تطبيق
                    </button>
                  </div>
                  {couponMessage ? <p className="mt-2 text-xs font-black text-[#6B3A25]">{couponMessage}</p> : null}
                </div>
                {couponDiscount > 0 ? (
                  <div className="flex justify-between font-bold text-emerald-700">
                    <span>خصم الكوبون</span>
                    <span>- {couponDiscount} ر.س</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-[#E7D7C6] pt-4 text-xl font-black text-[#311912]">
                  <span>الإجمالي شامل الضريبة</span>
                  <span>{total} ر.س</span>
                </div>
              </SoftCard>

              <p className="mt-4 text-sm font-bold text-[#806A5E]">
                لن يتم تغيير الباقة الحالية ({activePlan?.name}) إلا بعد إتمام الدفع بنجاح.
              </p>

              {paymentMessage ? (
                <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-center text-sm font-black text-emerald-700">
                  {paymentMessage}
                </div>
              ) : null}

              <div className="mt-6 space-y-4">
                <BarndaksaCardPaymentButton
                  subscriptionId={pending?.id}
                  disabled={!pending?.id || paying}
                  onMessage={setPaymentMessage}
                  onPaid={refreshAfterPayment}
                />
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="w-full rounded-2xl border border-[#E7D7C6] px-6 py-4 font-black text-[#806A5E]"
                >
                  تغيير الباقة
                </button>
              </div>
            </BentoCard>

            <BentoCard variant="white" span="2">
              <h3 className="text-lg font-black text-[#311912]">حدود ومميزات الباقة</h3>
              <div className="mt-4 grid gap-2">
                {getPlanLimits(selectedPlan).map((limit) => (
                  <div key={limit.label} className="flex justify-between rounded-xl bg-[#FCF8F3] px-4 py-3 text-sm font-black text-[#6B3A25]">
                    <span>{limit.label}</span>
                    <span>{limit.value}</span>
                  </div>
                ))}
              </div>
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
                <div
                  key={record.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedHistoryRecordId(record.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedHistoryRecordId(record.id);
                  }}
                  className="md:col-span-4 cursor-pointer rounded-[24px] border border-[#E7D7C6] bg-[#FCF8F3] p-4 text-right text-[#311912] shadow-[8px_8px_24px_rgba(49,25,18,0.06),-6px_-6px_20px_rgba(255,255,255,0.9)] transition hover:border-[#D9A33F] hover:shadow-[0_18px_45px_rgba(49,25,18,0.10)] sm:rounded-[32px] sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-black">{record.planName}</h3>
                      <p className="mt-1 text-sm font-bold text-[#806A5E]">
                        {record.amount} ر.س • {record.createdAt.slice(0, 10)}
                        {record.paidAt ? ` • دُفع: ${record.paidAt.slice(0, 10)}` : ""}
                        {record.paymentMethodLabel ? ` • ${record.paymentMethodLabel}` : ""}
                      </p>
                      <p className="mt-2 text-xs font-black text-[#6B3A25]">اضغط لعرض تفاصيل السجل والفاتورة</p>
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
                </div>
              ))
            ) : (
              <BentoCard variant="white" span="4">
                <p className="font-bold text-[#806A5E]">لا يوجد سجل اشتراكات بعد.</p>
              </BentoCard>
            )}
          </BentoGrid>
        </section>
        {selectedHistoryRecord ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#E7D7C6] bg-[#FCF8F3] p-5 shadow-[0_30px_80px_rgba(49,25,18,0.30)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-[#806A5E]">تفاصيل سجل الاشتراك</p>
                  <h3 className="mt-1 text-2xl font-black text-[#311912]">{selectedHistoryRecord.planName}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryRecordId(null)}
                  className="rounded-2xl bg-white p-3 text-[#6B3A25]"
                  aria-label="إغلاق"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-black text-[#806A5E]">نوع السجل</p>
                  <p className="mt-1 font-black text-[#311912]">اشتراك / تجديد باقة</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-black text-[#806A5E]">حالة الدفع</p>
                  <p className="mt-1 font-black text-[#311912]">{statusLabel[selectedHistoryRecord.paymentStatus]}</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-black text-[#806A5E]">المبلغ شامل الضريبة</p>
                  <p className="mt-1 font-black text-[#311912]">{selectedHistoryRecord.amount} ر.س</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-black text-[#806A5E]">تاريخ إنشاء السجل</p>
                  <p className="mt-1 font-black text-[#311912]">{selectedHistoryRecord.createdAt.slice(0, 10)}</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-black text-[#806A5E]">تاريخ الدفع</p>
                  <p className="mt-1 font-black text-[#311912]">{selectedHistoryRecord.paidAt ? selectedHistoryRecord.paidAt.slice(0, 10) : "لم يدفع بعد"}</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-black text-[#806A5E]">طريقة الدفع</p>
                  <p className="mt-1 font-black text-[#311912]">{selectedHistoryRecord.paymentMethodLabel ?? "لم تحدد"}</p>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-[#E7D7C6] bg-white p-4">
                <h4 className="font-black text-[#311912]">حدود الباقة</h4>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {getPlanLimits(selectedHistoryPlan).map((limit) => (
                    <div key={limit.label} className="flex justify-between rounded-xl bg-[#FCF8F3] px-3 py-2 text-sm font-black text-[#6B3A25]">
                      <span>{limit.label}</span>
                      <span>{limit.value}</span>
                    </div>
                  ))}
                </div>
                {!selectedHistoryPlan ? (
                  <p className="mt-3 text-sm font-bold text-[#806A5E]">تفاصيل هذه الباقة غير متاحة لأنها غير موجودة ضمن الباقات الحالية.</p>
                ) : null}
              </div>

              {selectedHistoryRecord.paymentStatus === "pending" ? (
                <div className="mt-5">
                  <BarndaksaCardPaymentButton
                    subscriptionId={selectedHistoryRecord.id}
                    onMessage={setPaymentMessage}
                    onPaid={() => refreshRecordAfterPayment(selectedHistoryRecord)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </DashboardPageShell>
    </div>
  );
}
