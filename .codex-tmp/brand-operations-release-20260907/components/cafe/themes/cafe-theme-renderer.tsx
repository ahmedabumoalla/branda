"use client";

import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { BrandIdentityCustomTheme } from "./brand-identity-custom-theme";

export function CafeThemeRenderer(props: CafeThemePageProps) {
  return <BrandIdentityCustomTheme {...props} themeId="brand-identity-custom" />;
}
