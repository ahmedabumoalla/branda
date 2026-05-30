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
  account: AccountLayout;
  auth: AuthLayout;
  collection: CollectionLayout;
  detail: DetailLayout;
  reserve: ReserveLayout;
  showMobileBottomNav: boolean;
  formInput: string;
  headingTracking: string;
};

const EXPERIENCE_MAP: Record<CafeThemeId, Omit<ThemeExperience, "themeId" | "theme">> = {
  "marketplace-amazon": {
    account: "practical-tabs",
    auth: "standard",
    collection: "sidebar-grid",
    detail: "split",
    reserve: "standard",
    showMobileBottomNav: false,
    formInput: "rounded-sm border border-[#888c8c] bg-white px-4 py-3 text-[#0f1111]",
    headingTracking: "tracking-normal",
  },
  "premium-apple": {
    account: "minimal",
    auth: "minimal",
    collection: "gallery",
    detail: "minimal",
    reserve: "minimal",
    showMobileBottomNav: false,
    formInput: "rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[#1d1d1f]",
    headingTracking: "tracking-tight",
  },
  "noon-commerce": {
    account: "deal-cards",
    auth: "standard",
    collection: "deal-strip",
    detail: "split",
    reserve: "standard",
    showMobileBottomNav: false,
    formInput: "rounded-lg border border-[#e7e8ef] bg-white px-4 py-3",
    headingTracking: "tracking-normal",
  },
  "luxury-boutique": {
    account: "boutique",
    auth: "boutique",
    collection: "editorial",
    detail: "boutique",
    reserve: "lounge",
    showMobileBottomNav: false,
    formInput: "rounded-none border border-[#c9a227]/30 bg-[#2a221c] px-4 py-3 text-[#f5efe6]",
    headingTracking: "tracking-wide",
  },
  "mobile-first-cafe": {
    account: "app-tabs",
    auth: "app",
    collection: "mobile-scroll",
    detail: "stack",
    reserve: "standard",
    showMobileBottomNav: true,
    formInput: "rounded-2xl border-0 bg-[#f1f5f9] px-4 py-3.5",
    headingTracking: "tracking-normal",
  },
  "cyber-eco-dark": {
    account: "glow-panels",
    auth: "neon",
    collection: "neon-grid",
    detail: "split",
    reserve: "neon",
    showMobileBottomNav: false,
    formInput: "rounded-lg border border-[#00e676]/30 bg-[#111916] px-4 py-3 text-[#e8f5e9]",
    headingTracking: "font-mono",
  },
  "soft-cream-3d": {
    account: "neumo",
    auth: "standard",
    collection: "neumo-grid",
    detail: "split",
    reserve: "standard",
    showMobileBottomNav: false,
    formInput:
      "rounded-2xl border-0 bg-[#e8e4df] px-4 py-3 shadow-[inset_4px_4px_8px_#c5c1bc,inset_-4px_-4px_8px_#ffffff]",
    headingTracking: "tracking-normal",
  },
  "magazine-editorial": {
    account: "editorial-timeline",
    auth: "minimal",
    collection: "editorial",
    detail: "boutique",
    reserve: "standard",
    showMobileBottomNav: false,
    formInput: "border-2 border-[#1a1a1a] bg-white px-4 py-3",
    headingTracking: "tracking-tight uppercase",
  },
  "fast-order-kiosk": {
    account: "kiosk-big",
    auth: "kiosk",
    collection: "kiosk-grid",
    detail: "kiosk",
    reserve: "kiosk",
    showMobileBottomNav: false,
    formInput: "rounded-lg border-2 border-[#bdbdbd] bg-white px-4 py-4 text-lg",
    headingTracking: "tracking-normal",
  },
  "reservation-lounge": {
    account: "lounge-reservations",
    auth: "boutique",
    collection: "lounge-grid",
    detail: "split",
    reserve: "lounge",
    showMobileBottomNav: false,
    formInput: "rounded-xl border border-[#e8e2db] bg-white px-4 py-3",
    headingTracking: "tracking-normal",
  },
  "brand-identity-custom": {
    account: "neumo",
    auth: "standard",
    collection: "neumo-grid",
    detail: "split",
    reserve: "standard",
    showMobileBottomNav: false,
    formInput:
      "rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-[var(--ci-input-bg,#FFFFFF)] px-4 py-3 text-[var(--ci-input-fg,#241610)] placeholder:text-[var(--ci-input-placeholder,#9B8173)] outline-none transition focus:border-[var(--ci-primary-bg,#6B3A25)] focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30",
    headingTracking: "tracking-normal",
  },
};

export function getThemeExperience(themeId: CafeThemeId): ThemeExperience {
  const base = EXPERIENCE_MAP[themeId] ?? EXPERIENCE_MAP["soft-cream-3d"];
  return {
    themeId,
    theme: getThemeClasses(themeId),
    ...base,
  };
}
