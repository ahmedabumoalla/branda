import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { adoptThemeAction, saveCustomIdentityAction } from "@/app/actions/theme";

export const BARNDAKSA_THEME_UPDATED_EVENT = "barndaksa:theme-updated";
export const BARNDAKSA_CUSTOM_IDENTITY_UPDATED_EVENT = "barndaksa:custom-identity-updated";
export const BARNDAKSA_MENU_CATEGORIES_UPDATED_EVENT = "barndaksa:menu-categories-updated";

export function readSavedCafeThemeIdFromStorage(): CafeThemeId {
  return "brand-identity-custom";
}

export async function adoptCafeTheme(_themeId: CafeThemeId) {
  await adoptThemeAction("brand-identity-custom");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BARNDAKSA_THEME_UPDATED_EVENT));
  }
}

export async function persistCustomIdentityTheme(theme: CustomIdentityTheme) {
  await saveCustomIdentityAction(theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BARNDAKSA_CUSTOM_IDENTITY_UPDATED_EVENT));
  }
}

export function notifyMenuCategoriesUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BARNDAKSA_MENU_CATEGORIES_UPDATED_EVENT));
  }
}

export function subscribeBarndaksaStorageEvents(handlers: {
  onThemeUpdated?: () => void;
  onCustomIdentityUpdated?: () => void;
  onMenuCategoriesUpdated?: () => void;
}) {
  if (typeof window === "undefined") return () => {};

  if (handlers.onThemeUpdated) window.addEventListener(BARNDAKSA_THEME_UPDATED_EVENT, handlers.onThemeUpdated);
  if (handlers.onCustomIdentityUpdated) window.addEventListener(BARNDAKSA_CUSTOM_IDENTITY_UPDATED_EVENT, handlers.onCustomIdentityUpdated);
  if (handlers.onMenuCategoriesUpdated) window.addEventListener(BARNDAKSA_MENU_CATEGORIES_UPDATED_EVENT, handlers.onMenuCategoriesUpdated);

  return () => {
    if (handlers.onThemeUpdated) window.removeEventListener(BARNDAKSA_THEME_UPDATED_EVENT, handlers.onThemeUpdated);
    if (handlers.onCustomIdentityUpdated) window.removeEventListener(BARNDAKSA_CUSTOM_IDENTITY_UPDATED_EVENT, handlers.onCustomIdentityUpdated);
    if (handlers.onMenuCategoriesUpdated) window.removeEventListener(BARNDAKSA_MENU_CATEGORIES_UPDATED_EVENT, handlers.onMenuCategoriesUpdated);
  };
}

export async function runCustomIdentityMigrationOnce() {
  return { ok: true as const };
}

export async function migrateAllLegacyImageDataUrls() {
  return { ok: true as const };
}

export async function migrateLegacyCustomIdentityAssets() {
  return { ok: true as const };
}

export async function repairLocalImageStorage(_force?: boolean) {
  return { ok: true as const };
}

export function settingsContainsLegacyBase64() {
  return false;
}

export function anyLegacyBase64InProjectStorage() {
  return false;
}

export { containsLegacyBase64InStorage } from "@/lib/mock/custom-identity-theme";
