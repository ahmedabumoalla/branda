"use server";

import { actionResult } from "@/lib/platform/action-result";
import { getFinanceCashHandovers, receiveFinanceShiftCash } from "@/lib/data/finance-cash-handovers";
import type { CashHandoverReceipt } from "@/lib/finance/cash-handovers";

export async function fetchFinanceCashHandoversAction(offset = 0, slug?: string) {
  return actionResult(() => getFinanceCashHandovers(offset, slug), "تعذر تحميل تسليمات الورديات حاول مجددا");
}

export async function receiveFinanceShiftCashAction(input: CashHandoverReceipt, slug?: string) {
  return actionResult(() => receiveFinanceShiftCash(input, slug), "تعذر تأكيد سند القبض أعد المحاولة بنفس الطلب");
}
