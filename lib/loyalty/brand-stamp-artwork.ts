import { loyaltyStampStyle, type LoyaltyStampStyle } from "./stamp-style";

/** Original Together catalog photograph reused as its loyalty stamp artwork. */
export function brandStampArtwork(slug: string): string | undefined {
  return slug === "brand-871ec6e243c0" ? "/together/loyalty-plant.webp" : undefined;
}

/** Old café defaults become botanical stamps for Together; an explicit logo choice is retained. */
export function brandStampStyle(slug: string, value: unknown): LoyaltyStampStyle {
  const style = loyaltyStampStyle(value);
  return brandStampArtwork(slug) && style !== "brand" ? "plant" : style;
}
