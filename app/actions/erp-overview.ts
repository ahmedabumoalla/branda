"use server";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import type { OverviewSearchResult, OverviewSnapshot } from "@/lib/erp/overview";

const riyadhDay = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(Date.now() + offset * 86400000));
function fail(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return;
  throw new Error(error.message && error.message.length < 300 && /[\u0600-\u06ff]/.test(error.message) ? error.message : fallback);
}

export async function getOverview(range?: { from: string; to: string }, slug?: string) {
  return actionResult(async () => {
    const parsed = range ? z.object({ from: z.iso.date(), to: z.iso.date() }).safeParse(range) : null;
    if (parsed && !parsed.success) throw new Error("اختر تاريخ بداية ونهاية صحيحين");
    const period = parsed?.data ?? { from: riyadhDay(-29), to: riyadhDay() };
    if (period.to < period.from) throw new Error("تاريخ البداية يجب أن يسبق تاريخ النهاية");
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_overview_read", { p_cafe: cafe.id, p_from: period.from, p_to: period.to });
    fail(error, "تعذر تحميل النظرة العامة");
    return { ...data, ...period, slug: cafe.slug, brand: cafe.name } as OverviewSnapshot;
  }, "تعذر تحميل النظرة العامة");
}

export async function searchOverview(kind: "invoice" | "customer", query: string, slug?: string) {
  return actionResult(async () => {
    const checked = z.object({ kind: z.enum(["invoice", "customer"]), query: z.string().trim().min(1).max(80) }).safeParse({ kind, query });
    if (!checked.success) throw new Error("اكتب كلمة البحث");
    const input = checked.data;
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_overview_search", { p_cafe: cafe.id, p_kind: input.kind, p_query: input.query });
    fail(error, "تعذر تنفيذ البحث");
    return { kind: input.kind, rows: Array.isArray(data) ? data : [] } as OverviewSearchResult;
  }, "تعذر تنفيذ البحث");
}
