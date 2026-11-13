"use server";
import type {BranchScope} from "@/lib/erp/branches";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceCashHandovers, receiveFinanceShiftCash } from "@/lib/data/erp-treasury-handovers";
import type { CashHandoverReceipt } from "@/lib/finance/cash-handovers";

export async function fetchFinanceCashHandoversAction(offset = 0, slug?: string, scope?:BranchScope|null) {
  return actionResult(() => getFinanceCashHandovers(offset, slug,scope), "تعذر تحميل تسليمات الورديات حاول مجددا");
}

export async function receiveFinanceShiftCashAction(input: CashHandoverReceipt, slug?: string, scope?:BranchScope|null) {
  return actionResult(async () => {
    const result = await receiveFinanceShiftCash(input, slug,scope);
    invalidateFinanceViews(slug);
    return result;
  }, "تعذر تأكيد سند القبض أعد المحاولة بنفس الطلب");
}
