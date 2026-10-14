"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpLeft, Coffee, Download, Search, Share2, WalletCards } from "lucide-react";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { kathResponsiveImage } from "@/lib/menu/kath-images";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { MenuServices } from "./menu-services";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import s from "./taza-menu.module.css";

function TazaMark({ menu, className }: { menu: StandaloneMenu; className: string }) {
  // Preserve the owner's current logo and its original colors
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={menu.logoUrl || "/menu-logos/taza-extracted-20261014.webp"} alt={menu.name} width={180} height={90} className={className} decoding="async" />;
}

function ProductPhoto({ product, secondary = false }: { product: StandaloneMenuProduct; secondary?: boolean }) {
  const src = product.images[0]?.url;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} {...kathResponsiveImage(src, secondary ? "(max-width: 700px) 36vw, 220px" : "(max-width: 700px) 82vw, 520px")} alt="" width={1080} height={1080} fetchPriority={secondary ? undefined : "high"} decoding="async" />;
}

export function TazaHero({ menu, onSearch, onShare, onSelect }: { menu: StandaloneMenu; onSearch: () => void; onShare: () => void; onSelect: (product: StandaloneMenuProduct) => void }) {
  const available = menu.products.filter(product => product.available && product.images.length);
  const feature = available.find(product => product.name === "إسبريسو فاخر") || available[0];
  const sweet = available.find(product => product.name === "ترايفل مانجو") || available.find(product => product.category === "الحلويات" && product.id !== feature?.id);
  return <section className={s.opening} aria-label={`مرحبًا في ${menu.name}`}>
    <header className={s.header}>
      <a href="#" aria-label={menu.name} className={s.brand}><TazaMark menu={menu} className={s.logo} /><span dir="ltr">TAZA COFFEE</span></a>
      <p className={s.headerNote}>تفاصيل صغيرة <span>تصنع لحظة تستاهل</span></p>
      <div className={s.actions}><button type="button" onClick={onSearch} aria-label="البحث في المنيو"><Search aria-hidden="true" /></button><button type="button" onClick={onShare} aria-label="مشاركة رابط المنيو"><Share2 aria-hidden="true" /></button><MenuServices menu={menu} compact /></div>
    </header>
    <div className={`${s.hero}${feature ? "" : ` ${s.withoutImage}`}`}>
      <span className={s.heroWord} aria-hidden="true" dir="ltr">TAZA</span>
      <div className={s.heroInner}>
        <div className={s.copy}>
          <p className={s.eyebrow}><span />قهوة مختصة وحلا على ذوقك</p>
          <h1>خذ لحظة<br /><span>خلّها <em>تازا</em></span></h1>
          <p className={s.description}>رشفة تضبط مزاجك ولقمة تكمّلها<br />هنا التفاصيل الصغيرة لها طعم ثاني</p>
          <a href="#rast-menu-items" className={s.explore}>اكتشف المنيو<ArrowDownLeft aria-hidden="true" /></a>
          <nav className={s.quickServices} aria-label="خدمات تازا">
            {menu.loyaltyEnabled && <a href="#taza-membership"><WalletCards aria-hidden="true" /><span>بطاقتك ومكافآتك</span></a>}
            <MenuServices menu={menu} offersTrigger />
          </nav>
        </div>
        {feature && <div className={s.composition}>
          <span className={s.orbit} aria-hidden="true" />
          <span className={s.photoNote} dir="ltr">TAZA COFFEE · A LITTLE DAILY RITUAL</span>
          <button type="button" className={s.feature} onClick={() => onSelect(feature)} aria-label={`اكتشف ${feature.name}`}>
            <span className={s.photograph}><ProductPhoto product={feature} /></span>
            <span className={s.featureCaption}><span><small>بداية على مزاجك</small><strong>{feature.name}</strong></span><ArrowUpLeft aria-hidden="true" /></span>
          </button>
          {sweet && <button type="button" className={s.sweet} onClick={() => onSelect(sweet)} aria-label={`اكتشف ${sweet.name}`}><ProductPhoto product={sweet} secondary /><span>{sweet.name}<ArrowUpLeft aria-hidden="true" /></span></button>}
          <span className={s.seal} aria-hidden="true"><Coffee /><span>قهوة وحلا<br /><b>ولحظة لك</b></span></span>
        </div>}
      </div>
    </div>
    <div className={s.ribbon}><span><Coffee aria-hidden="true" />قهوة تستاهل الروقان</span><span dir="ltr">GOOD COFFEE / SWEET COMPANY</span><span>والحلا يكمل الحكاية<ArrowDownLeft aria-hidden="true" /></span></div>
  </section>;
}

export function TazaLoyalty({ menu }: { menu: StandaloneMenu }) {
  if (!menu.loyaltyEnabled) return null;
  return <section className={s.membership} id="taza-membership" aria-label="بطاقة ولاء تازا">
    <div className={s.membershipPanel}>
      <div className={s.cardStage} aria-hidden="true"><span className={s.cardShadow} /><div className={s.cardArt}><div className={s.cardTop}><TazaMark menu={menu} className={s.cardLogo} /><WalletCards /></div><span className={s.cardTitle}>لأهل الذوق</span><span className={s.cardRule} /><span className={s.cardBottom}><span dir="ltr">TAZA MEMBERS</span><Coffee /></span></div><span className={s.cardTag}>كل زيارة تقرّبك</span></div>
      <div className={s.memberCopy}><p className={s.memberEyebrow}>أهل تازا لهم أكثر</p><h2>ذوقك الحلو<br /><span>يرجع لك مكافأة</span></h2><p>خلّ بطاقتك في جوالك واجمع أختامك مع كل زيارة</p>
        <Link className={s.memberAction} href={`/loyalty/${encodeURIComponent(menu.slug)}?source=menu`} onClick={() => trackBrandEngagement(menu.slug, "menu_loyalty_click")} onAuxClick={event => { if (event.button === 1) trackBrandEngagement(menu.slug, "menu_loyalty_click"); }}><Download aria-hidden="true" /><LoyaltyLinkContent label="اضغط هنا لتحميل بطاقة الولاء" /></Link>
        <p className={s.memberHint}>سجّل بياناتك ثم أضف البطاقة إلى محفظة جوالك</p>
      </div>
      <span className={s.memberWord} aria-hidden="true" dir="ltr">MEMBERS</span>
    </div>
  </section>;
}

export function TazaClosing({ menu }: { menu: StandaloneMenu }) {
  return <section className={s.closing} aria-label={menu.name}><span className={s.closingWord} aria-hidden="true" dir="ltr">TAZA</span><div className={s.closingContent}><p>للقهوة وقت ولتازا مكان</p><h2>لنا معك <span>لحظة ثانية</span></h2><a href="#rast-menu-items">وش تختار هالمرة؟<ArrowUpLeft aria-hidden="true" /></a></div><TazaMark menu={menu} className={s.closingLogo} /></section>;
}
