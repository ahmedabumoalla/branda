import { CashierSalesWorkspace } from "@/components/branda-finance/cashier-sales-workspace";
import { loadBrandaFinanceDemoData } from "@/lib/branda-finance/load-demo-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function BrandaFinanceSalesPage() {
  const dataset = await loadBrandaFinanceDemoData();
  return <CashierSalesWorkspace dataset={dataset} />;
}
