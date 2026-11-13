"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { normalizeSalesReturnQuery, salesReturnFiltersSchema, type SalesReturnDetail, type SalesReturnStockResult, type SalesReturnSummary } from "@/lib/finance/sales-return";
import { actionResult } from "@/lib/platform/action-result";
import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";

function failure(error: { code?: string; message: string }): never {
  if (["PGRST202", "42P01", "42883"].includes(error.code ?? "")) throw new Error("تحتاج الفواتير المرتجعة إلى تحديث قاعدة البيانات");
  if (error.code === "40001") throw new Error("تغير إذن الاستلام افتح النسخة المحفوظة قبل المتابعة");
  throw new Error(/[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر تنفيذ العملية أعد تحميل الفاتورة ثم حاول مجددًا");
}
export async function readSalesReturnsAction(slug: string, filters: unknown = {}) {
  return actionResult(async () => {
    const parsed = salesReturnFiltersSchema.safeParse(filters);
    if (!parsed.success) throw new Error("راجع خيارات البحث");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "reports")) throw new Error("لا تملك صلاحية عرض الفواتير المرتجعة");
    const { data, error } = await client.rpc("brand_finance_sales_returns", { p_cafe_id: cafe.id, p_filters: { ...parsed.data, query: normalizeSalesReturnQuery(parsed.data.query) } });
    if (error) failure(error);
    return data as { items: SalesReturnSummary[]; total: number; offset: number; limit: number };
  }, "تعذر تحميل الفواتير المرتجعة");
}
export async function readSalesReturnAction(id: string, slug: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success) throw new Error("الفاتورة المرتجعة غير متاحة");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "reports")) throw new Error("لا تملك صلاحية عرض الفاتورة المرتجعة");
    const { data, error } = await client.rpc("brand_finance_sales_returns", { p_cafe_id: cafe.id, p_id: id });
    if (error) failure(error);
    if (!data) throw new Error("الفاتورة المرتجعة غير موجودة أو غير متاحة");
    return data as SalesReturnDetail;
  }, "تعذر تحميل الفاتورة المرتجعة");
}
export async function transitionSalesReturnStockAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().positive(), operation: z.enum(["receive", "reject"]), requestId: z.uuid(), note: z.string().max(500).default("") }).strict().safeParse(input);
    if (!parsed.success) throw new Error("راجع بيانات إذن الاستلام");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "inventory_write")) throw new Error("لا تملك صلاحية استلام المخزون");
    const p = parsed.data;
    const { data, error } = await client.rpc("brand_finance_sales_return_stock", { p_cafe_id: cafe.id, p_id: p.id, p_revision: p.revision, p_operation: p.operation, p_request_id: p.requestId, p_note: p.note });
    if (error) failure(error);
    invalidateFinanceViews(slug);
    return data as SalesReturnDetail | SalesReturnStockResult;
  }, "تعذر تأكيد العملية أعد المحاولة بنفس الطلب");
}
