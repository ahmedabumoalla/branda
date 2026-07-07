import Link from "next/link";
import {
  Activity,
  LockKeyhole,
  Sparkles,
  Table2,
  Users,
} from "lucide-react";
import type {
  CustomerSegmentCard,
  CustomerSegmentsDashboardData,
  CustomerSegmentsPeriod,
  CustomerSegmentsRecentItem,
} from "@/lib/data/customer-segments";

type Props = {
  data: CustomerSegmentsDashboardData | null;
  period: CustomerSegmentsPeriod;
  configError?: string;
};

const periodOptions: Array<{ key: CustomerSegmentsPeriod; label: string }> = [
  { key: "30", label: "آخر 30 يومًا" },
  { key: "60", label: "آخر 60 يومًا" },
  { key: "90", label: "آخر 90 يومًا" },
];

const segmentTone: Record<CustomerSegmentCard["key"], string> = {
  new: "border-sky-200 bg-sky-50 text-sky-950",
  active: "border-emerald-200 bg-emerald-50 text-emerald-950",
  atRisk: "border-amber-200 bg-amber-50 text-amber-950",
  loyalty: "border-[#D9A33F]/35 bg-[#FFF7E3] text-[#4A281D]",
  rewards: "border-violet-200 bg-violet-50 text-violet-950",
  highEngagement: "border-[#E7D7C6] bg-white text-[#311912]",
};

function SegmentCount({ count }: { count: number | null }) {
  if (count === null) {
    return <span className="text-base font-black text-[#806A5E]">لا توجد بيانات كافية</span>;
  }

  return <span className="text-4xl font-black text-[#311912]">{count}</span>;
}

function LockedCustomerSegmentsPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
      <div className="rounded-3xl border border-[#E7D7C6] bg-white p-6 text-center shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-[#311912]">
          شرائح العملاء غير مفعّلة في باقتك الحالية
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
        لا توجد بيانات كافية لتكوين شرائح العملاء بعد
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#806A5E]">
        ابدأ بتفعيل الطلبات والولاء والحجوزات حتى تظهر الشرائح بدقة
      </p>
    </div>
  );
}

function RecentActivityTable({ items }: { items: CustomerSegmentsRecentItem[] }) {
  return (
    <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
          <Table2 className="h-5 w-5" />
        </span>
        <h2 className="text-base font-black text-[#311912]">أحدث العملاء/النشاط</h2>
      </div>

      {items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead>
              <tr className="border-b border-[#E7D7C6] text-xs font-black text-[#806A5E]">
                <th className="px-3 py-3">اسم العميل</th>
                <th className="px-3 py-3">رقم الجوال</th>
                <th className="px-3 py-3">آخر نشاط</th>
                <th className="px-3 py-3">نوع آخر نشاط</th>
                <th className="px-3 py-3">عدد الأنشطة</th>
                <th className="px-3 py-3">الشريحة الأقرب</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[#F2E7D9] last:border-0">
                  <td className="px-3 py-3 font-black text-[#311912]">{item.customerName}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{item.phone ?? "-"}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{item.lastActivity}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-[#FCF8F3] px-3 py-1 text-xs font-black text-[#6B3A25]">
                      {item.lastActivityType}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-black text-[#311912]">
                    {item.activityCount ?? "لا توجد بيانات كافية"}
                  </td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{item.nearestSegment}</td>
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

export function CustomerSegmentsPage({ data, period, configError }: Props) {
  if (!data) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          {configError ?? "تعذر تحميل شرائح العملاء"}
        </div>
      </div>
    );
  }

  if (!data.enabled) return <LockedCustomerSegmentsPage />;

  const hasAnySegmentData = data.segments.some((segment) => (segment.count ?? 0) > 0);

  return (
    <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">لوحة برندة</p>
          <h1 className="mt-1.5 text-2xl font-black text-[#311912] lg:text-3xl">شرائح العملاء</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#806A5E]">
            تقسيم عملي للعملاء حسب النشاط والولاء والمكافآت داخل علامتك فقط.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
          <Sparkles className="h-4 w-4" />
          Customer Segments v1
        </div>
      </header>

      {configError ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">
          {configError}
        </div>
      ) : null}

      <nav className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-[#E7D7C6] bg-white p-3 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]" aria-label="فلتر مدة شرائح العملاء">
        {periodOptions.map((option) => {
          const active = option.key === period;
          return (
            <Link
              key={option.key}
              href={`/dashboard/customer-segments?period=${option.key}`}
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

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
            <Users className="h-5 w-5" />
          </div>
          <p className="text-xs font-black text-[#806A5E]">إجمالي العملاء المعروفين</p>
          <p className="mt-1.5 text-3xl font-black text-[#311912]">{data.totalCustomers}</p>
          <p className="mt-1 text-xs font-bold text-[#806A5E]">من ملفات العملاء المرتبطة بهذه العلامة</p>
        </article>
        <article className="rounded-2xl border border-[#D9A33F]/35 bg-[#1A1117] p-4 text-[#FCF8F3]">
          <span className="rounded-full bg-[#D9A33F]/20 px-3 py-1 text-xs font-black text-[#F0C568]">
            قريبًا
          </span>
          <h2 className="mt-4 text-base font-black">الحملات الذكية قريبًا</h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#D8C4B3]">
            هذه الصفحة تعرض الشرائح فقط الآن، بدون إرسال أو إنشاء حملات.
          </p>
        </article>
        <article className="rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] p-4">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#6B3A25]">
            <Activity className="h-5 w-5" />
          </div>
          <p className="text-xs font-black text-[#806A5E]">نافذة النشاط الحالية</p>
          <p className="mt-1.5 text-3xl font-black text-[#311912]">{data.periodDays}</p>
          <p className="mt-1 text-xs font-bold text-[#806A5E]">يومًا للنشطين والمعرضين للفقد وأحدث النشاط</p>
        </article>
      </section>

      {!hasAnySegmentData ? (
        <div className="mb-5">
          <EmptyState />
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {data.segments.map((segment) => (
          <article key={segment.key} className={`rounded-2xl border p-4 ${segmentTone[segment.key]}`}>
            <div className="flex min-h-12 items-start justify-between gap-3">
              <h2 className="text-base font-black">{segment.title}</h2>
              <SegmentCount count={segment.count} />
            </div>
            <p className="mt-3 text-sm font-bold leading-7">{segment.description}</p>
            <div className="mt-4 rounded-xl bg-white/70 p-3">
              <p className="text-xs font-black text-[#6B3A25]">سبب الأهمية</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{segment.importance}</p>
            </div>
            <div className="mt-3 rounded-xl bg-[#1A1117]/5 p-3">
              <p className="text-xs font-black text-[#6B3A25]">إجراء مقترح</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{segment.suggestedAction}</p>
            </div>
          </article>
        ))}
      </section>

      {data.missingSources.length ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-800">
          بعض مصادر البيانات غير متاحة حاليًا، لذلك تعرض الشرائح المتأثرة عبارة "لا توجد بيانات كافية" بدلًا من رقم غير دقيق.
        </div>
      ) : null}

      <RecentActivityTable items={data.recent} />
    </div>
  );
}
