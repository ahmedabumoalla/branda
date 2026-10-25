"use server";

import { actionResult } from "@/lib/platform/action-result";
import { getFinanceCashDifferences, settleFinanceCashDifference } from "@/lib/data/finance-cash-differences";
import type { CashDifferenceSettlement } from "@/lib/finance/cash-differences";

export async function fetchFinanceCashDifferencesAction(offset = 0, slug?: string) {
  return actionResult(() => getFinanceCashDifferences(offset, slug), "تعذر تحميل فروقات الورديات حاول مجددا");
}

export async function settleFinanceCashDifferenceAction(input: CashDifferenceSettlement, slug?: string) {
  return actionResult(() => settleFinanceCashDifference(input, slug), "تعذر تأكيد تسوية الفرق أعد المحاولة بنفس الطلب");
}
