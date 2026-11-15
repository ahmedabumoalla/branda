"use server";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import type { PosPurchaseCatalog } from "@/lib/finance/pos-purchases";
export async function readFinancePosPurchases(slug: string, shiftId: string) {
  return actionResult(async () => {
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (cafe.role !== "owner" && (cafe.employeePermissions ? !cafe.employeePermissions["purchases.read"].enabled : !["manager", "cashier"].includes(cafe.role))) throw new Error("لا تملك صلاحية مشتريات الوردية");
    const { data, error } = await client.rpc("brand_finance_pos_purchase_catalog", { p_cafe_id: cafe.id, p_shift_id: z.uuid().parse(shiftId) });
    if (error) throw new Error(error.message && /[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر تحميل بيانات المشتريات أعد المحاولة");
    return data as PosPurchaseCatalog;
  }, "تعذر تحميل بيانات المشتريات");
}
