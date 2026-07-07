import Link from "next/link";
import {
  Activity,
  CalendarDays,
  Gift,
  LockKeyhole,
  Receipt,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type {
  GrowthDashboardData,
  GrowthMetricKey,
  GrowthPeriod,
  GrowthRecentItem,
  GrowthRecommendation,
} from "@/lib/data/growth";

type Props = {
  data: GrowthDashboardData | null;
  period: GrowthPeriod;
  configError?: string;
};

const metricIcons: Record<GrowthMetricKey, typeof Receipt> = {
  totalOrders: Receipt,
  acceptedOrders: Receipt,
  rejectedOrders: Receipt,
  reservations: CalendarDays,
  loyaltyOperations: Gift,
  rewardRedemptions: Gift,
  visits: Activity,
  cashierActivity: TrendingUp,
};

const periodOptions: Array<{ key: GrowthPeriod; label: string }> = [
  { key: "7", label: "آخر 7 أيام" },
  { key: "30", label: "آخر 30 يوم" },
  { key: "90", label: "آخر 90 يوم" },
];

const recommendationToneClass: Record<GrowthRecommendation["tone"], string> = {
  gold: "border-[#D9A33F]/35 bg-[#FFF7E3] text-[#4A281D]",
  green: "border-emerald-200 bg-emerald-50 text-emerald-950",
  blue: "border-sky-200 bg-sky-50 text-sky-950",
  muted: "border-[#E7D7C6] bg-white text-[#311912]",
};

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[#D8C4B3] bg-[#FCF8F3] p-4 text-sm font-bold text-[#806A5E]">
      لا توجد بيانات ضمن الفترة المحددة.
    </div>
  );
}

function RecentList({
  title,
  items,
}: {
  title: string;
  items: GrowthRecentItem[];
}) {
  return (
    <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <h2 className="text-base font-black text-[#311912]">{title}</h2>
      <div className="mt-4 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="rounded-xl bg-[#FCF8F3] p-3">
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#311912]">{item.title}</p>
                  <p className="truncate text-xs font-bold text-[#806A5E]">{item.subtitle}</p>
                </div>
                <p className="shrink-0 text-xs font-black text-[#6B3A25]">{item.meta}</p>
              </div>
              <p className="mt-2 text-[11px] font-bold text-[#9B887B]">{item.createdAt}</p>
            </div>
          ))
        ) : (
          <EmptyState />
        )}
      </div>
    </section>
  );
}

function LockedGrowthPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
      <div className="rounded-3xl border border-[#E7D7C6] bg-white p-6 text-center shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-[#311912]">مركز النمو غير مفعّل في باقتك الحالية</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-7 text-[#806A5E]">
          تواصل مع الأدمن لتفعيل الميزة.
        </p>
      </div>
    </div>
  );
}

export function GrowthPage({ data, period, configError }: Props) {
  if (!data) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          {configError ?? "تعذر تحميل مركز النمو"}
        </div>
      </div>
    );
  }

  if (!data.enabled) return <LockedGrowthPage />;

  return (
    <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">لوحة برندة</p>
          <h1 className="mt-1.5 text-2xl font-black text-[#311912] lg:text-3xl">مركز النمو</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#806A5E]">
            مؤشرات وتوصيات تساعدك على فهم نشاط علامتك وزيادة المبيعات.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
          <Sparkles className="h-4 w-4" />
          Growth OS v1
        </div>
      </header>

      {configError ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">
          {configError}
        </div>
      ) : null}

      <nav className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-[#E7D7C6] bg-white p-3 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]" aria-label="فلتر مدة مركز النمو">
        {periodOptions.map((option) => {
          const active = option.key === period;
          return (
            <Link
              key={option.key}
              href={`/dashboard/growth?period=${option.key}`}
              className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                active
                  ? "bg-[#4A281D] text-white shadow-[0_10px_22px_rgba(49,25,18,0.18)]"
                  : "bg-[#FCF8F3] text-[#6B3A25] hover:bg-[#F5E8DA]"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => {
          const Icon = metricIcons[metric.key];
          return (
            <article key={metric.key} className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-[#F8F4EF] px-2.5 py-1 text-[11px] font-black text-[#806A5E]">
                  {data.periodDays} يوم
                </span>
              </div>
              <p className="text-xs font-black text-[#806A5E]">{metric.label}</p>
              <p className="mt-1.5 text-3xl font-black text-[#311912]">{metric.value}</p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">{metric.hint}</p>
            </article>
          );
        })}
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {data.comparisons.map((comparison) => (
          <article key={comparison.key} className="rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] p-4">
            <p className="text-sm font-black text-[#311912]">{comparison.label}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black text-[#806A5E]">الفترة الحالية</p>
                <p className="text-2xl font-black text-[#311912]">{comparison.current}</p>
              </div>
              <div>
                <p className="text-[11px] font-black text-[#806A5E]">الفترة السابقة</p>
                <p className="text-2xl font-black text-[#6B3A25]">{comparison.previous}</p>
              </div>
            </div>
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#806A5E]">{comparison.message}</p>
          </article>
        ))}
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {data.recommendations.map((recommendation) => (
          <article key={recommendation.title} className={`rounded-2xl border p-4 ${recommendationToneClass[recommendation.tone]}`}>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-base font-black">{recommendation.title}</h2>
            <p className="mt-2 text-sm font-bold leading-7">{recommendation.body}</p>
          </article>
        ))}
        <article className="rounded-2xl border border-[#D9A33F]/35 bg-[#1A1117] p-4 text-[#FCF8F3]">
          <span className="rounded-full bg-[#D9A33F]/20 px-3 py-1 text-xs font-black text-[#F0C568]">
            قريبًا
          </span>
          <h2 className="mt-4 text-base font-black">حملات واتساب</h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#D8C4B3]">
            تجهيز حملات النمو سيأتي لاحقًا بدون إرسال أو إنشاء حملات في هذه المرحلة.
          </p>
        </article>
      </section>

      {data.missingSources.length ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-800">
          بعض مصادر البيانات غير متاحة حاليًا، لذلك عُرضت قيمها كحالة فارغة بدون بيانات بديلة.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <RecentList title="أحدث الطلبات" items={data.recent.orders} />
        <RecentList title="أحدث الحجوزات" items={data.recent.reservations} />
        <RecentList title="أحدث عمليات الولاء" items={data.recent.loyalty} />
        <RecentList title="أحدث المكافآت المصروفة" items={data.recent.rewards} />
      </div>
    </div>
  );
}
