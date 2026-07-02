"use client";

import { useParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gift,
  History,
  ImageIcon,
  Link as LinkIcon,
  MessageCircle,
  QrCode,
  Search,
  Send,
  Sparkles,
  Trophy,
  WalletCards,
  X,
} from "lucide-react";
import { fetchCustomerAccountSnapshotAction } from "@/app/actions/customer-account";
import {
  fetchCustomerExperienceRewardsAction,
  submitCustomerExperienceRewardProofAction,
} from "@/app/actions/experience-rewards";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import {
  CustomerBottomDock,
  defaultCustomerDockItems,
} from "@/components/cafe/themes/customer-mobile-experience";
import { PublicBrowserNav } from "@/components/cafe/public-browser-nav";
import { PublicFeatureUnavailable } from "@/components/cafe/public-feature-guard";
import { CustomerPointsSummary } from "@/components/loyalty/customer-points-summary";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import { getCafePath, getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { publicFeatureAllows } from "@/lib/platform/public-feature-access";
import type { CustomerExperienceReward } from "@/lib/data/experience-rewards";
import type { CustomerLoyaltyCardView } from "@/lib/data/loyalty-cards";
import type { CustomerRewardInstance } from "@/lib/data/customer-rewards";

type ViewMode = "home" | "loyalty" | "experience";
type RewardTab = "current" | "expired";
type CustomerAccountSnapshot = Awaited<
  ReturnType<typeof fetchCustomerAccountSnapshotAction>
>;

const REWARDS_LOAD_ERROR =
  "تعذر تحميل المكافآت. سجل الدخول مرة أخرى أو أعد المحاولة.";
const REWARD_QR_FIT_CLASS =
  "[&>div]:overflow-hidden [&>div]:rounded-[10px] [&>div]:p-2 [&_svg]:block [&_svg]:h-full [&_svg]:w-full";
const EMPTY_CUSTOMER_LOYALTY_POINTS = {
  enabled: false,
  balance: 0,
  usedPoints: 0,
  pointValueSar: 0,
  minimumRedemptionPoints: 0,
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function formatRewardDate(value?: string) {
  if (!value) return "غير محدد";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function daysUntil(value?: string) {
  if (!value) return null;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.ceil((expiresAt.getTime() - today.getTime()) / 86_400_000);
}

function isExperienceRewardExpired(reward: CustomerExperienceReward) {
  const remaining = daysUntil(reward.rewardExpiresAt);
  return (
    reward.status === "redeemed" ||
    reward.status === "rejected" ||
    (remaining !== null && remaining < 0)
  );
}

function isCustomerRewardExpired(reward: CustomerRewardInstance) {
  const remaining = daysUntil(reward.expiresAt ?? undefined);
  return (
    reward.status === "redeemed" ||
    reward.status === "expired" ||
    reward.status === "cancelled" ||
    (remaining !== null && remaining < 0)
  );
}

function customerRewardStatusLabel(reward: CustomerRewardInstance) {
  if (reward.status === "available" && !isCustomerRewardExpired(reward)) {
    return "متاحة";
  }
  if (reward.status === "redeemed") return "مستخدمة";
  if (reward.status === "cancelled") return "ملغاة";
  return "منتهية";
}

function rewardStatusLabel(reward: CustomerExperienceReward) {
  if (reward.status === "approved" && !isExperienceRewardExpired(reward)) {
    return "حالية";
  }
  if (reward.status === "pending") return "تحت المراجعة";
  if (reward.status === "redeemed") return "تم صرفها";
  if (reward.status === "rejected") return "مرفوضة";
  return "منتهية";
}

function rewardTitle(reward: CustomerExperienceReward) {
  if (reward.items.length) {
    return reward.items
      .map((item) => `${item.productName} × ${item.quantity}`)
      .join("، ");
  }
  if (reward.status === "approved") return "مكافأة توثيق تجربة";
  return `توثيق تجربة ${reward.id.slice(0, 8)}`;
}

function matchesExperienceReward(
  reward: CustomerExperienceReward,
  query: string,
) {
  if (!query) return true;
  const haystack = [
    rewardTitle(reward),
    reward.experienceUrl,
    reward.customerNotes,
    reward.reviewNotes,
    reward.status,
    reward.rewardCode,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesCustomerReward(reward: CustomerRewardInstance, query: string) {
  if (!query) return true;
  const haystack = [
    reward.rewardTitle,
    reward.rewardDescription,
    reward.rewardCode,
    reward.status,
    reward.sourceType,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function BrandHeader({
  cafeName,
  logoUrl,
  title,
  onBack,
  action,
}: {
  cafeName: string;
  logoUrl?: string;
  title: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <CafeLogo name={cafeName} logoUrl={logoUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-black text-[var(--ci-muted-fg,#806A5E)]">
            {cafeName}
          </p>
          <h1 className="truncate text-2xl font-black leading-tight text-[var(--ci-page-fg,#311912)]">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {action}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="رجوع إلى صفحة المكافآت"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--ci-border,#E7D7C6)] bg-white text-[var(--ci-page-fg,#311912)] shadow-sm transition active:scale-95"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </header>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ci-muted-fg,#806A5E)]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-[20px] border border-[var(--ci-border,#E7D7C6)] bg-white pr-11 pl-4 text-sm font-bold text-[var(--ci-page-fg,#311912)] outline-none shadow-sm placeholder:text-[var(--ci-muted-fg,#806A5E)]/70 focus:border-[var(--ci-button-bg,#2F7A52)]"
      />
    </label>
  );
}

function HomeActionButton({
  icon: Icon,
  title,
  activeCount,
  onClick,
}: {
  icon: typeof WalletCards;
  title: string;
  activeCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex min-h-[112px] flex-col items-center justify-center gap-3 rounded-[22px] border border-[var(--ci-border,#E7D7C6)] bg-white p-4 text-center shadow-[0_14px_36px_rgba(23,20,18,0.07)] transition active:scale-[0.98]"
    >
      {activeCount ? (
        <span className="absolute left-3 top-3 min-w-6 rounded-full bg-[var(--ci-button-bg,#2F7A52)] px-2 py-1 text-[10px] font-black text-[var(--ci-button-fg,#fff)]">
          {activeCount}
        </span>
      ) : null}
      <span className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[var(--ci-button-bg,#2F7A52)]/10 text-[var(--ci-button-bg,#2F7A52)]">
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-sm font-black text-[var(--ci-page-fg,#311912)]">
        {title}
      </span>
    </button>
  );
}

function SegmentTabs({
  value,
  onChange,
  currentCount,
  expiredCount,
}: {
  value: RewardTab;
  onChange: (value: RewardTab) => void;
  currentCount: number;
  expiredCount: number;
}) {
  const tabs: Array<{ key: RewardTab; label: string; count: number }> = [
    { key: "current", label: "المكافآت الحالية", count: currentCount },
    { key: "expired", label: "المكافآت المنتهية", count: expiredCount },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-black transition active:scale-95 ${
              active
                ? "bg-[var(--ci-button-bg,#2F7A52)] text-[var(--ci-button-fg,#fff)]"
                : "border border-[var(--ci-border,#E7D7C6)] bg-white text-[var(--ci-page-fg,#311912)]"
            }`}
          >
            {tab.label}
            {tab.count ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  active ? "bg-white/18" : "bg-[var(--ci-page-bg,#FCF8F3)]"
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[var(--ci-border,#E7D7C6)] bg-white/80 p-7 text-center shadow-sm">
      <Gift className="mx-auto h-9 w-9 text-[var(--ci-button-bg,#2F7A52)]" />
      <h3 className="mt-3 text-lg font-black text-[var(--ci-page-fg,#311912)]">
        {title}
      </h3>
      <p className="mt-2 text-xs font-bold leading-6 text-[var(--ci-muted-fg,#806A5E)]">
        {desc}
      </p>
    </div>
  );
}

function LoyaltyQrPreviewCard({
  view,
  enabled,
}: {
  view: CustomerLoyaltyCardView | null;
  enabled: boolean;
}) {
  const cardCode = view?.card.cardCode;

  return (
    <section className="rounded-[22px] border border-[var(--ci-border,#E7D7C6)] bg-white/92 p-4 text-center shadow-[0_12px_32px_rgba(23,20,18,0.07)]">
      {enabled && cardCode ? (
        <div className="flex flex-col items-center">
          <p className="text-[11px] font-black text-[var(--ci-muted-fg,#806A5E)]">
            QR بطاقة الولاء
          </p>
          <div className="mt-3 flex h-[156px] w-[156px] items-center justify-center rounded-[16px] bg-white p-2 ring-1 ring-[var(--ci-border,#E7D7C6)]">
            <SecureQrCode
              kind="loyalty-card"
              value={cardCode}
              title={`QR بطاقة الولاء ${cardCode}`}
              size={136}
              className={REWARD_QR_FIT_CLASS}
            />
          </div>
          <p className="mt-3 max-w-full truncate font-mono text-xs font-black tracking-[0.12em] text-[var(--ci-page-fg,#311912)]">
            {cardCode}
          </p>
          <p className="mt-2 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
            اعرضه للكاشير عند الشراء أو صرف المكافأة.
          </p>
        </div>
      ) : (
        <div className="flex min-h-[86px] items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[var(--ci-button-bg,#2F7A52)]/10 text-[var(--ci-button-bg,#2F7A52)]">
            <QrCode className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-[var(--ci-page-fg,#311912)]">
              {enabled
                ? "لا توجد بطاقة ولاء متاحة حاليًا"
                : "سجّل دخولك لعرض بطاقة الولاء"}
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
              سيظهر QR هنا عند توفر بطاقة الولاء في حسابك.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function LoyaltyRewardCard({
  view,
  rewards,
  expired,
}: {
  view: CustomerLoyaltyCardView;
  rewards: CustomerRewardInstance[];
  expired?: boolean;
}) {
  const card = view.card;
  const program = view.program;
  const required = Math.max(1, Number(program.purchasesRequired || 7));
  const current = Math.max(0, Math.min(required, Number(card.stampsInCycle || 0)));
  const remaining = Math.max(required - current, 0);
  const progress = Math.max(0, Math.min(100, (current / required) * 100));
  const readyRewards = rewards.length;

  return (
    <article className="overflow-hidden rounded-[24px] border border-[var(--ci-border,#E7D7C6)] bg-white shadow-[0_14px_38px_rgba(23,20,18,0.08)]">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-[var(--ci-button-bg,#2F7A52)]/10 px-3 py-1 text-[10px] font-black text-[var(--ci-button-bg,#2F7A52)]">
              {expired ? "منتهية" : "حالية"}
            </span>
            <h3 className="mt-2 line-clamp-2 text-base font-black leading-6 text-[var(--ci-page-fg,#311912)]">
              {readyRewards > 0 ? program.rewardName : program.cardTitle}
            </h3>
            <p className="mt-1 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
              {readyRewards > 0
                ? `لديك ${readyRewards} مكافأة جاهزة للصرف`
                : `باقي ${remaining} ختم للوصول إلى ${program.rewardName}`}
            </p>
          </div>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[var(--ci-page-bg,#FCF8F3)] text-[var(--ci-button-bg,#2F7A52)]">
            <Trophy className="h-6 w-6" />
          </span>
        </div>

        <div className="mt-4 rounded-[20px] bg-[var(--ci-page-bg,#FCF8F3)] p-3">
          <div className="flex items-center justify-between gap-3 text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
            <span>تقدم البطاقة</span>
            <span>
              {current} / {required}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <span
              className="block h-full rounded-full bg-[var(--ci-button-bg,#2F7A52)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {program.rewardProductName ? (
          <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-white p-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[var(--ci-page-bg,#FCF8F3)] text-[var(--ci-button-bg,#2F7A52)]">
              <ImageIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black text-[var(--ci-muted-fg,#806A5E)]">
                الجائزة
              </p>
              <p className="truncate text-sm font-black text-[var(--ci-page-fg,#311912)]">
                {program.rewardProductName}
              </p>
            </div>
          </div>
        ) : null}

        {rewards.length ? (
          <div className="mt-3 grid gap-2">
            {rewards.map((reward) => (
              <div
                key={reward.id}
                className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-white p-2.5"
              >
                <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-[14px] bg-white p-1 ring-1 ring-[var(--ci-border,#E7D7C6)]/70">
                  <SecureQrCode
                    kind="customer-reward"
                    value={reward.rewardCode}
                    title={`QR مكافأة الولاء ${reward.rewardCode}`}
                    size={78}
                    className={REWARD_QR_FIT_CLASS}
                  />
                </div>
                <div className="min-w-0 self-center">
                  <p className="text-[10px] font-black text-[var(--ci-muted-fg,#806A5E)]">
                    QR المكافأة
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] font-black tracking-[0.08em] text-[var(--ci-page-fg,#311912)]">
                    {reward.rewardCode}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-[var(--ci-muted-fg,#806A5E)]">
                    {customerRewardStatusLabel(reward)}
                    {reward.expiresAt ? ` · تنتهي في ${formatRewardDate(reward.expiresAt)}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ExperienceRewardCard({
  reward,
  instance,
}: {
  reward: CustomerExperienceReward;
  instance?: CustomerRewardInstance;
}) {
  const expired = isExperienceRewardExpired(reward);
  const ready = reward.status === "approved" && Boolean(reward.rewardCode) && !expired;
  const remaining = daysUntil(reward.rewardExpiresAt);
  const qrCode = instance?.rewardCode || reward.rewardCode;
  const qrKind = instance ? "customer-reward" : "experience-reward";

  return (
    <article className="rounded-[24px] border border-[var(--ci-border,#E7D7C6)] bg-white p-4 shadow-[0_14px_38px_rgba(23,20,18,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black ${
              ready
                ? "bg-[var(--ci-button-bg,#2F7A52)]/10 text-[var(--ci-button-bg,#2F7A52)]"
                : "bg-[var(--ci-page-bg,#FCF8F3)] text-[var(--ci-muted-fg,#806A5E)]"
            }`}
          >
            {rewardStatusLabel(reward)}
          </span>
          <h3 className="mt-2 line-clamp-2 text-base font-black leading-6 text-[var(--ci-page-fg,#311912)]">
            {rewardTitle(reward)}
          </h3>
          <p className="mt-1 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
            أرسل في {formatRewardDate(reward.createdAt)}
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[var(--ci-page-bg,#FCF8F3)] text-[var(--ci-button-bg,#2F7A52)]">
          <Gift className="h-6 w-6" />
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-xs font-bold text-[var(--ci-muted-fg,#806A5E)]">
        <p className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          <a
            href={reward.experienceUrl}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 truncate font-black text-[var(--ci-button-bg,#2F7A52)] underline"
          >
            رابط التجربة
          </a>
        </p>
        <p className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          المشاهدات: {reward.currentViews.toLocaleString("ar-SA")}
        </p>
        <p className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          التعليقات: {reward.currentComments.toLocaleString("ar-SA")}
        </p>
        {reward.rewardExpiresAt ? (
          <p className="flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            تنتهي في {formatRewardDate(reward.rewardExpiresAt)}
            {remaining !== null ? `، ${remaining >= 0 ? `باقي ${remaining} يوم` : "انتهت"}` : ""}
          </p>
        ) : null}
      </div>

      {reward.items.length ? (
        <div className="mt-3 rounded-[18px] bg-[var(--ci-page-bg,#FCF8F3)] p-3">
          <p className="text-[11px] font-black text-[var(--ci-muted-fg,#806A5E)]">
            تفاصيل الجائزة
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reward.items.map((item) => (
              <span
                key={item.id || `${reward.id}-${item.productId}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black text-[var(--ci-page-fg,#311912)]"
              >
                <ImageIcon className="h-3.5 w-3.5 text-[var(--ci-button-bg,#2F7A52)]" />
                {item.productName} × {item.quantity}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {reward.customerNotes ? (
        <p className="mt-3 rounded-[18px] bg-[var(--ci-page-bg,#FCF8F3)] px-3 py-2 text-xs font-bold leading-6 text-[var(--ci-muted-fg,#806A5E)]">
          ملاحظاتك: {reward.customerNotes}
        </p>
      ) : null}

      {reward.reviewNotes ? (
        <p className="mt-3 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] px-3 py-2 text-xs font-bold leading-6 text-[var(--ci-muted-fg,#806A5E)]">
          ملاحظات العلامة: {reward.reviewNotes}
        </p>
      ) : null}

      {ready ? (
        <div className="mt-3 grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-white p-2.5">
          <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-[14px] bg-white p-1 ring-1 ring-[var(--ci-border,#E7D7C6)]/70">
            <SecureQrCode
              kind={qrKind}
              value={qrCode}
              title={`QR مكافأة توثيق التجربة ${qrCode}`}
              size={78}
              className={REWARD_QR_FIT_CLASS}
            />
          </div>
          <div className="min-w-0 self-center">
            <p className="text-[10px] font-black text-[var(--ci-muted-fg,#806A5E)]">
              QR المكافأة
            </p>
            <p className="mt-1 truncate font-mono text-[11px] font-black tracking-[0.08em] text-[var(--ci-page-fg,#311912)]">
              {qrCode}
            </p>
          </div>
        </div>
      ) : expired ? (
        <div className="mt-3 flex items-center gap-2 rounded-[18px] bg-[var(--ci-page-bg,#FCF8F3)] px-3 py-3 text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
          <History className="h-4 w-4" />
          هذه المكافأة منتهية أو تم صرفها.
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-[18px] border border-dashed border-[var(--ci-border,#E7D7C6)] px-3 py-3 text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
          <QrCode className="h-4 w-4" />
          يظهر QR بعد اعتماد العلامة للمكافأة.
        </div>
      )}
    </article>
  );
}

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998]">
      <button
        type="button"
        aria-label="إغلاق النافذة"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/45 backdrop-blur-sm"
      />
      <div className="fixed inset-x-0 bottom-0 z-[9999] mx-auto max-h-[84vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-[var(--ci-border,#E7D7C6)] bg-white p-5 text-[var(--ci-page-fg,#311912)] shadow-2xl">
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ExperienceProofSheet({
  open,
  onClose,
  cafeName,
  busy,
  experienceUrl,
  views,
  comments,
  notes,
  onExperienceUrl,
  onViews,
  onComments,
  onNotes,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  cafeName: string;
  busy: boolean;
  experienceUrl: string;
  views: string;
  comments: string;
  notes: string;
  onExperienceUrl: (value: string) => void;
  onViews: (value: string) => void;
  onComments: (value: string) => void;
  onNotes: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
              توثيق التجربة
            </p>
            <h2 className="text-xl font-black">وثق تجربتك الآن</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--ci-page-bg,#FCF8F3)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
            رابط التجربة
          </span>
          <input
            value={experienceUrl}
            onChange={(event) => onExperienceUrl(event.target.value)}
            placeholder="https://..."
            className="h-12 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] px-4 text-sm font-bold outline-none focus:border-[var(--ci-button-bg,#2F7A52)]"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
              المشاهدات الحالية
            </span>
            <input
              value={views}
              onChange={(event) => onViews(event.target.value)}
              inputMode="numeric"
              className="h-12 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] px-4 text-sm font-bold outline-none focus:border-[var(--ci-button-bg,#2F7A52)]"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
              التعليقات الحالية
            </span>
            <input
              value={comments}
              onChange={(event) => onComments(event.target.value)}
              inputMode="numeric"
              className="h-12 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] px-4 text-sm font-bold outline-none focus:border-[var(--ci-button-bg,#2F7A52)]"
            />
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
            ملاحظات العميل
          </span>
          <textarea
            value={notes}
            onChange={(event) => onNotes(event.target.value)}
            rows={4}
            className="rounded-[18px] border border-[var(--ci-border,#E7D7C6)] px-4 py-3 text-sm font-bold leading-6 outline-none focus:border-[var(--ci-button-bg,#2F7A52)]"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-[var(--ci-button-bg,#2F7A52)] px-5 text-sm font-black text-[var(--ci-button-fg,#fff)] transition active:scale-95 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {busy ? "جاري الإرسال..." : `إرسال إلى ${cafeName} للمراجعة`}
        </button>
      </form>
    </BottomSheet>
  );
}

function RewardsPageInner() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { settings, previewThemeId, features, hydrated } = useCafePageContext(slug);
  const cafeName = settings.cafeName;
  const logoUrl = useResolvedCafeLogoUrl(settings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [query, setQuery] = useState("");
  const [loyaltyTab, setLoyaltyTab] = useState<RewardTab>("current");
  const [experienceTab, setExperienceTab] = useState<RewardTab>("current");
  const [loyaltyView, setLoyaltyView] =
    useState<CustomerLoyaltyCardView | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState(EMPTY_CUSTOMER_LOYALTY_POINTS);
  const [experienceRewards, setExperienceRewards] = useState<
    CustomerExperienceReward[]
  >([]);
  const [customerRewards, setCustomerRewards] = useState<
    CustomerRewardInstance[]
  >([]);
  const [proofOpen, setProofOpen] = useState(false);
  const [experienceUrl, setExperienceUrl] = useState("");
  const [experienceViews, setExperienceViews] = useState("");
  const [experienceComments, setExperienceComments] = useState("");
  const [experienceNotes, setExperienceNotes] = useState("");
  const [submittingProof, setSubmittingProof] = useState(false);

  const loyaltyEnabled = publicFeatureAllows(features, "loyalty_card");
  const experienceRewardsEnabled = publicFeatureAllows(features, "experience_reviews");
  const productsEnabled = publicFeatureAllows(features, "menu");
  const reservationsEnabled = publicFeatureAllows(features, "reservations");
  const rewardsPageEnabled = loyaltyEnabled || experienceRewardsEnabled;
  const loginHref = getCustomerLoginHref(slug, `/c/${slug}/rewards`, previewThemeId);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      setLoadedSlug(null);
      setLoyaltyPoints(EMPTY_CUSTOMER_LOYALTY_POINTS);
      try {
        const result: CustomerAccountSnapshot =
          await fetchCustomerAccountSnapshotAction(slug);
        if (cancelled) return;

        if (!result.success || !result.data?.customer) {
          setLoadError(result.message || REWARDS_LOAD_ERROR);
          setLoyaltyView(null);
          setLoyaltyPoints(EMPTY_CUSTOMER_LOYALTY_POINTS);
          setExperienceRewards([]);
          setCustomerRewards([]);
          setLoadedSlug(slug);
          return;
        }

        setLoyaltyView(result.data.loyalty);
        setLoyaltyPoints(result.data.loyaltyPoints);
        setExperienceRewards(result.data.experienceRewards);
        setCustomerRewards(result.data.customerRewards);
        setLoadedSlug(slug);
      } catch (error) {
        if (cancelled) return;
        console.error("[customer-rewards] load", error);
        setLoadError(REWARDS_LOAD_ERROR);
        setLoyaltyView(null);
        setLoyaltyPoints(EMPTY_CUSTOMER_LOYALTY_POINTS);
        setExperienceRewards([]);
        setCustomerRewards([]);
        setLoadedSlug(slug);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const hasCurrentSlugData = loadedSlug === slug;
  const pageLoading = loading || !hasCurrentSlugData;
  const scopedLoyaltyView = hasCurrentSlugData ? loyaltyView : null;
  const scopedExperienceRewards = hasCurrentSlugData ? experienceRewards : [];
  const scopedCustomerRewards = hasCurrentSlugData ? customerRewards : [];
  const scopedLoyaltyPoints = hasCurrentSlugData ? loyaltyPoints : EMPTY_CUSTOMER_LOYALTY_POINTS;
  const loyaltyPointsBalance = scopedLoyaltyPoints.balance;
  const loyaltyUsedPoints = scopedLoyaltyPoints.usedPoints;
  const loyaltyPointValueSar = scopedLoyaltyPoints.pointValueSar;
  const loyaltyMinimumRedemptionPoints = scopedLoyaltyPoints.minimumRedemptionPoints;
  const loyaltyPointsEnabled = Boolean(scopedLoyaltyPoints.enabled);

  const readyExperienceRewards = useMemo(
    () =>
      scopedExperienceRewards.filter(
        (reward) =>
          reward.status === "approved" &&
          Boolean(reward.rewardCode) &&
          !isExperienceRewardExpired(reward),
      ),
    [scopedExperienceRewards],
  );
  const currentExperienceRewards = readyExperienceRewards;
  const expiredExperienceRewards = useMemo(
    () => scopedExperienceRewards.filter(isExperienceRewardExpired),
    [scopedExperienceRewards],
  );
  const loyaltyRewardInstances = useMemo(
    () =>
      scopedCustomerRewards.filter(
        (reward) => reward.sourceType === "loyalty",
      ),
    [scopedCustomerRewards],
  );
  const currentLoyaltyRewards = useMemo(
    () => loyaltyRewardInstances.filter((reward) => !isCustomerRewardExpired(reward)),
    [loyaltyRewardInstances],
  );
  const expiredLoyaltyRewards = useMemo(
    () => loyaltyRewardInstances.filter(isCustomerRewardExpired),
    [loyaltyRewardInstances],
  );
  const experienceRewardInstancesBySourceId = useMemo(
    () =>
      new Map(
        scopedCustomerRewards
          .filter((reward) => reward.sourceType === "experience" && reward.sourceId)
          .map((reward) => [reward.sourceId, reward]),
      ),
    [scopedCustomerRewards],
  );
  const loyaltyReadyCount = currentLoyaltyRewards.length;
  const hasReadyLoyaltyReward = loyaltyReadyCount > 0;
  const normalizedQuery = normalizeText(query);

  const mainActions = useMemo(
    () =>
      [
        {
          key: "loyalty" as const,
          title: "بطاقة ولاء",
          enabled: loyaltyEnabled && Boolean(scopedLoyaltyView),
          activeCount: loyaltyReadyCount,
        },
        {
          key: "experience" as const,
          title: "توثيق التجارب",
          enabled: experienceRewardsEnabled,
          activeCount: readyExperienceRewards.length,
        },
      ].filter(
        (item) =>
          item.enabled && normalizeText(item.title).includes(normalizedQuery),
      ),
    [
      experienceRewardsEnabled,
      loyaltyEnabled,
      loyaltyReadyCount,
      normalizedQuery,
      readyExperienceRewards.length,
      scopedLoyaltyView,
    ],
  );

  const filteredExperienceRewards = useMemo(() => {
    const base =
      experienceTab === "current"
        ? currentExperienceRewards
        : expiredExperienceRewards;
    return base.filter((reward) =>
      matchesExperienceReward(reward, normalizedQuery),
    );
  }, [
    currentExperienceRewards,
    expiredExperienceRewards,
    experienceTab,
    normalizedQuery,
  ]);

  const loyaltyMatches = useMemo(() => {
    if (!normalizedQuery) return true;
    const text = [
      scopedLoyaltyView?.program.cardTitle,
      scopedLoyaltyView?.program.rewardName,
      scopedLoyaltyView?.program.rewardProductName,
      ...loyaltyRewardInstances.map((reward) => `${reward.rewardTitle} ${reward.rewardCode}`),
    ]
      .join(" ")
      .toLowerCase();
    return text.includes(normalizedQuery);
  }, [loyaltyRewardInstances, scopedLoyaltyView, normalizedQuery]);

  async function submitExperienceProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!experienceRewardsEnabled) {
      alert("توثيق التجارب غير مفعل ضمن باقة هذه العلامة");
      return;
    }

    if (!experienceUrl.trim()) {
      alert("أدخل رابط التجربة");
      return;
    }

    setSubmittingProof(true);
    try {
      await submitCustomerExperienceRewardProofAction({
        cafeSlug: slug,
        experienceUrl: experienceUrl.trim(),
        currentViews: Number(experienceViews || 0),
        currentComments: Number(experienceComments || 0),
        customerNotes: experienceNotes.trim() || undefined,
      });

      const items = await fetchCustomerExperienceRewardsAction(slug);
      setExperienceRewards(items);
      setLoadedSlug(slug);
      setExperienceUrl("");
      setExperienceViews("");
      setExperienceComments("");
      setExperienceNotes("");
      setProofOpen(false);
      alert(`تم إرسال التوثيق إلى ${cafeName} للمراجعة`);
    } catch {
      alert("تعذر إرسال التوثيق، تأكد من الرابط وحاول مرة أخرى");
    } finally {
      setSubmittingProof(false);
    }
  }

  let content: ReactNode;

  if (!hydrated || pageLoading) {
    content = (
      <div className="rounded-[24px] bg-white p-8 text-center shadow-sm">
        <p className="font-black text-[var(--ci-page-fg,#311912)]">
          جاري تحميل المكافآت...
        </p>
      </div>
    );
  } else if (!rewardsPageEnabled) {
    content = (
      <>
        <PublicBrowserNav slug={slug} previewThemeId={previewThemeId} features={features} active="rewards" />
        <PublicFeatureUnavailable slug={slug} feature="loyalty" previewThemeId={previewThemeId} title="المكافآت" />
      </>
    );
  } else if (loadError) {
    content = (
      <div className="rounded-[24px] bg-white p-8 text-center shadow-sm">
        <p className="font-black leading-7 text-[var(--ci-page-fg,#311912)]">
          {loadError}
        </p>
        <a
          href={loginHref}
          className="mt-4 inline-flex rounded-[18px] bg-[var(--ci-button-bg,#2F7A52)] px-5 py-3 text-sm font-black text-[var(--ci-button-fg,#fff)]"
        >
          تسجيل الدخول
        </a>
      </div>
    );
  } else if (viewMode === "loyalty") {
    const currentCount = currentLoyaltyRewards.length;
    const expiredCount = expiredLoyaltyRewards.length;
    const visibleLoyaltyRewards =
      loyaltyTab === "current" ? currentLoyaltyRewards : expiredLoyaltyRewards;
    const filteredLoyaltyRewards = visibleLoyaltyRewards.filter((reward) =>
      matchesCustomerReward(reward, normalizedQuery),
    );
    content = (
      <>
        <BrandHeader
          cafeName={cafeName}
          logoUrl={logoUrl}
          title="بطاقة الولاء"
          onBack={() => {
            setViewMode("home");
            setQuery("");
          }}
        />
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="ابحث داخل مكافآت الولاء"
        />
        <CustomerPointsSummary
          pointsBalance={loyaltyPointsBalance}
          pointValueSar={loyaltyPointValueSar}
          usedPoints={loyaltyUsedPoints}
          minimumRedemptionPoints={loyaltyMinimumRedemptionPoints}
          preview={false}
          pointsEnabled={loyaltyPointsEnabled}
        />
        <div className="grid gap-2">
          <p className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
            بطاقة الولاء
          </p>
          <LoyaltyQrPreviewCard
            view={scopedLoyaltyView}
            enabled={loyaltyEnabled}
          />
        </div>
        <SegmentTabs
          value={loyaltyTab}
          onChange={setLoyaltyTab}
          currentCount={currentCount}
          expiredCount={expiredCount}
        />
        <div className="grid gap-3">
          {filteredLoyaltyRewards.length && scopedLoyaltyView && loyaltyMatches ? (
            <LoyaltyRewardCard
              view={scopedLoyaltyView}
              rewards={filteredLoyaltyRewards}
              expired={loyaltyTab === "expired"}
            />
          ) : loyaltyTab === "expired" ? (
            <EmptyState
              title="لا توجد مكافآت منتهية"
              desc="أي مكافآت ولاء مستخدمة أو منتهية ستظهر هنا."
            />
          ) : (
            <EmptyState
              title="لا توجد مكافآت حالية لهذه العلامة"
              desc="ستظهر مكافأة الولاء هنا عند اكتمال شروط البطاقة."
            />
          )}
        </div>
      </>
    );
  } else if (viewMode === "experience") {
    content = (
      <>
        <BrandHeader
          cafeName={cafeName}
          logoUrl={logoUrl}
          title="توثيق التجارب"
          onBack={() => {
            setViewMode("home");
            setQuery("");
          }}
          action={
            <button
              type="button"
              onClick={() => setProofOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--ci-button-bg,#2F7A52)] px-3 text-xs font-black text-[var(--ci-button-fg,#fff)] shadow-sm transition active:scale-95"
            >
              <LinkIcon className="h-4 w-4" />
              وثق تجربتك الآن
            </button>
          }
        />
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="ابحث داخل مكافآت توثيق التجارب"
        />
        <SegmentTabs
          value={experienceTab}
          onChange={setExperienceTab}
          currentCount={currentExperienceRewards.length}
          expiredCount={expiredExperienceRewards.length}
        />
        <div className="grid gap-3">
          {filteredExperienceRewards.length ? (
            filteredExperienceRewards.map((reward) => (
              <ExperienceRewardCard
                key={reward.id}
                reward={reward}
                instance={experienceRewardInstancesBySourceId.get(reward.id)}
              />
            ))
          ) : (
            <EmptyState
              title={
                experienceTab === "current"
                  ? "لا توجد مكافآت حالية لهذه العلامة"
                  : "لا توجد مكافآت منتهية"
              }
              desc={
                experienceTab === "current"
                  ? "وثق تجربتك، وبعد اعتماد العلامة ستظهر المكافأة هنا."
                  : "المكافآت المصروفة أو المنتهية ستظهر هنا."
              }
            />
          )}
        </div>
        <ExperienceProofSheet
          open={proofOpen}
          onClose={() => setProofOpen(false)}
          cafeName={cafeName}
          busy={submittingProof}
          experienceUrl={experienceUrl}
          views={experienceViews}
          comments={experienceComments}
          notes={experienceNotes}
          onExperienceUrl={setExperienceUrl}
          onViews={setExperienceViews}
          onComments={setExperienceComments}
          onNotes={setExperienceNotes}
          onSubmit={submitExperienceProof}
        />
      </>
    );
  } else {
    content = (
      <>
        <BrandHeader cafeName={cafeName} logoUrl={logoUrl} title="المكافآت" />
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="ابحث في المكافآت"
        />
        {loyaltyEnabled ? (
          <div className="grid gap-3">
            <CustomerPointsSummary
              pointsBalance={loyaltyPointsBalance}
              pointValueSar={loyaltyPointValueSar}
              usedPoints={loyaltyUsedPoints}
              minimumRedemptionPoints={loyaltyMinimumRedemptionPoints}
              preview={false}
              pointsEnabled={loyaltyPointsEnabled}
            />
            <LoyaltyQrPreviewCard
              view={scopedLoyaltyView}
              enabled={loyaltyEnabled}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {mainActions.length ? (
            mainActions.map((item) => (
              <HomeActionButton
                key={item.key}
                icon={item.key === "loyalty" ? WalletCards : CheckCircle2}
                title={item.title}
                activeCount={item.activeCount}
                onClick={() => {
                  setViewMode(item.key);
                  setQuery("");
                }}
              />
            ))
          ) : (
            <div className="col-span-2">
              <EmptyState
                title="لا توجد عناصر مكافآت"
                desc="ستظهر بطاقة الولاء وتوثيق التجارب عند تفعيلها للعلامة."
              />
            </div>
          )}
        </div>
        {hasReadyLoyaltyReward || readyExperienceRewards.length ? null : (
          <EmptyState
            title="لا توجد مكافآت حالية لهذه العلامة"
            desc="بطاقة الولاء قد تظهر كهوية للعميل، لكنها لا تُحسب كمكافأة إلا عند توفر مكافأة جاهزة للاسترداد."
          />
        )}
      </>
    );
  }

  return (
    <>
      <section className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-md flex-col gap-4 pb-7 pt-3">
        {content}
      </section>
      <CustomerBottomDock
        {...defaultCustomerDockItems({
          slug,
          previewThemeId,
          active: "rewards",
          hasProducts: productsEnabled,
          hasOrders: reservationsEnabled,
          hasRewards: loyaltyEnabled,
          isCustomer: true,
          businessCategory: settings.businessCategory,
        })}
      />
    </>
  );
}

export default function CafeCustomerRewardsPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug} hideHeader hideFooter hideQuickDock>
      <Suspense
        fallback={
          <p className="p-8 text-center font-black">جاري تحميل المكافآت...</p>
        }
      >
        <RewardsPageInner />
      </Suspense>
    </CafeLayout>
  );
}
