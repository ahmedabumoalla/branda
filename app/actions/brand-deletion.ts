"use server";

import { revalidatePath } from "next/cache";
import { finishBrandDeletion, permanentlyDeleteBrand } from "@/lib/data/brand-deletion";
import { actionResult } from "@/lib/platform/action-result";

function refreshDeletedBrand() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/menu/[slug]", "page");
  revalidatePath("/loyalty/[slug]", "page");
}

export async function deleteBrandPermanentlyAction(cafeId: string, confirmation: string) {
  return actionResult(async () => {
    const result = await permanentlyDeleteBrand({ cafeId, confirmation });
    refreshDeletedBrand();
    return result;
  }, "تعذر إكمال الطلب حدّث القائمة للتحقق من حالة العلامة ثم حاول مجددًا");
}

export async function retryBrandDeletionCleanupAction(cafeId: string) {
  return actionResult(async () => {
    const completed = await finishBrandDeletion(cafeId);
    revalidatePath("/admin/cafes");
    return completed;
  }, "تعذر تنظيف الملفات المتبقية حاول مجددًا");
}
