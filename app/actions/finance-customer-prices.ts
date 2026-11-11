"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import type { CustomerSalePrice } from "@/lib/finance/customer-sale-price";

export async function customerSalePricesAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ customerId: z.uuid(), productIds: z.array(z.uuid()).min(1).max(100) }).safeParse(input);
    if (!parsed.success) throw new Error("اختر العميل والأصناف لعرض أسعار البيع السابقة");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية عرض أسعار العميل");
    const { data, error } = await client.rpc("brand_finance_customer_sale_prices", {
      p_cafe_id: cafe.id, p_customer_id: parsed.data.customerId, p_product_ids: [...new Set(parsed.data.productIds)],
    });
    if (error) throw new Error("تعذر تحميل أسعار البيع السابقة");
    return data as CustomerSalePrice[];
  }, "تعذر تحميل أسعار البيع السابقة");
}
