export const APPROVED_LOYALTY_DESIGN = "brand-stamps-v1";
export const DEFAULT_LOYALTY_COLORS = { background: "#4a281d", foreground: "#fcf8f3", accent: "#d9a33f" };

export function validBrandColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}
function luminance(color: string) {
  const c = [1, 3, 5].map(i => { const n = parseInt(color.slice(i, i + 2), 16) / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
export function readableBrandForeground(background: string, requested?: unknown) {
  const contrast = (ink: string) => { const a = luminance(background), b = luminance(ink); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
  const foreground = validBrandColor(requested) || DEFAULT_LOYALTY_COLORS.foreground;
  return contrast(foreground) >= 4.5 ? foreground : contrast("#ffffff") >= 4.5 ? "#ffffff" : "#000000";
}
/** Brand identity is authoritative; historical card-builder colors are not. */
export function approvedLoyaltyColors(slug: string, palette?: Record<string, unknown> | null) {
  if (slug === "rast") return { background: "#3b1420", foreground: "#f8f2e8", accent: "#970e29" };
  const background = validBrandColor(palette?.primary) || DEFAULT_LOYALTY_COLORS.background;
  return { background, foreground: readableBrandForeground(background, palette?.text), accent: validBrandColor(palette?.secondary) || validBrandColor(palette?.accent) || DEFAULT_LOYALTY_COLORS.accent };
}
