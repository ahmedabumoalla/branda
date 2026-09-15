import {
  BarChart3,
  LockKeyhole,
  Sparkles,
  Table2,
} from "lucide-react";
import type { V1FeatureDashboardData, V1Metric } from "@/lib/data/feature-v1-readiness";

type Props = {
  data: V1FeatureDashboardData | null;
  title: string;
  configError?: string;
};

function MetricValue({ metric }: { metric: V1Metric }) {
  if (metric.value === null) {
    return <span className="text-base font-black text-[#806A5E]">لا توجد بيانات كافية</span>;
  }

  return <span className="text-3xl font-black text-[#311912]">{metric.value}</span>;
}

function LockedFeaturePage({ title }: { title: string }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
      <div className="rounded-3xl border border-[#E7D7C6] bg-white p-6 text-center shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-[#311912]">
          {title} غير مفعّلة في باقتك الحالية
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
      <h2 className="text-lg font-black text-[#311912]">لا توجد بيانات كافية بعد</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#806A5E]">
        ستظهر المؤشرات بدقة أكبر بعد توفر طلبات ومنتجات ونشاط عملاء للعلامة.
      </p>
    </div>
  );
}

export function FeatureV1Page({ data, title, configError }: Props) {
  if (!data) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          {configError ?? `تعذر تحميل ${title}`}
        </div>
      </div>
    );
  }

  if (!data.enabled) return <LockedFeaturePage title={title} />;

  const hasAnyMetric = data.metrics.some((metric) => metric.value !== null && metric.value !== "0");

  return (
    <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">لوحة برندة</p>
          <h1 className="mt-1.5 text-2xl font-black text-[#311912] lg:text-3xl">{data.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#806A5E]">{data.summary}</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
          <Sparkles className="h-4 w-4" />
          {data.badge}
        </div>
      </header>

      {configError ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">
          {configError}
        </div>
      ) : null}

      {data.alert ? (
        <div className="mb-5 rounded-2xl border border-[#D9A33F]/35 bg-[#FFF7E3] p-4 text-sm font-black text-[#6B3A25]">
          {data.alert}
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <article key={metric.label} className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <p className="text-xs font-black text-[#806A5E]">{metric.label}</p>
            <p className="mt-1.5 min-h-10">
              <MetricValue metric={metric} />
            </p>
            <p className="mt-1 text-xs font-bold text-[#806A5E]">{metric.hint}</p>
          </article>
        ))}
      </section>

      {!hasAnyMetric ? (
        <div className="mb-5">
          <EmptyState />
        </div>
      ) : null}

      <section className="mb-5 rounded-2xl border border-[#D9A33F]/35 bg-[#FFF7E3] p-4 text-[#4A281D]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black text-[#6B3A25]">حالة الجاهزية</p>
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

      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {data.suggestions.map((suggestion) => (
          <article key={suggestion.title} className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-base font-black text-[#311912]">{suggestion.title}</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">{suggestion.description}</p>
            <div className="mt-4 rounded-xl bg-[#FCF8F3] p-3">
              <p className="text-xs font-black text-[#6B3A25]">سبب الاقتراح</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{suggestion.reason}</p>
            </div>
            <button
              type="button"
              disabled
              className="mt-4 w-full cursor-not-allowed rounded-xl bg-[#311912]/10 px-4 py-3 text-xs font-black text-[#6B3A25] opacity-80"
            >
              {suggestion.actionLabel || data.disabledActionLabel}
            </button>
          </article>
        ))}
      </section>

      {data.missingSources.length ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-800">
          بعض مصادر البيانات غير متاحة حاليًا، لذلك تعرض المؤشرات المتأثرة عبارة "لا توجد بيانات كافية" بدلًا من رقم غير دقيق.
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
            <Table2 className="h-5 w-5" />
          </span>
          <h2 className="text-base font-black text-[#311912]">{data.tableTitle}</h2>
        </div>

        {data.tableRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead>
                <tr className="border-b border-[#E7D7C6] text-xs font-black text-[#806A5E]">
                  {data.tableColumns.map((column) => (
                    <th key={column.key} className="px-3 py-3">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tableRows.map((row) => (
                  <tr key={row.id} className="border-b border-[#F2E7D9] last:border-0">
                    <td className="px-3 py-3 font-black text-[#311912]">{row.name}</td>
                    <td className="px-3 py-3 font-bold text-[#806A5E]">{row.metric}</td>
                    <td className="px-3 py-3 font-bold text-[#806A5E]">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}
