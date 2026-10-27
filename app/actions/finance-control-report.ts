"use server";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceControlReport,getFinanceJournalExport,getFinancePeriodClosures } from "@/lib/data/finance-control-report";
export async function fetchFinanceControlReportAction(slug?:string) {return actionResult(()=>getFinanceControlReport(slug),"تعذر تحميل الرقابة المالية");}
export async function fetchFinanceJournalExportAction(input:unknown,slug?:string) {return actionResult(()=>getFinanceJournalExport(input,slug),"تعذر تصدير اليومية");}
export async function fetchFinancePeriodClosuresAction(slug?:string) {return actionResult(()=>getFinancePeriodClosures(slug),"تعذر تحميل سجل الإقفال");}
