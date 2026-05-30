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
