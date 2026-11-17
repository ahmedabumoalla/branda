"use server";
import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import type { AldeemItemCard } from "@/lib/aldeem/item-card";

const inputSchema = z.object({ itemId: z.uuid(), from: z.iso.date(), to: z.iso.date(), branchId: z.uuid().nullable(), offset: z.number().int().min(0).max(1000000) }).strict();
export async function readAldeemItemCard(input: unknown) {
  return actionResult(async () => {
    const p = inputSchema.parse(input);
    const days = (Date.parse(p.to) - Date.parse(p.from)) / 86400000;
    if (days < 0 || days > 365) throw new Error("اختر فترة صحيحة لا تتجاوز سنة");
    const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
    if (cafe.slug !== "khayal-aldeem" || cafe.role !== "owner") throw new Error("بطاقة الصنف متاحة لمالك حساب الديم");
    const result = await client.rpc("aldeem_item_card_read", { p_cafe: cafe.id, p_item: p.itemId, p_from: p.from, p_to: p.to, p_branch: p.branchId, p_offset: p.offset });
    if (result.error?.code === "22023") throw new Error(result.error.message);
    if (result.error || !result.data) throw new Error("تعذر قراءة سجل الصنف أعد المحاولة");
    return result.data as AldeemItemCard;
  }, "تعذر قراءة بطاقة الصنف أعد المحاولة");
}
