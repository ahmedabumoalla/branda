"use client";

import type { ComponentType } from "react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import { MarketplaceAmazonTheme } from "./marketplace-amazon-theme";
import { PremiumAppleTheme } from "./premium-apple-theme";
import { NoonCommerceTheme } from "./noon-commerce-theme";
import { LuxuryBoutiqueTheme } from "./luxury-boutique-theme";
import { MobileFirstCafeTheme } from "./mobile-first-cafe-theme";
import { CyberEcoDarkTheme } from "./cyber-eco-dark-theme";
import { SoftCream3dTheme } from "./soft-cream-3d-theme";
import { MagazineEditorialTheme } from "./magazine-editorial-theme";
import { FastOrderKioskTheme } from "./fast-order-kiosk-theme";
import { ReservationLoungeTheme } from "./reservation-lounge-theme";
import { BrandIdentityCustomTheme } from "./brand-identity-custom-theme";

const THEME_COMPONENTS: Record<CafeThemeId, ComponentType<CafeThemePageProps>> = {
  "marketplace-amazon": MarketplaceAmazonTheme,
  "premium-apple": PremiumAppleTheme,
  "noon-commerce": NoonCommerceTheme,
  "luxury-boutique": LuxuryBoutiqueTheme,
  "mobile-first-cafe": MobileFirstCafeTheme,
  "cyber-eco-dark": CyberEcoDarkTheme,
  "soft-cream-3d": SoftCream3dTheme,
  "magazine-editorial": MagazineEditorialTheme,
  "fast-order-kiosk": FastOrderKioskTheme,
  "reservation-lounge": ReservationLoungeTheme,
  "brand-identity-custom": BrandIdentityCustomTheme,
};

export function CafeThemeRenderer(props: CafeThemePageProps) {
  const Component = THEME_COMPONENTS[props.themeId] ?? SoftCream3dTheme;
  return <Component {...props} />;
}
