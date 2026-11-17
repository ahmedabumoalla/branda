"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { defaults, policySchema, type AldeemSalesPolicyState } from "@/lib/finance/aldeem-sales-policy";

const stateSchema = z.object({ policy: policySchema, revision: z.number().int().positive() }).strict();
async function context() {
  const result = await getBrandFinanceContext("khayal-aldeem");
  if (result.cafe.slug !== "khayal-aldeem" || result.cafe.role !== "owner") throw new Error("لا تملك صلاحية إدارة إعدادات الديم");
  return result;
}

export async function getAldeemSalesPolicy() {
  return actionResult(async (): Promise<AldeemSalesPolicyState> => {
    const { client, cafe } = await context();
    const { data, error } = await client.rpc("aldeem_sales_policy", { p_cafe_id: cafe.id });
    if (error) throw new Error("تعذر تحميل إعدادات حساب الديم أعد المحاولة");
    return data === null ? { policy: { ...defaults }, revision: 0 } : stateSchema.parse(data);
  }, "تعذر تحميل إعدادات حساب الديم");
}

export async function saveAldeemSalesPolicy(policy: unknown, revision: number) {
  return actionResult(async (): Promise<AldeemSalesPolicyState> => {
    const { client, cafe } = await context();
    const parsed = z.object({ policy: policySchema, revision: z.number().int().nonnegative() }).safeParse({ policy, revision });
    if (!parsed.success) throw new Error("راجع إعدادات الفاتورة واختر طريقة دفع وطريقة إصدار واحدة على الأقل");
    const { data, error } = await client.rpc("aldeem_sales_policy", { p_cafe_id: cafe.id, p_action: "save", p_policy: parsed.data.policy, p_revision: parsed.data.revision });
    if (error?.code === "40001") throw new Error("تغيرت إعدادات الحساب من جلسة أخرى أعد تحميل الإعدادات قبل الحفظ");
    if (error) throw new Error("تعذر حفظ إعدادات حساب الديم أعد المحاولة");
    return stateSchema.parse(data);
  }, "تعذر حفظ إعدادات حساب الديم");
}
