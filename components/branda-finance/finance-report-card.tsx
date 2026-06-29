import Link from "next/link";
import { ArrowUpLeft, FileText } from "lucide-react";

type FinanceReportCardProps = {
  title: string;
  href: string;
  description?: string;
  section?: string;
};

export function FinanceReportCard({ title, href, description, section }: FinanceReportCardProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-[132px] min-w-0 flex-col justify-between rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_10px_22px_rgba(69,43,28,0.06)] transition hover:border-[#B88334] hover:bg-[#FFF8EA]"
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#E1D1BD] bg-[#FAF3E8] text-[#6B431C]">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </span>
        <ArrowUpLeft className="h-4 w-4 shrink-0 text-[#9C6B2E] transition group-hover:-translate-x-0.5 group-hover:translate-y-0.5" aria-hidden="true" />
      </span>
      <span className="mt-3 min-w-0">
        {section ? <span className="mb-1 block truncate text-[10px] font-black text-[#9C6B2E]">{section}</span> : null}
        <span className="block truncate text-[13px] font-black text-[#2F241D]">{title}</span>
        {description ? <span className="mt-1 line-clamp-2 text-[11px] font-bold leading-5 text-[#806A58]">{description}</span> : null}
      </span>
    </Link>
  );
}
