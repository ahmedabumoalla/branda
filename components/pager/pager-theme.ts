import type { CSSProperties } from "react";
import { DEFAULT_LOYALTY_COLORS, readableBrandForeground, validBrandColor } from "@/lib/loyalty/approved-design";
import type { PagerBrandColors } from "@/lib/pager/types";

/** Use the same approved, tenant-specific palette as the loyalty card. */
export function pagerTheme(colors?: PagerBrandColors): CSSProperties {
  const primary = validBrandColor(colors?.background) ?? DEFAULT_LOYALTY_COLORS.background;
  const accent = validBrandColor(colors?.accent) ?? DEFAULT_LOYALTY_COLORS.accent;
  const ink = readableBrandForeground("#ffffff", primary);
  return {
    "--pg-primary": primary,
    "--pg-primary-text": readableBrandForeground(primary, colors?.foreground),
    "--pg-primary-hover": `color-mix(in srgb, ${primary} 88%, ${ink})`,
    "--pg-accent": accent,
    "--pg-accent-text": readableBrandForeground(accent),
    "--pg-accent-hover": `color-mix(in srgb, ${accent} 90%, ${ink})`,
    "--pg-bg": `color-mix(in srgb, ${primary} 4%, #ffffff)`,
    "--pg-card": "#ffffff",
    "--pg-ink": ink,
    "--pg-muted": "#605d59",
    "--pg-line": `color-mix(in srgb, ${primary} 20%, #ffffff)`,
    "--pg-soft": `color-mix(in srgb, ${primary} 8%, #ffffff)`,
    "--pg-gold": readableBrandForeground("#ffffff", accent),
  } as CSSProperties;
}
