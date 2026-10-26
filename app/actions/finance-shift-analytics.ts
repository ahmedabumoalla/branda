"use server";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceShiftAnalytics } from "@/lib/data/finance-shift-analytics";

export async function fetchFinanceShiftAnalyticsAction(shiftId: string, slug?: string) {
  return actionResult(() => getFinanceShiftAnalytics(shiftId, slug), "تعذر تحميل تحليل الوردية");
}
