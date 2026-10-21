"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { getAdminCafeSubscriptionSummary } from "@/lib/data/admin";
import { actionResult } from "@/lib/platform/action-result";
import { parseSaudiDeadline } from "@/lib/platform/subscription-deadline";

const inputSchema = z.object({ cafeId: z.string().uuid(), subscriptionId: z.string().uuid(), expectedUpdatedAt: z.string().refine(value => Number.isFinite(Date.parse(value))), localDeadline: z.string() }).strict();

export async function updateSubscriptionDeadlineAction(input: unknown) {
  return actionResult(async () => {
    await requirePlatformAdmin();
    const result = inputSchema.safeParse(input);
    if (!result.success) throw new Error("حدّث بيانات الاشتراك ثم حدد تاريخ ووقت الانتهاء");
    const values = result.data;
    const expiresAt = parseSaudiDeadline(values.localDeadline);
    const client = await createClient();
    const { error } = await client.rpc("admin_update_subscription_deadline", {
      p_cafe_id: values.cafeId, p_subscription_id: values.subscriptionId,
      p_expected_updated_at: values.expectedUpdatedAt, p_expires_at: expiresAt,
    });
    if (error) {
      const messages: Record<string, string> = {
        expiry_conflict: "تغير الاشتراك أثناء التعديل حدّث بياناته ثم حاول مجددًا",
        expiry_invalid: "يجب أن يكون موعد الانتهاء بعد بداية الاشتراك",
        expiry_unavailable: "هذا الاشتراك غير متاح لتعديل موعد الانتهاء",
        expiry_forbidden: "تعديل موعد الانتهاء متاح لمدير المنصة فقط",
      };
      throw new Error(messages[error.message] || "تعذر حفظ موعد الانتهاء حدّث بيانات الاشتراك للتحقق ثم حاول مجددًا");
    }
    revalidatePath("/admin/cafes");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/menu/[slug]", "page");
    revalidatePath("/loyalty/[slug]", "page");
    return getAdminCafeSubscriptionSummary(values.cafeId);
  }, "تعذر حفظ موعد الانتهاء حدّث بيانات الاشتراك للتحقق ثم حاول مجددًا");
}

export async function refreshSubscriptionDeadlineAction(cafeId: string) {
  return actionResult(async () => {
    await requirePlatformAdmin();
    return getAdminCafeSubscriptionSummary(z.string().uuid().parse(cafeId));
  }, "تعذر تحديث بيانات الاشتراك حاول مجددًا");
}
