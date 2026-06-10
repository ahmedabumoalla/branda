import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { adoptThemeAction, saveCustomIdentityAction } from "@/app/actions/theme";

export const BRANDA_THEME_UPDATED_EVENT = "branda:theme-updated";
export const BRANDA_CUSTOM_IDENTITY_UPDATED_EVENT = "branda:custom-identity-updated";
export const BRANDA_MENU_CATEGORIES_UPDATED_EVENT = "branda:menu-categories-updated";

export function readSavedCafeThemeIdFromStorage(): CafeThemeId {
  return "brand-identity-custom";
}

export async function adoptCafeTheme(_themeId: CafeThemeId) {
  await adoptThemeAction("brand-identity-custom");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BRANDA_THEME_UPDATED_EVENT));
  }
}

export async function persistCustomIdentityTheme(theme: CustomIdentityTheme) {
  await saveCustomIdentityAction(theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BRANDA_CUSTOM_IDENTITY_UPDATED_EVENT));
  }
}

export function notifyMenuCategoriesUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BRANDA_MENU_CATEGORIES_UPDATED_EVENT));
  }
}

export function subscribeBrandaStorageEvents(handlers: {
  onThemeUpdated?: () => void;
  onCustomIdentityUpdated?: () => void;
  onMenuCategoriesUpdated?: () => void;
}) {
  if (typeof window === "undefined") return () => {};

  if (handlers.onThemeUpdated) window.addEventListener(BRANDA_THEME_UPDATED_EVENT, handlers.onThemeUpdated);
  if (handlers.onCustomIdentityUpdated) window.addEventListener(BRANDA_CUSTOM_IDENTITY_UPDATED_EVENT, handlers.onCustomIdentityUpdated);
  if (handlers.onMenuCategoriesUpdated) window.addEventListener(BRANDA_MENU_CATEGORIES_UPDATED_EVENT, handlers.onMenuCategoriesUpdated);

  return () => {
    if (handlers.onThemeUpdated) window.removeEventListener(BRANDA_THEME_UPDATED_EVENT, handlers.onThemeUpdated);
    if (handlers.onCustomIdentityUpdated) window.removeEventListener(BRANDA_CUSTOM_IDENTITY_UPDATED_EVENT, handlers.onCustomIdentityUpdated);
    if (handlers.onMenuCategoriesUpdated) window.removeEventListener(BRANDA_MENU_CATEGORIES_UPDATED_EVENT, handlers.onMenuCategoriesUpdated);
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
