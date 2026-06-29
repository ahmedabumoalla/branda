import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileSpreadsheet } from "lucide-react";
import { StatementAccountWorkspace } from "@/components/branda-finance/statement-account-workspace";
import type { StatementAccountView } from "@/lib/branda-finance/statement-account";

type StatementAccountReportProps = {
  view: StatementAccountView;
};

const viewLinks: { view: StatementAccountView; label: string; href: string }[] = [
  {
    view: "summary",
    label: "ملخص",
    href: "/dashboard/branda-finance/reports/statement-of-account?view=summary",
  },
  {
    view: "details",
    label: "تفاصيل",
    href: "/dashboard/branda-finance/reports/statement-of-account?view=details",
  },
];

export function StatementAccountReport({ view }: StatementAccountReportProps) {
  return (
    <main dir="rtl" className="min-h-screen bg-[#F7EFE4] px-4 py-6 text-right sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[28px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-[0_24px_60px_rgba(86,52,31,0.12)]">
          <div className="relative px-6 py-8 sm:px-8 lg:px-10">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-[#B88334] via-[#D8B46E] to-[#6B3F22]" />

            <Link
              href="/dashboard/branda-finance/reports"
              className="inline-flex items-center gap-2 rounded-full border border-[#E6D5BD] bg-[#FBF5EC] px-4 py-2 text-xs font-extrabold text-[#6B3F22] transition hover:border-[#C99A4D]"
            >
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
              التقارير
            </Link>

            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
              <div>
                <p className="text-sm font-black text-[#9A6A2F]">التقارير &gt; كشف الحساب</p>
                <h1 className="mt-3 text-3xl font-black tracking-normal text-[#3B2417] sm:text-4xl">
                  كشف الحساب
                </h1>
                <p className="mt-3 max-w-4xl text-base font-bold leading-8 text-[#806851]">
                  راجع حركة الحسابات حسب العملة والمصدر والمرجع مع تجهيز تجربة الملخص والتفاصيل داخل برندا المالية.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5D0AE] bg-[#FBF4EA] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6E9D4] text-[#6B3F22]">
                    <BookOpenCheck aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-xs font-extrabold text-[#9A6A2F]">نمط العرض</p>
                    <p className="mt-1 text-sm font-black text-[#3B2417]">
                      {view === "details" ? "تفاصيل الحركات" : "ملخص الحساب"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
          <aside className="rounded-[24px] border border-[#E3CFB0] bg-[#FFFDF8] p-3 shadow-[0_14px_34px_rgba(86,52,31,0.08)] lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center gap-2 rounded-2xl bg-[#FBF4EA] px-3 py-3 text-[#6B3F22]">
              <FileSpreadsheet aria-hidden="true" className="h-5 w-5" />
              <span className="text-sm font-black">كشف الحساب</span>
            </div>
            <div className="mt-3 grid gap-2">
              {viewLinks.map((item) => {
                const selected = item.view === view;
                return (
                  <Link
                    key={item.view}
                    href={item.href}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-black transition ${
                      selected
                        ? "bg-[#3B2417] text-white shadow-[0_10px_22px_rgba(59,36,23,0.22)]"
                        : "bg-[#FBF5EC] text-[#6B3F22] hover:bg-[#F6E9D4]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-[24px] border border-[#E3CFB0] bg-[#FFFDF8] p-3 shadow-[0_14px_34px_rgba(86,52,31,0.08)]">
              {viewLinks.map((item) => {
                const selected = item.view === view;
                return (
                  <Link
                    key={item.view}
                    href={item.href}
                    className={`rounded-2xl px-5 py-2.5 text-sm font-black transition ${
                      selected
                        ? "bg-[#B88334] text-white shadow-[0_10px_22px_rgba(184,131,52,0.26)]"
                        : "border border-[#E6D5BD] bg-[#FBF5EC] text-[#6B3F22] hover:border-[#C99A4D]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <StatementAccountWorkspace key={view} view={view} />
          </div>
        </section>
      </div>
    </main>
  );
}
