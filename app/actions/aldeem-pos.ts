"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import type { AldeemCustomerAccount, AldeemPosContext, AldeemPosCustomer, AldeemPosRegister } from "@/lib/aldeem/pos";
import type { FinanceCommandResult } from "@/lib/finance/brand-finance";

class PosRpcError extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
  if (cafe.slug !== "khayal-aldeem") throw new Error("نقطة البيع غير متاحة لهذا الحساب");
  let result;
  try { result = await client.rpc(name, { p_cafe: cafe.id, ...args }); }
  catch { throw new PosRpcError("تعذر تأكيد نتيجة الحفظ أعد المحاولة بنفس البيانات", true); }
  if (result.error) {
    // SQL validation/constraint/authorization/transaction errors reject the transaction.
    // A transport or gateway error can arrive after a commit and must retain its request identity.
    const rejected = /^(?:22|23|28|40|42|P0)[A-Z0-9]{3}$/.test(result.error.code ?? "");
    const message = result.error.message && /[\u0600-\u06ff]/.test(result.error.message) && result.error.message.length < 300 ? result.error.message : rejected ? "تعذر تنفيذ العملية راجع البيانات وأعد المحاولة" : "تعذر تأكيد نتيجة الحفظ أعد المحاولة بنفس البيانات";
    throw new PosRpcError(message, !rejected);
  }
  return result.data;
}
export async function readAldeemPos() {
  return actionResult(async () => await rpc("aldeem_pos_read", { p_point: null, p_query: "" }) as AldeemPosRegister, "تعذر قراءة نقاط البيع");
}
export async function openAldeemPos(point: string, query = "") {
  return actionResult(async () => await rpc("aldeem_pos_read", { p_point: z.uuid().parse(point), p_query: z.string().max(100).parse(query) }) as AldeemPosContext, "تعذر فتح نقطة البيع");
}
export async function findAldeemPosCustomers(point: string, query: string) {
  return actionResult(async () => await rpc("aldeem_pos_customers", { p_point: z.uuid().parse(point), p_query: z.string().trim().min(2).max(100).parse(query) }) as AldeemPosCustomer[], "تعذر البحث عن العميل");
}
export async function readAldeemCustomerAccount(customer: string, point?: string) {
  return actionResult(async () => await rpc("aldeem_pos_customer_account", { p_customer: z.uuid().parse(customer), p_point: point ? z.uuid().parse(point) : null }) as AldeemCustomerAccount, "تعذر قراءة حساب العميل");
}
// productId identifies the existing inventory item in Aldeem retail POS.
// The RPC supplies catalogSource and validates warehouse/unit/price server-side.
const line = z.object({ productId: z.uuid(), quantity: z.number().positive().max(1000), expectedUnitPrice: z.number().nonnegative().max(100000) }).strict();
const commands = z.discriminatedUnion("action", [
  z.object({ action: z.literal("point"), payload: z.object({ id: z.uuid(), revision: z.number().int().min(0), name: z.string().trim().min(2).max(100), branchId: z.uuid(), employeeId: z.uuid(), warehouseId: z.uuid(), cashAccountId: z.uuid(), cardAccountId: z.uuid(), enabled: z.boolean() }).strict() }),
  z.object({ action: z.literal("prices"), payload: z.object({ pointId: z.uuid(), revision: z.number().int().positive(), prices: z.array(z.object({ productId: z.uuid(), price: z.number().nonnegative().max(100000) })).max(100) }).strict() }),
  z.object({ action: z.literal("sale"), payload: z.object({ pointId: z.uuid(), revision: z.number().int().positive(), partyId: z.uuid().nullable(), method: z.enum(["cash", "card"]), lines: z.array(line).min(1).max(100), redeemPoints: z.number().int().nonnegative().max(1000000), expectedTotal: z.number().positive().max(100000000) }).strict() }),
  z.object({ action: z.enum(["shift_open", "shift_close"]), payload: z.object({ pointId: z.uuid(), amount: z.number().nonnegative().max(100000000) }).strict() }),
]);
export async function writeAldeemPos(input: unknown, requestId: string) {
  try {
    const parsed = commands.safeParse(input);
    if (!parsed.success) throw new Error("راجع الحقول والمبالغ المطلوبة قبل الحفظ");
    const data = await rpc("aldeem_pos_execute", { p_action: parsed.data.action, p_payload: parsed.data.payload, p_request: z.uuid().parse(requestId) }) as FinanceCommandResult | null;
    if (!data?.id) throw new PosRpcError("تعذر تأكيد نتيجة الحفظ أعد المحاولة بنفس البيانات", true);
    return { ok: true as const, data };
  } catch (error) {
    return { ok: false as const, uncertain: error instanceof PosRpcError && error.uncertain, message: error instanceof Error && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 400 ? error.message : "تعذر حفظ العملية بقي الطلب محفوظًا في السلة" };
  }
}
