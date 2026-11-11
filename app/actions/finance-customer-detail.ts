"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { customerDetailTabs, type CustomerDetail, type CustomerDetailTab } from "@/lib/finance/customer-detail";

export async function fetchCustomerDetailAction(id: string, tab: CustomerDetailTab, page: number, slug: string) {
  return actionResult(async () => {
    const input = z.object({ id: z.uuid(), tab: z.enum(customerDetailTabs), page: z.number().int().min(1).max(400001) }).safeParse({ id, tab, page });
    if (!input.success) throw new Error("بيانات صفحة العميل غير صالحة");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "reports")) throw new Error("لا تملك صلاحية عرض حساب العميل");
    const { data, error } = await client.rpc("brand_finance_customer_detail", { p_cafe_id: cafe.id, p_id: id, p_tab: tab, p_page: page });
    if (error || !data) throw new Error("تعذر تحميل تفاصيل العميل");
    return data as CustomerDetail;
  }, "تعذر تحميل تفاصيل العميل");
}
