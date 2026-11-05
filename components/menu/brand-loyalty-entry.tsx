"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { WalletCards } from "lucide-react";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import s from "./brand-loyalty-entry.module.css";

export type BrandLoyaltyEntryPalette = {
  background?: string;
  foreground?: string;
  muted?: string;
  cardBackground?: string;
  cardForeground?: string;
  cardBack?: string;
  actionBackground?: string;
  actionForeground?: string;
};

export type BrandLoyaltyEntryProps = {
  slug: string;
  name: string;
  logoUrl?: string | null;
  id?: string;
  className?: string;
  eyebrow?: string;
  description?: string;
  source?: "menu" | "salon";
  palette?: BrandLoyaltyEntryPalette;
};

/** Presentation only: callers retain their existing loyalty entitlement gate. */
export function BrandLoyaltyEntry({ slug, name, logoUrl, id, className, eyebrow, description, source = "menu", palette }: BrandLoyaltyEntryProps) {
  const style = {
    "--loyalty-entry-background": palette?.background || "#701e32",
    "--loyalty-entry-foreground": palette?.foreground || "#fffaf1",
    "--loyalty-entry-muted": palette?.muted || "#efd5d7",
    "--loyalty-entry-card-background": palette?.cardBackground || "#fffaf1",
    "--loyalty-entry-card-foreground": palette?.cardForeground || "#701e32",
    "--loyalty-entry-card-back": palette?.cardBack || "#a3404d",
    "--loyalty-entry-action-background": palette?.actionBackground || palette?.cardBackground || "#fffaf1",
    "--loyalty-entry-action-foreground": palette?.actionForeground || palette?.cardForeground || "#701e32",
  } as CSSProperties;
  return <section id={id} className={[s.section, className].filter(Boolean).join(" ")} style={style} data-loyalty-entry data-loyalty-layout="compact" aria-label={`بطاقة ولاء ${name}`}>
    <Link href={`/loyalty/${encodeURIComponent(slug)}?source=${source}`} className={s.entry} aria-label={`حمّل بطاقة ولاء ${name}`}
      onClick={() => trackBrandEngagement(slug, "menu_loyalty_click")}
      onAuxClick={event => { if (event.button === 1) trackBrandEngagement(slug, "menu_loyalty_click"); }}>
      <span className={s.cardStack} aria-hidden="true"><span className={s.cardBack} /><span className={s.cardFront}>
        <span className={s.cardTop}><span dir="auto">{name}</span><WalletCards /></span>
        {logoUrl ? <Image className={s.logo} src={logoUrl} alt="" width={72} height={56} unoptimized /> : <span className={s.monogram}>{Array.from(name.trim()).slice(0, 2).join("")}</span>}
        <span className={s.cardCaption}>بطاقة الولاء</span>
      </span></span>
      <span className={s.copy}><span className={s.eyebrow}>{eyebrow || `لأنك من أهل ${name}`}</span><span className={s.title}>بطاقتك معك في كل زيارة</span><span className={s.description}>{description || "حمّل بطاقة الولاء وخلّ لحظاتك معنا أقرب"}</span></span>
      <LoyaltyLinkContent className={s.action} label="حمّل بطاقتك" />
    </Link>
  </section>;
}
