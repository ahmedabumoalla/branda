import { CAFE_SETTINGS_KEY, type CafeSettings } from "@/lib/mock/cafe-settings";

import { sanitizeCafeSettingsRecord, assertNoBase64Images } from "@/lib/cafe/entity-storage-sanitize";

export function sanitizeCafeSettingsForStorage(settings: CafeSettings): CafeSettings {
  const payload = sanitizeCafeSettingsRecord(settings);
  assertNoBase64Images(JSON.stringify(payload), "Cafe settings");
  return payload;
}

export function saveCafeSettingsToStorage(settings: CafeSettings) {
  const payload = sanitizeCafeSettingsForStorage(settings);
  localStorage.setItem(CAFE_SETTINGS_KEY, JSON.stringify(payload));
}

export function loadCafeSettingsFromStorage(): CafeSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as CafeSettings;
  } catch {
    return null;
  }
}
