"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";

const creditContext = z.object({
  enabled: z.boolean(), limit: z.number().finite().nonnegative(), days: z.number().int().min(0).max(3650),
  balance: z.number().finite(), available: z.number().finite().nonnegative(), overdue: z.boolean(),
});

export async function getAldeemCustomerCredit(customerId: string) {
  return actionResult(async () => {
    const parsedId = z.uuid().safeParse(customerId);
    if (!parsedId.success) throw new Error("اختر عميلًا صحيحًا للتحقق من البيع الآجل");
    const id = parsedId.data;
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    if (cafe.slug !== "khayal-aldeem" || cafe.role !== "owner") throw new Error("هذه الصفحة متاحة لمالك العلامة فقط");
    const result = await client.rpc("aldeem_customer_credit_context", { p_cafe_id: cafe.id, p_customer_id: id });
    if (result.error) throw new Error("تعذر التحقق من حد العميل ومدة السداد أعد المحاولة قبل إصدار فاتورة آجلة");
    const parsed = creditContext.safeParse(result.data);
    if (!parsed.success) throw new Error("تعذر قراءة سياسة البيع الآجل للعميل");
    return parsed.data;
  }, "تعذر التحقق من سياسة البيع الآجل للعميل");
}
