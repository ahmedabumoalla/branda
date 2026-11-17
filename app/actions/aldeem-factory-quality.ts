"use server";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { manufacturingError } from "@/lib/data/erp-manufacturing";
import { actionResult } from "@/lib/platform/action-result";
import { factoryQualityCommand, type FactoryQualitySnapshot, type FactoryTrace } from "@/lib/aldeem/factory-quality";

export async function getAldeemFactoryQuality() {
  return actionResult(async () => {
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    const { data, error } = await client.rpc("aldeem_factory_quality_read", { p_cafe: cafe.id });
    manufacturingError(error); return data as FactoryQualitySnapshot;
  }, "تعذر قراءة جودة المصنع");
}
export async function saveAldeemFactoryQuality(input: unknown) {
  return actionResult(async () => {
    const parsed = factoryQualityCommand.parse(input);
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    const { data, error } = await client.rpc("aldeem_factory_quality_execute", { p_cafe: cafe.id, p_payload: parsed });
    manufacturingError(error); return data as { id: string; revision: number };
  }, "تعذر حفظ جودة المصنع");
}
export async function getAldeemFactoryTrace(orderId: string) {
  return actionResult(async () => {
    const id = z.uuid().parse(orderId);
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    const { data, error } = await client.rpc("aldeem_factory_trace", { p_cafe: cafe.id, p_order: id });
    manufacturingError(error); return data as FactoryTrace;
  }, "تعذر قراءة تتبع المصنع");
}
