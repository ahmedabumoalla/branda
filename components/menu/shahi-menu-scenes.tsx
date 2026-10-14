"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpLeft, Leaf, Search, Share2, WalletCards } from "lucide-react";
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
    <div className={s.teaScene} aria-hidden="true">
      {/* Editorial atmosphere only; catalog photography remains the owner's */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/menu-art/shahi-tea-atmosphere-v2.webp" alt="" width={1536} height={1024} fetchPriority="high" decoding="async" />
    </div>
    <header className={s.topbar}>
      <a href="#" className={s.brandLink} aria-label={menu.name}><ShahiMark menu={menu} className={s.brandLogo} /></a>
      <span className={s.topNote}>للّحظات اللي تستاهل نروّق لها</span>
      <div className={s.topTools}>
        <button className={s.iconButton} type="button" onClick={onSearch} aria-label="البحث في المنيو"><Search aria-hidden="true" /></button>
        <button className={s.iconButton} type="button" onClick={onShare} aria-label="مشاركة رابط المنيو"><Share2 aria-hidden="true" /></button>
        <MenuServices menu={menu} compact />
      </div>
    </header>
    <div className={s.heroBody}>
      <div className={s.heroCopy}>
        <p className={s.eyebrow}><Leaf aria-hidden="true" />مزاج يبدأ من أول رشفة</p>
        <h1>شاهي يُـروّق<span>وهيل يطيّب الخاطر</span></h1>
        <p className={s.intro}>خذ من زحمة اليوم لحظة لك<br />شاهي على مهل وجلسة تحلى بأهلها</p>
        <a className={s.explore} href="#rast-menu-items">اكتشف قائمتنا<span><ArrowDownLeft aria-hidden="true" /></span></a>
        <span className={s.heroCaption} dir="ltr">TEA &amp; HEEL / THE ART OF SLOW MOMENTS</span>
      </div>
      <div className={s.sceneNote} aria-hidden="true"><span>على رواق</span><span>شاهي وهيل</span></div>
    </div>
    <div className={s.heroEnd}><span><Leaf aria-hidden="true" />ريحة هيل ودفا شاهي</span><a href="#rast-menu-items">لحظتك الحلوة تبدأ هنا<ArrowDownLeft aria-hidden="true" /></a></div>
  </section>;
}

export function ShahiLoyalty({ menu }: { menu: StandaloneMenu }) {
  const content = <><span className={s.loyaltySeal} aria-hidden="true"><WalletCards /></span><span className={s.loyaltyCopy}><small>من أهل شاهي وهيل</small><strong>{menu.loyaltyEnabled ? "كل زيارة تقرّبك لمكافأتك" : "الولاء والمكافآت"}</strong><span>{menu.loyaltyEnabled ? "بطاقتك معك ولحظاتك محسوبة" : "بطاقة الولاء غير متاحة حاليًا"}</span></span>{menu.loyaltyEnabled ? <LoyaltyLinkContent className={s.loyaltyAction} /> : null}</>;
  return <section className={s.membership} aria-label="بطاقة ولاء شاهي وهيل">{menu.loyaltyEnabled ? <Link className={s.membershipLink} href={`/loyalty/${encodeURIComponent(menu.slug)}?source=menu`} aria-label="حمّل بطاقة ولاء شاهي وهيل" onClick={() => trackBrandEngagement(menu.slug, "menu_loyalty_click")} onAuxClick={event => { if (event.button === 1) trackBrandEngagement(menu.slug, "menu_loyalty_click"); }}>{content}</Link> : <div className={s.membershipLink}>{content}</div>}</section>;
}

export function ShahiClosing({ menu }: { menu: StandaloneMenu }) {
  return <section className={s.farewell} aria-label={menu.name}><ShahiMark menu={menu} className={s.closingLogo} /><div><p>تطيب الجلسة بشوفتكم</p><h2>نترك لك مكان<br />ونجهّز لك شاهي</h2></div><a href="#rast-menu-items">نرجع للقائمة<ArrowUpLeft aria-hidden="true" /></a></section>;
}
