import { InvoiceWorkspace } from "@/components/branda-finance/invoice-workspace";
import { loadBrandaFinanceDemoData } from "@/lib/branda-finance/load-demo-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function CreateInvoicePage() {
  const dataset = await loadBrandaFinanceDemoData();
  return <InvoiceWorkspace dataset={dataset} />;
}
