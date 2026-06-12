# Lib Storage Cafe UI Source

# File: lib/cafe/cafe-settings-storage.ts

```typescript
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

```

# File: lib/cafe/cafe-theme-types.ts

```typescript
import type { BrandaCustomerSession } from "@/lib/customer/session";
import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { CafeThemeId, ThemeClasses } from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";

export type CafeThemePageProps = {
  slug: string;
  cafeSettings: CafeSettings;
  themeId: CafeThemeId;
  theme: ThemeClasses;
  customer: BrandaCustomerSession | null;
  products: MenuProduct[];
  offers: CafeOffer[];
  availableProducts: MenuProduct[];
  popularProducts: MenuProduct[];
  latestProducts: MenuProduct[];
  bannerOffers: CafeOffer[];
  activeRewards: LoyaltyReward[];
  loyaltySettings: LoyaltySettings;
  isPreview?: boolean;
  previewThemeId?: string | null;
  /** Dashboard builder passes unsaved draft for live preview */
  customIdentityOverride?: CustomIdentityTheme;
  /** Unsaved blob preview URLs for builder only */
  customIdentityPreviewUrls?: {
    logoUrl?: string;
    backgroundUrl?: string;
  };
  /** Resolved cafe logo from IndexedDB (not base64 in settings) */
  cafeLogoUrl?: string;
  menuCategories?: import("@/lib/mock/menu-categories").MenuCategoryRecord[];
};

```

# File: lib/cafe/color-contrast.ts

```typescript
export type ContrastPaletteInput = {
  primary: string;
  secondary: string;
  button: string;
  background: string;
  text: string;
  accent: string;
};

function isValidHex(color: string) {
  return /^#([0-9A-Fa-f]{6})$/.test(color.trim());
}

export type CustomIdentityContrastTokens = {
  pageBackground: string;
  pageForeground: string;

  surfaceBackground: string;
  surfaceForeground: string;

  elevatedSurfaceBackground: string;
  elevatedSurfaceForeground: string;

  primaryBackground: string;
  primaryForeground: string;

  secondaryBackground: string;
  secondaryForeground: string;

  buttonBackground: string;
  buttonForeground: string;

  accentBackground: string;
  accentForeground: string;

  inputBackground: string;
  inputForeground: string;
  inputPlaceholder: string;
  inputBorder: string;

  mutedForeground: string;
  borderColor: string;

  dropdownBackground: string;
  dropdownForeground: string;
  dropdownHoverBackground: string;
};

export const CONTRAST_LIGHT_TEXT = "#FFF8F1" as const;
export const CONTRAST_DARK_TEXT = "#241610" as const;

function normalizeHex(hex: string, fallback: string): string {
  const trimmed = hex.trim();
  return isValidHex(trimmed) ? trimmed : fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex, "");
  if (!normalized) return null;
  const value = normalized.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/** Relative luminance (WCAG) */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;

  const channels = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function getContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = getLuminance(fgHex);
  const l2 = getLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getContrastText(
  backgroundHex: string
): typeof CONTRAST_DARK_TEXT | typeof CONTRAST_LIGHT_TEXT {
  const bg = normalizeHex(backgroundHex, "#FCF8F3");
  const darkRatio = getContrastRatio(CONTRAST_DARK_TEXT, bg);
  const lightRatio = getContrastRatio(CONTRAST_LIGHT_TEXT, bg);
  return lightRatio > darkRatio ? CONTRAST_LIGHT_TEXT : CONTRAST_DARK_TEXT;
}

function mixHex(hex1: string, hex2: string, ratio: number): string {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return hex1;
  const t = Math.min(1, Math.max(0, ratio));
  const r = Math.round(a.r * (1 - t) + b.r * t);
  const g = Math.round(a.g * (1 - t) + b.g * t);
  const bl = Math.round(a.b * (1 - t) + b.b * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function getReadableMutedText(backgroundHex: string): string {
  const bg = normalizeHex(backgroundHex, "#FCF8F3");
  const base = getContrastText(bg);
  if (base === CONTRAST_LIGHT_TEXT) {
    return mixHex(bg, "#FFFFFF", 0.55);
  }
  return mixHex(bg, CONTRAST_DARK_TEXT, 0.45);
}

export function getBorderForSurface(backgroundHex: string): string {
  const bg = normalizeHex(backgroundHex, "#FCF8F3");
  const base = getContrastText(bg);
  if (base === CONTRAST_LIGHT_TEXT) {
    return mixHex(bg, "#FFFFFF", 0.22);
  }
  return mixHex(bg, CONTRAST_DARK_TEXT, 0.14);
}

function pickElevatedSurface(pageBg: string): string {
  return getLuminance(pageBg) > 0.55 ? "#FFFFFF" : mixHex(pageBg, "#FFFFFF", 0.14);
}

export function buildCustomIdentityContrastTokens(
  palette: ContrastPaletteInput
): CustomIdentityContrastTokens {
  const pageBackground = normalizeHex(palette.background, "#FCF8F3");
  const pageForeground = getContrastText(pageBackground);

  const elevatedSurfaceBackground = pickElevatedSurface(pageBackground);
  const elevatedSurfaceForeground = getContrastText(elevatedSurfaceBackground);

  const primaryBackground = normalizeHex(palette.primary, "#6B3A25");
  const primaryForeground = getContrastText(primaryBackground);

  const secondaryBackground = normalizeHex(palette.secondary, "#4A281D");
  const secondaryForeground = getContrastText(secondaryBackground);

  const buttonBackground = normalizeHex(palette.button, primaryBackground);
  const buttonForeground = getContrastText(buttonBackground);

  const accentBackground = normalizeHex(palette.accent, "#D9A33F");
  const accentForeground = getContrastText(accentBackground);

  const inputBackground = elevatedSurfaceBackground;
  const inputForeground = getContrastText(inputBackground);

  return {
    pageBackground,
    pageForeground,
    surfaceBackground: elevatedSurfaceBackground,
    surfaceForeground: elevatedSurfaceForeground,
    elevatedSurfaceBackground,
    elevatedSurfaceForeground,
    primaryBackground,
    primaryForeground,
    secondaryBackground,
    secondaryForeground,
    buttonBackground,
    buttonForeground,
    accentBackground,
    accentForeground,
    inputBackground,
    inputForeground,
    inputPlaceholder: getReadableMutedText(inputBackground),
    inputBorder: getBorderForSurface(inputBackground),
    mutedForeground: getReadableMutedText(pageBackground),
    borderColor: getBorderForSurface(pageBackground),
    dropdownBackground: inputBackground,
    dropdownForeground: inputForeground,
    dropdownHoverBackground: mixHex(inputBackground, primaryBackground, 0.1),
  };
}

export function paletteTextWasAutoCorrected(palette: ContrastPaletteInput): boolean {
  if (!isValidHex(palette.text)) return false;
  const tokens = buildCustomIdentityContrastTokens(palette);
  return palette.text.trim().toLowerCase() !== tokens.pageForeground.toLowerCase();
}

export function buildCustomIdentityCssVarsFromPalette(
  palette: ContrastPaletteInput
): Record<string, string> {
  const tokens = buildCustomIdentityContrastTokens(palette);

  return {
    "--ci-primary": palette.primary,
    "--ci-secondary": palette.secondary,
    "--ci-button": palette.button,
    "--ci-background": palette.background,
    "--ci-text": tokens.pageForeground,
    "--ci-accent": palette.accent,

    "--ci-page-bg": tokens.pageBackground,
    "--ci-page-fg": tokens.pageForeground,
    "--ci-surface-bg": tokens.surfaceBackground,
    "--ci-surface-fg": tokens.surfaceForeground,
    "--ci-elevated-bg": tokens.elevatedSurfaceBackground,
    "--ci-elevated-fg": tokens.elevatedSurfaceForeground,
    "--ci-primary-bg": tokens.primaryBackground,
    "--ci-primary-fg": tokens.primaryForeground,
    "--ci-secondary-bg": tokens.secondaryBackground,
    "--ci-secondary-fg": tokens.secondaryForeground,
    "--ci-button-bg": tokens.buttonBackground,
    "--ci-button-fg": tokens.buttonForeground,
    "--ci-accent-bg": tokens.accentBackground,
    "--ci-accent-fg": tokens.accentForeground,
    "--ci-input-bg": tokens.inputBackground,
    "--ci-input-fg": tokens.inputForeground,
    "--ci-input-placeholder": tokens.inputPlaceholder,
    "--ci-input-border": tokens.inputBorder,
    "--ci-muted-fg": tokens.mutedForeground,
    "--ci-border": tokens.borderColor,
    "--ci-dropdown-bg": tokens.dropdownBackground,
    "--ci-dropdown-fg": tokens.dropdownForeground,
    "--ci-dropdown-hover-bg": tokens.dropdownHoverBackground,
  };
}

/** Shared classes for dashboard theme builder — isolated from gold BentoCard text color */
export const THEME_BUILDER_FIELD_CLASS =
  "h-12 w-full rounded-2xl border border-[#E5D8CD] bg-white px-3 text-sm font-bold text-[#241610] outline-none transition focus:border-[#6B3A25] focus:ring-2 focus:ring-[#D9A33F]/35";

export const THEME_BUILDER_LABEL_CLASS = "mb-1 block text-xs font-black text-[#7A6255]";

export const CAFE_FORM_FIELD_CLASS =
  "rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-[var(--ci-input-bg,#FFFFFF)] px-4 py-3 text-sm font-bold text-[var(--ci-input-fg,#241610)] outline-none transition placeholder:text-[var(--ci-input-placeholder,#9B8173)] focus:border-[var(--ci-primary-bg,#6B3A25)] focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30";

```

# File: lib/cafe/color-extract.ts

```typescript
import type { CustomIdentityPalette } from "@/lib/mock/custom-identity-theme";

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(r: number, g: number, b: number) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Deterministic palette extraction from logo image (client-side mock, no external AI). */
export async function extractPaletteFromImage(src: string): Promise<CustomIdentityPalette> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 128) continue;
        const lum = luminance(r, g, b);
        if (lum > 0.92 || lum < 0.08) continue;
        const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
        const prev = buckets.get(key);
        if (prev) {
          prev.r += r;
          prev.g += g;
          prev.b += b;
          prev.count += 1;
        } else {
          buckets.set(key, { r, g, b, count: 1 });
        }
      }

      const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
      const primary = sorted[0]
        ? rgbToHex(
            Math.round(sorted[0].r / sorted[0].count),
            Math.round(sorted[0].g / sorted[0].count),
            Math.round(sorted[0].b / sorted[0].count)
          )
        : "#6B3A25";
      const secondary = sorted[1]
        ? rgbToHex(
            Math.round(sorted[1].r / sorted[1].count),
            Math.round(sorted[1].g / sorted[1].count),
            Math.round(sorted[1].b / sorted[1].count)
          )
        : "#4A281D";
      const accent = sorted[2]
        ? rgbToHex(
            Math.round(sorted[2].r / sorted[2].count),
            Math.round(sorted[2].g / sorted[2].count),
            Math.round(sorted[2].b / sorted[2].count)
          )
        : "#D9A33F";

      resolve({
        primary,
        secondary,
        button: primary,
        background: "#FCF8F3",
        text: luminance(
          parseInt(primary.slice(1, 3), 16),
          parseInt(primary.slice(3, 5), 16),
          parseInt(primary.slice(5, 7), 16)
        ) > 0.5
          ? "#311912"
          : "#FCF8F3",
        accent,
      });
    };
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}

```

# File: lib/cafe/custom-identity-featured.ts

```typescript
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { FEATURED_SECTION_LABELS } from "@/lib/mock/custom-identity-theme";
import { isPromoActive } from "@/lib/mock/menu";
import {
  getCategoryNameById,
  type MenuCategoryRecord,
} from "@/lib/mock/menu-categories";

export function resolveFeaturedProducts(
  props: Pick<
    CafeThemePageProps,
    "availableProducts" | "popularProducts" | "latestProducts"
  >,
  identity: CustomIdentityTheme,
  categories: MenuCategoryRecord[]
) {
  const { availableProducts, popularProducts, latestProducts } = props;

  switch (identity.featuredSectionMode) {
    case "popular":
      return popularProducts;
    case "latest":
      return latestProducts;
    case "new-products":
      return latestProducts;
    case "offers":
      return availableProducts
        .filter((p) => p.promo && isPromoActive(p.promo))
        .slice(0, 4);
    case "category": {
      const catName = getCategoryNameById(
        categories,
        identity.featuredCategoryId,
        ""
      );
      if (!catName) return popularProducts;
      return availableProducts
        .filter(
          (p) =>
            p.category === catName ||
            catName.includes(p.category) ||
            p.category.includes(catName.split(/\s+/)[0] ?? "")
        )
        .slice(0, 4);
    }
    default:
      return popularProducts;
  }
}

export function featuredSectionTitle(
  identity: CustomIdentityTheme,
  categories: MenuCategoryRecord[]
) {
  if (identity.featuredSectionMode === "category" && identity.featuredCategoryId) {
    return getCategoryNameById(categories, identity.featuredCategoryId, "مختارات");
  }
  return FEATURED_SECTION_LABELS[identity.featuredSectionMode];
}

```

# File: lib/cafe/entity-storage-sanitize.ts

```typescript
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { MarketingCampaign } from "@/lib/mock/marketing";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { BrandaCustomerSession } from "@/lib/customer/session";
import { isLegacyDataImageUrl } from "@/lib/cafe/image-asset-pipeline";

export function jsonContainsBase64Images(json: string): boolean {
  return json.includes("data:image");
}

export function assertNoBase64Images(json: string, context: string) {
  if (jsonContainsBase64Images(json)) {
    throw new Error(`${context}: image assets must use IndexedDB references, not base64.`);
  }
}

export function sanitizeMenuProduct(product: MenuProduct): MenuProduct {
  const next = { ...product };
  if (isLegacyDataImageUrl(next.imageDataUrl)) {
    delete next.imageDataUrl;
  }
  return next;
}

export function sanitizeMenuProducts(products: MenuProduct[]): MenuProduct[] {
  return products.map(sanitizeMenuProduct);
}

export function sanitizeMenuCategory(category: MenuCategoryRecord): MenuCategoryRecord {
  const next = { ...category };
  if (isLegacyDataImageUrl(next.imageDataUrl)) {
    delete next.imageDataUrl;
  }
  return next;
}

export function sanitizeMenuCategories(categories: MenuCategoryRecord[]): MenuCategoryRecord[] {
  return categories.map(sanitizeMenuCategory);
}

export function sanitizeCafeOffer(offer: CafeOffer): CafeOffer {
  const next = { ...offer };
  if (isLegacyDataImageUrl(next.bannerImageUrl)) {
    delete next.bannerImageUrl;
  }
  return next;
}

export function sanitizeCafeOffers(offers: CafeOffer[]): CafeOffer[] {
  return offers.map(sanitizeCafeOffer);
}

export function sanitizeMarketingCampaign(campaign: MarketingCampaign): MarketingCampaign {
  return { ...campaign };
}

export function sanitizeCustomerSession(session: BrandaCustomerSession): BrandaCustomerSession {
  const next = { ...session };
  if (isLegacyDataImageUrl(next.avatarUrl)) {
    delete next.avatarUrl;
  }
  return next;
}

export function sanitizeCafeSettingsRecord(settings: CafeSettings): CafeSettings {
  const next = { ...settings };
  if (isLegacyDataImageUrl(next.logoDataUrl)) {
    delete next.logoDataUrl;
  }
  return next;
}

```

# File: lib/cafe/image-asset-pipeline.ts

```typescript
export type ImageAssetPurpose =
  | "custom-theme-logo"
  | "custom-theme-background"
  | "cafe-logo"
  | "product-image"
  | "category-image"
  | "offer-banner"
  | "marketing-image"
  | "customer-avatar";

export type OptimizedImageResult = {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
  wasOptimized: boolean;
  fileName: string;
};

export class ImagePipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePipelineError";
  }
}

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

const ACCEPTED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

type PurposeConfig = {
  maxWidth: number;
  maxHeight: number;
  qualityStart: number;
  qualityMin: number;
  targetBytes: number;
};

const PURPOSE_CONFIG: Record<ImageAssetPurpose, PurposeConfig> = {
  "custom-theme-logo": {
    maxWidth: 1400,
    maxHeight: 1400,
    qualityStart: 0.92,
    qualityMin: 0.72,
    targetBytes: 500 * 1024,
  },
  "cafe-logo": {
    maxWidth: 1400,
    maxHeight: 1400,
    qualityStart: 0.92,
    qualityMin: 0.72,
    targetBytes: 500 * 1024,
  },
  "custom-theme-background": {
    maxWidth: 2560,
    maxHeight: 1600,
    qualityStart: 0.88,
    qualityMin: 0.62,
    targetBytes: 1.8 * 1024 * 1024,
  },
  "offer-banner": {
    maxWidth: 2560,
    maxHeight: 1600,
    qualityStart: 0.88,
    qualityMin: 0.62,
    targetBytes: 1.8 * 1024 * 1024,
  },
  "marketing-image": {
    maxWidth: 2560,
    maxHeight: 1600,
    qualityStart: 0.88,
    qualityMin: 0.62,
    targetBytes: 1.8 * 1024 * 1024,
  },
  "product-image": {
    maxWidth: 1600,
    maxHeight: 1600,
    qualityStart: 0.9,
    qualityMin: 0.68,
    targetBytes: 900 * 1024,
  },
  "category-image": {
    maxWidth: 1600,
    maxHeight: 1600,
    qualityStart: 0.9,
    qualityMin: 0.68,
    targetBytes: 900 * 1024,
  },
  "customer-avatar": {
    maxWidth: 800,
    maxHeight: 800,
    qualityStart: 0.88,
    qualityMin: 0.7,
    targetBytes: 350 * 1024,
  },
};

function normalizeMime(type: string) {
  return type.toLowerCase().split(";")[0].trim();
}

function scaleDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
) {
  const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight, 1);
  return {
    width: Math.max(1, Math.round(srcWidth * ratio)),
    height: Math.max(1, Math.round(srcHeight * ratio)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function loadImageSource(file: File): Promise<{
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => {
          ctx.drawImage(bitmap, 0, 0, w, h);
          bitmap.close();
        },
        cleanup: () => {
          try {
            bitmap.close();
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      /* fall through to HTMLImageElement */
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => {},
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new ImagePipelineError("تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP")
      );
    };
    img.src = objectUrl;
  });
}

async function encodeOptimized(
  file: File,
  config: PurposeConfig
): Promise<{ blob: Blob; mimeType: string; width: number; height: number }> {
  const source = await loadImageSource(file);
  const { width, height } = scaleDimensions(
    source.width,
    source.height,
    config.maxWidth,
    config.maxHeight
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    source.cleanup();
    throw new ImagePipelineError("تعذر معالجة الصورة في المتصفح");
  }

  ctx.drawImage = ctx.drawImage.bind(ctx);
  source.draw(ctx, width, height);
  source.cleanup();

  const mimeCandidates = ["image/webp", "image/jpeg"] as const;
  let bestBlob: Blob | null = null;
  let bestMime = "image/jpeg";

  for (const mime of mimeCandidates) {
    let quality = config.qualityStart;
    let candidate: Blob | null = null;

    while (quality >= config.qualityMin) {
      const blob = await canvasToBlob(canvas, mime, quality);
      if (!blob) break;
      candidate = blob;
      if (blob.size <= config.targetBytes) {
        bestBlob = blob;
        bestMime = mime;
        return { blob: bestBlob, mimeType: bestMime, width, height };
      }
      quality -= 0.06;
    }

    if (candidate && (!bestBlob || candidate.size < bestBlob.size)) {
      bestBlob = candidate;
      bestMime = mime;
    }
  }

  if (!bestBlob) {
    throw new ImagePipelineError("تعذر ضغط الصورة، جرّب ملفًا آخر");
  }

  return { blob: bestBlob, mimeType: bestMime, width, height };
}

export async function optimizeImageForStorage(
  file: File,
  purpose: ImageAssetPurpose
): Promise<OptimizedImageResult> {
  if (typeof window === "undefined") {
    throw new ImagePipelineError("Image optimization requires a browser environment");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImagePipelineError(
      "حجم الصورة كبير جدًا للمعالجة، اختر ملفًا أقل من 40MB"
    );
  }

  const mime = normalizeMime(file.type);
  if (mime === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    throw new ImagePipelineError("ارفع الشعار بصيغة PNG أو JPG أو WEBP");
  }

  if (!ACCEPTED_MIMES.has(mime)) {
    throw new ImagePipelineError("تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP");
  }

  const config = PURPOSE_CONFIG[purpose];
  const encoded = await encodeOptimized(file, config);
  const ext = encoded.mimeType === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || purpose;

  return {
    blob: encoded.blob,
    mimeType: encoded.mimeType,
    width: encoded.width,
    height: encoded.height,
    sizeBytes: encoded.blob.size,
    originalSizeBytes: file.size,
    wasOptimized: encoded.blob.size < file.size || encoded.width < config.maxWidth,
    fileName: `${baseName}.${ext}`,
  };
}

export async function optimizeDataUrlForStorage(
  dataUrl: string,
  purpose: ImageAssetPurpose,
  fileName = "legacy-image"
): Promise<OptimizedImageResult> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  return optimizeImageForStorage(file, purpose);
}

export function isHttpImageUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

export function isLegacyDataImageUrl(url?: string | null): boolean {
  return Boolean(url?.startsWith("data:image"));
}

```

# File: lib/cafe/local-asset-store.ts

```typescript
import {
  optimizeImageForStorage,
  type ImageAssetPurpose,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";

export type LocalAssetKind =
  | "custom-theme-logo"
  | "custom-theme-background"
  | "cafe-logo"
  | "product-image"
  | "category-image"
  | "offer-banner"
  | "marketing-image"
  | "customer-avatar";

export type StoredLocalAsset = {
  id: string;
  kind: LocalAssetKind;
  blob: Blob;
  mimeType: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = "branda-local-assets";
const DB_VERSION = 1;
const STORE_NAME = "assets";

/** Fixed IDs — replaced in place */
export const FIXED_ASSET_IDS: Partial<Record<LocalAssetKind, string>> = {
  "custom-theme-logo": "branda-qatrah-custom-theme-logo",
  "custom-theme-background": "branda-qatrah-custom-theme-background",
  "cafe-logo": "branda-qatrah-cafe-logo",
};

/** @deprecated use FIXED_ASSET_IDS */
export const LOCAL_ASSET_IDS = FIXED_ASSET_IDS as Record<
  "custom-theme-logo" | "custom-theme-background" | "cafe-logo",
  string
>;

const PURPOSE_BY_KIND: Record<LocalAssetKind, ImageAssetPurpose> = {
  "custom-theme-logo": "custom-theme-logo",
  "custom-theme-background": "custom-theme-background",
  "cafe-logo": "cafe-logo",
  "product-image": "product-image",
  "category-image": "category-image",
  "offer-banner": "offer-banner",
  "marketing-image": "marketing-image",
  "customer-avatar": "customer-avatar",
};

function isClient() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!isClient()) {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function buildAssetId(kind: LocalAssetKind, entityId?: string): string {
  const fixed = FIXED_ASSET_IDS[kind];
  if (fixed) return fixed;

  if (!entityId) {
    throw new Error(`Entity id required for asset kind "${kind}"`);
  }

  switch (kind) {
    case "product-image":
      return `branda-qatrah-product-${entityId}-image`;
    case "category-image":
      return `branda-qatrah-category-${entityId}-image`;
    case "offer-banner":
      return `branda-qatrah-offer-${entityId}-banner`;
    case "marketing-image":
      return `branda-qatrah-marketing-${entityId}-image`;
    case "customer-avatar":
      return `branda-customer-${entityId}-avatar`;
    default:
      throw new Error(`Unknown asset kind "${kind}"`);
  }
}

export function revokeObjectUrl(url?: string) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export async function getLocalAssetBlob(assetId: string): Promise<Blob | null> {
  if (!isClient()) return null;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const record = await new Promise<StoredLocalAsset | undefined>((resolve, reject) => {
      const req = store.get(assetId);
      req.onsuccess = () => resolve(req.result as StoredLocalAsset | undefined);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    db.close();
    return record?.blob ?? null;
  } catch (err) {
    console.error("[local-asset-store] getLocalAssetBlob failed", err);
    return null;
  }
}

export async function getLocalAssetObjectUrl(
  assetId?: string
): Promise<string | undefined> {
  if (!assetId || !isClient()) return undefined;
  const blob = await getLocalAssetBlob(assetId);
  if (!blob) return undefined;
  return URL.createObjectURL(blob);
}

export async function saveLocalAsset(
  kind: LocalAssetKind,
  fileOrBlob: File | Blob,
  fileName?: string,
  entityId?: string
): Promise<string> {
  if (!isClient()) {
    throw new Error("IndexedDB is only available in the browser");
  }

  const id = buildAssetId(kind, entityId);
  const now = new Date().toISOString();
  const blob = fileOrBlob instanceof File ? fileOrBlob : fileOrBlob;
  const mimeType =
    blob.type || (fileOrBlob instanceof File ? fileOrBlob.type : "application/octet-stream");
  const name =
    fileName ??
    (fileOrBlob instanceof File ? fileOrBlob.name : `${kind}.${mimeType.split("/")[1] || "bin"}`);

  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<StoredLocalAsset | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoredLocalAsset | undefined);
    req.onerror = () => reject(req.error);
  });

  const record: StoredLocalAsset = {
    id,
    kind,
    blob,
    mimeType,
    fileName: name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.put(record);
  await txDone(tx);
  db.close();
  return id;
}

export async function saveOptimizedImageAsset(
  kind: LocalAssetKind,
  optimized: OptimizedImageResult,
  entityId?: string
): Promise<string> {
  return saveLocalAsset(kind, optimized.blob, optimized.fileName, entityId);
}

export async function replaceOptimizedImageAsset(
  kind: LocalAssetKind,
  file: File,
  entityId?: string
): Promise<{ assetId: string; optimized: OptimizedImageResult }> {
  const purpose = PURPOSE_BY_KIND[kind];
  const optimized = await optimizeImageForStorage(file, purpose);
  const assetId = await saveOptimizedImageAsset(kind, optimized, entityId);
  return { assetId, optimized };
}

/** @deprecated use replaceOptimizedImageAsset */
export async function replaceLocalAsset(
  kind: "custom-theme-logo" | "custom-theme-background" | "cafe-logo",
  fileOrBlob: File | Blob,
  fileName?: string
): Promise<string> {
  if (fileOrBlob instanceof File) {
    const { assetId } = await replaceOptimizedImageAsset(kind, fileOrBlob);
    return assetId;
  }
  return saveLocalAsset(kind, fileOrBlob, fileName);
}

export async function deleteLocalAsset(assetId: string): Promise<void> {
  if (!isClient()) return;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(assetId);
    await txDone(tx);
    db.close();
  } catch (err) {
    console.error("[local-asset-store] deleteLocalAsset failed", err);
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

```

# File: lib/cafe/local-storage-repair.ts

```typescript
import { getCustomerKey, type BrandaCustomerSession } from "@/lib/customer/session";
import { sanitizeCafeSettingsForStorage } from "@/lib/cafe/cafe-settings-storage";
import {
  assertNoBase64Images,
  sanitizeCafeOffer,
  sanitizeCafeOffers,
  sanitizeMenuCategory,
  sanitizeMenuCategories,
  sanitizeMenuProduct,
  sanitizeMenuProducts,
  sanitizeCustomerSession,
} from "@/lib/cafe/entity-storage-sanitize";
import {
  optimizeDataUrlForStorage,
  type ImageAssetPurpose,
} from "@/lib/cafe/image-asset-pipeline";
import {
  buildAssetId,
  dataUrlToBlob,
  FIXED_ASSET_IDS,
  saveOptimizedImageAsset,
  type LocalAssetKind,
} from "@/lib/cafe/local-asset-store";
import { CAFE_SETTINGS_KEY, type CafeSettings } from "@/lib/mock/cafe-settings";
import {
  CUSTOM_IDENTITY_THEME_KEY,
  loadCustomIdentityTheme,
  saveCustomIdentityTheme,
  type CustomIdentityTheme,
} from "@/lib/mock/custom-identity-theme";
import { MARKETING_KEY, type MarketingCampaign } from "@/lib/mock/marketing";
import { MENU_CATEGORIES_KEY, type MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeOffer } from "@/lib/mock/offers";

export type MigrationReport = {
  migratedImages: number;
  repairedKeys: string[];
  failedImages: number;
  message?: string;
};

export type MigrationResult = MigrationReport & {
  migratedCustomTheme: boolean;
  migratedCafeLogo: boolean;
  repairedStorage: boolean;
};

const MENU_KEY = "branda_qatrah_menu";
const OFFERS_KEY = "branda_qatrah_offers";

let migrationPromise: Promise<MigrationResult> | null = null;

async function migrateDataUrlField(
  dataUrl: string,
  kind: LocalAssetKind,
  purpose: ImageAssetPurpose,
  entityId?: string
): Promise<string | null> {
  try {
    const optimized = await optimizeDataUrlForStorage(dataUrl, purpose, `${kind}-legacy`);
    return saveOptimizedImageAsset(kind, optimized, entityId);
  } catch {
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const optimized = {
        blob,
        mimeType: blob.type || "image/png",
        width: 0,
        height: 0,
        sizeBytes: blob.size,
        originalSizeBytes: blob.size,
        wasOptimized: false,
        fileName: `${kind}-legacy.bin`,
      };
      return saveOptimizedImageAsset(kind, optimized, entityId);
    } catch {
      return null;
    }
  }
}

export async function migrateAllLegacyImageDataUrls(): Promise<MigrationReport> {
  const report: MigrationReport = {
    migratedImages: 0,
    repairedKeys: [],
    failedImages: 0,
  };

  if (typeof window === "undefined") return report;

  // Custom identity theme
  try {
    const theme = loadCustomIdentityTheme();
    let changed = false;
    const next: CustomIdentityTheme = { ...theme };

    if (theme.legacyLogoDataUrl?.startsWith("data:image")) {
      const assetId = await migrateDataUrlField(
        theme.legacyLogoDataUrl,
        "custom-theme-logo",
        "custom-theme-logo"
      );
      if (assetId) {
        next.logoAssetId = assetId;
        report.migratedImages += 1;
      } else report.failedImages += 1;
      delete next.legacyLogoDataUrl;
      changed = true;
    }

    if (theme.legacyBackgroundImageDataUrl?.startsWith("data:image")) {
      const assetId = await migrateDataUrlField(
        theme.legacyBackgroundImageDataUrl,
        "custom-theme-background",
        "custom-theme-background"
      );
      if (assetId) {
        next.backgroundAssetId = assetId;
        report.migratedImages += 1;
      } else report.failedImages += 1;
      delete next.legacyBackgroundImageDataUrl;
      changed = true;
    }

    if (changed) {
      saveCustomIdentityTheme(next);
      report.repairedKeys.push(CUSTOM_IDENTITY_THEME_KEY);
    }
  } catch {
    await stripBase64FromKey(CUSTOM_IDENTITY_THEME_KEY, [
      "logoDataUrl",
      "backgroundImageDataUrl",
      "legacyLogoDataUrl",
      "legacyBackgroundImageDataUrl",
    ]);
    report.repairedKeys.push(CUSTOM_IDENTITY_THEME_KEY);
  }

  // Cafe settings logo
  try {
    const settingsRaw = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (settingsRaw?.includes("data:image")) {
      const settings = JSON.parse(settingsRaw) as CafeSettings & { logoDataUrl?: string };
      if (settings.logoDataUrl?.startsWith("data:image")) {
        const assetId = await migrateDataUrlField(
          settings.logoDataUrl,
          "cafe-logo",
          "cafe-logo"
        );
        if (assetId) {
          settings.logoAssetId = assetId;
          report.migratedImages += 1;
        } else report.failedImages += 1;
        delete settings.logoDataUrl;
      }
      sanitizeCafeSettingsForStorage(settings);
      report.repairedKeys.push(CAFE_SETTINGS_KEY);
    }
  } catch {
    await stripBase64FromKey(CAFE_SETTINGS_KEY, ["logoDataUrl"]);
    report.repairedKeys.push(CAFE_SETTINGS_KEY);
  }

  // Menu products
  try {
    const menuRaw = localStorage.getItem(MENU_KEY);
    if (menuRaw?.includes("data:image")) {
      const products = JSON.parse(menuRaw) as MenuProduct[];
      let changed = false;
      const next = await Promise.all(
        products.map(async (product) => {
          if (!product.imageDataUrl?.startsWith("data:image")) return product;
          const assetId = await migrateDataUrlField(
            product.imageDataUrl,
            "product-image",
            "product-image",
            product.id
          );
          changed = true;
          if (assetId) {
            report.migratedImages += 1;
            return sanitizeMenuProduct({ ...product, imageAssetId: assetId });
          }
          report.failedImages += 1;
          return sanitizeMenuProduct(product);
        })
      );
      if (changed) {
        localStorage.setItem(MENU_KEY, JSON.stringify(next));
        report.repairedKeys.push(MENU_KEY);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  // Menu categories
  try {
    const catRaw = localStorage.getItem(MENU_CATEGORIES_KEY);
    if (catRaw?.includes("data:image")) {
      const categories = JSON.parse(catRaw) as MenuCategoryRecord[];
      let changed = false;
      const next = await Promise.all(
        categories.map(async (category) => {
          if (!category.imageDataUrl?.startsWith("data:image")) return category;
          const assetId = await migrateDataUrlField(
            category.imageDataUrl,
            "category-image",
            "category-image",
            category.id
          );
          changed = true;
          if (assetId) {
            report.migratedImages += 1;
            return sanitizeMenuCategory({ ...category, imageAssetId: assetId });
          }
          report.failedImages += 1;
          return sanitizeMenuCategory(category);
        })
      );
      if (changed) {
        localStorage.setItem(MENU_CATEGORIES_KEY, JSON.stringify(next));
        report.repairedKeys.push(MENU_CATEGORIES_KEY);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  // Offers
  try {
    const offersRaw = localStorage.getItem(OFFERS_KEY);
    if (offersRaw?.includes("data:image")) {
      const offers = JSON.parse(offersRaw) as CafeOffer[];
      let changed = false;
      const next = await Promise.all(
        offers.map(async (offer) => {
          if (!offer.bannerImageUrl?.startsWith("data:image")) return offer;
          const assetId = await migrateDataUrlField(
            offer.bannerImageUrl,
            "offer-banner",
            "offer-banner",
            offer.id
          );
          changed = true;
          if (assetId) {
            report.migratedImages += 1;
            return sanitizeCafeOffer({ ...offer, bannerAssetId: assetId });
          }
          report.failedImages += 1;
          return sanitizeCafeOffer(offer);
        })
      );
      if (changed) {
        localStorage.setItem(OFFERS_KEY, JSON.stringify(next));
        report.repairedKeys.push(OFFERS_KEY);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  // Marketing (future image fields)
  try {
    const marketingRaw = localStorage.getItem(MARKETING_KEY);
    if (marketingRaw?.includes("data:image")) {
      const campaigns = JSON.parse(marketingRaw) as (MarketingCampaign & {
        imageDataUrl?: string;
        imageAssetId?: string;
      })[];
      let changed = false;
      const next = await Promise.all(
        campaigns.map(async (campaign) => {
          const dataUrl = (campaign as { imageDataUrl?: string }).imageDataUrl;
          if (!dataUrl?.startsWith("data:image")) return campaign;
          const assetId = await migrateDataUrlField(
            dataUrl,
            "marketing-image",
            "marketing-image",
            campaign.id
          );
          changed = true;
          const copy = { ...campaign } as MarketingCampaign & {
            imageDataUrl?: string;
            imageAssetId?: string;
          };
          delete copy.imageDataUrl;
          if (assetId) {
            copy.imageAssetId = assetId;
            report.migratedImages += 1;
          } else report.failedImages += 1;
          return copy;
        })
      );
      if (changed) {
        localStorage.setItem(MARKETING_KEY, JSON.stringify(next));
        report.repairedKeys.push(MARKETING_KEY);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  // Customer sessions (qatrah mock + any slug key pattern)
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("branda_customer_session_")) continue;
      const raw = localStorage.getItem(key);
      if (!raw?.includes("data:image")) continue;

      const session = JSON.parse(raw) as BrandaCustomerSession & { avatarAssetId?: string };
      if (session.avatarUrl?.startsWith("data:image")) {
        const assetId = await migrateDataUrlField(
          session.avatarUrl,
          "customer-avatar",
          "customer-avatar",
          session.id
        );
        if (assetId) {
          session.avatarAssetId = assetId;
          report.migratedImages += 1;
        } else report.failedImages += 1;
        delete session.avatarUrl;
        localStorage.setItem(key, JSON.stringify(sanitizeCustomerSession(session)));
        report.repairedKeys.push(key);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  if (report.migratedImages > 0 || report.repairedKeys.length > 0) {
    report.message =
      report.failedImages > 0
        ? `تم نقل ${report.migratedImages} صورة. بعض الصور التالفة قد تحتاج إعادة رفع.`
        : `تم نقل ${report.migratedImages} صورة وتحسين التخزين المحلي.`;
  }

  return report;
}

async function stripBase64FromKey(key: string, fields: string[]) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved?.includes("data:image")) return;
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    for (const field of fields) delete parsed[field];
    localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export async function migrateLegacyCustomIdentityAssets(): Promise<MigrationResult> {
  const report = await migrateAllLegacyImageDataUrls();
  return {
    ...report,
    migratedCustomTheme: report.repairedKeys.includes(CUSTOM_IDENTITY_THEME_KEY),
    migratedCafeLogo: report.repairedKeys.includes(CAFE_SETTINGS_KEY),
    repairedStorage: report.repairedKeys.length > 0,
  };
}

export async function runCustomIdentityMigrationOnce(): Promise<MigrationResult> {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyCustomIdentityAssets();
  }
  return migrationPromise;
}

export async function repairLocalImageStorage(
  confirmStripLegacy = true
): Promise<MigrationResult> {
  migrationPromise = null;
  const report = await migrateAllLegacyImageDataUrls();

  if (confirmStripLegacy) {
    await stripBase64FromKey(CUSTOM_IDENTITY_THEME_KEY, [
      "logoDataUrl",
      "backgroundImageDataUrl",
      "legacyLogoDataUrl",
      "legacyBackgroundImageDataUrl",
    ]);
    await stripBase64FromKey(CAFE_SETTINGS_KEY, ["logoDataUrl"]);
  }

  return {
    ...report,
    migratedCustomTheme: report.repairedKeys.includes(CUSTOM_IDENTITY_THEME_KEY),
    migratedCafeLogo: report.repairedKeys.includes(CAFE_SETTINGS_KEY),
    repairedStorage: true,
    message:
      report.message ??
      "تم إصلاح التخزين. أعد رفع الشعار أو الخلفية ثم احفظ الثيم إن لزم.",
  };
}

export function settingsContainsLegacyBase64(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const keys = [CAFE_SETTINGS_KEY, MENU_KEY, OFFERS_KEY, MENU_CATEGORIES_KEY, MARKETING_KEY];
    return keys.some((key) => {
      const saved = localStorage.getItem(key);
      return Boolean(saved && saved.includes("data:image"));
    });
  } catch {
    return true;
  }
}

export function anyLegacyBase64InProjectStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("branda_")) continue;
      const value = localStorage.getItem(key);
      if (value?.includes("data:image")) return true;
    }
    return false;
  } catch {
    return true;
  }
}

// re-export fixed ids for migration callers
export { FIXED_ASSET_IDS as LOCAL_ASSET_IDS };

```

# File: lib/cafe/menu-category-utils.ts

```typescript
import type { MenuProduct } from "@/lib/mock/menu";
import {
  defaultMenuCategories,
  getCategoryNameById,
  loadMenuCategories,
  type MenuCategoryRecord,
} from "@/lib/mock/menu-categories";

export const UNCATEGORIZED_LABEL = "غير مصنف";

/** Resolve category id from categoryId or legacy category name. */
export function resolveProductCategoryId(
  product: MenuProduct,
  categories: MenuCategoryRecord[]
): string | null {
  if (product.categoryId) {
    const byId = categories.find((c) => c.id === product.categoryId);
    if (byId) return byId.id;
  }

  const legacyName = product.category?.trim();
  if (legacyName) {
    const byName = categories.find(
      (c) => c.name === legacyName || c.name.includes(legacyName) || legacyName.includes(c.name)
    );
    if (byName) return byName.id;
  }

  return null;
}

export function resolveProductCategoryLabel(
  product: MenuProduct,
  categories?: MenuCategoryRecord[]
): string {
  const list =
    categories ??
    (typeof window !== "undefined" ? defaultMenuCategories : defaultMenuCategories);

  const categoryId = resolveProductCategoryId(product, list);
  if (categoryId) {
    return getCategoryNameById(list, categoryId, product.category);
  }

  return product.category?.trim() || UNCATEGORIZED_LABEL;
}

/** All visible categories for customer strips — sorted by sortOrder. */
export function getVisibleCategoryNames(categories: MenuCategoryRecord[]): string[] {
  return [...categories]
    .filter((c) => c.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.name);
}

/** Filter dropdown options: all visible categories + uncategorized if needed. */
export function getCustomerCategoryFilterOptions(
  products: MenuProduct[],
  categories: MenuCategoryRecord[]
): string[] {
  const visible = getVisibleCategoryNames(categories);
  const available = products.filter((p) => p.available);
  const hasUncategorized = available.some(
    (p) => resolveProductCategoryId(p, categories) === null
  );

  const options = ["الكل", ...visible];
  if (hasUncategorized && !visible.includes(UNCATEGORIZED_LABEL)) {
    options.push(UNCATEGORIZED_LABEL);
  }
  return options;
}

export function productMatchesCategory(
  product: MenuProduct,
  categoryFilter: string,
  categories: MenuCategoryRecord[]
): boolean {
  if (categoryFilter === "الكل") return true;

  if (categoryFilter === UNCATEGORIZED_LABEL) {
    return resolveProductCategoryId(product, categories) === null;
  }

  const record = categories.find((c) => c.name === categoryFilter);
  if (!record) {
    return product.category === categoryFilter;
  }

  const productCategoryId = resolveProductCategoryId(product, categories);
  if (productCategoryId) return productCategoryId === record.id;

  return product.category === record.name;
}

/** @deprecated use getCustomerCategoryFilterOptions */
export function getFilterableCategoryNames(
  products: MenuProduct[],
  categories: MenuCategoryRecord[]
): string[] {
  return getCustomerCategoryFilterOptions(products, categories);
}

export type PriceRangeFilter = "all" | "under-20" | "20-40" | "over-40";

export function productMatchesPriceRange(
  product: MenuProduct,
  priceRange: PriceRangeFilter
): boolean {
  if (priceRange === "all") return true;
  if (priceRange === "under-20") return product.price < 20;
  if (priceRange === "20-40") return product.price >= 20 && product.price <= 40;
  if (priceRange === "over-40") return product.price > 40;
  return true;
}

export function isFilterActive(state: {
  query: string;
  category: string;
  priceRange: PriceRangeFilter;
  onlyOffers: boolean;
  sort: string;
}): boolean {
  return (
    Boolean(state.query.trim()) ||
    state.category !== "الكل" ||
    state.priceRange !== "all" ||
    state.onlyOffers ||
    state.sort !== "popular"
  );
}

export const DEFAULT_FILTER_STATE = {
  query: "",
  category: "الكل",
  priceRange: "all" as PriceRangeFilter,
  onlyOffers: false,
  sort: "popular" as const,
};

```

# File: lib/cafe/menu-storage.ts

```typescript
import { assertNoBase64Images, sanitizeMenuProducts } from "@/lib/cafe/entity-storage-sanitize";
import type { MenuProduct } from "@/lib/mock/menu";

export const MENU_STORAGE_KEY = "branda_qatrah_menu";

export function saveMenuProductsToStorage(_products: MenuProduct[]) {
  throw new Error("Use Supabase — save via app/actions/menu");
}

export function loadMenuProductsFromStorage(): MenuProduct[] | null {
  throw new Error("Use Supabase — fetch via lib/data/menu");
}

```

# File: lib/cafe/theme-experience.ts

```typescript
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

```

# File: lib/cafe/theme-links.ts

```typescript
import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import { isValidCafeThemeId } from "@/lib/mock/cafe-theme";

/** يبني مسار صفحة كوفي مع الحفاظ على previewTheme */
export function getCafePath(
  slug: string,
  path = "",
  previewTheme?: string | null
) {
  const normalized = path.replace(/^\//, "");
  const base = normalized ? `/c/${slug}/${normalized}` : `/c/${slug}`;
  return withThemePreview(base, previewTheme);
}

/** يضيف أو يستبدل previewTheme في الرابط */
export function withThemePreview(href: string, previewTheme?: string | null) {
  if (!previewTheme || !isValidCafeThemeId(previewTheme)) return href;

  const [pathname, search = ""] = href.split("?");
  const params = new URLSearchParams(search);
  params.set("previewTheme", previewTheme);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** يقرأ previewTheme من searchParams أو window */
export function readPreviewThemeFromSearch(
  searchParams?: URLSearchParams | null
): CafeThemeId | null {
  const raw =
    searchParams?.get("previewTheme") ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("previewTheme")
      : null);
  if (raw && isValidCafeThemeId(raw)) return raw;
  return null;
}

/** يدمج previewTheme الحالي في مسار نسبي */
export function preservePreviewSearchParams(
  path: string,
  previewTheme?: string | null
) {
  return withThemePreview(path, previewTheme);
}

/** لاستخدامه مع router.push */
export function appendPreviewToNextPath(
  nextPath: string,
  previewTheme?: string | null
) {
  if (!previewTheme) return nextPath;
  const sep = nextPath.includes("?") ? "&" : "?";
  return `${nextPath}${sep}previewTheme=${encodeURIComponent(previewTheme)}`;
}

```

# File: lib/cafe/theme-storage-sync.ts

```typescript
import {
  normalizeThemeId,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { adoptThemeAction } from "@/app/actions/theme";
import { saveCustomIdentityAction } from "@/app/actions/theme";

export const BRANDA_THEME_UPDATED_EVENT = "branda:theme-updated";
export const BRANDA_CUSTOM_IDENTITY_UPDATED_EVENT = "branda:custom-identity-updated";
export const BRANDA_MENU_CATEGORIES_UPDATED_EVENT = "branda:menu-categories-updated";

export function readSavedCafeThemeIdFromStorage(): CafeThemeId {
  return normalizeThemeId(null);
}

export async function adoptCafeTheme(themeId: CafeThemeId) {
  await adoptThemeAction(themeId);
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

export async function runCustomIdentityMigrationOnce() {
  return { ok: true as const };
}

export async function migrateAllLegacyImageDataUrls() {
  throw new Error("Legacy localStorage migration removed — use Supabase storage");
}

export async function migrateLegacyCustomIdentityAssets() {
  throw new Error("Legacy localStorage migration removed — use Supabase storage");
}

export async function repairLocalImageStorage(_force?: boolean) {
  throw new Error("Legacy localStorage repair removed — use Supabase storage");
}

export function settingsContainsLegacyBase64() {
  return false;
}

export function anyLegacyBase64InProjectStorage() {
  return false;
}

export { containsLegacyBase64InStorage } from "@/lib/mock/custom-identity-theme";

```

# File: lib/cafe/use-cafe-theme-page.ts

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  appendPreviewToNextPath,
  getCafePath,
  readPreviewThemeFromSearch,
} from "@/lib/cafe/theme-links";
import { getThemeExperience, type ThemeExperience } from "@/lib/cafe/theme-experience";
import {
  DEFAULT_CAFE_THEME_ID,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import { mockCafeSettings, type CafeSettings } from "@/lib/mock/cafe-settings";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { isSupabaseConfigured } from "@/lib/branda/env";

export function useCafeThemePage(slug: string) {
  const searchParams = useSearchParams();
  const previewThemeId = readPreviewThemeFromSearch(searchParams);
  const [savedThemeId, setSavedThemeId] = useState<CafeThemeId>(DEFAULT_CAFE_THEME_ID);
  const [customIdentity, setCustomIdentity] = useState<CustomIdentityTheme | null>(null);
  const [settings, setSettings] = useState<CafeSettings>({
    ...mockCafeSettings,
    cafeSlug: slug,
    cafeName: slug,
  });
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured()) {
        setLoadError("Supabase غير مهيأ — راجع .env.local");
        setHydrated(true);
        return;
      }

      try {
        const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setLoadError("المقهى غير موجود");
          } else {
            setLoadError("تعذر تحميل بيانات المقهى");
          }
          setHydrated(true);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (data.settings) setSettings(data.settings);
        if (data.themeId) setSavedThemeId(data.themeId);
        if (data.customIdentity) setCustomIdentity(data.customIdentity);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("تعذر الاتصال بالخادم");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const themeId = previewThemeId ?? savedThemeId;
  const experience = getThemeExperience(themeId);
  const isPreview = Boolean(
    previewThemeId && previewThemeId !== (hydrated ? savedThemeId : DEFAULT_CAFE_THEME_ID)
  );

  function path(subpath = "") {
    return getCafePath(slug, subpath, previewThemeId);
  }

  function nextPath(subpath: string) {
    return appendPreviewToNextPath(subpath, previewThemeId);
  }

  return {
    slug,
    themeId,
    theme: experience.theme,
    experience,
    settings,
    customIdentity,
    previewThemeId,
    isPreview,
    path,
    nextPath,
    hydrated,
    loadError,
  };
}

```

# File: lib/cafe/use-custom-identity-visuals.ts

```typescript
"use client";

import { useEffect, useState } from "react";
import {
  getLocalAssetObjectUrl,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";

type PreviewUrls = {
  logoUrl?: string;
  backgroundUrl?: string;
};

export function useCustomIdentityVisuals(
  identity: CustomIdentityTheme,
  preview?: PreviewUrls
) {
  const [logoUrl, setLogoUrl] = useState<string | undefined>(preview?.logoUrl);
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>(
    preview?.backgroundUrl
  );

  useEffect(() => {
    let cancelled = false;
    let resolvedLogoUrl: string | undefined;
    let resolvedBackgroundUrl: string | undefined;

    async function load() {
      if (preview?.logoUrl) {
        resolvedLogoUrl = preview.logoUrl;
      } else if (identity.logoAssetId) {
        resolvedLogoUrl = await getLocalAssetObjectUrl(identity.logoAssetId);
      } else if (identity.legacyLogoDataUrl) {
        resolvedLogoUrl = identity.legacyLogoDataUrl;
      }

      if (preview?.backgroundUrl) {
        resolvedBackgroundUrl = preview.backgroundUrl;
      } else if (identity.backgroundAssetId) {
        resolvedBackgroundUrl = await getLocalAssetObjectUrl(identity.backgroundAssetId);
      } else if (identity.legacyBackgroundImageDataUrl) {
        resolvedBackgroundUrl = identity.legacyBackgroundImageDataUrl;
      }

      if (!cancelled) {
        setLogoUrl(resolvedLogoUrl);
        setBackgroundUrl(resolvedBackgroundUrl);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (!preview?.logoUrl && resolvedLogoUrl?.startsWith("blob:")) {
        revokeObjectUrl(resolvedLogoUrl);
      }
      if (!preview?.backgroundUrl && resolvedBackgroundUrl?.startsWith("blob:")) {
        revokeObjectUrl(resolvedBackgroundUrl);
      }
    };
  }, [
    identity.logoAssetId,
    identity.backgroundAssetId,
    identity.legacyLogoDataUrl,
    identity.legacyBackgroundImageDataUrl,
    preview?.logoUrl,
    preview?.backgroundUrl,
  ]);

  return { logoUrl, backgroundUrl };
}

```

# File: lib/cafe/use-local-asset-url.ts

```typescript
"use client";

import { useEffect, useState } from "react";
import {
  getLocalAssetObjectUrl,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import {
  isHttpImageUrl,
  isLegacyDataImageUrl,
} from "@/lib/cafe/image-asset-pipeline";

export function useLocalAssetUrl(
  assetId?: string,
  fallbackSrc?: string | null,
  previewUrl?: string
) {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (previewUrl) return previewUrl;
    if (isLegacyDataImageUrl(fallbackSrc) || isHttpImageUrl(fallbackSrc)) {
      return fallbackSrc ?? undefined;
    }
    return undefined;
  });

  useEffect(() => {
    if (previewUrl) {
      setUrl(previewUrl);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

    async function load() {
      if (assetId) {
        objectUrl = await getLocalAssetObjectUrl(assetId);
        if (!cancelled) {
          setUrl(
            objectUrl ??
              (isLegacyDataImageUrl(fallbackSrc) || isHttpImageUrl(fallbackSrc)
                ? fallbackSrc ?? undefined
                : undefined)
          );
        }
        return;
      }

      if (!cancelled) {
        setUrl(
          isLegacyDataImageUrl(fallbackSrc) || isHttpImageUrl(fallbackSrc)
            ? fallbackSrc ?? undefined
            : undefined
        );
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) revokeObjectUrl(objectUrl);
    };
  }, [assetId, fallbackSrc, previewUrl]);

  return url;
}

```

# File: lib/cafe/use-public-cafe-menu.ts

```typescript
"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/branda/env";
import type { CafeBranch } from "@/lib/mock/branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";

type PublicMenuPayload = {
  products: MenuProduct[];
  categories: MenuCategoryRecord[];
  offers: CafeOffer[];
  branches: CafeBranch[];
  loyaltySettings: LoyaltySettings;
  loyaltyRewards: LoyaltyReward[];
};

const emptyPayload: PublicMenuPayload = {
  products: [],
  categories: [],
  offers: [],
  branches: [],
  loyaltySettings: { pointsPerSar: 1, welcomePoints: 0, enabled: true, earnRules: [], redemptionRules: [] },
  loyaltyRewards: [],
};

export function usePublicCafeMenu(slug: string) {
  const [data, setData] = useState<PublicMenuPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured()) {
        setError("Supabase غير مهيأ");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}/menu`);
        if (!res.ok) {
          setError(res.status === 404 ? "المقهى غير موجود" : "تعذر تحميل المنيو");
          setLoading(false);
          return;
        }

        const json = await res.json();
        if (cancelled) return;

        setData({
          products: json.products ?? [],
          categories: json.categories ?? [],
          offers: json.offers ?? [],
          branches: json.branches ?? [],
          loyaltySettings: json.loyaltySettings ?? emptyPayload.loyaltySettings,
          loyaltyRewards: json.loyaltyRewards ?? [],
        });
        setError(null);
      } catch {
        if (!cancelled) setError("تعذر الاتصال بالخادم");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { ...data, loading, error };
}

```

# File: lib/cafe/use-resolved-cafe-logo.ts

```typescript
"use client";

import { useEffect, useState } from "react";
import {
  getLocalAssetObjectUrl,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

export function useResolvedCafeLogoUrl(
  settings: CafeSettings,
  previewUrl?: string
) {
  const [logoUrl, setLogoUrl] = useState<string | undefined>(previewUrl ?? settings.logoDataUrl);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    async function load() {
      if (previewUrl) {
        setLogoUrl(previewUrl);
        return;
      }

      if (settings.logoAssetId) {
        objectUrl = await getLocalAssetObjectUrl(settings.logoAssetId);
        if (!cancelled) setLogoUrl(objectUrl);
        return;
      }

      if (!cancelled) setLogoUrl(settings.logoDataUrl);
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) revokeObjectUrl(objectUrl);
    };
  }, [settings.logoAssetId, settings.logoDataUrl, previewUrl]);

  return logoUrl;
}

```

# File: lib/cafe/use-resolved-cafe-theme.ts

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_CAFE_THEME_ID,
  getThemeClasses,
  isValidCafeThemeId,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import { subscribeBrandaStorageEvents } from "@/lib/cafe/theme-storage-sync";
import { isSupabaseConfigured } from "@/lib/branda/env";

export function readSavedCafeThemeId(): CafeThemeId | null {
  return null;
}

export function useResolvedCafeTheme(slug = "qatrah") {
  const searchParams = useSearchParams();
  const previewParam = searchParams.get("previewTheme");

  const [savedThemeId, setSavedThemeId] = useState<CafeThemeId>(DEFAULT_CAFE_THEME_ID);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured()) {
        setHydrated(true);
        return;
      }

      try {
        const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          setHydrated(true);
          return;
        }
        const data = await res.json();
        if (!cancelled && data.themeId) {
          setSavedThemeId(data.themeId as CafeThemeId);
        }
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void load();
    return subscribeBrandaStorageEvents({
      onThemeUpdated: () => {
        void load();
      },
    });
  }, [slug]);

  const previewThemeId =
    previewParam && isValidCafeThemeId(previewParam) ? previewParam : null;

  const themeId: CafeThemeId = previewThemeId ?? savedThemeId;

  const savedId = hydrated ? savedThemeId : DEFAULT_CAFE_THEME_ID;
  const isPreview = Boolean(previewThemeId && previewThemeId !== savedId);

  return {
    themeId,
    theme: getThemeClasses(themeId),
    isPreview,
    previewThemeId,
    hydrated,
  };
}

```

# File: lib/storage/customer-media-server.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import { requireCustomerProfileForSession } from "@/lib/data/customers";
import { optimizeImageForStorage } from "@/lib/cafe/image-asset-pipeline";

const AVATAR_MIME = ["image/webp", "image/jpeg", "image/png"];
/** Max raw upload before server-side optimization (5 MB). */
const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;
/** Matches customer-avatars bucket limit in migration 002 (2 MB). */
const MAX_FINAL_BYTES = 2 * 1024 * 1024;

function assertSafePathSegment(segment: string) {
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
    throw new Error("Invalid storage path segment");
  }
}

/** Upload customer avatar — stores `{userId}/{uuid}.webp` in customer-avatars only. */
export async function uploadCustomerAvatar(cafeSlug: string, file: File) {
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error("Image file is too large (max 5 MB before processing)");
  }

  const { user, profile } = await requireCustomerProfileForSession(cafeSlug);
  const optimized = await optimizeImageForStorage(file, "customer-avatar");

  if (!AVATAR_MIME.includes(optimized.mimeType)) {
    throw new Error("Unsupported file type after optimization");
  }

  if (optimized.sizeBytes > MAX_FINAL_BYTES) {
    throw new Error("Optimized image exceeds safe size limit (max 2 MB)");
  }

  const ext = optimized.mimeType === "image/webp" ? "webp" : "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  assertSafePathSegment(fileName);
  const storagePath = `${user.id}/${fileName}`;
  const previousStoragePath = (profile.avatar_storage_path as string | null | undefined) ?? null;

  const supabase = await createClient();
  const { error } = await supabase.storage.from("customer-avatars").upload(storagePath, optimized.blob, {
    contentType: optimized.mimeType,
    upsert: false,
  });
  if (error) throw error;

  return {
    storagePath,
    byteSize: optimized.sizeBytes,
    previousStoragePath,
  };
}

export async function deleteCustomerAvatar(storagePath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const ownerId = storagePath.split("/")[0];
  if (ownerId !== user.id) {
    throw new Error("Forbidden: avatar path does not belong to current user");
  }

  const { error } = await supabase.storage.from("customer-avatars").remove([storagePath]);
  if (error) throw error;
}

```

# File: lib/storage/experience-media-server.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug } from "@/lib/data/cafes";
import { requireCustomerProfileForSession } from "@/lib/data/customers";
import { optimizeImageForStorage } from "@/lib/cafe/image-asset-pipeline";

const IMAGE_MIME = ["image/webp", "image/jpeg", "image/png"];
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_FINAL_BYTES = 5 * 1024 * 1024;

const DIRECT_VIDEO_UPLOAD_DISABLED_MESSAGE =
  "رفع الفيديو المباشر غير متاح حاليًا. يمكنك إضافة رابط TikTok أو Instagram أو YouTube بدلًا من ذلك.";

function assertSafePathSegment(segment: string) {
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
    throw new Error("Invalid storage path segment");
  }
}

/**
 * Upload experience submission proof image after the submission row exists.
 * Path: `{userId}/{submissionId}/{uuid}.ext` — direct video upload disabled for v1.
 */
export async function uploadExperienceSubmissionMedia(
  cafeSlug: string,
  submissionId: string,
  file: File
) {
  if (file.type.startsWith("video/")) {
    throw new Error(DIRECT_VIDEO_UPLOAD_DISABLED_MESSAGE);
  }

  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error("Image file is too large (max 10 MB before processing)");
  }

  const { user, profile } = await requireCustomerProfileForSession(cafeSlug);
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  assertSafePathSegment(submissionId);

  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("experience_submissions")
    .select("id, customer_id, cafe_id, status")
    .eq("id", submissionId)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (!submission || submission.customer_id !== profile.id) {
    throw new Error("Submission not found or forbidden");
  }

  if (submission.status !== "pending") {
    throw new Error("Submission is not editable");
  }

  const optimized = await optimizeImageForStorage(file, "product-image");
  if (!IMAGE_MIME.includes(optimized.mimeType)) {
    throw new Error("Unsupported file type — images only");
  }

  if (optimized.sizeBytes > MAX_FINAL_BYTES) {
    throw new Error("Optimized image exceeds safe size limit (max 5 MB)");
  }

  const ext = optimized.mimeType === "image/webp" ? "webp" : "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  assertSafePathSegment(fileName);
  const storagePath = `${user.id}/${submissionId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("experience-submissions")
    .upload(storagePath, optimized.blob, {
      contentType: optimized.mimeType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: attachError } = await supabase.rpc("attach_experience_submission_media", {
    p_submission_id: submissionId,
    p_media_storage_path: storagePath,
  });
  if (attachError) {
    await supabase.storage.from("experience-submissions").remove([storagePath]);
    throw attachError;
  }

  return { storagePath, byteSize: optimized.sizeBytes };
}

```

# File: lib/storage/private-storage-access.ts

```typescript
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { PrivateStorageBucket } from "@/lib/storage/public-storage-access";

function assertSafePath(path: string): string | null {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return null;
  }
  return path;
}

async function isPlatformAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  return !error && Boolean(data);
}

async function isCafeOwner(supabase: SupabaseClient, cafeId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_cafe_owner", { p_cafe_id: cafeId });
  return !error && Boolean(data);
}

async function hasCafePermission(
  supabase: SupabaseClient,
  cafeId: string,
  permission: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_cafe_permission", {
    p_cafe_id: cafeId,
    p_permission: permission,
  });
  return !error && Boolean(data);
}

/**
 * DB-backed authorization before issuing signed URLs for private buckets.
 * Never uses service role — relies on user session + RPC permission checks.
 */
export async function assertPrivateStorageAccess(
  supabase: SupabaseClient,
  user: User,
  bucket: PrivateStorageBucket,
  storagePath: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const path = assertSafePath(storagePath);
  if (!path) {
    return { ok: false, status: 400, error: "Invalid path" };
  }

  const segments = path.split("/");

  if (bucket === "customer-avatars") {
    const pathUserId = segments[0];
    if (!pathUserId || !segments[1]) {
      return { ok: false, status: 400, error: "Invalid avatar path" };
    }

    if (pathUserId !== user.id) {
      if (!(await isPlatformAdmin(supabase))) {
        return { ok: false, status: 403, error: "Forbidden: path user mismatch" };
      }
    }

    const { data: profile } = await supabase
      .from("customer_profiles")
      .select("user_id, avatar_storage_path")
      .eq("avatar_storage_path", path)
      .maybeSingle();

    if (!profile) {
      return { ok: false, status: 403, error: "Avatar path not linked in database" };
    }

    if (profile.user_id === user.id && pathUserId === user.id) {
      return { ok: true };
    }

    if (await isPlatformAdmin(supabase)) {
      return { ok: true };
    }

    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (bucket === "experience-submissions") {
    const pathUserId = segments[0];
    const submissionId = segments[1];
    if (!pathUserId || !submissionId || !segments[2]) {
      return { ok: false, status: 400, error: "Invalid experience media path" };
    }

    const { data: submission } = await supabase
      .from("experience_submissions")
      .select("id, cafe_id, customer_id, media_storage_path")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submission) {
      return { ok: false, status: 403, error: "Submission not found" };
    }

    if (submission.media_storage_path !== path) {
      return { ok: false, status: 403, error: "Path does not match submission media record" };
    }

    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("user_id")
      .eq("id", submission.customer_id)
      .maybeSingle();

    if (customerProfile?.user_id === user.id) {
      if (pathUserId !== user.id) {
        return { ok: false, status: 403, error: "Forbidden: path user mismatch" };
      }
      return { ok: true };
    }

    if (await isPlatformAdmin(supabase)) {
      return { ok: true };
    }

    const cafeId = submission.cafe_id as string;
    if (await isCafeOwner(supabase, cafeId)) {
      return { ok: true };
    }

    if (await hasCafePermission(supabase, cafeId, "marketing")) {
      return { ok: true };
    }

    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: false, status: 400, error: "Unsupported bucket" };
}

```

# File: lib/storage/public-storage-access.ts

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

/** Buckets allowed on the anonymous public signed-URL endpoint only. */
export const ANON_PUBLIC_STORAGE_BUCKETS = [
  "cafe-logos",
  "cafe-backgrounds",
  "menu-products",
  "menu-categories",
  "offer-banners",
  "marketing-assets",
] as const;

export type AnonPublicStorageBucket = (typeof ANON_PUBLIC_STORAGE_BUCKETS)[number];

/** Buckets that must never be served from the public API route. */
export const PRIVATE_STORAGE_BUCKETS = ["customer-avatars", "experience-submissions"] as const;

export type PrivateStorageBucket = (typeof PRIVATE_STORAGE_BUCKETS)[number];

export function isAnonPublicStorageBucket(bucket: string): bucket is AnonPublicStorageBucket {
  return (ANON_PUBLIC_STORAGE_BUCKETS as readonly string[]).includes(bucket);
}

export function isPrivateStorageBucketName(bucket: string): bucket is PrivateStorageBucket {
  return (PRIVATE_STORAGE_BUCKETS as readonly string[]).includes(bucket);
}

function assertSafePath(path: string): string | null {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return null;
  }
  return path;
}

/**
 * Validates public storage access via DB RPC — no direct reads on cafe_settings or other staff tables.
 * Uses caller session (anon or authenticated); RPC runs SECURITY DEFINER internally.
 */
export async function assertAnonPublicStorageAccess(
  supabase: SupabaseClient,
  bucket: AnonPublicStorageBucket,
  storagePath: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const path = assertSafePath(storagePath);
  if (!path) {
    return { ok: false, status: 400, error: "Invalid path" };
  }

  if (isPrivateStorageBucketName(bucket)) {
    return { ok: false, status: 403, error: "Private bucket not allowed on public endpoint" };
  }

  if (!isAnonPublicStorageBucket(bucket)) {
    return { ok: false, status: 400, error: "Unknown or disallowed bucket" };
  }

  const { data, error } = await supabase.rpc("can_access_public_storage_object", {
    p_bucket: bucket,
    p_storage_path: path,
  });

  if (error) {
    return { ok: false, status: 403, error: "Access check failed" };
  }

  if (!data) {
    return { ok: false, status: 403, error: "Object not published or path mismatch" };
  }

  return { ok: true };
}

```

# File: lib/storage/resolve-storage-url.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import {
  assertAnonPublicStorageAccess,
  isAnonPublicStorageBucket,
  isPrivateStorageBucketName,
  type AnonPublicStorageBucket,
  type PrivateStorageBucket,
} from "@/lib/storage/public-storage-access";
import { assertPrivateStorageAccess } from "@/lib/storage/private-storage-access";
import type { StorageBucket } from "@/lib/storage/upload-server";

/** Short-lived signed URLs — max 10 minutes. */
export const PRIVATE_STORAGE_TTL_SECONDS = 10 * 60;
export const PUBLIC_STORAGE_TTL_SECONDS = 10 * 60;

const PUBLISHED_BUCKETS = [
  "cafe-logos",
  "cafe-backgrounds",
  "menu-products",
  "menu-categories",
  "offer-banners",
  "marketing-assets",
] as const satisfies readonly AnonPublicStorageBucket[];

export type PublishedStorageBucket = (typeof PUBLISHED_BUCKETS)[number];

export function isPublishedStorageBucket(bucket: string): bucket is PublishedStorageBucket {
  return isAnonPublicStorageBucket(bucket);
}

/** Signed URL for published cafe assets only — never private buckets. */
export async function createPublishedAssetSignedUrl(
  bucket: PublishedStorageBucket,
  storagePath: string
): Promise<string | null> {
  if (!storagePath) return null;

  const supabase = await createClient();
  const access = await assertAnonPublicStorageAccess(supabase, bucket, storagePath);
  if (!access.ok) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, PUBLIC_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function resolvePublishedStoragePathToUrl(
  bucket: PublishedStorageBucket,
  storagePath: string | null | undefined
): Promise<string | undefined> {
  if (!storagePath) return undefined;
  return (await createPublishedAssetSignedUrl(bucket, storagePath)) ?? undefined;
}

/** Private buckets only — requires session + DB-backed authorization. */
export async function createPrivateAssetSignedUrl(
  bucket: PrivateStorageBucket,
  storagePath: string
): Promise<string | null> {
  if (!storagePath) return null;
  if (!isPrivateStorageBucketName(bucket)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const access = await assertPrivateStorageAccess(supabase, user, bucket, storagePath);
  if (!access.ok) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, PRIVATE_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function resolvePrivateStoragePathToUrl(
  bucket: PrivateStorageBucket,
  storagePath: string | null | undefined
): Promise<string | undefined> {
  if (!storagePath) return undefined;
  return (await createPrivateAssetSignedUrl(bucket, storagePath)) ?? undefined;
}

/**
 * @deprecated Use resolvePublishedStoragePathToUrl or resolvePrivateStoragePathToUrl.
 * Routes private buckets through authorization; rejects unknown buckets.
 */
export async function resolveStoragePathToUrl(
  bucket: StorageBucket,
  storagePath: string | null | undefined
): Promise<string | undefined> {
  if (!storagePath) return undefined;

  if (isPrivateStorageBucketName(bucket)) {
    return resolvePrivateStoragePathToUrl(bucket, storagePath);
  }

  if (isPublishedStorageBucket(bucket)) {
    return resolvePublishedStoragePathToUrl(bucket, storagePath);
  }

  return undefined;
}

export function storageBucketForLogo(): PublishedStorageBucket {
  return "cafe-logos";
}

export function storageBucketForProduct(): PublishedStorageBucket {
  return "menu-products";
}

export function storageBucketForCategory(): PublishedStorageBucket {
  return "menu-categories";
}

export function storageBucketForOfferBanner(): PublishedStorageBucket {
  return "offer-banners";
}

export function storageBucketForMarketing(): PublishedStorageBucket {
  return "marketing-assets";
}

export function storageBucketForBackground(): PublishedStorageBucket {
  return "cafe-backgrounds";
}

export function storageBucketForAvatar(): PrivateStorageBucket {
  return "customer-avatars";
}

export { PUBLISHED_BUCKETS as PUBLIC_BUCKETS };

```

# File: lib/storage/upload-server.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { optimizeImageForStorage } from "@/lib/cafe/image-asset-pipeline";

export type StorageBucket =
  | "cafe-logos"
  | "cafe-backgrounds"
  | "menu-products"
  | "menu-categories"
  | "offer-banners"
  | "customer-avatars"
  | "marketing-assets"
  | "experience-submissions";

const BUCKET_MIME: Record<StorageBucket, string[]> = {
  "cafe-logos": ["image/webp", "image/jpeg", "image/png"],
  "cafe-backgrounds": ["image/webp", "image/jpeg", "image/png"],
  "menu-products": ["image/webp", "image/jpeg", "image/png"],
  "menu-categories": ["image/webp", "image/jpeg", "image/png"],
  "offer-banners": ["image/webp", "image/jpeg", "image/png"],
  "customer-avatars": ["image/webp", "image/jpeg", "image/png"],
  "marketing-assets": ["image/webp", "image/jpeg", "image/png"],
  "experience-submissions": ["image/webp", "image/jpeg", "image/png"],
};

function assertSafeFileName(segment: string) {
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
    throw new Error("Invalid storage path segment");
  }
}

function buildStoragePath(
  bucket: StorageBucket,
  cafeId: string,
  entityId: string,
  fileName: string
) {
  assertSafeFileName(entityId);
  assertSafeFileName(fileName);

  switch (bucket) {
    case "cafe-logos":
    case "cafe-backgrounds":
      return `${cafeId}/${fileName}`;
    case "menu-products":
    case "menu-categories":
    case "offer-banners":
    case "marketing-assets":
      return `${cafeId}/${entityId}/${fileName}`;
    default:
      throw new Error(`Bucket ${bucket} requires dedicated upload handler`);
  }
}

export async function uploadOptimizedImage(
  bucket: StorageBucket,
  file: File,
  purpose: Parameters<typeof optimizeImageForStorage>[1],
  entityId: string
) {
  const cafe = await requireOwnerCafeContext();
  const optimized = await optimizeImageForStorage(file, purpose);

  if (!BUCKET_MIME[bucket].includes(optimized.mimeType)) {
    throw new Error("Unsupported file type after optimization");
  }

  const ext = optimized.mimeType === "image/webp" ? "webp" : "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = buildStoragePath(bucket, cafe.id, entityId, fileName);

  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).upload(storagePath, optimized.blob, {
    contentType: optimized.mimeType,
    upsert: false,
  });
  if (error) throw error;

  return {
    storagePath,
    byteSize: optimized.sizeBytes,
  };
}

export async function deleteStorageObject(bucket: StorageBucket, storagePath: string) {
  const cafe = await requireOwnerCafeContext();
  const pathCafeId = storagePath.split("/")[0];
  if (pathCafeId !== cafe.id) {
    throw new Error("Forbidden: storage path does not belong to this cafe");
  }

  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) throw error;
}

```

# File: lib/ui/brand-colors.ts

```typescript
/** Official Branda platform palette */
export const BRAND_COLORS = {
  espressoDark: "#311912",
  coffeeBrown: "#4A281D",
  brandBrown: "#6B3A25",
  goldAccent: "#D9A33F",
  softGold: "#F0C568",
  creamBase: "#FCF8F3",
  warmSand: "#F2E7D9",
  borderSand: "#E7D7C6",
  mutedText: "#806A5E",
} as const;

```

# File: lib/ui/brand.ts

```typescript
export const brandColors = {
  brown: "#3A2117",
  brownDark: "#241610",
  brownLuxury: "#6B3A25",
  cream: "#F8F4EF",
  creamSecondary: "#EFE2D3",
  gold: "#F6C35B",
  textMuted: "#7A6255",
  border: "#E5D8CD",
  creamText: "#F8E8D2",
} as const;

export const LOGO = {
  dark: "/brand/branda-logo-dark.png",
  brown: "/brand/branda-logo-brown.png",
  brownBg: "/brand/branda-logo-brown-bg.png",
} as const;

```

