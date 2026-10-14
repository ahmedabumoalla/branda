"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpLeft, Search, Share2, WalletCards } from "lucide-react";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";
import { editorialBrand } from "@/lib/menu/editorial-brand";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { MenuServices } from "./menu-services";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import s from "./shahi-majlis.module.css";

function ShahiMark({ menu, className }: { menu: StandaloneMenu; className: string }) {
  // Preserve the owner's current original-color logo, including dashboard replacements
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={menu.logoUrl || editorialBrand(menu.slug).logo} alt={menu.name} width={180} height={104} className={className} decoding="async" />;
}

export function ShahiHero({ menu, onSearch, onShare }: { menu: StandaloneMenu; onSearch: () => void; onShare: () => void }) {
  return <section className={s.majlis} aria-label="مرحبًا في شاهي وهيل">
    <header className={s.topbar}>
      <a href="#" className={s.brandLink} aria-label={menu.name}><ShahiMark menu={menu} className={s.brandLogo} /></a>
      <span className={s.topNote}>حيّاك على فنجال ومجلس طيّب</span>
      <div className={s.topTools}>
        <button className={s.iconButton} type="button" onClick={onSearch} aria-label="البحث في المنيو"><Search aria-hidden="true" /></button>
        <button className={s.iconButton} type="button" onClick={onShare} aria-label="مشاركة رابط المنيو"><Share2 aria-hidden="true" /></button>
        <MenuServices menu={menu} compact />
      </div>
    </header>
    <div className={s.heroBody}>
      <div className={s.heroCopy}>
        <p className={s.eyebrow}><span aria-hidden="true" />شاهي وهيل</p>
        <h1>للشاهي وقته<br /><span>وللجلسة أهلها</span></h1>
        <p className={s.intro}>ريحة الهيل وأول رشفة شاهي<br />وباقي الحكاية على ذوقك</p>
        <a className={s.explore} href="#rast-menu-items">تفضّل على قائمتنا<ArrowDownLeft aria-hidden="true" /></a>
        <span className={s.heroCaption} dir="ltr">TEA &amp; HEEL — A MOMENT TO SAVOUR</span>
      </div>
      <figure className={s.teaPortrait}>
        <div className={s.teaArch}>
          {/* Decorative tea atmosphere, never substituted for a catalog product */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/menu-art/shahi-tea-editorial-v1.webp" alt="" width={1536} height={1024} fetchPriority="high" decoding="async" />
        </div>
        <figcaption><span>على مهل</span><span>كل رشفة لها حكاية</span></figcaption>
      </figure>
    </div>
    <div className={s.heroEnd} aria-hidden="true"><span>شاهي يعدّل المزاج</span><span className={s.ornament}>✦</span><span>وهيل يطيّب الجلسة</span></div>
  </section>;
}

export function ShahiLoyalty({ menu }: { menu: StandaloneMenu }) {
  const content = <><span className={s.loyaltySeal} aria-hidden="true"><WalletCards /></span><span className={s.loyaltyCopy}><small>من أهل شاهي وهيل</small><strong>{menu.loyaltyEnabled ? "كل زيارة تقرّبك لمكافأتك" : "الولاء والمكافآت"}</strong><span>{menu.loyaltyEnabled ? "بطاقتك معك ولحظاتك محسوبة" : "بطاقة الولاء غير متاحة حاليًا"}</span></span>{menu.loyaltyEnabled ? <LoyaltyLinkContent className={s.loyaltyAction} /> : null}</>;
  return <section className={s.membership} aria-label="بطاقة ولاء شاهي وهيل">{menu.loyaltyEnabled ? <Link className={s.membershipLink} href={`/loyalty/${encodeURIComponent(menu.slug)}?source=menu`} aria-label="حمّل بطاقة ولاء شاهي وهيل" onClick={() => trackBrandEngagement(menu.slug, "menu_loyalty_click")} onAuxClick={event => { if (event.button === 1) trackBrandEngagement(menu.slug, "menu_loyalty_click"); }}>{content}</Link> : <div className={s.membershipLink}>{content}</div>}</section>;
}

export function ShahiClosing({ menu }: { menu: StandaloneMenu }) {
  return <section className={s.farewell} aria-label={menu.name}><ShahiMark menu={menu} className={s.closingLogo} /><div><p>تطيب الجلسة بشوفتكم</p><h2>نترك لك مكان<br />ونجهّز لك شاهي</h2></div><a href="#rast-menu-items">نرجع للقائمة<ArrowUpLeft aria-hidden="true" /></a></section>;
}
