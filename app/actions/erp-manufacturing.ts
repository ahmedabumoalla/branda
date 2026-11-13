"use server";
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { manufacturingContext, manufacturingError, readManufacturing } from "@/lib/data/erp-manufacturing";
import { manufacturingActionSchema, manufacturingKinds, manufacturingPayloads, manufacturingSettingsSchema, type ManufacturingAction, type ManufacturingQuery } from "@/lib/erp/manufacturing";
import { actionResult } from "@/lib/platform/action-result";

export async function getManufacturing(query: ManufacturingQuery, slug?: string) {
  return actionResult(() => readManufacturing(query,slug), "تعذر تحميل التصنيع");
}
export async function saveManufacturing(input: { kind: string; id?: string; revision: number; draft: boolean; requestId: string; payload: unknown }, slug?: string) {
  return actionResult(async () => {
    const envelope = z.object({ kind: z.enum([...manufacturingKinds, "settings"]), id: z.uuid().optional(), revision: z.number().int().min(0), draft: z.boolean(), requestId: z.uuid() }).safeParse(branchInput(input));
    if (!envelope.success) throw new Error("راجع بيانات طلب الحفظ");
    const command = envelope.data;
    const schema = command.kind === "settings" ? manufacturingSettingsSchema : manufacturingPayloads[command.kind];
    const parsed = schema.safeParse(input.payload);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message && /[\u0600-\u06ff]/u.test(parsed.error.issues[0].message) ? parsed.error.issues[0].message : "راجع الحقول المطلوبة وكميات التصنيع");
    const { client, cafe } = await manufacturingContext(true, command.kind === "settings",slug);
    const { data, error } = await branchRpc(client,cafe.id,"erp_manufacturing_save",{ p_cafe_id: cafe.id, p_kind: command.kind, p_payload: parsed.data, p_id: command.id || null, p_revision: command.revision, p_draft: command.draft, p_request_id: command.requestId },input);
    manufacturingError(error);
    revalidatePath("/dashboard/system/manufacturing", "layout");
    return data as { id: string; revision: number; duplicate?: boolean };
  }, "تعذر حفظ بيانات التصنيع");
}
export async function actManufacturing(input: ManufacturingAction, slug?: string) {
  return actionResult(async () => {
    const parsed = manufacturingActionSchema.safeParse(branchInput(input));
    if (!parsed.success) throw new Error("راجع بيانات الإجراء والكميات");
    const { client, cafe } = await manufacturingContext(true,false,slug);
    const { data, error } = await branchRpc(client,cafe.id,"erp_manufacturing_act",{ p_cafe_id: cafe.id, p_command: parsed.data },input);
    manufacturingError(error);
    revalidatePath("/dashboard/system/manufacturing", "layout");
    return data as { id: string; deleted?: boolean; duplicate?: boolean };
  }, "تعذر تنفيذ إجراء التصنيع");
}
