"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { getAdminCafeSubscriptionSummary } from "@/lib/data/admin";
import { actionResult } from "@/lib/platform/action-result";
import { parseSaudiDeadline } from "@/lib/platform/subscription-deadline";
import { subscriptionMutationError, subscriptionRevisionSchema, summaryFromSubscriptionState } from "@/lib/data/admin-brand-subscriptions";

const inputSchema = z.object({ cafeId: z.string().uuid(), expectedRevision: subscriptionRevisionSchema, localDeadline: z.string() }).strict();

export async function updateSubscriptionDeadlineAction(input: unknown) {
  return actionResult(async () => {
    await requirePlatformAdmin();
    const result = inputSchema.safeParse(input);
    if (!result.success) throw new Error("حدّث بيانات الاشتراك ثم حدد تاريخ ووقت الانتهاء");
    const values = result.data;
    const expiresAt = parseSaudiDeadline(values.localDeadline);
    const client = await createClient();
    const { data, error } = await client.rpc("admin_update_brand_subscription_deadline", {
      p_cafe_id: values.cafeId,
      p_expected_revision: values.expectedRevision, p_expires_at: expiresAt,
    });
    if (error) subscriptionMutationError(error.message);
    revalidatePath("/admin/cafes");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/c/[slug]", "layout");
    revalidatePath("/menu/[slug]", "page");
    revalidatePath("/loyalty/[slug]", "page");
    return summaryFromSubscriptionState(data);
  }, "تعذر حفظ موعد الانتهاء حدّث بيانات الاشتراك للتحقق ثم حاول مجددًا");
}

export async function refreshSubscriptionDeadlineAction(cafeId: string) {
  return actionResult(async () => {
    await requirePlatformAdmin();
    return getAdminCafeSubscriptionSummary(z.string().uuid().parse(cafeId));
  }, "تعذر تحديث بيانات الاشتراك حاول مجددًا");
}
