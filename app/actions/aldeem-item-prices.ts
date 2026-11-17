"use server";

import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";

const priceInput = z.object({
  itemId: z.uuid(), branchId: z.uuid(), price: z.number().finite().min(0).max(100000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001).nullable(),
  revision: z.number().int().min(0), unitName: z.string().trim().min(1).max(100), unitFactor: z.number().finite().positive().max(1000000),
}).strict();
export async function saveAldeemItemBranchPrice(input: unknown, requestId: string) {
  const parsed = priceInput.safeParse(input), request = z.uuid().safeParse(requestId);
  if (!parsed.success || !request.success) return { ok: false as const, uncertain: false, message: "راجع سعر الفرع ووحدة البيع" };
  let dispatched = false;
  try {
    const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
    if (cafe.slug !== "khayal-aldeem" || cafe.role !== "owner") return { ok: false as const, uncertain: false, message: "تعديل أسعار الفروع متاح لمالك الحساب" };
    const p = parsed.data;
    dispatched = true;
    const { data, error } = await client.rpc("aldeem_item_branch_price_save", {
      p_cafe: cafe.id, p_item: p.itemId, p_branch: p.branchId, p_price: p.price, p_revision: p.revision,
      p_unit_name: p.unitName, p_unit_factor: p.unitFactor, p_request: request.data,
    });
    if (error) {
      const rejected = /^(?:22|23|28|40|42|P0)[A-Z0-9]{3}$/.test(error.code ?? "");
      return { ok: false as const, uncertain: !rejected, message: rejected && /[؀-ۿ]/.test(error.message ?? "") && error.message.length < 300 ? error.message : rejected ? "تعذر حفظ السعر راجع الفرع والصنف ووحدة البيع" : "تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات" };
    }
    if (!data?.revision) return { ok: false as const, uncertain: true, message: "تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات" };
    return { ok: true as const, data: data as { itemId: string; branchId: string; price: number | null; revision: number; unitName: string; unitFactor: number } };
  } catch {
    return { ok: false as const, uncertain: dispatched, message: dispatched ? "تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات" : "تعذر التحقق من صلاحية الحساب أعد المحاولة" };
  }
}
