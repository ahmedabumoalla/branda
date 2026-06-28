"use server";

import { revalidatePath } from "next/cache";
import { getOwnerCafeSettings, updateCafeSettings } from "@/lib/data/settings";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

export async function fetchOwnerSettingsAction() {
  return getOwnerCafeSettings();
}

function revalidateBrandSettingsSurfaces(slug?: string | null) {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");

  const normalizedSlug = slug?.trim().toLowerCase();
  if (!normalizedSlug) return;

  revalidatePath(`/c/${normalizedSlug}`);
}

export async function saveSettingsAction(settings: CafeSettings) {
  const updated = await updateCafeSettings({
    cafeName: settings.cafeName,
    ownerName: settings.ownerName,
    ownerEmail: settings.ownerEmail,
    ownerPhone: settings.ownerPhone,
    taxNumber: settings.taxNumber,
    commercialRegister: settings.commercialRegister,
    maroofCertificate: settings.maroofCertificate,
    instagram: settings.instagram,
    whatsapp: settings.whatsapp,
    description: settings.description,
    customDomain: settings.customDomain,
    domainStatus: settings.domainStatus,
    purchasedDomain: settings.purchasedDomain,
    purchasedDomainStatus: settings.purchasedDomainStatus,
    logoStoragePath: settings.logoAssetId ?? null,
  });

  revalidateBrandSettingsSurfaces(updated.cafeSlug);
  return updated;
}
