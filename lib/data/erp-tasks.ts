import "server-only";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { taskActionSchema, taskQuerySchema, type TaskSnapshot } from "@/lib/erp/tasks";
import {branchInput} from "@/lib/erp/branches";
import {branchRpc} from "@/lib/data/erp-branches";
import { z } from "zod";

function taskError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "42883") throw new Error("خدمة المهام تحتاج إلى تحديث قاعدة البيانات");
  if (error.code === "23503") throw new Error("السجل مرتبط بمهام أو مسارات أخرى ولا يمكن حذفه");
  if (error.code === "23505") throw new Error("الكود أو الاسم مستخدم بالفعل اختر قيمة أخرى");
  if (error.code === "40001") throw new Error("تغير السجل في جلسة أخرى أعد تحميله قبل الحفظ");
  if (error.message && error.message.length < 300 && /[\u0600-\u06ff]/u.test(error.message)) throw new Error(error.message);
  throw new Error("تعذر تأكيد العملية على المهام حاول مجددًا");
}

export async function readTasks(input: unknown = {}, slug?: string): Promise<TaskSnapshot> {
  const parsed = taskQuerySchema.safeParse(input);
  if (!parsed.success) throw new Error("راجع معايير البحث");
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("erp_tasks_read", { p_cafe_id: cafe.id, p_query: parsed.data });
  taskError(error);
  if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.types)) throw new Error("تعذر قراءة بيانات المهام");
  return data as TaskSnapshot;
}

export async function mutateTask(input: unknown, requestId: string, slug?: string) {
  const parsed = taskActionSchema.safeParse(branchInput(input));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "راجع بيانات المهمة");
  if (!z.uuid().safeParse(requestId).success) throw new Error("معرف العملية غير صالح أعد فتح النموذج");
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await branchRpc(client,cafe.id,"erp_tasks_execute", { p_cafe_id: cafe.id, p_action: parsed.data.action, p_data: parsed.data.data, p_request_id: requestId },input);
  taskError(error);
  return z.object({ id: z.uuid().nullable(), saved: z.literal(true), duplicate: z.boolean().optional() }).parse(data);
}

export async function readTaskTargets(kind: string, query: string, slug?: string) {
  if (query.length > 120) throw new Error("اختصر نص البحث");
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("erp_tasks_targets", { p_cafe_id: cafe.id, p_kind: kind, p_query: query });
  taskError(error);
  return z.array(z.object({ id: z.uuid(), label: z.string() })).parse(data);
}
