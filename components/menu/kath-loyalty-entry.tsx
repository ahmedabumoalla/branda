"use client";

import Link from "next/link";
import { WalletCards } from "lucide-react";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";
import s from "./rast-loyalty-entry.module.css";
import kath from "./kath-menu.module.css";

export function KathLoyaltyEntry({ menu }: { menu: StandaloneMenu }) {
  const content = <>
    <span className={s.cardIllustration} aria-hidden="true">
      <span className={s.cardBack} />
      <span className={`${s.cardFront} ${kath.loyaltyCard}`}>
        <span className={s.cardTop}><span dir="ltr">KATH</span><WalletCards /></span>
        <span className={s.cardBrand}>
          {/* Keep the brand's own uploaded mark, including later dashboard replacements */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={menu.logoUrl || "/menu-logos/kath-transparent-v1.webp"} alt="" width={62} height={36} />
        </span>
        <span className={s.cardCaption}>بطاقة الولاء</span>
      </span>
    </span>
    <span className={s.copy}>
      <span className={s.eyebrow}>لأنك من أهل كاث</span>
      <span className={s.title}>{menu.loyaltyEnabled ? "بطاقتك معك في كل زيارة" : "الولاء والمكافآت"}</span>
      <span className={s.description}>{menu.loyaltyEnabled ? "حمّل بطاقة الولاء وخلي لحظاتك معنا أقرب" : "بطاقة الولاء غير متاحة حاليًا"}</span>
    </span>
    {menu.loyaltyEnabled ? <LoyaltyLinkContent className={`${s.action} ${kath.loyaltyAction}`} />
      : <span className={`${s.action} ${kath.loyaltyAction}`}>غير مفعّلة حاليًا</span>}
  </>;
  return <section className={`${s.section} ${kath.loyalty}`} aria-label="بطاقة ولاء مقهى كاث">
    {menu.loyaltyEnabled ? <Link href={`/loyalty/${encodeURIComponent(menu.slug)}?source=menu`} className={s.entry}
      aria-label="حمّل بطاقة ولاء مقهى كاث"
      onClick={() => trackBrandEngagement(menu.slug, "menu_loyalty_click")}
      onAuxClick={event => { if (event.button === 1) trackBrandEngagement(menu.slug, "menu_loyalty_click"); }}>{content}</Link>
      : <div className={`${s.entry} ${kath.inactiveLoyalty}`}>{content}</div>}
  </section>;
}
