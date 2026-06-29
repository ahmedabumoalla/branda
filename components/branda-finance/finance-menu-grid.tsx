import { FinanceMenuCard } from "@/components/branda-finance/finance-menu-card";
import { brandaFinanceMenuItems } from "@/lib/branda-finance/menu";

export function FinanceMenuGrid() {
  return (
    <section
      aria-label="أقسام برندا المالية"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      {brandaFinanceMenuItems.map((item) => (
        <FinanceMenuCard key={item.title} item={item} />
      ))}
    </section>
  );
}
