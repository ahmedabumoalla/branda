"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { approveSubscriptionRequest, getAdminSubscriptionRequestPage, rejectSubscriptionRequest } from "@/lib/data/admin";
import { actionResult } from "@/lib/platform/action-result";

export async function fetchSubscriptionRequestPageAction(input: unknown) {
  return actionResult(() => getAdminSubscriptionRequestPage(input), "تعذر تحميل الطلبات حاول مجددًا");
}

export async function reviewSubscriptionRequestAction(input: unknown) {
  return actionResult(async () => {
    const { requestId, decision, reason } = z.object({
      requestId: z.string().uuid(),
      decision: z.enum(["approve", "reject"]),
      reason: z.string().trim().max(1000).default(""),
    }).parse(input);
    if (decision === "approve") await approveSubscriptionRequest(requestId);
    else await rejectSubscriptionRequest(requestId, reason || "تم إلغاء الطلب بعد رفض تفعيل الباقة");
    revalidatePath("/admin/subscription-requests");
    revalidatePath("/admin/plans");
    revalidatePath("/admin/cafes");
    revalidatePath("/dashboard", "layout");
    return { requestId, status: decision === "approve" ? "approved" : "rejected" };
  }, "تعذر تحديث الطلب حدّث القائمة وتحقق من حالته ثم حاول مجددًا");
}
