import type { BrandaFinanceReadinessResult } from "@/lib/branda-finance/db-types";
import { getBrandaFinanceDbReadiness } from "@/lib/branda-finance/db-readiness";
import type { FinanceWorkspaceData } from "@/lib/branda-finance/invoice-types";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";

export async function getBrandaFinanceInvoiceWorkspace(): Promise<
  BrandaFinanceReadinessResult<FinanceWorkspaceData>
> {
  const data = await getBrandaFinanceRealWorkspaceData();

  return {
    data,
    readiness: getBrandaFinanceDbReadiness(),
  };
}

export async function getBrandaFinanceSalesWorkspace(): Promise<
  BrandaFinanceReadinessResult<FinanceWorkspaceData>
> {
  return getBrandaFinanceInvoiceWorkspace();
}
