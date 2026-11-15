"use server";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import type { BranchMonitor, CashTrail, ItemTrace } from "@/lib/erp/tracking";

const riyadhDay = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(Date.now() + offset * 86400000));
function fail(error: { message?: string } | null, fallback: string) {
  if (!error) return;
  throw new Error(error.message && error.message.length < 300 && /[\u0600-\u06ff]/.test(error.message) ? error.message : fallback);
}

export async function getBranchMonitor(slug?: string) {
  return actionResult(async () => {
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_branch_monitor", { p_cafe: cafe.id });
    fail(error, "تعذر تحميل متابعة الفروع");
    return { ...data, slug: cafe.slug, brand: cafe.name } as BranchMonitor;
  }, "تعذر تحميل متابعة الفروع");
}

export async function traceItem(query: string, slug?: string) {
  return actionResult(async () => {
    const text = typeof query === "string" ? query.trim().slice(0, 100) : "";
    if (!text) throw new Error("اكتب اسم الصنف أو امسح الباركود");
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_trace_item", { p_cafe: cafe.id, p_query: text });
    fail(error, "تعذر تتبع الصنف");
    return data as ItemTrace;
  }, "تعذر تتبع الصنف");
}

export async function getCashTrail(filter?: { from?: string; to?: string; accountId?: string; branchId?: string }, slug?: string) {
  return actionResult(async () => {
    const parsed = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), accountId: z.union([z.uuid(), z.literal("")]).optional(), branchId: z.union([z.uuid(), z.literal("")]).optional() }).safeParse(filter ?? {});
    if (!parsed.success) throw new Error("راجع تواريخ ومرشحات تتبع النقد");
    const from = parsed.data.from ?? riyadhDay(-6), to = parsed.data.to ?? riyadhDay();
    if (to < from) throw new Error("تاريخ البداية يجب أن يسبق تاريخ النهاية");
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { data, error } = await client.rpc("erp_trace_cash", { p_cafe: cafe.id, p_from: from, p_to: to, p_account: parsed.data.accountId || null, p_branch: parsed.data.branchId || null });
    fail(error, "تعذر تحميل تتبع النقد");
    return { ...data, from, to, accountId: parsed.data.accountId ?? "", filterBranchId: parsed.data.branchId ?? "", slug: cafe.slug, brand: cafe.name } as CashTrail;
  }, "تعذر تحميل تتبع النقد");
}
