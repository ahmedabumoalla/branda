import Link from "next/link";
import { ArrowRight, BookOpenText } from "lucide-react";
import { GeneralLedgerWorkspace } from "@/components/branda-finance/general-ledger-workspace";

export function GeneralLedgerReport() {
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

            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
              <div>
                <p className="text-sm font-black text-[#9A6A2F]">
                  التقارير &gt; دفتر الأستاذ العام
                </p>
                <h1 className="mt-3 text-3xl font-black tracking-normal text-[#3B2417] sm:text-4xl">
                  دفتر الأستاذ العام
                </h1>
                <p className="mt-3 max-w-4xl text-base font-bold leading-8 text-[#806851]">
                  يعرض سجل معاملات الحسابات حسب الفترة والفلاتر المحددة
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5D0AE] bg-[#FBF4EA] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6E9D4] text-[#6B3F22]">
                    <BookOpenText aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-xs font-extrabold text-[#9A6A2F]">دفتر محاسبي</p>
                    <p className="mt-1 text-sm font-black text-[#3B2417]">واجهة معاينة فقط</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <GeneralLedgerWorkspace />
      </div>
    </main>
  );
}
