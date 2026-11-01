import Image from "next/image";
import { loyaltyStampStyle, stampPaths, type LoyaltyStampStyle } from "@/lib/loyalty/stamp-style";

export function StampGlyph({ style, logoUrl, artworkUrl }: { style?: LoyaltyStampStyle; logoUrl?: string | null; artworkUrl?: string }) {
  if (artworkUrl) return <Image src={artworkUrl} width={72} height={72} sizes="72px" alt="" aria-hidden="true" data-stamp-artwork="plant" />;
  const selected = loyaltyStampStyle(style);
  if (selected === "brand" && logoUrl) return <Image unoptimized src={logoUrl} width={40} height={40} alt="" aria-hidden="true" style={{ width: "76%", height: "68%", objectFit: "contain" }} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={stampPaths[selected === "brand" ? "ceramic" : selected]} /></svg>;
}
