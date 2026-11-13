"use server";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceShiftDetail } from "@/lib/data/finance-shifts";

export async function fetchFinanceShiftDetailAction(shiftId: string, slug?: string) {
  return actionResult(() => getFinanceShiftDetail(shiftId, slug), "تعذر تحميل تفاصيل الوردية");
}
