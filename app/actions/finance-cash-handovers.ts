"use server";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceCashHandovers, receiveFinanceShiftCash } from "@/lib/data/finance-cash-handovers";
import type { CashHandoverReceipt } from "@/lib/finance/cash-handovers";

export async function fetchFinanceCashHandoversAction(offset = 0, slug?: string) {
  return actionResult(() => getFinanceCashHandovers(offset, slug), "تعذر تحميل تسليمات الورديات حاول مجددا");
}

export async function receiveFinanceShiftCashAction(input: CashHandoverReceipt, slug?: string) {
  return actionResult(async () => {
    const result = await receiveFinanceShiftCash(input, slug);
    invalidateFinanceViews(slug);
    return result;
  }, "تعذر تأكيد سند القبض أعد المحاولة بنفس الطلب");
}
