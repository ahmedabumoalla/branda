import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import type { PosShiftReport } from "@/lib/finance/pos-shift-report";

export async function getPosShiftReport(shiftId: string, slug?: string): Promise<PosShiftReport> {
  const id = z.uuid().parse(shiftId);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_pos_shift_report", { p_cafe_id: cafe.id, p_shift_id: id });
  if (error?.code === "42501") throw new Error("تقرير الوردية غير متاح لهذا الحساب");
  if (error || !data || data.shift?.id !== id || data.shift.status !== "closed") throw new Error("تعذر تحميل تقرير الوردية حاول مرة أخرى");
  return data as PosShiftReport;
}
