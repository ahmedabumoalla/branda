"use server";

import {
  BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE,
  getBrandaFinanceDbReadiness,
} from "@/lib/branda-finance/db-readiness";

export type BrandaFinanceDisabledActionResult = {
  success: false;
  disabled: true;
  message: string;
  readiness: ReturnType<typeof getBrandaFinanceDbReadiness>;
};

function disabledActionResult(): BrandaFinanceDisabledActionResult {
  return {
    success: false,
    disabled: true,
    message: BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE,
    readiness: getBrandaFinanceDbReadiness(),
  };
}

export async function saveSalesInvoiceDraftAction(): Promise<BrandaFinanceDisabledActionResult> {
  return disabledActionResult();
}

export async function approveSalesInvoiceAction(): Promise<BrandaFinanceDisabledActionResult> {
  return disabledActionResult();
}

export async function createCashierInvoiceAction(): Promise<BrandaFinanceDisabledActionResult> {
  return disabledActionResult();
}

export async function recordFinancePaymentAction(): Promise<BrandaFinanceDisabledActionResult> {
  return disabledActionResult();
}
