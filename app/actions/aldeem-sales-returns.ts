"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { normalizeSalesReturnQuery } from "@/lib/finance/sales-return";
import { aldeemReturnInvoicesSchema, aldeemRefundRequestsSchema, aldeemReturnSettlementSchema, type AldeemRefundRequest, type AldeemReturnSettlement } from "@/lib/finance/aldeem-sales-return";

async function lookup(mode: "invoices" | "requests" | "settlement", query = "", offset = 0) {
  const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
  if (cafe.slug !== "khayal-aldeem" || cafe.role !== "owner") throw new Error("لا تملك صلاحية إدارة مرتجعات الديم");
  const { data, error } = await client.rpc("aldeem_sales_return_lookup", { p_cafe_id: cafe.id, p_mode: mode, p_query: query, p_offset: offset });
  if (error) throw new Error("تعذر قراءة بيانات المرتجع أعد المحاولة");
  return data;
}

export async function searchAldeemReturnInvoices(query: string, offset = 0) {
  return actionResult(async () => {
    const parsed = z.object({ query: z.string().trim().max(100), offset: z.number().int().min(0).max(100000) }).parse({ query, offset });
    return aldeemReturnInvoicesSchema.parse(await lookup("invoices", normalizeSalesReturnQuery(parsed.query), parsed.offset));
  }, "تعذر البحث عن الفاتورة الأصلية");
}

export async function readAldeemRefundRequests() {
  return actionResult(async (): Promise<AldeemRefundRequest[]> => aldeemRefundRequestsSchema.parse(await lookup("requests")), "تعذر قراءة طلبات المرتجع");
}

export async function getAldeemReturnSettlement() {
  return actionResult(async (): Promise<AldeemReturnSettlement> => aldeemReturnSettlementSchema.parse(await lookup("settlement")), "تعذر قراءة حسابات تسوية المرتجع");
}
