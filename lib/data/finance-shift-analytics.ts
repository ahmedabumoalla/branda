import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import type { ShiftAnalytics } from "@/lib/finance/shift-analytics";

export async function getFinanceShiftAnalytics(shiftId: string, slug?: string): Promise<ShiftAnalytics> {
  const id = z.uuid().parse(shiftId);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_shift_analytics", { p_cafe_id: cafe.id, p_shift_id: id });
  if (error || !data || data.shiftId !== id) throw new Error("تعذر تحميل تحليل الوردية تحقق من الاتصال وصلاحيتك ثم أعد المحاولة");
  return data as ShiftAnalytics;
}
