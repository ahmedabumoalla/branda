"use server";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { manufacturingError } from "@/lib/data/erp-manufacturing";
import { actionResult } from "@/lib/platform/action-result";
import { foodQualityCommand, type FoodQualitySnapshot, type FoodTrace } from "@/lib/erp/aldeem-food-quality";
import { z } from "zod";

export async function getAldeemFoodQuality() {
  return actionResult(async () => {
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    const { data, error } = await client.rpc("erp_aldeem_food_quality_read", { p_cafe: cafe.id });
    manufacturingError(error);
    return data as FoodQualitySnapshot;
  }, "تعذر قراءة مراحل سلامة التصنيع");
}
export async function saveAldeemFoodQuality(input: unknown) {
  return actionResult(async () => {
    const parsed = foodQualityCommand.safeParse(input);
    if (!parsed.success) throw new Error("أكمل بيانات المرحلة والمراجع المطلوبة");
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    const { data, error } = await client.rpc("erp_aldeem_food_quality_execute", { p_cafe: cafe.id, p_payload: parsed.data });
    manufacturingError(error);
    return data as { id: string; revision: number };
  }, "تعذر حفظ سجل سلامة التصنيع");
}
export async function getAldeemFoodTrace(orderId: string) {
  return actionResult(async () => {
    const id = z.uuid().parse(orderId);
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    const { data, error } = await client.rpc("erp_aldeem_food_trace", { p_cafe: cafe.id, p_order: id });
    manufacturingError(error);
    return data as FoodTrace;
  }, "تعذر قراءة حركات التشغيلات الأصلية");
}
