"use server";

import { revalidatePath } from "next/cache";
import { addBrandEmployee, listBrandStaff, removeBrandEmployee, saveBrandStaffAccess } from "@/lib/staff/brand-staff-server";

type Access = { canLogin: boolean; menu: boolean; messages: boolean; rewards: boolean; password?: string };

function failure(error: unknown) {
  return { ok: false as const, message: error instanceof Error && error.message.startsWith("إدارة") ? error.message : "تعذر تنفيذ الطلب حاول مجددًا" };
}

export async function fetchBrandStaffAction() {
  try { return { ok: true as const, ...(await listBrandStaff()) }; } catch (error) { return failure(error); }
}

export async function addBrandEmployeeAction(input: { name: string; phone: string } & Access) {
  try {
    const result = await addBrandEmployee(input);
    if (result.ok) revalidatePath("/dashboard/staff-permissions");
    return result;
  } catch (error) { return failure(error); }
}

export async function saveBrandStaffAccessAction(input: { accountId: string | null; cashierId: string | null; phone?: string } & Access) {
  try {
    const result = await saveBrandStaffAccess(input);
    if (result.ok) revalidatePath("/dashboard/staff-permissions");
    return result;
  } catch (error) { return failure(error); }
}

export async function removeBrandEmployeeAction(accountId: string) {
  try {
    const result = await removeBrandEmployee(accountId);
    if (result.ok) revalidatePath("/dashboard/staff-permissions");
    return result;
  } catch (error) { return failure(error); }
}
