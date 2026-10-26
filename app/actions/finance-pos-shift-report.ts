"use server";
import { actionResult } from "@/lib/platform/action-result";
import { getPosShiftReport } from "@/lib/data/finance-pos-shift-report";

export async function fetchPosShiftReportAction(shiftId: string, slug?: string) {
  return actionResult(() => getPosShiftReport(shiftId, slug), "تعذر تحميل تقرير الوردية");
}
