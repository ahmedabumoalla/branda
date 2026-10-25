import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import type { CashHandoversPage, CashHandoverReceiptResult } from "@/lib/finance/cash-handovers";

const offsetSchema = z.number().int().min(0).max(10_000_000);
const receiptSchema = z.object({
  handoverId: z.uuid(), accountId: z.uuid(),
  note: z.string().trim().max(1000), requestId: z.uuid(),
}).strict();

export async function getFinanceCashHandovers(offset: unknown = 0, slug?: string): Promise<CashHandoversPage> {
  const parsed = offsetSchema.safeParse(offset);
  if (!parsed.success) throw new Error("نطاق سجل التسليمات غير صالح");
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_cash_handovers", { p_cafe_id: cafe.id, p_offset: parsed.data, p_limit: 50 });
  if (error) throw new Error("تعذر تحميل تسليمات الورديات حاول مجددا");
  const result = data as Omit<CashHandoversPage, "hasMore"> | null;
  if (!result || !Array.isArray(result.rows) || !Array.isArray(result.accountants) || !z.uuid().safeParse(result.cashierDrawerId).success || !Number.isSafeInteger(Number(result.total)) || Number(result.total) < 0) throw new Error("تعذر تحميل بيانات صندوق الكاشير حاول مجددا");
  return {
    ...result, total: Number(result.total),
    hasMore: parsed.data + result.rows.length < Number(result.total),
    canReceive: (cafe.role === "owner" || cafe.role === "manager") && result.canReceive === true,
  };
}

export async function receiveFinanceShiftCash(input: unknown, slug?: string): Promise<CashHandoverReceiptResult> {
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) throw new Error("اختر تسليم الوردية وحساب الاستلام وراجع بيانات السند");
  const { client, cafe } = await getBrandFinanceContext(slug);
  if (cafe.role !== "owner" && cafe.role !== "manager") throw new Error("استلام نقدية الورديات متاح لإدارة المالية فقط");
  const value = parsed.data;
  // The database locks the handover and reads its exact amount; no client amount is accepted
  const { data, error } = await client.rpc("brand_finance_receive_shift_cash", {
    p_cafe_id: cafe.id, p_handover_id: value.handoverId, p_account_id: value.accountId,
    p_note: value.note, p_request_id: value.requestId,
  });
  if (error) {
    if (error.code === "42501") throw new Error("لا تملك صلاحية استلام نقدية هذه الوردية");
    if (error.message && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 300) throw new Error(error.message);
    throw new Error("تعذر تأكيد سند القبض حدث السجل ثم أعد المحاولة بنفس الطلب");
  }
  if (!data) throw new Error("تعذر تأكيد سند القبض أعد المحاولة بنفس الطلب");
  return data as CashHandoverReceiptResult;
}
