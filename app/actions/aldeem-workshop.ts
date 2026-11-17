"use server";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { manufacturingError } from "@/lib/data/erp-manufacturing";
import { actionResult } from "@/lib/platform/action-result";
import { workshopReadSchema, workshopCommandSchema, type WorkshopSnapshot } from "@/lib/aldeem/workshop";
import { workshopMedia } from "@/lib/aldeem/workshop-media";

export async function getAldeemWorkshop(input: unknown = {}) {
  return actionResult(async () => {
    const p = workshopReadSchema.parse(input);
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    const { data, error } = await client.rpc("aldeem_workshop_read", { p_cafe: cafe.id, p_branch: p.branchId, p_status: p.status, p_query: p.query, p_field: p.searchField, p_offset: p.offset, p_legacy_offset: p.legacyOffset });
    manufacturingError(error);
    return workshopMedia(cafe.id, data as WorkshopSnapshot);
  }, "تعذر قراءة طلبات الفروع للمعمل");
}
export async function saveAldeemWorkshop(input: unknown) {
  const parsed = workshopCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, uncertain: false, message: "راجع الفرع والأصناف والكميات وموعد الطلب" };
  let dispatched = false;
  try {
    const p = parsed.data;
    const { client, cafe } = await getBrandFinanceContext("khayal-aldeem");
    dispatched = true;
    const { data, error } = await client.rpc("aldeem_workshop_execute", { p_cafe: cafe.id, p_payload: p });
    if (error) {
      const rejected = /^(?:22|23|28|40|42|P0)[A-Z0-9]{3}$/.test(error.code ?? "");
      return { ok: false as const, uncertain: !rejected, message: rejected && /[؀-ۿ]/.test(error.message ?? "") && error.message.length < 300 ? error.message : rejected ? "تعذر حفظ الطلب راجع الحالة والفرع والأصناف" : "تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات" };
    }
    if (!data?.revision) return { ok: false as const, uncertain: true, message: "تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات" };
    return { ok: true as const, data: data as { id: string; revision: number; status: WorkshopSnapshot["orders"][number]["status"] } };
  } catch {
    return { ok: false as const, uncertain: dispatched, message: dispatched ? "تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات" : "تعذر التحقق من صلاحية الحساب أعد المحاولة" };
  }
}
