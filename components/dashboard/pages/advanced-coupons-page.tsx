import {
  BadgePercent,
  CalendarClock,
  Clock3,
  LockKeyhole,
  Sparkles,
  Table2,
  TicketPercent,
} from "lucide-react";
import type {
  AdvancedCouponMetric,
  AdvancedCouponMetricKey,
  AdvancedCouponOfferRow,
  AdvancedCouponSuggestion,
  AdvancedCouponsDashboardData,
} from "@/lib/data/advanced-coupons";

type Props = {
  data: AdvancedCouponsDashboardData | null;
  configError?: string;
};

const metricIcons: Record<AdvancedCouponMetricKey, typeof TicketPercent> = {
  activeOffers: TicketPercent,
  expiredOffers: Clock3,
  upcomingOffers: CalendarClock,
  discountOrders: BadgePercent,
};

const statusTone: Record<AdvancedCouponOfferRow["status"], string> = {
  نشط: "bg-emerald-50 text-emerald-700",
  منتهي: "bg-stone-100 text-stone-700",
  قادم: "bg-sky-50 text-sky-700",
  متوقف: "bg-amber-50 text-amber-700",
  مسودة: "bg-[#FCF8F3] text-[#6B3A25]",
};

const suggestionTone: Record<AdvancedCouponSuggestion["key"], string> = {
  winback: "border-amber-200 bg-amber-50 text-amber-950",
  newCustomers: "border-sky-200 bg-sky-50 text-sky-950",
  loyalty: "border-[#D9A33F]/35 bg-[#FFF7E3] text-[#4A281D]",
  quietPeriod: "border-emerald-200 bg-emerald-50 text-emerald-950",
  weakProduct: "border-[#E7D7C6] bg-white text-[#311912]",
};

function MetricValue({ metric }: { metric: AdvancedCouponMetric }) {
  if (metric.value === null) {
    return <span className="text-base font-black text-[#806A5E]">لا توجد بيانات كافية</span>;
  }

  return <span className="text-3xl font-black text-[#311912]">{metric.value}</span>;
}

function LockedAdvancedCouponsPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
      <div className="rounded-3xl border border-[#E7D7C6] bg-white p-6 text-center shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-[#311912]">
          الكوبونات المتقدمة غير مفعّلة في باقتك الحالية
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-7 text-[#806A5E]">
          تواصل مع الأدمن لتفعيل الميزة
        </p>
      </div>
    </div>
  );
}

function EmptyOffersState() {
  return (
    <div className="rounded-2xl border border-dashed border-[#D8C4B3] bg-[#FCF8F3] p-6 text-center">
      <h2 className="text-lg font-black text-[#311912]">
        لا توجد عروض أو كوبونات بعد
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#806A5E]">
        ابدأ بإنشاء عروض من صفحة العروض، وستظهر هنا تحليلاتها.
      </p>
    </div>
  );
}

function OffersTable({ offers }: { offers: AdvancedCouponOfferRow[] }) {
  return (
    <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
          <Table2 className="h-5 w-5" />
        </span>
        <h2 className="text-base font-black text-[#311912]">العروض والكوبونات الحالية</h2>
      </div>

      {offers.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-right text-sm">
            <thead>
              <tr className="border-b border-[#E7D7C6] text-xs font-black text-[#806A5E]">
                <th className="px-3 py-3">الاسم</th>
                <th className="px-3 py-3">الحالة</th>
                <th className="px-3 py-3">تاريخ البداية</th>
                <th className="px-3 py-3">تاريخ النهاية</th>
                <th className="px-3 py-3">نوع الخصم</th>
                <th className="px-3 py-3">عدد الاستخدام</th>
                <th className="px-3 py-3">الحالة المحسوبة</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id} className="border-b border-[#F2E7D9] last:border-0">
                  <td className="px-3 py-3 font-black text-[#311912]">{offer.title}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{offer.rawStatus}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{offer.startDate}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{offer.endDate}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{offer.discountType}</td>
                  <td className="px-3 py-3 font-black text-[#311912]">
                    {offer.usageCount ?? "لا توجد بيانات كافية"}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${statusTone[offer.status]}`}>
                      {offer.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyOffersState />
      )}
    </section>
  );
}

export function AdvancedCouponsPage({ data, configError }: Props) {
  if (!data) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          {configError ?? "تعذر تحميل الكوبونات المتقدمة"}
        </div>
      </div>
    );
  }

  if (!data.enabled) return <LockedAdvancedCouponsPage />;

  return (
    <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">لوحة برندة</p>
          <h1 className="mt-1.5 text-2xl font-black text-[#311912] lg:text-3xl">الكوبونات المتقدمة</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#806A5E]">
            قراءة للعروض والكوبونات الحالية مع اقتراحات نمو مبنية على العملاء والطلبات والولاء، بدون إنشاء كوبونات فعلية في هذه النسخة.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
          <Sparkles className="h-4 w-4" />
          Advanced Coupons v1
        </div>
      </header>

      {configError ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">
          {configError}
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => {
          const Icon = metricIcons[metric.key];
          return (
            <article key={metric.key} className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-xs font-black text-[#806A5E]">{metric.label}</p>
              <p className="mt-1.5 min-h-10">
                <MetricValue metric={metric} />
              </p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">{metric.hint}</p>
            </article>
          );
        })}
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-5">
        {data.suggestions.map((suggestion) => (
          <article key={suggestion.key} className={`rounded-2xl border p-4 ${suggestionTone[suggestion.key]}`}>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
              <BadgePercent className="h-5 w-5" />
            </div>
            <div className="flex min-h-12 items-start justify-between gap-3">
              <h2 className="text-base font-black">{suggestion.title}</h2>
              <span className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-[11px] font-black">
                اقتراح فقط
              </span>
            </div>
            <p className="mt-3 text-xs font-black text-[#6B3A25]">الشريحة المناسبة</p>
            <p className="mt-1 text-sm font-bold leading-7">{suggestion.segment}</p>
            <div className="mt-4 rounded-xl bg-white/70 p-3">
              <p className="text-xs font-black text-[#6B3A25]">سبب الاقتراح</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{suggestion.reason}</p>
            </div>
            <div className="mt-3 rounded-xl bg-[#1A1117]/5 p-3">
              <p className="text-xs font-black text-[#6B3A25]">الإجراء المقترح</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{suggestion.suggestedAction}</p>
            </div>
          </article>
        ))}
      </section>

      {data.totalOffers === 0 ? (
        <div className="mb-5">
          <EmptyOffersState />
        </div>
      ) : null}

      {data.missingSources.length ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-800">
          بعض مصادر البيانات غير متاحة حاليًا، لذلك تعرض المؤشرات المتأثرة عبارة "لا توجد بيانات كافية" بدلًا من رقم غير دقيق.
        </div>
      ) : null}

      <OffersTable offers={data.latestOffers} />
    </div>
  );
}
