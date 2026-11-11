"use server";

import { revalidatePath } from "next/cache";
import { requireStorefrontEnabled } from "@/lib/platform/storefront-availability";

import { getOwnerBranches, softDeleteBranch, upsertBranch } from "@/lib/data/branches";
import type { CafeBranch } from "@/lib/mock/branches";

export async function fetchOwnerBranchesAction() {
  requireStorefrontEnabled();
  return getOwnerBranches();
}

export async function saveBranchAction(branch: CafeBranch) {
  requireStorefrontEnabled();
  const saved = await upsertBranch({
    id: /^[0-9a-f-]{36}$/i.test(branch.id) ? branch.id : undefined,
    name: branch.name,
    address: branch.address,
    city: branch.city,
    phone: branch.phone,
    workingHours: branch.workingHours,
    lat: branch.lat ?? null,
    lng: branch.lng ?? null,
    geofenceRadiusM: branch.geofenceRadiusM ?? 50,
    welcomeMessage: branch.welcomeMessage,
    active: branch.active,
  });
  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/menu");
  return saved;
}

export async function deleteBranchAction(branchId: string) {
  requireStorefrontEnabled();
  await softDeleteBranch(branchId);
  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/menu");
}
