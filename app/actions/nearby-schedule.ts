"use server";

import { revalidatePath } from "next/cache";
import { saveOwnerNearbySchedule } from "@/lib/data/nearby-schedule";

export async function saveNearbyScheduleAction(input: unknown) {
  try {
    const result = await saveOwnerNearbySchedule(input);
    if (result.ok) revalidatePath("/dashboard/loyalty");
    return result;
  } catch {
    return { ok: false as const, message: "تعذر حفظ فترات رسائل القرب تحقق من صلاحية الحساب وحاول مرة أخرى" };
  }
}
