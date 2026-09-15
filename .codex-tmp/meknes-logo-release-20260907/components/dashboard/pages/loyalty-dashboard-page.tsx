"use client";

import Link from "next/link";
import { CreditCard, Edit3, Save, Sparkles, ToggleLeft, ToggleRight, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { saveLoyaltyCardProgramAction } from "@/app/actions/loyalty-cards";
import { saveLoyaltySettingsAction } from "@/app/actions/loyalty";
import { LoyaltyCardPreview } from "@/components/loyalty/loyalty-card-preview";
import { LoyaltyPointsSettings } from "@/components/loyalty/loyalty-points-settings";
import { LoyaltyPointsSummary } from "@/components/loyalty/loyalty-points-summary";
import { LoyaltySectionTabs, type LoyaltySectionTab } from "@/components/loyalty/loyalty-section-tabs";
import { DashboardPageShell, SoftCard } from "@/components/ui/design-system";
import { buildLoyaltyDashboardState } from "@/lib/loyalty/production-state";
import type { LoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import type { LoyaltySettings } from "@/lib/mock/loyalty";
import type { LoyaltyDashboardState, LoyaltyPointsSettings as LoyaltyPointsState } from "@/lib/loyalty/types";

type Props = {
  initialDashboard: LoyaltyCardsDashboard | null;
  initialSettings: LoyaltySettings | null;
  configError?: string;
};

const emptySettings: LoyaltySettings = {
  pointsPerSar: 1,
  welcomePoints: 0,
  enabled: false,
  earnRules: [],
  redemptionRules: [],
};

function pointsToSettings(current: LoyaltySettings, points: LoyaltyPointsState): LoyaltySettings {
  const earnRule = current.earnRules[0] ?? {
    id: "dashboard_earn_rule",
    type: "purchase_per_sar" as const,
    title: points.earningRule,
    enabled: true,
    pointsPerSar: current.pointsPerSar,
  };
  const redemptionRule = current.redemptionRules[0] ?? {
    id: "dashboard_redemption_rule",
    type: "fixed_discount" as const,
    title: points.redemptionRule,
    enabled: true,
    pointsCost: Math.max(1, points.minimumRedemptionPoints || 1),
    discountAmount: 0,
    description: points.policyText,
  };

  return {
    ...current,
    enabled: points.enabled,
    earnRules: [
      {
        ...earnRule,
        enabled: points.enabled,
        title: points.earningRule || earnRule.title,
      },
      ...current.earnRules.slice(1),
    ],
    redemptionRules: [
      {
        ...redemptionRule,
        enabled: points.enabled,
        title: points.redemptionRule || redemptionRule.title,
        pointsCost: Math.max(1, points.minimumRedemptionPoints || redemptionRule.pointsCost || 1),
        description: points.policyText,
      },
      ...current.redemptionRules.slice(1),
    ],
  };
}

export function LoyaltyDashboardPage({ initialDashboard, initialSettings, configError }: Props) {
  const [activeTab, setActiveTab] = useState<LoyaltySectionTab>("card");
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [settings, setSettings] = useState<LoyaltySettings>(initialSettings ?? emptySettings);
  const [state, setState] = useState<LoyaltyDashboardState>(() =>
    buildLoyaltyDashboardState({
      cafeName: initialDashboard?.cafeName ?? "Branda",
      program: initialDashboard?.program ?? null,
      cards: initialDashboard?.cards ?? [],
      settings: initialSettings ?? emptySettings,
    }),
  );
  const [saving, setSaving] = useState<"card" | "points" | null>(null);
  const [message, setMessage] = useState("");

  const redeemableValue = useMemo(
    () => Math.round(state.points.customerPointsBalance * state.points.pointValueSar * 100) / 100,
    [state.points.customerPointsBalance, state.points.pointValueSar],
  );

  const totalPurchases = useMemo(
    () => dashboard?.cards.reduce((sum, card) => sum + card.totalPurchases, 0) ?? 0,
    [dashboard?.cards],
  );

  async function saveCard(nextState = state) {
    if (!dashboard) return;
    setSaving("card");
    setMessage("");
    try {
      const card = nextState.card;
      await saveLoyaltyCardProgramAction({
        enabled: card.enabled,
        cardTitle: card.cardTitle,
        cardSubtitle: card.subtitle,
        purchasesRequired: card.stampsRequired,
        rewardProductId: dashboard.program.rewardProductId,
        rewardName: card.rewardTitle,
        stampLabel: card.stampLabel,
        terms: card.terms,
        cardBackground: card.cardBackground,
        cardForeground: card.cardForeground,
        cardAccent: card.cardAccent,
        cardDesign: card,
      });
      setDashboard((current) =>
        current
          ? {
              ...current,
              program: {
                ...current.program,
                enabled: card.enabled,
                cardTitle: card.cardTitle,
                cardSubtitle: card.subtitle,
                purchasesRequired: card.stampsRequired,
                rewardName: card.rewardTitle,
                stampLabel: card.stampLabel,
                terms: card.terms,
                cardBackground: card.cardBackground,
                cardForeground: card.cardForeground,
                cardAccent: card.cardAccent,
                cardDesign: card,
              },
            }
          : current,
      );
      setMessage("تم حفظ إعدادات بطاقة الولاء.");
    } catch {
      setMessage("تعذر حفظ إعدادات بطاقة الولاء.");
    } finally {
      setSaving(null);
    }
  }

  async function savePoints(nextPoints = state.points) {
    setSaving("points");
    setMessage("");
    try {
      const nextSettings = pointsToSettings(settings, nextPoints);
      await saveLoyaltySettingsAction(nextSettings);
      setSettings(nextSettings);
      setMessage("تم حفظ إعدادات نقاط الولاء.");
    } catch {
      setMessage("تعذر حفظ إعدادات نقاط الولاء.");
    } finally {
      setSaving(null);
    }
  }

  function patchState(next: Partial<LoyaltyDashboardState>) {
    setState((current) => ({ ...current, ...next }));
  }

  function toggleCard() {
    const nextState = { ...state, card: { ...state.card, enabled: !state.card.enabled } };
    setState(nextState);
    void saveCard(nextState);
  }

  function togglePoints() {
    const nextPoints = { ...state.points, enabled: !state.points.enabled };
    const nextState = {
      ...state,
      points: nextPoints,
      card: { ...state.card, pointsBadgeVisible: nextPoints.enabled && state.card.pointsBadgeVisible },
    };
    setState(nextState);
    void savePoints(nextPoints);
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الولاء والمكافآت"
        subtitle="إدارة بطاقة الولاء ونقاط الولاء من بيانات العلامة الحقيقية."
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
        {configError ? <SoftCard className="mb-4 p-4 font-black text-amber-700">{configError}</SoftCard> : null}
        {message ? <SoftCard className="mb-4 p-4 font-black text-[#6B3A25]">{message}</SoftCard> : null}

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <StatCard icon={CreditCard} label="بطاقة الولاء" value={state.card.enabled ? "مفعلة" : "متوقفة"} />
          <StatCard icon={Sparkles} label="نقاط الولاء" value={state.points.enabled ? "مفعلة" : "متوقفة"} />
          <StatCard icon={WalletCards} label="بطاقات العملاء" value={dashboard?.cards.length ?? 0} />
          <StatCard icon={Sparkles} label="قيمة النقاط" value={`${redeemableValue} ر.س`} />
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <LoyaltySectionTabs value={activeTab} onChange={setActiveTab} />
          <button
            type="button"
            onClick={toggleCard}
            disabled={!dashboard || saving === "card"}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${
              state.card.enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            } disabled:opacity-60`}
          >
            {state.card.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {state.card.enabled ? "إيقاف بطاقة الولاء" : "تفعيل بطاقة الولاء"}
          </button>
          <button
            type="button"
            onClick={togglePoints}
            disabled={saving === "points"}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${
              state.points.enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            } disabled:opacity-60`}
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
                    تعرض هذه المعاينة آخر تصميم محفوظ من قاعدة البيانات، مع حالة آمنة عند عدم وجود بطاقات عملاء.
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
                <InfoTile label="العنوان" value={state.card.cardTitle} />
                <InfoTile label="المكافأة" value={state.card.rewardTitle} />
                <InfoTile label="عمليات الشراء" value={totalPurchases} />
              </div>
            </section>

            <aside className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-black text-[#311912]">المعاينة المحفوظة</h2>
                <span className="rounded-xl bg-[#FFF8EA] px-3 py-1 text-xs font-black text-[#6B3A25]">Supabase</span>
              </div>
              <LoyaltyCardPreview
                card={{ ...state.card, pointsBadgeVisible: state.points.enabled && state.card.pointsBadgeVisible }}
                pointsBalance={state.points.customerPointsBalance}
                pointValueSar={state.points.pointValueSar}
                compact
              />
            </aside>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.7fr)]">
            <div>
              <LoyaltyPointsSettings
                value={state.points}
                onChange={(points) => patchState({ points })}
              />
              <button
                type="button"
                onClick={() => savePoints()}
                disabled={saving === "points"}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#4A281D] px-5 py-3 text-sm font-black text-[#FCF8F3] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving === "points" ? "جاري الحفظ" : "حفظ إعدادات النقاط"}
              </button>
            </div>
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

function StatCard({ icon: Icon, label, value }: { icon: typeof CreditCard; label: string; value: string | number }) {
  return (
    <div className="rounded-[14px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-[#806A5E]">{label}</p>
        <Icon className="h-4 w-4 text-[#6B3A25]" />
      </div>
      <p className="mt-2 text-lg font-black text-[#311912]">{value}</p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[14px] bg-[#FCF8F3] p-3">
      <p className="text-xs font-black text-[#806A5E]">{label}</p>
      <p className="mt-1 text-sm font-black text-[#311912]">{value || "غير محدد"}</p>
    </div>
  );
}
