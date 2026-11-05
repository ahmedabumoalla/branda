"use client";

import { WalletCards } from "lucide-react";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";
import { editorialBrand } from "@/lib/menu/editorial-brand";
import { BrandLoyaltyEntry } from "./brand-loyalty-entry";
import s from "./rast-loyalty-entry.module.css";
import kath from "./kath-menu.module.css";

export function KathLoyaltyEntry({ menu }: { menu: StandaloneMenu }) {
  const brand = editorialBrand(menu.slug);
  if (menu.loyaltyEnabled) return <BrandLoyaltyEntry slug={menu.slug} name={brand.name} logoUrl={menu.logoUrl || brand.logo} eyebrow={`لأنك من أهل ${brand.community}`} palette={{ background: "var(--rast-wine)", foreground: "var(--rast-cream)", muted: "var(--rast-blush)", cardBackground: "var(--kath-brown)", cardForeground: "var(--kath-ivory)", cardBack: "var(--kath-gold)", actionBackground: "var(--kath-ivory)", actionForeground: "var(--kath-espresso)" }} />;
  return <section className={`${s.section} ${kath.loyalty}`} aria-label={`بطاقة ولاء ${brand.name}`}>
    <div className={`${s.entry} ${kath.inactiveLoyalty}`}>
      <span className={s.cardIllustration} aria-hidden="true">
        <span className={s.cardBack} />
        <span className={`${s.cardFront} ${kath.loyaltyCard}`}>
          <span className={s.cardTop}><span dir="ltr">{brand.wordmark}</span><WalletCards /></span>
          <span className={s.cardBrand}>
            {/* Preserve the owner's current uploaded mark even while loyalty is disabled */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={menu.logoUrl || brand.logo} alt="" width={62} height={36} />
          </span>
          <span className={s.cardCaption}>بطاقة الولاء</span>
        </span>
      </span>
      <span className={s.copy}>
        <span className={s.eyebrow}>لأنك من أهل {brand.community}</span>
        <span className={s.title}>الولاء والمكافآت</span>
        <span className={s.description}>بطاقة الولاء غير متاحة حاليًا</span>
      </span>
      <span className={`${s.action} ${kath.loyaltyAction}`}>غير مفعّلة حاليًا</span>
    </div>
  </section>;
}
