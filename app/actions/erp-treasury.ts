"use server";
import type {BranchScope} from "@/lib/erp/branches";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceTreasury, getFinanceAccountStatement, getFinanceTreasuryHistory, getFinanceTerminalFeeHistory, executeFinanceTreasury, executeFinanceTreasuryCorrection } from "@/lib/data/erp-treasury";
import type { TreasuryStatementOptions } from "@/lib/finance/treasury";

export async function fetchFinanceTreasuryAction(slug?: string, scope?:BranchScope|null) {
  return actionResult(() => getFinanceTreasury(slug,scope), "تعذر تحميل الخزينة حاول مجددا");
}
export async function fetchFinanceAccountStatementAction(accountId: string, options: TreasuryStatementOptions = {}, slug?: string, scope?:BranchScope|null) {
  return actionResult(() => getFinanceAccountStatement(accountId, options, slug,scope), "تعذر تحميل كشف الحساب حاول مجددا");
}
export async function fetchFinanceTreasuryHistoryAction(accountId: string, kind: "audit" | "reconciliations", offset = 0, slug?: string, scope?:BranchScope|null) {
  return actionResult(() => getFinanceTreasuryHistory(accountId, kind, offset, slug,scope), "تعذر تحميل سجل الحساب حاول مجددا");
}
export async function fetchFinanceTerminalFeeHistoryAction(accountId: string | null = null, offset = 0, slug?: string, scope?:BranchScope|null) {
  return actionResult(() => getFinanceTerminalFeeHistory(accountId, offset, slug,scope), "تعذر تحميل سجل رسوم الشبكة حاول مجددا");
}
export async function executeFinanceTreasuryAction(operation: string, payload: Record<string, unknown>, requestId: string, slug?: string, scope?:BranchScope|null) {
  return actionResult(async () => {
    const result = await executeFinanceTreasury(operation, payload, requestId, slug,scope);
    invalidateFinanceViews(slug);
    return result;
  }, "تعذر تأكيد العملية أعد المحاولة بنفس الطلب لتجنب التكرار");
}
export async function executeFinanceTreasuryCorrectionAction(operation: string, payload: Record<string, unknown>, requestId: string, slug?: string, scope?:BranchScope|null) {
  return actionResult(async () => {
    const result = await executeFinanceTreasuryCorrection(operation, payload, requestId, slug,scope);
    invalidateFinanceViews(slug);
    return result;
  }, "تعذر تنفيذ التصحيح تحقق من جلسة الدخول بالنيابة");
}
