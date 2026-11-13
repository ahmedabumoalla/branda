import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import { getCurrentMaintenanceSession } from "@/lib/platform/maintenance";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FinanceShiftDetail } from "@/lib/finance/shift-operations";
import type { FinanceCommandResult } from "@/lib/finance/brand-finance";

export async function getFinanceMaintenanceActor(cafeId: string) {
  const session = await getCurrentMaintenanceSession();
  if (!session || session.cafeId !== cafeId) return null;
  const { data, error } = await createAdminClient().from("profiles").select("role,status").eq("id", session.adminUserId).maybeSingle();
  return !error && data?.role === "platform_admin" && data.status === "active" ? session.adminUserId : null;
}

export async function resetFinanceBalances(cafeId: string, payload: Record<string, unknown>, requestId: string): Promise<FinanceCommandResult> {
  const values = z.object({ note: z.string().trim().min(3).max(1000), confirmation: z.literal("RESET") }).parse(payload);
  const actor = await getFinanceMaintenanceActor(cafeId);
  if (!actor) throw new Error("تصفير الأرصدة متاح لأدمن برندة فقط من جلسة الدخول بالنيابة عن العلامة");
  const { data, error } = await createAdminClient().rpc("brand_finance_reset_liquid_balances", { p_cafe_id: cafeId, p_actor_id: actor, p_reason: values.note, p_request_id: z.uuid().parse(requestId) });
  if (error) throw new Error("تعذر تصفير الأرصدة تأكد من إقفال الورديات وتسوية الفروقات والمرتجعات المعلقة وفتح الفترة المحاسبية");
  return data as FinanceCommandResult;
}

export async function getFinanceShiftDetail(shiftId: string, slug?: string): Promise<FinanceShiftDetail> {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_shift_detail", { p_cafe_id: cafe.id, p_shift_id: z.uuid().parse(shiftId) });
  if (error) throw new Error("تعذر تحميل الوردية تحقق من صلاحيتك ثم أعد المحاولة");
  return data as FinanceShiftDetail;
}
