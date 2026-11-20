import Image from "next/image";
import { loyaltyStampStyle, stampPaths, type LoyaltyStampStyle } from "@/lib/loyalty/stamp-style";

export function StampGlyph({ style, logoUrl, stampLogo }: { style?: LoyaltyStampStyle; logoUrl?: string | null; stampLogo?: string | null }) {
  const selected = loyaltyStampStyle(style);
  if (selected === "brand" && stampLogo) {
    // The logo is a mask filled with the stamp colour, so it reads on every card palette in both states.
    const mask = `url("${stampLogo}") center / contain no-repeat`;
    return <span aria-hidden="true" data-stamp-logo="" style={{ width: "62%", height: "62%", backgroundColor: "currentColor", WebkitMask: mask, mask }} />;
  }
  if (selected === "brand" && logoUrl) return <Image unoptimized src={logoUrl} width={40} height={40} alt="" aria-hidden="true" style={{ width: "76%", height: "68%", objectFit: "contain" }} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-stamp-icon={selected}><path d={stampPaths[selected === "brand" ? "ceramic" : selected]} /></svg>;
}
