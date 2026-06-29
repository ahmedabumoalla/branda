import { CashierSalesWorkspace } from "@/components/branda-finance/cashier-sales-workspace";
import { getBrandaFinanceSalesWorkspace } from "@/lib/branda-finance/queries";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function BrandaFinanceSalesPage() {
  const [{ data, readiness }, features] = await Promise.all([
    getBrandaFinanceSalesWorkspace(),
    getOwnerFeatureCodes().catch(() => []),
  ]);

  return (
    <CashierSalesWorkspace
      data={data}
      loyaltyEnabled={featureCodesAllow(features, "loyalty")}
      realInvoicePersistenceReady={readiness.canPersistSalesInvoices}
    />
  );
}
