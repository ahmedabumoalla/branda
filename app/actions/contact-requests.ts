"use server";

import { revalidatePath } from "next/cache";
import { submitHomeContactRequest, updateContactRequestStatus } from "@/lib/data/contact-requests";
import type { ContactRequestInput } from "@/lib/platform/contact-requests";

export async function submitHomeContactAction(input: ContactRequestInput) {
  const result = await submitHomeContactRequest(input);
  if (result.ok) {
    revalidatePath("/admin/contact-requests");
    revalidatePath("/admin/content");
  }
  return result;
}

export async function updateContactStatusAction(id: string, status: string) {
  try { await updateContactRequestStatus(id, status); }
  catch { return { ok: false as const }; }
  revalidatePath("/admin/contact-requests");
  revalidatePath("/admin/content");
  return { ok: true as const };
}
