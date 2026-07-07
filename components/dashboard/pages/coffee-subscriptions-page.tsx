import {
  CalendarDays,
  Coffee,
  LockKeyhole,
  PackageCheck,
  Sparkles,
  Table2,
  Users,
} from "lucide-react";
import type {
  CoffeeSubscriptionMetric,
  CoffeeSubscriptionMetricKey,
  CoffeeSubscriptionProductCandidate,
  CoffeeSubscriptionReadinessLevel,
  CoffeeSubscriptionSuggestion,
  CoffeeSubscriptionsDashboardData,
} from "@/lib/data/coffee-subscriptions";

type Props = {
  data: CoffeeSubscriptionsDashboardData | null;
  configError?: string;
};

const metricIcons: Record<CoffeeSubscriptionMetricKey, typeof Coffee> = {
  repeatCustomers: Users,
  multiOrderCustomers: Users,
  subscriptionProducts: PackageCheck,
  loyaltyCustomers: Sparkles,
  ordersLast30: CalendarDays,
  averageOrdersPerCustomer: Coffee,
};

const readinessTone: Record<CoffeeSubscriptionReadinessLevel, string> = {
  "جاهزية عالية": "border-emerald-200 bg-emerald-50 text-emerald-950",
  "جاهزية متوسطة": "border-[#D9A33F]/35 bg-[#FFF7E3] text-[#4A281D]",
  "تحتاج بيانات أكثر": "border-amber-200 bg-amber-50 text-amber-950",
};

const suggestionTone: Record<CoffeeSubscriptionSuggestion["key"], string> = {
  tenCups: "border-[#D9A33F]/35 bg-[#FFF7E3] text-[#4A281D]",
  dailyCup: "border-emerald-200 bg-emerald-50 text-emerald-950",
  employees: "border-sky-200 bg-sky-50 text-sky-950",
  family: "border-violet-200 bg-violet-50 text-violet-950",
  morning: "border-[#E7D7C6] bg-white text-[#311912]",
};

function MetricValue({ metric }: { metric: CoffeeSubscriptionMetric }) {
  if (metric.value === null) {
    return <span className="text-base font-black text-[#806A5E]">لا توجد بيانات كافية</span>;
  }

  return <span className="text-3xl font-black text-[#311912]">{metric.value}</span>;
}

function LockedCoffeeSubscriptionsPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
      <div className="rounded-3xl border border-[#E7D7C6] bg-white p-6 text-center shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-[#311912]">
          اشتراكات القهوة غير مفعّلة في باقتك الحالية
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-7 text-[#806A5E]">
          تواصل مع الأدمن لتفعيل الميزة
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[#D8C4B3] bg-[#FCF8F3] p-6 text-center">
      <h2 className="text-lg font-black text-[#311912]">
        لا توجد بيانات كافية لتجهيز اشتراكات القهوة بعد
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#806A5E]">
        ابدأ بتفعيل الطلبات والمنتجات والولاء حتى تظهر مؤشرات الاشتراكات بدقة.
      </p>
    </div>
  );
}

function ProductCandidatesTable({ products }: { products: CoffeeSubscriptionProductCandidate[] }) {
  return (
    <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
          <Table2 className="h-5 w-5" />
        </span>
        <h2 className="text-base font-black text-[#311912]">منتجات مرشحة للاشتراك</h2>
      </div>

      {products.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead>
              <tr className="border-b border-[#E7D7C6] text-xs font-black text-[#806A5E]">
                <th className="px-3 py-3">المنتج</th>
                <th className="px-3 py-3">الكمية المباعة</th>
                <th className="px-3 py-3">عدد الطلبات</th>
                <th className="px-3 py-3">متوسط السعر</th>
                <th className="px-3 py-3">سبب الترشيح</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-[#F2E7D9] last:border-0">
                  <td className="px-3 py-3 font-black text-[#311912]">{product.name}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{product.quantitySold}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{product.orderCount}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">
                    {product.averageUnitPrice ?? "لا توجد بيانات كافية"}
                  </td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{product.signal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

export function CoffeeSubscriptionsPage({ data, configError }: Props) {
  if (!data) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          {configError ?? "تعذر تحميل اشتراكات القهوة"}
        </div>
      </div>
    );
  }

  if (!data.enabled) return <LockedCoffeeSubscriptionsPage />;

  const hasAnyData = data.metrics.some((metric) => metric.value !== null && metric.value !== "0");

  return (
    <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">لوحة برندة</p>
          <h1 className="mt-1.5 text-2xl font-black text-[#311912] lg:text-3xl">اشتراكات القهوة</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#806A5E]">
            تحليل جاهزية العلامة لاشتراكات القهوة واقتراح باقات شهرية مبنية على الطلبات والمنتجات والولاء، بدون بيع أو إنشاء اشتراك فعلي في هذه النسخة.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
          <Coffee className="h-4 w-4" />
          Coffee Subscriptions v1
        </div>
      </header>

      {configError ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">
          {configError}
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

      {!hasAnyData ? (
        <div className="mb-5">
          <EmptyState />
        </div>
      ) : null}

      <section className={`mb-5 rounded-2xl border p-4 ${readinessTone[data.readiness.level]}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black text-[#6B3A25]">جاهزية العلامة للاشتراكات</p>
            <h2 className="mt-1 text-2xl font-black">{data.readiness.level}</h2>
          </div>
          <span className="w-fit rounded-full bg-white/70 px-4 py-2 text-xs font-black">
            {data.readiness.score} من 4 مؤشرات
          </span>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {data.readiness.reasons.map((reason) => (
            <p key={reason} className="rounded-xl bg-white/70 p-3 text-sm font-bold leading-7 text-[#806A5E]">
              {reason}
            </p>
          ))}
        </div>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-5">
        {data.suggestions.map((suggestion) => (
          <article key={suggestion.key} className={`rounded-2xl border p-4 ${suggestionTone[suggestion.key]}`}>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
              <Coffee className="h-5 w-5" />
            </div>
            <h2 className="text-base font-black">{suggestion.title}</h2>
            <p className="mt-2 text-sm font-bold leading-7">{suggestion.description}</p>
            <div className="mt-4 rounded-xl bg-white/70 p-3">
              <p className="text-xs font-black text-[#6B3A25]">لمن يناسب</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{suggestion.audience}</p>
            </div>
            <div className="mt-3 rounded-xl bg-white/70 p-3">
              <p className="text-xs font-black text-[#6B3A25]">سبب الاقتراح من البيانات</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{suggestion.dataReason}</p>
            </div>
            <div className="mt-3 rounded-xl bg-[#1A1117]/5 p-3">
              <p className="text-xs font-black text-[#6B3A25]">السعر المقترح</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{suggestion.suggestedPrice}</p>
            </div>
            <button
              type="button"
              disabled
              className="mt-4 w-full cursor-not-allowed rounded-xl bg-[#311912]/10 px-4 py-3 text-xs font-black text-[#6B3A25] opacity-80"
            >
              إنشاء باقة اشتراك — قريبًا
            </button>
          </article>
        ))}
      </section>

      <section className="mb-5 rounded-2xl border border-[#D9A33F]/35 bg-[#1A1117] p-5 text-[#FCF8F3]">
        <span className="rounded-full bg-[#D9A33F]/20 px-3 py-1 text-xs font-black text-[#F0C568]">
          المرحلة القادمة
        </span>
        <h2 className="mt-4 text-lg font-black">
          المرحلة القادمة: إنشاء باقات اشتراك فعلية وربطها بالاستخدام الشهري
        </h2>
        <p className="mt-2 text-sm font-bold leading-7 text-[#D8C4B3]">
          تتطلب جدول اشتراكات وسجل استخدامات قبل تفعيل البيع الفعلي.
        </p>
      </section>

      {data.missingSources.length ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-800">
          بعض مصادر البيانات غير متاحة حاليًا، لذلك تعرض المؤشرات المتأثرة عبارة "لا توجد بيانات كافية" بدلًا من رقم غير دقيق.
        </div>
      ) : null}

      <ProductCandidatesTable products={data.productCandidates} />
    </div>
  );
}
