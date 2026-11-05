"use client";

import { BrandLoyaltyEntry } from "./brand-loyalty-entry";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";

export function RastLoyaltyEntry({ menu }: { menu: StandaloneMenu }) {
  if (!menu.loyaltyEnabled) return null;
  return <BrandLoyaltyEntry slug={menu.slug} name={menu.name} logoUrl={menu.logoUrl || "/menu-logos/kawakib-transparent-20261008.png"} eyebrow={`لأنك من أهل ${menu.name}`} palette={{ background: "var(--rast-wine)", foreground: "var(--rast-cream)", muted: "var(--rast-blush)", cardBackground: "var(--rast-cream)", cardForeground: "var(--rast-wine)", cardBack: "var(--rast-red)" }} />;
}
