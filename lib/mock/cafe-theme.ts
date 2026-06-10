export const CAFE_THEME_KEY = "branda_qatrah_theme";

export type CafeThemeId =
  | "marketplace-amazon"
  | "premium-apple"
  | "noon-commerce"
  | "luxury-boutique"
  | "mobile-first-cafe"
  | "cyber-eco-dark"
  | "soft-cream-3d"
  | "magazine-editorial"
  | "fast-order-kiosk"
  | "reservation-lounge"
  | "brand-identity-custom";

export type ThemeClasses = {
  page: string;
  header: string;
  card: string;
  cardHover: string;
  button: string;
  buttonOutline: string;
  accent: string;
  muted: string;
  input: string;
  nav: string;
  hero: string;
  footer: string;
  badge: string;
  link: string;
};

export type CafeThemeDefinition = {
  id: CafeThemeId;
  name: string;
  description: string;
  styleFamily: string;
  layoutType: string;
  previewGradient: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
  };
  typographyMood: string;
  productCardStyle: string;
  heroStyle: string;
  navigationStyle: string;
  bannerStyle: string;
  density: string;
  supportsDarkMode: boolean;
  recommendedFor: string;
};

export const DEFAULT_CAFE_THEME_ID: CafeThemeId = "brand-identity-custom";

const CUSTOM_THEME_CLASSES: ThemeClasses = {
  page: "bg-[var(--identity-background,#FCF8F3)] text-[var(--identity-text,#311912)]",
  header: "bg-white/90 backdrop-blur border-b border-[#E7D7C6] text-[#311912]",
  card: "bg-white rounded-[28px] border border-[#E7D7C6] shadow-[0_12px_35px_rgba(49,25,18,0.08)]",
  cardHover: "hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(49,25,18,0.12)]",
  button: "bg-[var(--identity-button,#6B3A25)] text-white hover:brightness-105",
  buttonOutline: "border border-[var(--identity-button,#6B3A25)] text-[var(--identity-button,#6B3A25)] hover:bg-[var(--identity-button,#6B3A25)] hover:text-white",
  accent: "text-[var(--identity-accent,#D9A33F)]",
  muted: "text-[#806A5E]",
  input: "bg-white border-[#E7D7C6] text-[#311912]",
  nav: "bg-white text-[#311912] border-b border-[#E7D7C6]",
  hero: "bg-white text-[#311912] border border-[#E7D7C6] shadow-sm",
  footer: "bg-white text-[#806A5E] border-t border-[#E7D7C6]",
  badge: "bg-[#FCF8F3] text-[#6B3A25] border border-[#E7D7C6]",
  link: "text-[var(--identity-button,#6B3A25)] hover:opacity-80",
};

const CUSTOM_THEME_DEFINITION: CafeThemeDefinition = {
  id: "brand-identity-custom",
  name: "ثيم هوية علامتك",
  description: "الثيم الوحيد المعتمد حاليًا ويُبنى من شعار وألوان وهوية العلامة التجارية",
  styleFamily: "custom-identity",
  layoutType: "browser-storefront",
  previewGradient: "from-[#6B3A25] via-[#D9A33F] to-[#FCF8F3]",
  colors: {
    primary: "#6B3A25",
    secondary: "#4A281D",
    accent: "#D9A33F",
    background: "#FCF8F3",
    surface: "#FFFFFF",
    text: "#311912",
    muted: "#806A5E",
  },
  typographyMood: "brand",
  productCardStyle: "browser-card",
  heroStyle: "identity-hero",
  navigationStyle: "browser-header",
  bannerStyle: "identity-banner",
  density: "balanced",
  supportsDarkMode: false,
  recommendedFor: "كل العلامات التجارية",
};

export const cafeThemes: CafeThemeDefinition[] = [CUSTOM_THEME_DEFINITION];

export function getThemeDefinition(_id?: string | null): CafeThemeDefinition {
  return CUSTOM_THEME_DEFINITION;
}

export function getThemeClasses(_id?: string | null): ThemeClasses {
  return CUSTOM_THEME_CLASSES;
}

export function isValidCafeThemeId(id: string): id is CafeThemeId {
  return id === "brand-identity-custom";
}

export function normalizeThemeId(_id: unknown): CafeThemeId {
  return DEFAULT_CAFE_THEME_ID;
}
