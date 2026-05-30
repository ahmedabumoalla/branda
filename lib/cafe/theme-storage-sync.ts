import {

  CAFE_THEME_KEY,

  normalizeThemeId,

  type CafeThemeId,

} from "@/lib/mock/cafe-theme";

import {

  CUSTOM_IDENTITY_THEME_KEY,

  saveCustomIdentityTheme,

  type CustomIdentityTheme,

} from "@/lib/mock/custom-identity-theme";

import { MENU_CATEGORIES_KEY } from "@/lib/mock/menu-categories";



export const BRANDA_THEME_UPDATED_EVENT = "branda:theme-updated";

export const BRANDA_CUSTOM_IDENTITY_UPDATED_EVENT = "branda:custom-identity-updated";

export const BRANDA_MENU_CATEGORIES_UPDATED_EVENT = "branda:menu-categories-updated";



export function readSavedCafeThemeIdFromStorage(): CafeThemeId {

  if (typeof window === "undefined") {

    return normalizeThemeId(null);

  }

  return normalizeThemeId(localStorage.getItem(CAFE_THEME_KEY));

}



export function adoptCafeTheme(themeId: CafeThemeId) {

  localStorage.setItem(CAFE_THEME_KEY, themeId);

  if (typeof window !== "undefined") {

    window.dispatchEvent(new Event(BRANDA_THEME_UPDATED_EVENT));

  }

}



export function persistCustomIdentityTheme(theme: CustomIdentityTheme) {

  saveCustomIdentityTheme(theme);

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



  const onStorage = (event: StorageEvent) => {

    if (event.key === CAFE_THEME_KEY) handlers.onThemeUpdated?.();

    if (event.key === CUSTOM_IDENTITY_THEME_KEY) handlers.onCustomIdentityUpdated?.();

    if (event.key === MENU_CATEGORIES_KEY) handlers.onMenuCategoriesUpdated?.();

  };



  window.addEventListener("storage", onStorage);

  if (handlers.onThemeUpdated) {

    window.addEventListener(BRANDA_THEME_UPDATED_EVENT, handlers.onThemeUpdated);

  }

  if (handlers.onCustomIdentityUpdated) {

    window.addEventListener(

      BRANDA_CUSTOM_IDENTITY_UPDATED_EVENT,

      handlers.onCustomIdentityUpdated

    );

  }

  if (handlers.onMenuCategoriesUpdated) {

    window.addEventListener(

      BRANDA_MENU_CATEGORIES_UPDATED_EVENT,

      handlers.onMenuCategoriesUpdated

    );

  }



  return () => {

    window.removeEventListener("storage", onStorage);

    if (handlers.onThemeUpdated) {

      window.removeEventListener(BRANDA_THEME_UPDATED_EVENT, handlers.onThemeUpdated);

    }

    if (handlers.onCustomIdentityUpdated) {

      window.removeEventListener(

        BRANDA_CUSTOM_IDENTITY_UPDATED_EVENT,

        handlers.onCustomIdentityUpdated

      );

    }

    if (handlers.onMenuCategoriesUpdated) {

      window.removeEventListener(

        BRANDA_MENU_CATEGORIES_UPDATED_EVENT,

        handlers.onMenuCategoriesUpdated

      );

    }

  };

}



export {

  migrateAllLegacyImageDataUrls,

  migrateLegacyCustomIdentityAssets,

  repairLocalImageStorage,

  runCustomIdentityMigrationOnce,

  settingsContainsLegacyBase64,

  anyLegacyBase64InProjectStorage,

} from "@/lib/cafe/local-storage-repair";



export { containsLegacyBase64InStorage } from "@/lib/mock/custom-identity-theme";


