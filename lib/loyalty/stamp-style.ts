export const stampStyles = ["ceramic", "paper", "meal", "cutlery", "brand", "scissors", "comb", "plant", "shirt", "phone", "sim", "headphones", "tea", "star", "check"] as const;
export type LoyaltyStampStyle = typeof stampStyles[number];

export function canChooseCutleryStamp(category: string | null | undefined) {
  return category === "cafes_coffee" || category === "restaurants";
}

export function loyaltyStampStyle(value: unknown): LoyaltyStampStyle {
  return stampStyles.includes(value as LoyaltyStampStyle) ? value as LoyaltyStampStyle : "ceramic";
}

/** Choices every brand may keep, whatever its own default stamp identity is. */
export const universalStampStyles: readonly LoyaltyStampStyle[] = ["brand", "star", "check"];

export function isUniversalStampStyle(style: LoyaltyStampStyle) {
  return universalStampStyles.includes(style);
}

export const STAMP_LOGO_VERSION = "stamp-logo-v1";

/** Square single-colour rendition of the saved brand or branch logo, sized for a stamp slot. */
export function stampLogoUrl(slug: string, branchId?: string | null) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) return null;
  return `/api/wallet/brand/${encodeURIComponent(slug)}/logo?shape=stamp&v=${STAMP_LOGO_VERSION}${branchId ? `&branch=${encodeURIComponent(branchId)}` : ""}`;
}

// Shared outlines keep the card preview and both native wallets consistent.
export const stampPaths = {
  cutlery: "M3 2v6a3 3 0 0 0 6 0V2M6 2v20M15 22V2c3.4 2.4 5 6.2 5 11h-5",
  star: "M12 2.6 14.7 8.9 21.5 9.5 16.4 14 17.9 20.7 12 17.2 6.1 20.7 7.6 14 2.5 9.5 9.3 8.9Z",
  check: "M21.5 12a9.5 9.5 0 1 1-19 0 9.5 9.5 0 0 1 19 0ZM7.8 12.4l2.9 2.9 5.6-6.2",
  tea: "M6 8h12l-2 11H8L6 8Zm1 4h10M4 22h16M9 2c-2 2 2 2 0 4m5-4c-2 2 2 2 0 4",
  phone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 3h4m-3 14h2",
  sim: "M9 2h7l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7l5-5Zm-1 9h8v7H8v-7Zm4 0v7m-4-3h8",
  headphones: "M3 14v-3a9 9 0 0 1 18 0v3M3 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 1-2Zm18 0h-3v8h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-1-2Z",
  shirt: "M16 3 21 6l-3 5-2-1v11H8V10l-2 1-3-5 5-3a4 4 0 0 0 8 0Z",
  plant: "M7 16h10l-1 6H8l-1-6Zm5 0V8m0 4C5 12 4 8 4 4c5 0 8 2 8 8Zm0-3c0-5 3-7 8-7 0 5-2 8-8 8",
  scissors: "M8.5 8.5 21 21M8.5 15.5 21 3M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  comb: "M3 5h18v5H3V5Zm0 5v9m3-9v9m3-9v9m3-9v9m3-9v9m3-9v9m3-9v9",
  ceramic: "M6 8h11v7a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4V8Zm11 1h1.5a3 3 0 0 1 0 6H17M4 22h16M9 3v2m5-2v2",
  paper: "M5 7h14l-2 14H7L5 7Zm-1 0h16V4H4v3Zm3-3V2h10v2M7 11h10M8 17h8",
  meal: "M3 13h18a9 9 0 0 1-18 0Zm-1 9h20M7 10c-3-3 3-3 0-6m5 6c-3-3 3-3 0-7m5 7c-3-3 3-3 0-6",
} as const;
