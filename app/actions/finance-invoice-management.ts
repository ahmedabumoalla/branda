"use server";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import { withInvoiceLineNotes } from "@/lib/data/invoice-line-notes";

const change = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), ids: z.array(z.uuid()).min(1).max(500) }).strict(),
  z.object({ action: z.literal("delivery"), ids: z.array(z.uuid()).length(1), confirmed: z.boolean() }).strict(),
  z.object({ action: z.literal("schedule"), ids: z.array(z.uuid()).length(1), schedule: z.object({ amount: z.number().finite().min(0.01).max(1e9).multipleOf(0.01), start: z.iso.date(), frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "half_yearly", "yearly"]), note: z.string().max(500) }).strict().nullable() }).strict(),
]);

export async function readInvoiceDetailAction(id: string, slug: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success) throw new Error("الفاتورة غير متاحة");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "reports")) throw new Error("لا تملك صلاحية عرض تفاصيل الفواتير");
    const { data, error } = await client.rpc("brand_finance_invoice_detail", { p_cafe_id: cafe.id, p_id: z.uuid().parse(id) });
    if (error || !data) throw new Error("تعذر تحميل تفاصيل الفاتورة");
    const detail = data as InvoiceDetail;
    return detail.invoice ? { ...detail, invoice: await withInvoiceLineNotes(client, cafe.id, detail.invoice) } : detail;
  }, "تعذر تحميل تفاصيل الفاتورة");
}

export async function updateInvoiceManagementAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = change.safeParse(input);
    if (!parsed.success) throw new Error("راجع بيانات الفاتورة ومبلغ الأقساط وتاريخ البداية");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية تعديل بيانات الفاتورة");
    const { data, error } = await client.rpc("brand_finance_invoice_management", { p_cafe_id: cafe.id, p_input: parsed.data });
    if (error?.code === "22023" && error.message === "Invalid schedule for fully refunded invoice") throw new Error("الفاتورة مرتجعة بالكامل ولا تقبل إنشاء اتفاقية تقسيط أو تعديلها");
    if (error) throw new Error(["22023", "22007", "22008"].includes(error.code) ? "راجع مبلغ الأقساط وتاريخ البداية والعميل المرتبط بالفاتورة" : "تعذر حفظ التغيير أعد تحميل الفاتورة ثم حاول مجددًا");
    invalidateFinanceViews(slug);
    return data as { changed: number; skipped: number };
  }, "تعذر حفظ بيانات الفواتير");
}
