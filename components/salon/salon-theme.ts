import type { CSSProperties } from "react";
import { loyaltyTheme } from "@/components/rast-loyalty/loyalty-theme";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
export function salonTheme(identity: LoyaltyIdentity): CSSProperties {
  const theme = loyaltyTheme(identity) as Record<string, string> | undefined;
  return { ...theme, "--salon-bg": identity.cardBackground || "#4a281d", "--salon-ink": identity.cardForeground || "#fcf8f3",
    "--salon-accent": theme?.["--wine"] || "#4a281d", "--salon-button-ink": theme?.["--cream"] || "#f7f7f4" } as CSSProperties;
}
