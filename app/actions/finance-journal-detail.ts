"use server";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import type { JournalDetail, JournalActivityFilters, JournalActivityPage } from "@/lib/finance/journal-detail";

const date = z.union([z.literal(""), z.iso.date()]);
const filtersSchema = z.object({ action: z.enum(["all", "created", "payment", "description"]), actorId: z.uuid().nullable(), from: date, to: date, sort: z.enum(["newest", "oldest"]), offset: z.number().int().min(0).max(10000000) }).strict().refine(value => !value.from || !value.to || value.from <= value.to);
const descriptionsSchema = z.object({ id: z.uuid(), revision: z.number().int().min(0), requestId: z.uuid(), note: z.string().max(1000), lineMemos: z.array(z.object({ id: z.uuid(), memo: z.string().max(300) }).strict()).max(2000) }).strict().refine(value => new Set(value.lineMemos.map(line => line.id)).size === value.lineMemos.length);

export async function fetchJournalDetailAction(id: string, slug: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success) throw new Error("القيد غير متاح");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "reports")) throw new Error("لا تملك صلاحية عرض القيد");
    const { data, error } = await client.rpc("brand_finance_journal_detail", { p_cafe_id: cafe.id, p_id: id });
    if (error || !data) throw new Error("تعذر تحميل تفاصيل القيد");
    return data as JournalDetail;
  }, "تعذر تحميل تفاصيل القيد");
}

export async function fetchJournalActivityAction(id: string, filters: JournalActivityFilters, slug: string) {
  return actionResult(async () => {
    const parsed = filtersSchema.safeParse(filters);
    if (!z.uuid().safeParse(id).success || !parsed.success) throw new Error("راجع مرشحات سجل النشاط");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "reports")) throw new Error("لا تملك صلاحية عرض سجل القيد");
    const { data, error } = await client.rpc("brand_finance_journal_activity", { p_cafe_id: cafe.id, p_id: id, p_filters: parsed.data });
    if (error || !data) throw new Error("تعذر تحميل سجل نشاط القيد");
    return data as JournalActivityPage;
  }, "تعذر تحميل سجل نشاط القيد");
}

export async function saveJournalDescriptionsAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = descriptionsSchema.safeParse(input);
    if (!parsed.success) throw new Error("راجع وصف القيد وأوصاف السطور وحدود النص");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية تعديل وصف القيد");
    const { data, error } = await client.rpc("brand_finance_save_journal_descriptions", { p_cafe_id: cafe.id, p_input: parsed.data });
    if (error?.code === "40001") throw new Error("تغير وصف القيد في جلسة أخرى أعد تحميله قبل الحفظ");
    if (error) throw new Error("تعذر تأكيد حفظ الأوصاف أعد المحاولة بنفس الطلب");
    invalidateFinanceViews(slug);
    return data as { id: string; revision: number; changed: number; duplicate: boolean };
  }, "تعذر حفظ أوصاف القيد");
}
