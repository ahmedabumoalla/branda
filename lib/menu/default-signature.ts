import { buildCustomIdentityContrastTokens, getContrastRatio } from "@/lib/cafe/color-contrast";
import type { SignatureBrand } from "./signature-brands";
import { menuDisplayText, type StandaloneMenu } from "@/lib/menu/standalone-menu";

// Rollout starts on the approved design day in Riyadh. Database creation time,
// not a hand-maintained slug registry, covers every account creation path.
export const SIGNATURE_MENU_ROLLOUT_AT = "2026-11-03T00:00:00+03:00";
export const DEFAULT_SIGNATURE_HERO = "/menu-art/default/hospitality-hero-v1.webp";

export function usesDefaultSignatureMenu(category: string | null | undefined, createdAt: string | null | undefined) {
  return ["cafes_coffee", "restaurants", "butcher_shops"].includes(category ?? "")
    && Boolean(createdAt) && Date.parse(createdAt!) >= Date.parse(SIGNATURE_MENU_ROLLOUT_AT);
}

export function defaultSignatureBrand(menu: StandaloneMenu): SignatureBrand | null {
  if (menu.presentation !== "signature" || !["cafes_coffee", "restaurants", "butcher_shops"].includes(menu.businessCategory ?? "")) return null;
  const input = menu.appearance?.palette;
  const color = (key: string, fallback: string) => /^#[a-f\d]{6}$/i.test(input?.[key] ?? "") ? input![key] : fallback;
  const palette = { primary: color("primary", "#354438"), secondary: color("secondary", "#6b7057"), button: color("button", "#354438"), background: color("background", "#f7f3e9"), text: color("text", "#252c25"), accent: color("accent", "#dac49a") };
  const t = buildCustomIdentityContrastTokens(palette);
  const readable = (foreground: string, background: string, fallback: string) => getContrastRatio(foreground, background) >= 4.5 ? foreground : fallback;
  return {
    key: "default", name: menu.name, arabic: menu.name, logo: "", hero: menu.appearance?.heroUrl || DEFAULT_SIGNATURE_HERO,
    headline: "لذوقك", emphasis: "حكاية", note: menu.description ? menuDisplayText(menu.description) : `اختيارات ${menu.name} بكل محبة`,
    signature: menu.branch?.name || menu.name, catalog: "وش تختار اليوم؟", loyalty: "زياراتك معنا لها مكافأة", welcome: `حيّاك في ${menu.name}`,
    cssVariables: {
      "--brand": t.primaryBackground, "--tone": t.pageForeground, "--accent": t.accentBackground,
      "--surface": t.pageBackground, "--text": t.pageForeground, "--muted": readable(t.mutedForeground, t.pageBackground, t.pageForeground),
      "--edge": t.borderColor, "--white": t.primaryForeground, "--panel": t.primaryBackground,
      "--hero-paper": t.pageBackground, "--hero-ink": t.pageForeground,
      "--hero-detail": readable(t.primaryBackground, t.pageBackground, t.pageForeground),
      "--button-bg": t.buttonBackground, "--button-fg": t.buttonForeground,
      "--surface-raised": t.surfaceBackground, "--surface-raised-fg": t.surfaceForeground,
      "--accent-ink": t.accentForeground,
      "--gold": readable(t.accentBackground, t.primaryBackground, t.primaryForeground),
    },
  };
}
