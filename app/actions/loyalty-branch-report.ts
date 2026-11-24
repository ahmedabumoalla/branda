"use server";

import { getOwnerLoyaltyBranchReport } from "@/lib/data/loyalty-branch-report";
import type { BranchReportFilters, LoyaltyBranchReportResult } from "@/lib/loyalty/branch-report-types";

export async function loadLoyaltyBranchReportAction(filters: BranchReportFilters): Promise<LoyaltyBranchReportResult> {
  try { return { ok: true, data: await getOwnerLoyaltyBranchReport(filters) }; }
  catch { return { ok: false, message: "تعذر تحميل تفاصيل عملاء الفرع تحقق من الفترة وصلاحية الدخول ثم أعد المحاولة" }; }
}
