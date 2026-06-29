import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";

export type FinanceKpi = {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "gold" | "red" | "brown";
};

type FinanceKpiRowProps = {
  items: FinanceKpi[];
};

export function FinanceKpiRow({ items }: FinanceKpiRowProps) {
  return (
    <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <FinanceStatCard key={item.label} {...item} />
      ))}
    </section>
  );
}
