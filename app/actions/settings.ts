"use server";

import { getOwnerCafeSettings, updateCafeSettings } from "@/lib/data/settings";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";
import { revalidatePath } from "next/cache";

export async function fetchOwnerSettingsAction() {
  await assertOwnerServiceEnabled("settings");
  return getOwnerCafeSettings();
}

export async function saveSettingsAction(settings: CafeSettings, logoPalette?: { primary: string; secondary: string; text: string } | null) {
  await assertOwnerServiceEnabled("settings");
  const saved = await updateCafeSettings({
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
    logoPalette: logoPalette ?? undefined,
  });
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/menu/${saved.cafeSlug}`);
  revalidatePath(`/salon/${saved.cafeSlug}`);
  revalidatePath(`/loyalty/${saved.cafeSlug}`);
  revalidatePath("/");
  return saved;
}
