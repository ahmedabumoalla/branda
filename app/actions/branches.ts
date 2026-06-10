"use server";

import { getOwnerBranches, softDeleteBranch, upsertBranch } from "@/lib/data/branches";
import type { CafeBranch } from "@/lib/mock/branches";

export async function fetchOwnerBranchesAction() {
  return getOwnerBranches();
}

export async function saveBranchAction(branch: CafeBranch) {
  return upsertBranch({
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
}

export async function deleteBranchAction(branchId: string) {
  await softDeleteBranch(branchId);
}
