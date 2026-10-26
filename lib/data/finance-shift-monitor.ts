import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import type { ShiftMonitorPage } from "@/lib/finance/shift-monitor";
const date = z.union([z.literal(""), z.iso.date()]);
export async function getFinanceShiftMonitor(input: unknown, slug?: string): Promise<ShiftMonitorPage> {
  const filter = z.object({ offset: z.number().int().min(0).max(10_000_000), query: z.string().trim().max(120), from: date, to: date, shiftId: z.uuid().optional() }).strict().parse(input);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_shift_monitor", { p_cafe_id: cafe.id, p_offset: filter.offset, p_query: filter.query, p_from: filter.from || null, p_to: filter.to || null, p_shift_id: filter.shiftId ?? null });
  if (error) throw new Error("تعذر تحميل سجل الورديات تحقق من صلاحيتك والاتصال");
  return data as ShiftMonitorPage;
}
export async function superviseFinanceShift(input: unknown, slug?: string) {
  const command = z.object({ shiftId: z.uuid(), action: z.enum(["pause", "resume"]), reason: z.string().trim().min(3).max(1000), requestId: z.uuid() }).strict().parse(input);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_supervise_shift", { p_cafe_id: cafe.id, p_shift_id: command.shiftId, p_action: command.action, p_reason: command.reason, p_request_id: command.requestId });
  if (error) throw new Error(/[\u0600-\u06ff]/.test(error.message) && error.message.length < 300 ? error.message : "تعذر تنفيذ الإجراء تحقق من حالة الوردية وصلاحيتك");
  return data as { id: string };
}
