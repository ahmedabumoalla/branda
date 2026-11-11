"use server";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceCashDifferences, settleFinanceCashDifference } from "@/lib/data/finance-cash-differences";
import type { CashDifferenceSettlement } from "@/lib/finance/cash-differences";

export async function fetchFinanceCashDifferencesAction(offset = 0, slug?: string) {
  return actionResult(() => getFinanceCashDifferences(offset, slug), "تعذر تحميل فروقات الورديات حاول مجددا");
}

export async function settleFinanceCashDifferenceAction(input: CashDifferenceSettlement, slug?: string) {
  return actionResult(async () => {
    const result = await settleFinanceCashDifference(input, slug);
    invalidateFinanceViews(slug);
    return result;
  }, "تعذر تأكيد تسوية الفرق أعد المحاولة بنفس الطلب");
}
