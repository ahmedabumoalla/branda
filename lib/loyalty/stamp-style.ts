export const stampStyles = ["ceramic", "paper", "meal", "brand"] as const;
export type LoyaltyStampStyle = typeof stampStyles[number];

export function loyaltyStampStyle(value: unknown): LoyaltyStampStyle {
  return stampStyles.includes(value as LoyaltyStampStyle) ? value as LoyaltyStampStyle : "ceramic";
}

// Shared outlines keep the card preview and both native wallets consistent.
export const stampPaths = {
  ceramic: "M6 8h11v7a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4V8Zm11 1h1.5a3 3 0 0 1 0 6H17M4 22h16M9 3v2m5-2v2",
  paper: "M5 7h14l-2 14H7L5 7Zm-1 0h16V4H4v3Zm3-3V2h10v2M7 11h10M8 17h8",
  meal: "M3 13h18a9 9 0 0 1-18 0Zm-1 9h20M7 10c-3-3 3-3 0-6m5 6c-3-3 3-3 0-7m5 7c-3-3 3-3 0-6",
} as const;
