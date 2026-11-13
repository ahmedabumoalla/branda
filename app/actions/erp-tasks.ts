"use server";

import { actionResult } from "@/lib/platform/action-result";
import { mutateTask, readTasks, readTaskTargets } from "@/lib/data/erp-tasks";
import { revalidatePath } from "next/cache";

export async function readErpTasksAction(query: unknown, slug?: string) {
  return actionResult(() => readTasks(query, slug), "تعذر تحميل المهام");
}
export async function executeErpTaskAction(input: unknown, requestId: string, slug?: string) {
  return actionResult(async () => {
    const result = await mutateTask(input, requestId, slug);
    revalidatePath("/dashboard/system/tasks", "layout");
    return result;
  }, "تعذر حفظ المهمة");
}
export async function readErpTaskTargetsAction(kind: string, query: string, slug?: string) {
  return actionResult(() => readTaskTargets(kind, query, slug), "تعذر تحميل السجلات المرتبطة");
}
