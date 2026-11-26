"use server";
import { actionResult } from "@/lib/platform/action-result";
import { getPosShiftReport } from "@/lib/data/finance-pos-shift-report";

export async function fetchPosShiftReportAction(shiftId: string, slug?: string, withInvoiceMethods = false) {
  return actionResult(() => getPosShiftReport(shiftId, slug, withInvoiceMethods), "تعذر تحميل تقرير الوردية");
}
