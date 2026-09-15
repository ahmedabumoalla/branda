import { CAFE_SETTINGS_KEY, type CafeSettings } from "@/lib/mock/cafe-settings";

import { sanitizeCafeSettingsRecord, assertNoBase64Images } from "@/lib/cafe/entity-storage-sanitize";

export function sanitizeCafeSettingsForStorage(settings: CafeSettings): CafeSettings {
  const payload = sanitizeCafeSettingsRecord(settings);
  assertNoBase64Images(JSON.stringify(payload), "Cafe settings");
  return payload;
}

export function saveCafeSettingsToStorage(_settings: CafeSettings) {
  throw new Error("Use Supabase — save via app/actions/settings");
}

export function loadCafeSettingsFromStorage(): CafeSettings | null {
  throw new Error("Use Supabase — fetch via app/actions/settings");
}
