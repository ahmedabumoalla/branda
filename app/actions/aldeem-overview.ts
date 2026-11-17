"use server";

import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import type { RealOverview } from "@/lib/aldeem/overview";

const filters = z.object({
  from: z.iso.date(), to: z.iso.date(), branch: z.uuid().nullable(),
  department: z.enum(["all", "sales", "lab", "manufacturing", "loyalty"]),
}).strict();

export async function readAldeemRealOverview(input: unknown) {
  return actionResult(async () => {
    const parsed = filters.safeParse(input);
    if (!parsed.success) throw new Error("راجع الفترة والفرع المطلوبين");
    const p = parsed.data;
    const days = (Date.parse(p.to) - Date.parse(p.from)) / 86400000;
    if (days < 0 || days > 365) throw new Error("اختر فترة صحيحة لا تتجاوز سنة");
    // The existing context validates the authenticated owner and signed maintenance
    // session. The RPC repeats authorization and applies the current branch scope.
    const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
    if (cafe.slug !== "khayal-aldeem" || cafe.role !== "owner") throw new Error("النظرة الشاملة متاحة لمالك حساب الديم");
    const { data, error } = await client.rpc("aldeem_overview_read", {
      p_cafe: cafe.id, p_from: p.from, p_to: p.to, p_branch: p.branch, p_department: p.department,
    });
    if (error || !data) throw new Error("تعذر قراءة النظرة العامة من سجلات الحساب أعد المحاولة");
    return data as RealOverview;
  }, "تعذر تحميل النظرة العامة أعد المحاولة");
}
