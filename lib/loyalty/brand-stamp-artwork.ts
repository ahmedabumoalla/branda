import { isUniversalStampStyle, loyaltyStampStyle, type LoyaltyStampStyle } from "./stamp-style";

export function isMobileRetailLoyalty(slug: string) {
  return slug === "brand-434aab1976d5";
}

/** Original Together catalog photograph reused as its loyalty stamp artwork. */
export function brandStampArtwork(slug: string): string | undefined {
  return slug === "brand-871ec6e243c0" ? "/together/loyalty-plant.webp" : undefined;
}

/** Replace legacy cafe defaults with each brand's stamp identity, retaining an explicit logo, star or check choice. */
export function brandStampStyle(slug: string, value: unknown): LoyaltyStampStyle {
  const style = loyaltyStampStyle(value);
  if (isUniversalStampStyle(style)) return style;
  if (isMobileRetailLoyalty(slug) && !["phone", "sim", "headphones"].includes(style)) return "phone";
  if (slug === "brand-1c2b6f7e028f") return "shirt";
  return brandStampArtwork(slug) ? "plant" : style;
}
