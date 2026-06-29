import Link from "next/link";
import type { ReactNode } from "react";
import { FinanceBackButton } from "@/components/branda-finance/finance-back-button";
import { FinanceStatusBadge } from "@/components/branda-finance/finance-status-badge";

type FinancePageShellProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  status?: string;
  backHref?: string;
  backLabel?: string;
  actions?: Array<{ label: string; href: string; primary?: boolean }>;
  children: ReactNode;
};

export function FinancePageShell({
  title,
  eyebrow = "برندة المالية",
  description,
  status = "ديمو محلي",
  backHref = "/dashboard/branda-finance",
  backLabel = "عودة",
  actions = [],
  children,
}: FinancePageShellProps) {
  return (
    <main dir="rtl" className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#F5EFE6] px-3 py-4 text-right text-[#2F241D] sm:px-4 lg:px-5">
      <div className="mx-auto flex w-full max-w-[1320px] min-w-0 flex-col gap-4 overflow-hidden">
        <header className="min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_16px_38px_rgba(69,43,28,0.08)] sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2">
                <FinanceBackButton href={backHref} label={backLabel} />
              </div>
              <p className="text-[11px] font-black text-[#9C6B2E]">{eyebrow}</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-xl font-black text-[#2F241D] sm:text-2xl">{title}</h1>
                <FinanceStatusBadge>{status}</FinanceStatusBadge>
              </div>
              {description ? <p className="mt-1.5 max-w-4xl text-[12px] font-bold leading-5 text-[#7D6654]">{description}</p> : null}
            </div>
            {actions.length ? (
              <div className="flex min-w-0 flex-wrap gap-1.5 lg:justify-end">
                {actions.map((action) => (
                  <Link
                    key={action.href + action.label}
                    href={action.href}
                    className={`inline-flex h-9 items-center rounded-[8px] px-3 text-[12px] font-black ${
                      action.primary
                        ? "bg-[#2F5D50] text-white"
                        : "border border-[#D8C7B2] bg-white text-[#5B3926]"
                    }`}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
