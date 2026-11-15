import "server-only";
import type { getBrandFinanceContext } from "./brand-finance";
import { saudiEinvoicePolicySchema, unavailableSaudiEinvoicePolicy, type SaudiEinvoicePolicy } from "@/lib/finance/invoice-amendment";

type FinanceClient = Awaited<ReturnType<typeof getBrandFinanceContext>>["client"];

export async function readSaudiEinvoicePolicy(client: FinanceClient, cafeId: string): Promise<SaudiEinvoicePolicy> {
  const { data, error } = await client.rpc("brand_finance_saudi_einvoice_context", { p_cafe_id: cafeId });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code) && error.message.includes("brand_finance_saudi_einvoice_context")) {
      return unavailableSaudiEinvoicePolicy();
    }
    throw new Error("تعذر التحقق من إعداد الفوترة الإلكترونية أعد المحاولة");
  }
  const result = saudiEinvoicePolicySchema.safeParse(data);
  if (!result.success || !result.data.available) throw new Error("تعذر التحقق من إعداد الفوترة الإلكترونية أعد المحاولة");
  return result.data;
}
