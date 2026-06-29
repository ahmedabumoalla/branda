import { InvoiceWorkspace } from "@/components/branda-finance/invoice-workspace";
import { getBrandaFinanceInvoiceWorkspace } from "@/lib/branda-finance/queries";

export default async function BrandaFinanceInvoiceCreatePage() {
  const { data, readiness } = await getBrandaFinanceInvoiceWorkspace();
  return <InvoiceWorkspace data={data} realPersistenceReady={readiness.canPersistSalesInvoices} />;
}
