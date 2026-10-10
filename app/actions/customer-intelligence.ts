"use server";
import { actionResult } from "@/lib/platform/action-result";
import { getCustomerIntelligence, getCustomerIntelligenceDetail } from "@/lib/data/customer-intelligence";
export async function fetchCustomerIntelligenceAction(input: unknown) {
    return actionResult(() => getCustomerIntelligence(input), "تعذر تحميل العملاء حاول مجددًا");
}
export async function fetchCustomerIntelligenceDetailAction(input: unknown) {
    return actionResult(() => getCustomerIntelligenceDetail(input), "تعذر تحميل ملف العميل حاول مجددًا");
}
