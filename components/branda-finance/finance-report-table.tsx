import type { ReactNode } from "react";
import { FinanceTable } from "@/components/branda-finance/finance-table";

type FinanceReportTableProps = {
  title: string;
  description?: string;
  headers: string[];
  rows: ReactNode[][];
  minWidth?: string;
};

export function FinanceReportTable({
  title,
  description,
  headers,
  rows,
  minWidth = "860px",
}: FinanceReportTableProps) {
  return (
    <section className="min-w-0 space-y-2">
      <div className="min-w-0">
        <h2 className="text-[14px] font-black text-[#2F241D]">{title}</h2>
        {description ? <p className="mt-1 text-[12px] font-bold leading-5 text-[#806A58]">{description}</p> : null}
      </div>
      <FinanceTable headers={headers} rows={rows} minWidth={minWidth} />
    </section>
  );
}
