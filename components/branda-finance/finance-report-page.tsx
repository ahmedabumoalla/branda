import type { ReactNode } from "react";
import { FinanceKpiRow, type FinanceKpi } from "@/components/branda-finance/finance-kpi-row";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatusBadge } from "@/components/branda-finance/finance-status-badge";

type FinanceReportPageProps = {
  title: string;
  description: string;
  kpis: FinanceKpi[];
  filters?: string[];
  children: ReactNode;
};

export function FinanceReportPage({ title, description, kpis, filters = [], children }: FinanceReportPageProps) {
  return (
    <FinancePageShell
      title={title}
      eyebrow="تقارير براندا المالية"
      description={description}
      status="تقرير ديمو"
      backHref="/dashboard/branda-finance/reports"
      actions={[
        { label: "مركز التقارير", href: "/dashboard/branda-finance/reports" },
        { label: "إنشاء فاتورة", href: "/dashboard/branda-finance/invoicing/create", primary: true },
      ]}
    >
      <FinanceKpiRow items={kpis} />
      {filters.length ? (
        <section className="flex min-w-0 flex-wrap gap-1.5 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
          {filters.map((filter) => (
            <FinanceStatusBadge key={filter} tone="gold">
              {filter}
            </FinanceStatusBadge>
          ))}
        </section>
      ) : null}
      <div className="min-w-0 space-y-4">{children}</div>
    </FinancePageShell>
  );
}
