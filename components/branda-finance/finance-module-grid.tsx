import { FinanceActionCard } from "@/components/branda-finance/finance-action-card";
import type { BrandaFinanceRoute } from "@/lib/branda-finance/navigation";

export function FinanceModuleGrid({ routes }: { routes: BrandaFinanceRoute[] }) {
  return (
    <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {routes.map((route) => (
        <FinanceActionCard key={route.href} title={route.title} href={route.href} description={route.description} status={route.status} />
      ))}
    </section>
  );
}
