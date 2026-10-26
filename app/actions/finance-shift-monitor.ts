"use server";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceShiftMonitor, superviseFinanceShift } from "@/lib/data/finance-shift-monitor";
import type { ShiftMonitorFilter } from "@/lib/finance/shift-monitor";
export async function fetchFinanceShiftMonitorAction(filter: ShiftMonitorFilter, slug?: string) {
  return actionResult(() => getFinanceShiftMonitor(filter, slug), "تعذر تحميل الورديات");
}
export async function superviseFinanceShiftAction(input: { shiftId: string; action: "pause" | "resume"; reason: string; requestId: string }, slug?: string) {
  return actionResult(() => superviseFinanceShift(input, slug), "تعذر تأكيد الإجراء أعد المحاولة بنفس البيانات");
}
