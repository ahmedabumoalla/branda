import Link from "next/link";
import { ArrowUpLeft, FileText } from "lucide-react";
import type { BrandaFinanceReportItem } from "@/lib/branda-finance/reports";

type ReportLinkCardProps = {
  report: BrandaFinanceReportItem;
};

export function ReportLinkCard({ report }: ReportLinkCardProps) {
  if (report.slug === "statement-of-account") {
    return (
      <article className="group flex min-h-[132px] flex-col justify-between rounded-[18px] border border-[#E8D7BE] bg-[#FFFDF8] p-4 text-right shadow-[0_10px_24px_rgba(86,52,31,0.08),inset_0_1px_0_rgba(255,255,255,0.82)] transition duration-200 hover:-translate-y-0.5 hover:border-[#C99A4D] hover:shadow-[0_18px_36px_rgba(86,52,31,0.14)]">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#E7D1AE] bg-[#F6E9D4] text-[#6B3F22]">
            <FileText aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#E2C690] bg-[#F7E7C8] px-2.5 py-1 text-[10px] font-extrabold text-[#7A4D1F]">
            جاهز للتجربة
            <ArrowUpLeft aria-hidden="true" className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5 group-hover:translate-y-0.5" />
          </span>
        </div>

        <div className="mt-4">
          <h3 className="text-base font-black leading-7 text-[#3D2418]">{report.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs font-bold leading-6 text-[#8F765F]">{report.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/dashboard/branda-finance/reports/statement-of-account?view=summary"
              className="rounded-full border border-[#D8B46E] bg-[#F7E7C8] px-3 py-1.5 text-xs font-black text-[#6B3F22] transition hover:bg-[#E9D0A4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B88334]"
            >
              ملخص
            </Link>
            <Link
              href="/dashboard/branda-finance/reports/statement-of-account?view=details"
              className="rounded-full border border-[#E6D5BD] bg-[#FBF5EC] px-3 py-1.5 text-xs font-black text-[#6B3F22] transition hover:border-[#C99A4D] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B88334]"
            >
              تفاصيل
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <Link
      href={`/dashboard/branda-finance/reports/${report.slug}`}
      className="group flex min-h-[132px] flex-col justify-between rounded-[18px] border border-[#E8D7BE] bg-[#FFFDF8] p-4 text-right shadow-[0_10px_24px_rgba(86,52,31,0.08),inset_0_1px_0_rgba(255,255,255,0.82)] transition duration-200 hover:-translate-y-0.5 hover:border-[#C99A4D] hover:shadow-[0_18px_36px_rgba(86,52,31,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B88334] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7EFE4]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#E7D1AE] bg-[#F6E9D4] text-[#6B3F22]">
          <FileText aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#E6D5BD] bg-[#FBF5EC] px-2.5 py-1 text-[10px] font-extrabold text-[#8A5B24]">
          قريبًا
          <ArrowUpLeft aria-hidden="true" className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5 group-hover:translate-y-0.5" />
        </span>
      </div>

      <div className="mt-4">
        <h3 className="text-base font-black leading-7 text-[#3D2418]">{report.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs font-bold leading-6 text-[#8F765F]">{report.description}</p>
        {report.tags?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#E6D5BD] bg-[#FBF5EC] px-2.5 py-1 text-[10px] font-extrabold text-[#7A4D1F]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
