"use client";

import Link from "next/link";
import Image from "next/image";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { ArrowUpLeft, WalletCards } from "lucide-react";
import s from "./rast-loyalty-entry.module.css";

export function RastLoyaltyEntry() {
  return <section className={s.section} aria-label="بطاقة ولاء مقهى الكواكب">
    <Link href="/loyalty/rast?source=menu" prefetch={false} className={s.entry} aria-label="حمّل بطاقة ولاء مقهى الكواكب"
      onClick={() => trackBrandEngagement("rast", "menu_loyalty_click")}
      onAuxClick={event => { if (event.button === 1) trackBrandEngagement("rast", "menu_loyalty_click"); }}>
      <span className={s.cardIllustration} aria-hidden="true">
        <span className={s.cardBack} />
        <span className={s.cardFront}>
          <span className={s.cardTop}><span dir="ltr">KAWAKIB</span><WalletCards /></span>
          <span className={s.cardBrand}><Image src="/menu-logos/kawakib-transparent-20261008.png" alt="" width={48} height={28} style={{ objectFit: "contain" }} /></span>
          <span className={s.cardCaption}>بطاقة الولاء</span>
        </span>
      </span>
      <span className={s.copy}>
        <span className={s.eyebrow}>لأنك من أهل مقهى الكواكب</span>
        <span className={s.title}>بطاقتك معك في كل زيارة</span>
        <span className={s.description}>حمّل بطاقة الولاء وخلي لحظاتك معنا أقرب</span>
      </span>
      <span className={s.action}>حمّل بطاقتك<ArrowUpLeft aria-hidden="true" /></span>
    </Link>
  </section>;
}
