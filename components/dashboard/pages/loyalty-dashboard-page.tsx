"use client";

import Link from "next/link";
import { CreditCard, Edit3, Sparkles, ToggleLeft, ToggleRight, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { LoyaltyCardPreview } from "@/components/loyalty/loyalty-card-preview";
import { LoyaltyPointsSettings } from "@/components/loyalty/loyalty-points-settings";
import { LoyaltyPointsSummary } from "@/components/loyalty/loyalty-points-summary";
import { LoyaltySectionTabs, type LoyaltySectionTab } from "@/components/loyalty/loyalty-section-tabs";
import { useLoyaltyDemoState } from "@/components/loyalty/use-loyalty-demo-state";
import { DashboardPageShell } from "@/components/ui/design-system";
import type { LoyaltyDashboardDemoState } from "@/lib/loyalty/types";

export function LoyaltyDashboardPage() {
  const [activeTab, setActiveTab] = useState<LoyaltySectionTab>("card");
  const [state, setState] = useLoyaltyDemoState();

  const redeemableValue = useMemo(
    () => Math.round(state.points.customerPointsBalance * state.points.pointValueSar * 100) / 100,
    [state.points.customerPointsBalance, state.points.pointValueSar]
  );

  function patchState(next: Partial<LoyaltyDashboardDemoState>) {
    setState({ ...state, ...next });
  }

  function toggleCard() {
    patchState({ card: { ...state.card, enabled: !state.card.enabled } });
  }

  function togglePoints() {
    patchState({
      points: { ...state.points, enabled: !state.points.enabled },
      card: { ...state.card, pointsBadgeVisible: !state.points.enabled },
    });
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الولاء والمكافآت"
        subtitle="لوحة مدمجة لإدارة تفعيل بطاقة الولاء ونقاط الولاء، مع مصمم مستقل للبطاقة."
        action={
          <Link
            href="/dashboard/loyalty/card-designer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#4A281D] px-5 py-3 text-sm font-black text-[#FCF8F3] shadow-[0_14px_30px_rgba(49,25,18,0.18)]"
          >
            <Edit3 className="h-4 w-4" />
            تصميم البطاقة
          </Link>
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-[14px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-[#806A5E]">بطاقة الولاء</p>
              <CreditCard className="h-4 w-4 text-[#6B3A25]" />
            </div>
            <p className="mt-2 text-lg font-black text-[#311912]">{state.card.enabled ? "مفعلة" : "متوقفة"}</p>
          </div>
          <div className="rounded-[14px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-[#806A5E]">نقاط الولاء</p>
              <Sparkles className="h-4 w-4 text-[#6B3A25]" />
            </div>
            <p className="mt-2 text-lg font-black text-[#311912]">{state.points.enabled ? "مفعلة" : "متوقفة"}</p>
          </div>
          <div className="rounded-[14px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-[#806A5E]">الأختام</p>
              <WalletCards className="h-4 w-4 text-[#6B3A25]" />
            </div>
            <p className="mt-2 text-lg font-black text-[#311912]">{state.card.completedStamps} / {state.card.stampsRequired}</p>
          </div>
          <div className="rounded-[14px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-[#806A5E]">قيمة النقاط</p>
              <Sparkles className="h-4 w-4 text-[#6B3A25]" />
            </div>
            <p className="mt-2 text-lg font-black text-[#311912]">{redeemableValue} ر.س</p>
          </div>
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <LoyaltySectionTabs value={activeTab} onChange={setActiveTab} />
          <button
            type="button"
            onClick={toggleCard}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${
              state.card.enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {state.card.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {state.card.enabled ? "إيقاف بطاقة الولاء" : "تفعيل بطاقة الولاء"}
          </button>
          <button
            type="button"
            onClick={togglePoints}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${
              state.points.enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {state.points.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {state.points.enabled ? "إيقاف نقاط الولاء" : "تفعيل نقاط الولاء"}
          </button>
        </div>

        {activeTab === "card" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.65fr)]">
            <section className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-[#311912]">بطاقة الولاء</h2>
                  <p className="mt-1 text-xs font-bold leading-5 text-[#806A5E]">
                    التصميم الكامل موجود في صفحة المصمم، وهذه معاينة مدمجة للتصميم المحفوظ.
                  </p>
                </div>
                <Link
                  href="/dashboard/loyalty/card-designer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#6B3A25] px-4 py-2 text-sm font-black text-[#6B3A25]"
                >
                  <Edit3 className="h-4 w-4" />
                  تصميم البطاقة
                </Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[14px] bg-[#FCF8F3] p-3">
                  <p className="text-xs font-black text-[#806A5E]">العنوان</p>
                  <p className="mt-1 text-sm font-black text-[#311912]">{state.card.cardTitle}</p>
                </div>
                <div className="rounded-[14px] bg-[#FCF8F3] p-3">
                  <p className="text-xs font-black text-[#806A5E]">المكافأة</p>
                  <p className="mt-1 text-sm font-black text-[#311912]">{state.card.rewardTitle}</p>
                </div>
                <div className="rounded-[14px] bg-[#FCF8F3] p-3">
                  <p className="text-xs font-black text-[#806A5E]">العناصر</p>
                  <p className="mt-1 text-sm font-black text-[#311912]">
                    {state.card.barcodeVisible ? "باركود" : "بدون باركود"} / {state.card.pointsBadgeVisible ? "وسم نقاط" : "بدون وسم نقاط"}
                  </p>
                </div>
              </div>
            </section>

            <aside className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-black text-[#311912]">المعاينة المحفوظة</h2>
                <span className="rounded-xl bg-[#FFF8EA] px-3 py-1 text-xs font-black text-[#6B3A25]">محلية</span>
              </div>
              <LoyaltyCardPreview
                card={{
                  ...state.card,
                  pointsBadgeVisible: state.points.enabled && state.card.pointsBadgeVisible,
                }}
                pointsBalance={state.points.enabled ? state.points.customerPointsBalance : 0}
                pointValueSar={state.points.pointValueSar}
                compact
              />
            </aside>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.7fr)]">
            <LoyaltyPointsSettings
              value={state.points}
              onChange={(points) => patchState({ points })}
            />
            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <div className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
                <h2 className="text-base font-black text-[#311912]">ملخص نقاط الولاء</h2>
                <div className="mt-4">
                  <LoyaltyPointsSummary points={state.points} />
                </div>
              </div>
              <div className="rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
                <h3 className="text-sm font-black text-[#311912]">السياسة الظاهرة</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">{state.points.policyText}</p>
              </div>
            </aside>
          </div>
        )}
      </DashboardPageShell>
    </div>
  );
}
