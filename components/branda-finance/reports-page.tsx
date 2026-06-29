import Link from "next/link";
import { ArrowRight, Pin, Search, Sparkles } from "lucide-react";
import { ReportSection } from "@/components/branda-finance/report-section";
import { brandaFinanceReportSections, brandaFinanceReports } from "@/lib/branda-finance/reports";

export function BrandaFinanceReportsPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#F7EFE4] px-4 py-6 text-right sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="overflow-hidden rounded-[28px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-[0_24px_60px_rgba(86,52,31,0.12)]">
          <div className="relative px-6 py-8 sm:px-8 lg:px-10">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-[#B88334] via-[#D8B46E] to-[#6B3F22]" />
            <Link
              href="/dashboard/branda-finance"
              className="inline-flex items-center gap-2 rounded-full border border-[#E6D5BD] bg-[#FBF5EC] px-4 py-2 text-xs font-extrabold text-[#6B3F22] transition hover:border-[#C99A4D]"
            >
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
              العودة إلى برندة المالية
            </Link>

            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
              <div>
                <span className="inline-flex rounded-full border border-[#E2C690] bg-[#F7E7C8] px-4 py-1.5 text-xs font-extrabold text-[#7A4D1F] shadow-sm">
                  مركز التقارير
                </span>
                <h1 className="mt-5 text-3xl font-black tracking-normal text-[#3B2417] sm:text-4xl">
                  التقارير المالية
                </h1>
                <p className="mt-3 max-w-3xl text-base font-bold leading-8 text-[#806851] sm:text-lg">
                  صفحة مرتبة لتقارير برندة المالية: محاسبة، قوائم مالية، ضرائب، مبيعات، مشتريات، مخزون ورواتب.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#E5D0AE] bg-[#FBF4EA] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div>
                  <p className="text-xs font-extrabold text-[#9A6A2F]">إجمالي التقارير</p>
                  <p className="mt-1 text-3xl font-black text-[#3B2417]">{brandaFinanceReports.length}</p>
                </div>
                <div>
                  <p className="text-xs font-extrabold text-[#9A6A2F]">الأقسام</p>
                  <p className="mt-1 text-3xl font-black text-[#3B2417]">{brandaFinanceReportSections.length}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {["الكل", "للمحاسب", "قوائم مالية", "مبيعات", "مشتريات", "ضرائب"].map((filter) => (
                <span
                  key={filter}
                  className="rounded-full border border-[#E6D5BD] bg-[#FFFDF8] px-3 py-1.5 text-xs font-extrabold text-[#7A4D1F]"
                >
                  {filter}
                </span>
              ))}
            </div>
          </div>
        </header>

        <section className="rounded-[24px] border border-dashed border-[#D5B98D] bg-[#FFF9F0] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#E7D1AE] bg-[#F6E9D4] text-[#6B3F22]">
                <Pin aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-xs font-extrabold text-[#9A6A2F]">التقارير المثبتة</p>
                <h2 className="mt-1 text-xl font-black text-[#3B2417]">ثبّت التقارير للوصول السريع</h2>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E6D5BD] bg-[#FBF5EC] px-3 py-1.5 text-xs font-extrabold text-[#7A4D1F]">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              لا توجد تقارير مثبتة بعد
            </span>
          </div>
        </section>

        <div className="flex items-center gap-3 rounded-[20px] border border-[#E6D5BD] bg-[#FFFDF8] px-4 py-3 shadow-[0_10px_24px_rgba(86,52,31,0.07)]">
          <Search aria-hidden="true" className="h-5 w-5 text-[#8A5B24]" />
          <p className="text-sm font-bold text-[#806851]">
            اختر أي تقرير لفتح صفحة تحضيرية خاصة به. بناء المحتوى التشغيلي سيكون في المرحلة القادمة.
          </p>
        </div>

        <div className="grid gap-9">
          {brandaFinanceReportSections.map((section) => (
            <ReportSection key={section.key} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}
