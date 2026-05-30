export type CustomIdentityPalette = {

  primary: string;

  secondary: string;

  button: string;

  background: string;

  text: string;

  accent: string;

};



export type BackgroundScope =

  | "home-only"

  | "all-customer-pages"

  | "hero-only"

  | "top-banner";



export type BackgroundFit = "cover" | "contain";

export type OverlayStrength = "light" | "medium" | "strong";



export type FeaturedSectionMode =

  | "new-products"

  | "offers"

  | "latest"

  | "popular"

  | "category";



/** Persisted in localStorage — references only, no image payloads. */

export type CustomIdentityTheme = {

  logoAssetId?: string;

  backgroundAssetId?: string;

  palette: CustomIdentityPalette;

  backgroundScope: BackgroundScope;

  backgroundFit: BackgroundFit;

  overlayStrength: OverlayStrength;

  featuredSectionMode: FeaturedSectionMode;

  featuredCategoryId?: string;

  createdAt: string;

  updatedAt: string;

  /** Read-only during migration; never written back to localStorage. */

  legacyLogoDataUrl?: string;

  legacyBackgroundImageDataUrl?: string;

};



export const CUSTOM_IDENTITY_THEME_KEY = "branda_qatrah_custom_identity_theme";



export const defaultCustomIdentityPalette: CustomIdentityPalette = {

  primary: "#6B3A25",

  secondary: "#4A281D",

  button: "#6B3A25",

  background: "#FCF8F3",

  text: "#311912",

  accent: "#D9A33F",

};



export function defaultCustomIdentityTheme(): CustomIdentityTheme {

  const now = new Date().toISOString();

  return {

    palette: defaultCustomIdentityPalette,

    backgroundScope: "home-only",

    backgroundFit: "cover",

    overlayStrength: "medium",

    featuredSectionMode: "latest",

    createdAt: now,

    updatedAt: now,

  };

}



type RawStoredTheme = CustomIdentityTheme & {

  logoDataUrl?: string;

  backgroundImageDataUrl?: string;

};



function normalizeLoadedTheme(raw: RawStoredTheme): CustomIdentityTheme {

  const base = defaultCustomIdentityTheme();

  const merged: CustomIdentityTheme = {

    ...base,

    ...raw,

    palette: { ...base.palette, ...raw.palette },

  };



  if (raw.logoDataUrl?.startsWith("data:image")) {

    merged.legacyLogoDataUrl = raw.logoDataUrl;

  }

  if (raw.backgroundImageDataUrl?.startsWith("data:image")) {

    merged.legacyBackgroundImageDataUrl = raw.backgroundImageDataUrl;

  }



  delete (merged as RawStoredTheme).logoDataUrl;

  delete (merged as RawStoredTheme).backgroundImageDataUrl;



  return merged;

}



export function loadCustomIdentityTheme(): CustomIdentityTheme {

  if (typeof window === "undefined") return defaultCustomIdentityTheme();

  try {

    const saved = localStorage.getItem(CUSTOM_IDENTITY_THEME_KEY);

    if (!saved) return defaultCustomIdentityTheme();

    return normalizeLoadedTheme(JSON.parse(saved) as RawStoredTheme);

  } catch (err) {

    console.error("[custom-identity-theme] load failed", err);

    return defaultCustomIdentityTheme();

  }

}



function stripForStorage(theme: CustomIdentityTheme): CustomIdentityTheme {

  const {

    legacyLogoDataUrl: _legacyLogo,

    legacyBackgroundImageDataUrl: _legacyBg,

    ...rest

  } = theme;



  const payload: CustomIdentityTheme = {

    ...rest,

    updatedAt: new Date().toISOString(),

  };



  const json = JSON.stringify(payload);

  if (json.includes("data:image")) {

    throw new Error("Image assets must be stored in IndexedDB, not localStorage.");

  }



  return payload;

}



export function saveCustomIdentityTheme(theme: CustomIdentityTheme) {

  if (typeof window === "undefined") return;

  const payload = stripForStorage(theme);

  localStorage.setItem(CUSTOM_IDENTITY_THEME_KEY, JSON.stringify(payload));

}



export function containsLegacyBase64InStorage(): boolean {

  if (typeof window === "undefined") return false;

  try {

    const saved = localStorage.getItem(CUSTOM_IDENTITY_THEME_KEY);

    return Boolean(saved && saved.includes("data:image"));

  } catch {

    return true;

  }

}



export function isValidHex(color: string) {

  return /^#([0-9A-Fa-f]{6})$/.test(color.trim());

}



export const OVERLAY_OPACITY: Record<OverlayStrength, number> = {

  light: 0.25,

  medium: 0.45,

  strong: 0.65,

};



export const FEATURED_SECTION_LABELS: Record<FeaturedSectionMode, string> = {

  "new-products": "منتجات جديدة",

  offers: "عروض مميزة",

  latest: "أحدث الإضافات",

  popular: "الأكثر طلبًا",

  category: "قسم محدد",

};



import {
  buildCustomIdentityCssVarsFromPalette,
  type CustomIdentityContrastTokens,
} from "@/lib/cafe/color-contrast";

export type { CustomIdentityContrastTokens };
export {
  buildCustomIdentityContrastTokens,
  paletteTextWasAutoCorrected,
} from "@/lib/cafe/color-contrast";

export function buildCustomIdentityCssVars(
  palette: CustomIdentityPalette
): Record<string, string> {
  return buildCustomIdentityCssVarsFromPalette(palette);
}
