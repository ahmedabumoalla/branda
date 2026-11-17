"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { defaults, policySchema } from "@/lib/finance/aldeem-sales-policy";

/** Explicit editor intent only: no full finance snapshot, accounts or catalog in the response. */
export async function getAldeemQuoteDefaults() {
  return actionResult(async () => {
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    if (cafe.slug !== "khayal-aldeem" || cafe.role !== "owner") throw new Error("لا تملك صلاحية إدارة عروض الديم");
    const [options, storedPolicy] = await Promise.all([
      client.rpc("aldeem_invoice_payment_options", { p_cafe_id: cafe.id }),
      client.rpc("aldeem_sales_policy", { p_cafe_id: cafe.id }),
    ]);
    if (options.error || storedPolicy.error) throw new Error("تعذر قراءة مستودعات العرض وإعدادات الضريبة أعد المحاولة");
    const policy = storedPolicy.data === null ? defaults : policySchema.parse(storedPolicy.data.policy);
    const parsed = z.object({
      warehouses: z.array(z.object({ id: z.uuid(), name: z.string(), active: z.boolean() })),
      settings: z.object({ tax_inclusive: z.boolean() }),
    }).parse(options.data);
    return { brand: cafe.name, warehouses: parsed.warehouses.filter(warehouse => warehouse.active), taxRate: policy.taxEnabled ? policy.taxRate : 0, taxInclusive: parsed.settings.tax_inclusive };
  }, "تعذر تجهيز خيارات عرض السعر");
}
