"use server";

import { getOwnerCafeSettings, updateCafeSettings } from "@/lib/data/settings";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";

export async function fetchOwnerSettingsAction() {
  await assertOwnerServiceEnabled("settings");
  return getOwnerCafeSettings();
}

export async function saveSettingsAction(settings: CafeSettings) {
  await assertOwnerServiceEnabled("settings");
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
