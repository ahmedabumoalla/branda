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
  | "reservation-lounge";

export type StyleFamily =
  | "marketplace"
  | "minimal-luxury"
  | "commerce-flash"
  | "boutique"
  | "mobile-app"
  | "cyber-dark"
  | "neumorphic"
  | "editorial"
  | "kiosk"
  | "lounge";

export type LayoutType =
  | "grid-dense"
  | "gallery-spacious"
  | "deal-strip"
  | "cinematic"
  | "app-shell"
  | "neon-panel"
  | "soft-3d"
  | "magazine-flow"
  | "kiosk-tiles"
  | "reservation-first";

export type TypographyMood =
  | "practical"
  | "refined"
  | "energetic"
  | "elegant"
  | "friendly"
  | "tech"
  | "cozy"
  | "editorial"
  | "bold"
  | "hospitality";

export type ProductCardStyle =
  | "compact-grid"
  | "large-showcase"
  | "deal-card"
  | "cinematic-tile"
  | "round-app"
  | "glass-tile"
  | "neumo-pill"
  | "story-card"
  | "kiosk-tile"
  | "lounge-card";

export type HeroStyle =
  | "search-hero"
  | "minimal-hero"
  | "promo-hero"
  | "story-hero"
  | "app-hero"
  | "glow-hero"
  | "soft-hero"
  | "editorial-hero"
  | "order-hero"
  | "booking-hero";

export type NavigationStyle =
  | "top-bar-search"
  | "minimal-top"
  | "sticky-deals"
  | "overlay-nav"
  | "bottom-tabs"
  | "glass-top"
  | "floating-pill"
  | "magazine-nav"
  | "kiosk-top"
  | "lounge-nav";

export type BannerStyle =
  | "carousel-wide"
  | "none-minimal"
  | "strip-flash"
  | "cinematic-slide"
  | "app-banner"
  | "neon-banner"
  | "soft-banner"
  | "editorial-feature"
  | "hidden"
  | "booking-banner";

export type Density = "compact" | "balanced" | "spacious";

export type CafeThemeDefinition = {
  id: CafeThemeId;
  name: string;
  description: string;
  styleFamily: StyleFamily;
  layoutType: LayoutType;
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
  typographyMood: TypographyMood;
  productCardStyle: ProductCardStyle;
  heroStyle: HeroStyle;
  navigationStyle: NavigationStyle;
  bannerStyle: BannerStyle;
  density: Density;
  supportsDarkMode: boolean;
  recommendedFor: string;
};

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

const THEME_CLASS_MAP: Record<CafeThemeId, ThemeClasses> = {
  "marketplace-amazon": {
    page: "bg-[#eaeded] text-[#0f1111]",
    header: "bg-[#131921] text-white border-b border-[#232f3e]",
    card: "bg-white border border-[#d5d9d9] rounded-sm shadow-sm",
    cardHover: "hover:shadow-md hover:border-[#c7511f]/40",
    button: "bg-[#ffd814] hover:bg-[#f7ca00] text-[#0f1111] font-semibold",
    buttonOutline: "border border-[#d5d9d9] bg-white text-[#0f1111] hover:bg-[#f7fafa]",
    accent: "text-[#c7511f]",
    muted: "text-[#565959]",
    input: "bg-white border-[#888c8c] text-[#0f1111] placeholder:text-[#565959]",
    nav: "bg-[#232f3e] text-white",
    hero: "bg-[#232f3e] text-white",
    footer: "bg-[#131921] text-[#ccc]",
    badge: "bg-[#cc0c39] text-white",
    link: "text-[#007185] hover:text-[#c7511f]",
  },
  "premium-apple": {
    page: "bg-white text-[#1d1d1f]",
    header: "bg-white/80 backdrop-blur-xl border-b border-black/5 text-[#1d1d1f]",
    card: "bg-[#f5f5f7] rounded-3xl border-0",
    cardHover: "hover:scale-[1.02] transition-transform duration-300",
    button: "bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full",
    buttonOutline: "border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-full",
    accent: "text-[#0071e3]",
    muted: "text-[#86868b]",
    input: "bg-[#f5f5f7] border-transparent text-[#1d1d1f]",
    nav: "bg-white/90 text-[#1d1d1f]",
    hero: "bg-[#fbfbfd] text-[#1d1d1f]",
    footer: "bg-[#f5f5f7] text-[#86868b]",
    badge: "bg-[#1d1d1f] text-white",
    link: "text-[#0071e3]",
  },
  "noon-commerce": {
    page: "bg-[#f7f7fa] text-[#404553]",
    header: "bg-[#feee00] text-[#404553] border-b border-[#f4d400]",
    card: "bg-white rounded-xl border border-[#e7e8ef] shadow-sm",
    cardHover: "hover:shadow-lg hover:border-[#3866df]/30",
    button: "bg-[#3866df] hover:bg-[#2d52b8] text-white rounded-lg",
    buttonOutline: "border border-[#3866df] text-[#3866df] hover:bg-[#3866df]/5 rounded-lg",
    accent: "text-[#3866df]",
    muted: "text-[#7e859b]",
    input: "bg-white border-[#e7e8ef] text-[#404553]",
    nav: "bg-white text-[#404553] border-t border-[#e7e8ef]",
    hero: "bg-gradient-to-l from-[#feee00] to-[#fff9b8] text-[#404553]",
    footer: "bg-[#404553] text-white",
    badge: "bg-[#e93a3a] text-white",
    link: "text-[#3866df]",
  },
  "luxury-boutique": {
    page: "bg-[#1a1410] text-[#f5efe6]",
    header: "bg-[#0d0a08]/95 backdrop-blur border-b border-[#c9a227]/20 text-[#f5efe6]",
    card: "bg-[#2a221c] border border-[#c9a227]/15 rounded-none",
    cardHover: "hover:border-[#c9a227]/50 transition-colors",
    button: "bg-gradient-to-r from-[#c9a227] to-[#e8d48b] text-[#1a1410] font-medium tracking-wide",
    buttonOutline: "border border-[#c9a227]/50 text-[#c9a227] hover:bg-[#c9a227]/10",
    accent: "text-[#c9a227]",
    muted: "text-[#a89888]",
    input: "bg-[#2a221c] border-[#c9a227]/30 text-[#f5efe6]",
    nav: "bg-[#0d0a08] text-[#f5efe6]",
    hero: "bg-gradient-to-b from-[#2a221c] to-[#1a1410]",
    footer: "bg-[#0d0a08] text-[#a89888]",
    badge: "bg-[#c9a227] text-[#1a1410]",
    link: "text-[#e8d48b] hover:text-[#c9a227]",
  },
  "mobile-first-cafe": {
    page: "bg-[#f0f4f8] text-[#1e293b]",
    header: "bg-white shadow-sm text-[#1e293b]",
    card: "bg-white rounded-2xl shadow-md",
    cardHover: "hover:shadow-xl active:scale-[0.98]",
    button: "bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-2xl",
    buttonOutline: "border-2 border-[#6366f1] text-[#6366f1] rounded-2xl",
    accent: "text-[#6366f1]",
    muted: "text-[#64748b]",
    input: "bg-[#f1f5f9] border-0 rounded-2xl text-[#1e293b]",
    nav: "bg-white border-t border-[#e2e8f0] fixed bottom-0",
    hero: "bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white rounded-b-3xl",
    footer: "bg-[#1e293b] text-[#94a3b8]",
    badge: "bg-[#f59e0b] text-white",
    link: "text-[#6366f1]",
  },
  "cyber-eco-dark": {
    page: "bg-[#0a0f0d] text-[#e8f5e9]",
    header: "bg-[#0d1512]/90 backdrop-blur border-b border-[#00e676]/20 text-[#e8f5e9]",
    card: "bg-[#111916]/80 border border-[#00e676]/15 rounded-lg backdrop-blur",
    cardHover: "hover:border-[#00e676]/40 hover:shadow-[0_0_20px_rgba(0,230,118,0.1)]",
    button: "bg-[#00e676] hover:bg-[#00c853] text-[#0a0f0d] font-semibold",
    buttonOutline: "border border-[#00e676]/50 text-[#00e676] hover:bg-[#00e676]/10",
    accent: "text-[#00e676]",
    muted: "text-[#81c784]",
    input: "bg-[#111916] border-[#00e676]/30 text-[#e8f5e9]",
    nav: "bg-[#0d1512] border-t border-[#00e676]/15",
    hero: "bg-gradient-to-br from-[#0d1512] to-[#0a0f0d] border border-[#00e676]/10",
    footer: "bg-[#0a0f0d] text-[#81c784]",
    badge: "bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/40",
    link: "text-[#00e676]",
  },
  "soft-cream-3d": {
    page: "bg-[#e8e4df] text-[#4a4540]",
    header: "bg-[#e8e4df] text-[#4a4540]",
    card: "bg-[#e8e4df] rounded-2xl shadow-[8px_8px_16px_#c5c1bc,-8px_-8px_16px_#ffffff]",
    cardHover: "hover:shadow-[4px_4px_8px_#c5c1bc,-4px_-4px_8px_#ffffff]",
    button:
      "bg-[#e8e4df] text-[#6b5d4f] shadow-[6px_6px_12px_#c5c1bc,-6px_-6px_12px_#ffffff] hover:shadow-[inset_4px_4px_8px_#c5c1bc,inset_-4px_-4px_8px_#ffffff]",
    buttonOutline:
      "bg-[#e8e4df] border-0 text-[#6b5d4f] shadow-[4px_4px_8px_#c5c1bc,-4px_-4px_8px_#ffffff]",
    accent: "text-[#8b7355]",
    muted: "text-[#8a8278]",
    input:
      "bg-[#e8e4df] border-0 shadow-[inset_4px_4px_8px_#c5c1bc,inset_-4px_-4px_8px_#ffffff] text-[#4a4540]",
    nav: "bg-[#e8e4df]",
    hero: "bg-[#e8e4df]",
    footer: "bg-[#ddd9d4] text-[#8a8278]",
    badge: "bg-[#d4c4b0] text-[#4a4540] shadow-[2px_2px_4px_#c5c1bc,-2px_-2px_4px_#ffffff]",
    link: "text-[#8b7355]",
  },
  "magazine-editorial": {
    page: "bg-[#faf9f7] text-[#1a1a1a]",
    header: "bg-[#faf9f7] border-b-2 border-[#1a1a1a] text-[#1a1a1a]",
    card: "bg-white border border-[#e5e5e5]",
    cardHover: "hover:border-[#1a1a1a]",
    button: "bg-[#1a1a1a] hover:bg-[#333] text-white",
    buttonOutline: "border-2 border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white",
    accent: "text-[#c41e3a]",
    muted: "text-[#666]",
    input: "bg-white border-[#1a1a1a] text-[#1a1a1a]",
    nav: "bg-[#faf9f7] border-b border-[#1a1a1a]",
    hero: "bg-[#1a1a1a] text-white",
    footer: "bg-[#1a1a1a] text-[#999]",
    badge: "bg-[#c41e3a] text-white",
    link: "text-[#c41e3a]",
  },
  "fast-order-kiosk": {
    page: "bg-[#f5f5f5] text-[#212121]",
    header: "bg-[#ff6f00] text-white",
    card: "bg-white border-2 border-[#e0e0e0] rounded-lg",
    cardHover: "hover:border-[#ff6f00]",
    button: "bg-[#ff6f00] hover:bg-[#e65100] text-white text-lg font-bold rounded-lg",
    buttonOutline: "border-2 border-[#ff6f00] text-[#ff6f00] rounded-lg font-bold",
    accent: "text-[#ff6f00]",
    muted: "text-[#757575]",
    input: "bg-white border-2 border-[#bdbdbd] text-[#212121] text-lg",
    nav: "bg-[#424242] text-white",
    hero: "bg-[#ff6f00] text-white",
    footer: "bg-[#424242] text-[#bdbdbd]",
    badge: "bg-[#e65100] text-white",
    link: "text-[#ff6f00]",
  },
  "reservation-lounge": {
    page: "bg-[#f8f6f3] text-[#3d3630]",
    header: "bg-[#5c4a3d] text-[#f8f6f3]",
    card: "bg-white rounded-2xl border border-[#e8e2db] shadow-sm",
    cardHover: "hover:shadow-md hover:border-[#5c4a3d]/30",
    button: "bg-[#5c4a3d] hover:bg-[#4a3b30] text-[#f8f6f3] rounded-xl",
    buttonOutline: "border border-[#5c4a3d] text-[#5c4a3d] hover:bg-[#5c4a3d]/5 rounded-xl",
    accent: "text-[#8b6914]",
    muted: "text-[#8a8278]",
    input: "bg-white border-[#e8e2db] text-[#3d3630]",
    nav: "bg-[#5c4a3d] text-[#f8f6f3]",
    hero: "bg-gradient-to-br from-[#5c4a3d] to-[#8b6914] text-[#f8f6f3]",
    footer: "bg-[#3d3630] text-[#c4b8a8]",
    badge: "bg-[#8b6914] text-white",
    link: "text-[#5c4a3d]",
  },
};

export const cafeThemes: CafeThemeDefinition[] = [
  {
    id: "marketplace-amazon",
    name: "ماركت بليس",
    description: "شبكة منتجات عملية، بحث واضح، فلاتر بارزة — مناسب للقوائم الكبيرة.",
    styleFamily: "marketplace",
    layoutType: "grid-dense",
    previewGradient: "from-[#131921] via-[#232f3e] to-[#ffd814]",
    colors: {
      primary: "#131921",
      secondary: "#232f3e",
      accent: "#c7511f",
      background: "#eaeded",
      surface: "#ffffff",
      text: "#0f1111",
      muted: "#565959",
    },
    typographyMood: "practical",
    productCardStyle: "compact-grid",
    heroStyle: "search-hero",
    navigationStyle: "top-bar-search",
    bannerStyle: "carousel-wide",
    density: "compact",
    supportsDarkMode: false,
    recommendedFor: "كوفيهات بمنتجات كثيرة",
  },
  {
    id: "premium-apple",
    name: "بريميوم",
    description: "مساحات بيضاء، معارض منتجات كبيرة، تجربة فاخرة وهادئة.",
    styleFamily: "minimal-luxury",
    layoutType: "gallery-spacious",
    previewGradient: "from-white via-[#f5f5f7] to-[#0071e3]",
    colors: {
      primary: "#1d1d1f",
      secondary: "#f5f5f7",
      accent: "#0071e3",
      background: "#ffffff",
      surface: "#f5f5f7",
      text: "#1d1d1f",
      muted: "#86868b",
    },
    typographyMood: "refined",
    productCardStyle: "large-showcase",
    heroStyle: "minimal-hero",
    navigationStyle: "minimal-top",
    bannerStyle: "none-minimal",
    density: "spacious",
    supportsDarkMode: false,
    recommendedFor: "كوفيهات مختصة وفاخرة",
  },
  {
    id: "noon-commerce",
    name: "تجارة سريعة",
    description: "عروض يومية، شريط خصومات، بطاقات عروض — تجربة تسوق سريعة.",
    styleFamily: "commerce-flash",
    layoutType: "deal-strip",
    previewGradient: "from-[#feee00] via-white to-[#3866df]",
    colors: {
      primary: "#feee00",
      secondary: "#3866df",
      accent: "#e93a3a",
      background: "#f7f7fa",
      surface: "#ffffff",
      text: "#404553",
      muted: "#7e859b",
    },
    typographyMood: "energetic",
    productCardStyle: "deal-card",
    heroStyle: "promo-hero",
    navigationStyle: "sticky-deals",
    bannerStyle: "strip-flash",
    density: "balanced",
    supportsDarkMode: false,
    recommendedFor: "عروض يومية وموسمية",
  },
  {
    id: "luxury-boutique",
    name: "بوتيك فاخر",
    description: "صور سينمائية، ألوان ذهبية/بنية، سرد قصصي للمنتجات.",
    styleFamily: "boutique",
    layoutType: "cinematic",
    previewGradient: "from-[#0d0a08] via-[#2a221c] to-[#c9a227]",
    colors: {
      primary: "#0d0a08",
      secondary: "#2a221c",
      accent: "#c9a227",
      background: "#1a1410",
      surface: "#2a221c",
      text: "#f5efe6",
      muted: "#a89888",
    },
    typographyMood: "elegant",
    productCardStyle: "cinematic-tile",
    heroStyle: "story-hero",
    navigationStyle: "overlay-nav",
    bannerStyle: "cinematic-slide",
    density: "spacious",
    supportsDarkMode: true,
    recommendedFor: "كوفيهات راقية",
  },
  {
    id: "mobile-first-cafe",
    name: "تطبيق جوال",
    description: "تنقل سفلي، كروت دائرية، CTA سريع — مثالي لزوار الجوال.",
    styleFamily: "mobile-app",
    layoutType: "app-shell",
    previewGradient: "from-[#6366f1] to-[#8b5cf6]",
    colors: {
      primary: "#6366f1",
      secondary: "#8b5cf6",
      accent: "#f59e0b",
      background: "#f0f4f8",
      surface: "#ffffff",
      text: "#1e293b",
      muted: "#64748b",
    },
    typographyMood: "friendly",
    productCardStyle: "round-app",
    heroStyle: "app-hero",
    navigationStyle: "bottom-tabs",
    bannerStyle: "app-banner",
    density: "balanced",
    supportsDarkMode: false,
    recommendedFor: "عملاء الجوال",
  },
  {
    id: "cyber-eco-dark",
    name: "سايبر إيكو",
    description: "داكن مع توهج أخضر، حدود شفافة — شبابي وتقني مع قراءة واضحة.",
    styleFamily: "cyber-dark",
    layoutType: "neon-panel",
    previewGradient: "from-[#0a0f0d] to-[#00e676]",
    colors: {
      primary: "#0a0f0d",
      secondary: "#111916",
      accent: "#00e676",
      background: "#0a0f0d",
      surface: "#111916",
      text: "#e8f5e9",
      muted: "#81c784",
    },
    typographyMood: "tech",
    productCardStyle: "glass-tile",
    heroStyle: "glow-hero",
    navigationStyle: "glass-top",
    bannerStyle: "neon-banner",
    density: "balanced",
    supportsDarkMode: true,
    recommendedFor: "كوفيهات شبابية",
  },
  {
    id: "soft-cream-3d",
    name: "كريمي 3D",
    description: "Neumorphism ناعم، أزرار بارزة، خلفية كريمية هادئة.",
    styleFamily: "neumorphic",
    layoutType: "soft-3d",
    previewGradient: "from-[#e8e4df] to-[#d4c4b0]",
    colors: {
      primary: "#e8e4df",
      secondary: "#d4c4b0",
      accent: "#8b7355",
      background: "#e8e4df",
      surface: "#e8e4df",
      text: "#4a4540",
      muted: "#8a8278",
    },
    typographyMood: "cozy",
    productCardStyle: "neumo-pill",
    heroStyle: "soft-hero",
    navigationStyle: "floating-pill",
    bannerStyle: "soft-banner",
    density: "balanced",
    supportsDarkMode: false,
    recommendedFor: "كوفيهات هادئة",
  },
  {
    id: "magazine-editorial",
    name: "مجلة",
    description: "منتجات كقصص، عناوين قوية، تخطيط تحريري — للمختصين.",
    styleFamily: "editorial",
    layoutType: "magazine-flow",
    previewGradient: "from-[#1a1a1a] via-[#faf9f7] to-[#c41e3a]",
    colors: {
      primary: "#1a1a1a",
      secondary: "#faf9f7",
      accent: "#c41e3a",
      background: "#faf9f7",
      surface: "#ffffff",
      text: "#1a1a1a",
      muted: "#666666",
    },
    typographyMood: "editorial",
    productCardStyle: "story-card",
    heroStyle: "editorial-hero",
    navigationStyle: "magazine-nav",
    bannerStyle: "editorial-feature",
    density: "spacious",
    supportsDarkMode: false,
    recommendedFor: "قصص المنتج والهوية",
  },
  {
    id: "fast-order-kiosk",
    name: "كشك سريع",
    description: "أسعار كبيرة، أزرار طلب واضحة — للطلب السريع داخل الكوفي.",
    styleFamily: "kiosk",
    layoutType: "kiosk-tiles",
    previewGradient: "from-[#ff6f00] to-[#424242]",
    colors: {
      primary: "#ff6f00",
      secondary: "#424242",
      accent: "#e65100",
      background: "#f5f5f5",
      surface: "#ffffff",
      text: "#212121",
      muted: "#757575",
    },
    typographyMood: "bold",
    productCardStyle: "kiosk-tile",
    heroStyle: "order-hero",
    navigationStyle: "kiosk-top",
    bannerStyle: "hidden",
    density: "compact",
    supportsDarkMode: false,
    recommendedFor: "طلب سريع داخل المحل",
  },
  {
    id: "reservation-lounge",
    name: "لاونج وحجز",
    description: "هيرو للحجز، فروع وجلسات — للكوفيهات المعتمدة على الحجوزات.",
    styleFamily: "lounge",
    layoutType: "reservation-first",
    previewGradient: "from-[#5c4a3d] to-[#8b6914]",
    colors: {
      primary: "#5c4a3d",
      secondary: "#8b6914",
      accent: "#8b6914",
      background: "#f8f6f3",
      surface: "#ffffff",
      text: "#3d3630",
      muted: "#8a8278",
    },
    typographyMood: "hospitality",
    productCardStyle: "lounge-card",
    heroStyle: "booking-hero",
    navigationStyle: "lounge-nav",
    bannerStyle: "booking-banner",
    density: "balanced",
    supportsDarkMode: false,
    recommendedFor: "حجوزات وطاولات",
  },
];

const LEGACY_THEME_MAP: Record<string, CafeThemeId> = {
  "classic-branda": "soft-cream-3d",
  "cyber-eco-dark": "cyber-eco-dark",
  "soft-cream-3d": "soft-cream-3d",
  "luxury-brown-gold": "luxury-boutique",
  minimal: "premium-apple",
  dark: "cyber-eco-dark",
};

export const DEFAULT_CAFE_THEME_ID: CafeThemeId = "soft-cream-3d";

export function isValidCafeThemeId(id: string): id is CafeThemeId {
  return cafeThemes.some((t) => t.id === id);
}

export function normalizeThemeId(saved: string | null): CafeThemeId {
  if (!saved) return DEFAULT_CAFE_THEME_ID;
  if (isValidCafeThemeId(saved)) return saved;
  return LEGACY_THEME_MAP[saved] ?? DEFAULT_CAFE_THEME_ID;
}

export function getThemeDefinition(id: CafeThemeId): CafeThemeDefinition {
  return cafeThemes.find((t) => t.id === id) ?? cafeThemes[6];
}

export function getThemeClasses(themeId: CafeThemeId): ThemeClasses {
  return THEME_CLASS_MAP[themeId] ?? THEME_CLASS_MAP[DEFAULT_CAFE_THEME_ID];
}
