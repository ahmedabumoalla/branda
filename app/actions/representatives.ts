"use server";

import { revalidatePath } from "next/cache";
import { changeRepresentativePassword, createRepresentative } from "@/lib/data/representatives";

export async function createRepresentativeAction(formData: FormData) {
  const fileEntry = formData.get("bankDocument");
  const bankDocument =
    fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : undefined;

  const result = await createRepresentative({
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    email: String(formData.get("email") ?? ""),
    region: String(formData.get("region") ?? ""),
    nationality: String(formData.get("nationality") ?? ""),
    bankAccountNumber: String(formData.get("bankAccountNumber") ?? ""),
    iban: String(formData.get("iban") ?? ""),
    accountName: String(formData.get("accountName") ?? ""),
    swiftCode: String(formData.get("swiftCode") ?? ""),
    couponCode: String(formData.get("couponCode") ?? ""),
    discountPercent: Number(formData.get("discountPercent") ?? 0),
    freeTrialDays: Number(formData.get("freeTrialDays") ?? 0),
    eligiblePlanIds: formData
      .getAll("eligiblePlanIds")
      .map((item) => String(item).trim())
      .filter(Boolean),
    bankDocument,
  });

  revalidatePath("/admin/representatives");
  return result;
}

export async function changeRepresentativePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}) {
  try {
    if (input.newPassword !== input.newPasswordConfirmation) {
      return { ok: false as const, message: "تأكيد كلمة المرور غير مطابق" };
    }

    await changeRepresentativePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });

    return { ok: true as const, message: "تم تغيير كلمة المرور بنجاح" };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "تعذر تغيير كلمة المرور",
    };
  }
}
