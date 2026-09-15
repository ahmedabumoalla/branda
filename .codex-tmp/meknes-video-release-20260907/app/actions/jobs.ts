"use server";

import { revalidatePath } from "next/cache";
import { submitJobApplication, updateJobApplicationStatus } from "@/lib/data/jobs";

export async function submitJobApplicationAction(formData: FormData) {
  try {
    const cv = formData.get("cv");
    if (!(cv instanceof File) || cv.size === 0) {
      return { ok: false as const, message: "أرفق السيرة الذاتية بصيغة PDF" };
    }

    await submitJobApplication({
      fullName: String(formData.get("fullName") ?? ""),
      birthDate: String(formData.get("birthDate") ?? ""),
      gender: String(formData.get("gender") ?? ""),
      experience: String(formData.get("experience") ?? ""),
      languages: String(formData.get("languages") ?? ""),
      region: String(formData.get("region") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      cv,
    });

    return { ok: true as const, message: "تم استلام طلبك بنجاح" };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "تعذر إرسال الطلب",
    };
  }
}

export async function updateJobApplicationStatusAction(id: string, status: string) {
  await updateJobApplicationStatus(id, status);
  revalidatePath("/admin/jobs");
}
