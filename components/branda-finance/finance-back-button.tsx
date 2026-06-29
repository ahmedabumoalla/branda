import Link from "next/link";
import { ArrowRight } from "lucide-react";

type FinanceBackButtonProps = {
  href: string;
  label?: string;
};

export function FinanceBackButton({ href, label = "عودة" }: FinanceBackButtonProps) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 max-w-full items-center justify-center gap-1.5 rounded-[8px] border border-[#D8C7B2] bg-white px-3 text-[12px] font-black text-[#5B3926] transition hover:border-[#B88334] hover:bg-[#FFF8EA]"
    >
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
