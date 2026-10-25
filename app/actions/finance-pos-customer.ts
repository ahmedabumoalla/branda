"use server";

import { after } from "next/server";
import { actionResult } from "@/lib/platform/action-result";
import { getFinancePosCustomer, getFinancePosPager, transitionFinancePosPager } from "@/lib/data/finance-pos-customer";
import { runPagerMessageJobs } from "@/lib/pager/worker";
import type { PagerFilter } from "@/lib/pager/types";

export async function fetchFinancePosCustomerAction(phone: string, slug?: string) {
  return actionResult(() => getFinancePosCustomer(phone, slug), "تعذر التحقق من ولاء العميل حاول مجددًا");
}
export async function fetchFinancePosPagerAction(filter: PagerFilter = {}, slug?: string) {
  return actionResult(() => getFinancePosPager(filter, slug), "تعذر تحميل طلبات البيجر حاول مجددًا");
}
export async function updateFinancePosPagerAction(orderId: string, status: "ready" | "received" | "cancelled", slug?: string) {
  return actionResult(async () => {
    const order = await transitionFinancePosPager(orderId, status, slug);
    if (status === "ready" || status === "received") after(async () => {
      try { await runPagerMessageJobs(5); } catch { /* Existing durable pager queue remains available to its worker */ }
    });
    return order;
  }, "تعذر تحديث طلب البيجر حاول مجددًا");
}
