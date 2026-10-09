"use server";

import { getAdminOperationsReport } from "@/lib/data/operations-report";
import type { ReportPeriod } from "@/lib/analytics/operations-report";

export async function loadOperationsReportAction(input: ReportPeriod) {
  try { return { ok: true as const, data: await getAdminOperationsReport(input) }; }
  catch { return { ok: false as const, message: "تعذر تحميل التقرير تحقق من صلاحية دخولك وتفعيل سجل التقارير ثم أعد المحاولة" }; }
}
