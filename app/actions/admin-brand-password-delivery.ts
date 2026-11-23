"use server";

import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { getBrandPasswordDelivery, requestBrandPasswordDelivery } from "@/lib/data/brand-password-delivery";
import { actionResult } from "@/lib/platform/action-result";

const uuid = z.string().uuid();

export async function fetchAdminBrandPasswordDeliveryAction(cafeId: string) {
  return actionResult(async () => {
    const actor = await requirePlatformAdmin();
    if (!uuid.safeParse(cafeId).success) throw new Error("تعذر تحديد العلامة");
    return getBrandPasswordDelivery(cafeId, actor.id);
  }, "تعذر تحديث حالة إرسال كلمة المرور");
}

export async function requestAdminBrandPasswordDeliveryAction(cafeId: string, requestId: string) {
  return actionResult(async () => {
    const actor = await requirePlatformAdmin();
    if (!uuid.safeParse(cafeId).success || !uuid.safeParse(requestId).success) {
      throw new Error("تعذر تحديد طلب تغيير كلمة المرور");
    }
    return requestBrandPasswordDelivery(cafeId, requestId, actor.id);
  }, "تعذر تسجيل الطلب حدّث حالة الإرسال ثم حاول مجددًا");
}
