import Link from "next/link";
import { ArrowUpLeft, Landmark } from "lucide-react";

type FinanceActionCardProps = {
  title: string;
  href: string;
  description?: string;
  status?: string;
  metric?: string;
};

export function FinanceActionCard({ title, href, description, status = "جاهز", metric }: FinanceActionCardProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-[116px] min-w-0 flex-col justify-between rounded-[8px] border border-[#D8C3A2] bg-[linear-gradient(135deg,#FFFDF8_0%,#F8EEDC_100%)] p-3 shadow-[0_10px_22px_rgba(69,43,28,0.07)] transition hover:border-[#B88334] hover:bg-[#FFF8EA]"
    >
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#E1D1BD] bg-white text-[#6B431C]">
          <Landmark className="h-4 w-4" />
        </span>
        <ArrowUpLeft className="h-4 w-4 shrink-0 text-[#9C6B2E]" />
      </span>
      <span className="mt-3 min-w-0">
        <span className="block truncate text-[13px] font-black text-[#2F241D]">{title}</span>
        {description ? <span className="mt-1 line-clamp-2 text-[11px] font-bold leading-5 text-[#806A58]">{description}</span> : null}
      </span>
      <span className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] px-2 py-1 text-[10px] font-black text-[#6B431C]">{status}</span>
        {metric ? <span className="truncate text-[10px] font-black text-[#2F5D50]">{metric}</span> : null}
      </span>
    </Link>
  );
}
