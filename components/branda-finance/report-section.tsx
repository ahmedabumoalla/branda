import { ReportLinkCard } from "@/components/branda-finance/report-link-card";
import type { BrandaFinanceReportSection } from "@/lib/branda-finance/reports";

type ReportSectionProps = {
  section: BrandaFinanceReportSection;
};

export function ReportSection({ section }: ReportSectionProps) {
  return (
    <section className="border-t border-[#E2CFB2] pt-8">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-extrabold text-[#9A6A2F]">{section.eyebrow}</p>
          <h2 className="mt-1 text-2xl font-black text-[#3B2417]">{section.title}</h2>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-[#806851]">{section.description}</p>
        </div>
        <span className="w-fit rounded-full border border-[#E6D5BD] bg-[#FBF5EC] px-3 py-1.5 text-xs font-extrabold text-[#7A4D1F]">
          {section.reports.length} تقارير
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {section.reports.map((report) => (
          <ReportLinkCard key={report.slug} report={report} />
        ))}
      </div>
    </section>
  );
}
