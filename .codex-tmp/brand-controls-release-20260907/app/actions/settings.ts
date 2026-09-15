"use server";

import { getOwnerCafeSettings, updateCafeSettings } from "@/lib/data/settings";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

export async function fetchOwnerSettingsAction() {
  return getOwnerCafeSettings();
}

export async function saveSettingsAction(settings: CafeSettings) {
  await updateCafeSettings({
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
}
