"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { normalizeSalesReturnQuery } from "@/lib/finance/sales-return";
import { aldeemPurchaseKindSchema, aldeemPurchasePageSchema, aldeemPurchaseDetailSchema, aldeemPurchaseDefaultsSchema, aldeemPurchaseItemSchema, aldeemPurchaseSupplierSchema, type AldeemPurchaseKind } from "@/lib/erp/aldeem-purchases";

const searchSchema = z.object({ query: z.string().trim().max(100), offset: z.number().int().min(0).max(100000) });
async function lookup(mode: string, options: { kind?: string; query?: string; offset?: number; id?: string; ids?: string[] } = {}) {
  const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
  if (cafe.slug !== "khayal-aldeem" || cafe.role !== "owner") throw new Error("لا تملك صلاحية إدارة مشتريات الديم");
  const { data, error } = await client.rpc("aldeem_purchases_lookup", {
    p_cafe_id: cafe.id, p_mode: mode, p_kind: options.kind ?? "invoice", p_query: options.query ?? "",
    p_offset: options.offset ?? 0, p_id: options.id ?? null, p_ids: options.ids ?? [],
  });
  if (error) throw new Error("تعذر قراءة بيانات المشتريات أعد المحاولة");
  return data;
}
export async function listAldeemPurchases(kind: AldeemPurchaseKind, query = "", offset = 0) {
  return actionResult(async () => {
    const parsed = searchSchema.parse({ query, offset });
    return aldeemPurchasePageSchema.parse(await lookup("list", { kind: aldeemPurchaseKindSchema.parse(kind), query: normalizeSalesReturnQuery(parsed.query), offset: parsed.offset }));
  }, "تعذر قراءة سجل المشتريات");
}
export async function readAldeemPurchaseRecord(id: string) {
  return actionResult(async () => aldeemPurchaseDetailSchema.parse(await lookup("record", { id: z.uuid().parse(id) })), "تعذر قراءة تفاصيل المستند");
}
export async function getAldeemPurchaseDefaults() {
  return actionResult(async () => aldeemPurchaseDefaultsSchema.parse(await lookup("defaults")), "تعذر قراءة إعدادات المشتريات");
}
export async function searchAldeemPurchaseSuppliers(query: string, ids: string[] = []) {
  return actionResult(async () => z.array(aldeemPurchaseSupplierSchema).max(100).parse(await lookup("suppliers", { query: z.string().trim().max(100).parse(query), ids: z.array(z.uuid()).max(100).parse(ids) })), "تعذر البحث عن المورد");
}
export async function searchAldeemPurchaseItems(query: string, ids: string[] = []) {
  return actionResult(async () => z.array(aldeemPurchaseItemSchema).max(100).parse(await lookup("items", { query: normalizeSalesReturnQuery(z.string().trim().max(100).parse(query)), ids: z.array(z.uuid()).max(100).parse(ids) })), "تعذر البحث عن الصنف");
}
export async function searchAldeemPurchaseReturnSources(query = "", offset = 0) {
  return actionResult(async () => {
    const parsed = searchSchema.parse({ query, offset });
    return aldeemPurchasePageSchema.parse(await lookup("sources", { query: normalizeSalesReturnQuery(parsed.query), offset: parsed.offset }));
  }, "تعذر البحث عن فاتورة المشتريات الأصلية");
}
