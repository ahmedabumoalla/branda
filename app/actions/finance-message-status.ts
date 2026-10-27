"use server";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceInvoiceMessageStatuses } from "@/lib/data/finance-message-status";

export async function loadFinanceInvoiceMessageStatusesAction(input: { documentIds: string[] }, slug?: string) {
  return actionResult(() => getFinanceInvoiceMessageStatuses(input, slug), "تعذر التحقق من حالة رسالة الفاتورة");
}
