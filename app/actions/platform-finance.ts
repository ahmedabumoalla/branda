"use server";

import { revalidatePath } from "next/cache";
import { actionResult } from "@/lib/platform/action-result";
import { getFinanceOptions, getFinancePage, getFinanceReceipt, postFinanceEntry } from "@/lib/data/platform-finance";

export async function fetchFinanceAction(input: unknown) {
  return actionResult(() => getFinancePage(input), "تعذر تحميل السجل المالي حاول مجددًا");
}
export async function financeOptionsAction() {
  return actionResult(getFinanceOptions, "تعذر تحميل العلامات والباقات حاول مجددًا");
}
export async function financeReceiptAction(id: unknown) {
  return actionResult(() => getFinanceReceipt(id), "تعذر فتح الإيصال حاول مجددًا");
}
export async function postFinanceAction(input: unknown, form: FormData) {
  return actionResult(async () => {
    const result = await postFinanceEntry(input, form);
    revalidatePath("/admin/finance");
    revalidatePath("/admin/subscription-requests");
    revalidatePath("/admin/cafes");
    revalidatePath("/admin/plans");
    revalidatePath("/dashboard", "layout");
    return result;
  }, "تعذر تأكيد حفظ السند أعد المحاولة بنفس البيانات حتى لا يتكرر التحصيل");
}
