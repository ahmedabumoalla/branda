import type { CafeThemeId, ThemeClasses } from "@/lib/mock/cafe-theme";
import { getThemeClasses } from "@/lib/mock/cafe-theme";

export type CollectionLayout =
  | "sidebar-grid"
  | "gallery"
  | "deal-strip"
  | "editorial"
  | "mobile-scroll"
  | "neon-grid"
  | "neumo-grid"
  | "kiosk-grid"
  | "lounge-grid";

export type AccountLayout =
  | "practical-tabs"
  | "minimal"
  | "deal-cards"
  | "boutique"
  | "app-tabs"
  | "glow-panels"
  | "neumo"
  | "editorial-timeline"
  | "kiosk-big"
  | "lounge-reservations";

export type AuthLayout = "standard" | "minimal" | "app" | "kiosk" | "boutique" | "neon";
export type DetailLayout = "split" | "stack" | "kiosk" | "boutique" | "minimal";
export type ReserveLayout = "standard" | "lounge" | "kiosk" | "minimal" | "neon";

export type ThemeExperience = {
  themeId: CafeThemeId;
  theme: ThemeClasses;

  /**
   * Compatibility fields.
   * أبقيناها حتى لا تنكسر الصفحات القديمة بعد حذف الثيمات الجاهزة.
   * التنفيذ الفعلي الآن يستخدم brand-identity-custom فقط.
   */
  account: AccountLayout;
  auth: AuthLayout;
  collection: CollectionLayout;
  detail: DetailLayout;
  reserve: ReserveLayout;
  showMobileBottomNav: boolean;
  formInput: string;
  headingTracking: string;
};

const CUSTOM_IDENTITY_THEME_ID = "brand-identity-custom" as CafeThemeId;

const CUSTOM_IDENTITY_EXPERIENCE: Omit<ThemeExperience, "themeId" | "theme"> = {
  account: "practical-tabs",
  auth: "standard",
  collection: "sidebar-grid",
  detail: "split",
  reserve: "standard",
  showMobileBottomNav: false,
  formInput:
    "rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-[var(--ci-input-bg,#FFFFFF)] px-4 py-3 text-[var(--ci-input-fg,#241610)] placeholder:text-[var(--ci-input-placeholder,#9B8173)] outline-none transition focus:border-[var(--ci-primary-bg,#6B3A25)] focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30",
  headingTracking: "tracking-normal",
};

export function getThemeExperience(_themeId?: CafeThemeId | string | null): ThemeExperience {
  return {
    themeId: CUSTOM_IDENTITY_THEME_ID,
    theme: getThemeClasses(CUSTOM_IDENTITY_THEME_ID),
    ...CUSTOM_IDENTITY_EXPERIENCE,
  };
}

export function getDefaultThemeExperience(): ThemeExperience {
  return getThemeExperience(CUSTOM_IDENTITY_THEME_ID);
}
