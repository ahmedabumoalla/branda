"use server";

import { actionResult } from "@/lib/platform/action-result";
import { getFinanceTreasury, getFinanceAccountStatement, getFinanceTreasuryHistory, getFinanceTerminalFeeHistory, executeFinanceTreasury, executeFinanceTreasuryCorrection } from "@/lib/data/finance-treasury";
import type { TreasuryStatementOptions } from "@/lib/finance/treasury";

export async function fetchFinanceTreasuryAction(slug?: string) {
  return actionResult(() => getFinanceTreasury(slug), "تعذر تحميل الخزينة حاول مجددا");
}
export async function fetchFinanceAccountStatementAction(accountId: string, options: TreasuryStatementOptions = {}, slug?: string) {
  return actionResult(() => getFinanceAccountStatement(accountId, options, slug), "تعذر تحميل كشف الحساب حاول مجددا");
}
export async function fetchFinanceTreasuryHistoryAction(accountId: string, kind: "audit" | "reconciliations", offset = 0, slug?: string) {
  return actionResult(() => getFinanceTreasuryHistory(accountId, kind, offset, slug), "تعذر تحميل سجل الحساب حاول مجددا");
}
export async function fetchFinanceTerminalFeeHistoryAction(accountId: string | null = null, offset = 0, slug?: string) {
  return actionResult(() => getFinanceTerminalFeeHistory(accountId, offset, slug), "تعذر تحميل سجل رسوم الشبكة حاول مجددا");
}
export async function executeFinanceTreasuryAction(operation: string, payload: Record<string, unknown>, requestId: string, slug?: string) {
  return actionResult(() => executeFinanceTreasury(operation, payload, requestId, slug), "تعذر تأكيد العملية أعد المحاولة بنفس الطلب لتجنب التكرار");
}
export async function executeFinanceTreasuryCorrectionAction(operation: string, payload: Record<string, unknown>, requestId: string, slug?: string) {
  return actionResult(() => executeFinanceTreasuryCorrection(operation, payload, requestId, slug), "تعذر تنفيذ التصحيح تحقق من جلسة الدخول بالنيابة");
}
