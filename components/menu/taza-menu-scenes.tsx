"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpLeft, Coffee, Search, Share2, WalletCards } from "lucide-react";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { kathResponsiveImage } from "@/lib/menu/kath-images";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { MenuServices } from "./menu-services";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import s from "./taza-menu.module.css";

function TazaMark({ menu, className }: { menu: StandaloneMenu; className: string }) {
  // The dashboard logo remains authoritative after the initial identity setup
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={menu.logoUrl || "/menu-logos/taza-extracted-20261014.webp"} alt={menu.name} width={180} height={90} className={className} decoding="async" />;
}

export function TazaHero({ menu, onSearch, onShare, onSelect }: { menu: StandaloneMenu; onSearch: () => void; onShare: () => void; onSelect: (product: StandaloneMenuProduct) => void }) {
  const feature = menu.products.find(product => product.name === "إسبريسو فاخر" && product.available && product.images.length) || menu.products.find(product => product.available && product.images.length);
  const image = feature?.images[0]?.url;
  const responsive = image ? kathResponsiveImage(image, "(max-width: 700px) 100vw, 65vw") : null;
  return <section className={s.opening} aria-label={`مرحبًا في ${menu.name}`}>
    <header className={s.header}>
      <a href="#" aria-label={menu.name} className={s.brand}><TazaMark menu={menu} className={s.logo} /><span dir="ltr">TAZA COFFEE</span></a>
      <p className={s.headerNote}>قهوة نختارها بذوق <span>ولحظة تعيشها على مهلك</span></p>
      <div className={s.actions}><button type="button" onClick={onSearch} aria-label="البحث في المنيو"><Search aria-hidden="true" /></button><button type="button" onClick={onShare} aria-label="مشاركة رابط المنيو"><Share2 aria-hidden="true" /></button><MenuServices menu={menu} compact /></div>
    </header>
    <nav className={s.quickServices} aria-label="خدمات تازا">
      {menu.loyaltyEnabled && <Link href={`/loyalty/${encodeURIComponent(menu.slug)}?source=menu`}><WalletCards aria-hidden="true" /><span>بطاقة الولاء</span><ArrowUpLeft aria-hidden="true" /></Link>}
      <MenuServices menu={menu} offersTrigger />
    </nav>
    <div className={`${s.hero}${image ? "" : ` ${s.withoutImage}`}`}>
      {image && <div className={s.photograph} aria-hidden="true">
        {/* Supplied product photography, linked to the current catalog image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} {...responsive} alt="" width={1080} height={1080} fetchPriority="high" decoding="async" />
      </div>}
      <div className={s.geometry} aria-hidden="true" />
      <div className={s.heroInner}>
        <div className={s.copy}><p className={s.eyebrow}><span />قهوة مختصة وحلا</p><h1>ذوق له <em>طابع</em><br />ولحظتك <span>تازا</span></h1><p className={s.description}>من دفء الإسبريسو إلى انتعاش القهوة الباردة<br />اختَر قهوتك واترك للحلا بقية الحكاية</p><a href="#rast-menu-items" className={s.explore}>على ذوقك<ArrowDownLeft aria-hidden="true" /></a><p className={s.english} dir="ltr">GOOD COFFEE. YOUR KIND OF MOMENT.</p></div>
        {feature && <button type="button" className={s.feature} onClick={() => onSelect(feature)} aria-label={`اكتشف ${feature.name}`}><span><small>لحظتك الأولى</small><strong>{feature.name}</strong></span><ArrowUpLeft aria-hidden="true" /></button>}
      </div>
    </div>
    <div className={s.ribbon}><span><Coffee aria-hidden="true" />من أول رشفة</span><span dir="ltr">ESPRESSO / V60 / SOMETHING SWEET</span><a href="#rast-menu-items">إلى آخر لقمة<ArrowDownLeft aria-hidden="true" /></a></div>
  </section>;
}

export function TazaLoyalty({ menu }: { menu: StandaloneMenu }) {
  if (!menu.loyaltyEnabled) return null;
  return <section className={s.membership} aria-label="بطاقة ولاء تازا"><Link className={s.membershipLink} href={`/loyalty/${encodeURIComponent(menu.slug)}?source=menu`} onClick={() => trackBrandEngagement(menu.slug, "menu_loyalty_click")} onAuxClick={event => { if (event.button === 1) trackBrandEngagement(menu.slug, "menu_loyalty_click"); }}>
    <span className={s.cardArt} aria-hidden="true"><TazaMark menu={menu} className={s.cardLogo} /><span>TAZA MEMBERS</span><WalletCards /></span>
    <span className={s.memberCopy}><small>من أهل تازا</small><strong>لذوقك الجميل مكافأة</strong><span>اجمع أختامك وخلّ الزيارة الجاية أحلى</span></span>
    <LoyaltyLinkContent className={s.memberAction} />
  </Link></section>;
}

export function TazaClosing({ menu }: { menu: StandaloneMenu }) {
  return <section className={s.closing} aria-label={menu.name}><TazaMark menu={menu} className={s.closingLogo} /><div><p>نفس الذوق في كل زيارة</p><h2>نلتقي على <span>تازا</span></h2></div><a href="#rast-menu-items">خلّها لحظة ثانية<ArrowUpLeft aria-hidden="true" /></a></section>;
}
