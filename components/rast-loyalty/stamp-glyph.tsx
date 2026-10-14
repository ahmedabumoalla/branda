import Image from "next/image";
import { loyaltyStampStyle, stampPaths, type LoyaltyStampStyle } from "@/lib/loyalty/stamp-style";

export function StampGlyph({ style, logoUrl }: { style?: LoyaltyStampStyle; logoUrl?: string | null }) {
  const selected = loyaltyStampStyle(style);
  if (selected === "brand" && logoUrl) return <Image unoptimized src={logoUrl} width={32} height={32} alt="" aria-hidden="true" style={{ width: "60%", height: "60%", objectFit: "contain" }} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={stampPaths[selected === "brand" ? "ceramic" : selected]} /></svg>;
}
