export const stampStyles = ["ceramic", "paper", "meal", "brand", "scissors", "comb", "plant"] as const;
export type LoyaltyStampStyle = typeof stampStyles[number];

export function loyaltyStampStyle(value: unknown): LoyaltyStampStyle {
  return stampStyles.includes(value as LoyaltyStampStyle) ? value as LoyaltyStampStyle : "ceramic";
}

// Shared outlines keep the card preview and both native wallets consistent.
export const stampPaths = {
  plant: "M7 16h10l-1 6H8l-1-6Zm5 0V8m0 4C5 12 4 8 4 4c5 0 8 2 8 8Zm0-3c0-5 3-7 8-7 0 5-2 8-8 8",
  scissors: "M8.5 8.5 21 21M8.5 15.5 21 3M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  comb: "M3 5h18v5H3V5Zm0 5v9m3-9v9m3-9v9m3-9v9m3-9v9m3-9v9m3-9v9",
  ceramic: "M6 8h11v7a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4V8Zm11 1h1.5a3 3 0 0 1 0 6H17M4 22h16M9 3v2m5-2v2",
  paper: "M5 7h14l-2 14H7L5 7Zm-1 0h16V4H4v3Zm3-3V2h10v2M7 11h10M8 17h8",
  meal: "M3 13h18a9 9 0 0 1-18 0Zm-1 9h20M7 10c-3-3 3-3 0-6m5 6c-3-3 3-3 0-7m5 7c-3-3 3-3 0-6",
} as const;
