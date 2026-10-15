"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpLeft, ChevronDown, Coffee, Pause, Play, Search, Share2, Tag, WalletCards } from "lucide-react";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { menuDisplayText } from "@/lib/menu/standalone-menu";
import { kathResponsiveImage } from "@/lib/menu/kath-images";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { MenuServices } from "./menu-services";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import s from "./deli-menu.module.css";

const films = ["/deli-cake/background-01.mp4", "/deli-cake/background-02.mp4", "/deli-cake/background-03.mp4"];
type DataConnection = EventTarget & { saveData?: boolean };

/** Only attach a video URL when playback is permitted; the other films are not prefetched. */
export function DeliBackground() {
  const video = useRef<HTMLVideoElement>(null);
  const filmIndex = useRef(0);
  const wantsPlayback = useRef(false);
  const userPreference = useRef<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  function play() {
    const element = video.current;
    if (!element || document.hidden) return;
    if (!element.getAttribute("src")) element.src = films[filmIndex.current];
    if (element.error) element.load();
    element.muted = true;
    void element.play().catch(() => { setPlaying(false); setFailed(true); });
  }

  useEffect(() => {
    const element = video.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: DataConnection }).connection;
    function preferencesChanged() {
      wantsPlayback.current = userPreference.current ?? (!motion.matches && !connection?.saveData);
      if (wantsPlayback.current) play(); else element?.pause();
    }
    function visibilityChanged() {
      if (document.hidden) element?.pause(); else if (wantsPlayback.current) play();
    }
    preferencesChanged();
    motion.addEventListener("change", preferencesChanged);
    connection?.addEventListener("change", preferencesChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      wantsPlayback.current = false;
      element?.pause();
      motion.removeEventListener("change", preferencesChanged);
      connection?.removeEventListener("change", preferencesChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);

  return <>
    <div className={s.backdrop} aria-hidden="true">
      <video ref={video} className={s.film} data-failed={failed || undefined} muted playsInline preload="none" poster="/deli-cake/background-poster.webp" tabIndex={-1}
        onPlaying={() => { setPlaying(true); setFailed(false); }} onPause={() => setPlaying(false)} onError={() => { setPlaying(false); setFailed(true); }}
        onEnded={() => {
          filmIndex.current = (filmIndex.current + 1) % films.length;
          if (video.current) video.current.src = films[filmIndex.current];
          if (wantsPlayback.current) play();
        }} />
      <div className={s.veil} />
    </div>
    <button type="button" className={s.filmControl} aria-label={playing ? "إيقاف فيديو الخلفية مؤقتًا" : "تشغيل فيديو الخلفية"}
      onClick={() => {
        wantsPlayback.current = !playing;
        userPreference.current = !playing;
        if (playing) video.current?.pause(); else play();
      }}>
      {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}<span>{playing ? "إيقاف الخلفية" : "تشغيل الخلفية"}</span>
    </button>
  </>;
}

function DeliMark({ menu, className }: { menu: StandaloneMenu; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={menu.logoUrl || "/deli-cake/logo.webp"} alt={menu.name} width={240} height={150} className={className} decoding="async" />;
}

function useVisibleOffers(menu: StandaloneMenu) {
  const [now, setNow] = useState(menu.highlights?.asOf ?? 0);
  const hasExpiry = menu.highlights?.items.some(offer => offer.expiresAt != null);
  useEffect(() => {
    if (!hasExpiry) return;
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [hasExpiry, menu.highlights?.asOf]);
  return menu.highlights?.items.filter(offer => offer.showInSpotlight !== false && (offer.expiresAt == null || offer.expiresAt >= now)) ?? [];
}

function HeroPhoto({ product }: { product: StandaloneMenuProduct }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const original = product.images[0].url;
  const responsive = failedSrc === original ? null : kathResponsiveImage(original, "(max-width: 700px) 65vw, 520px");
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={original} {...responsive} alt="" width={800} height={800} fetchPriority="high" decoding="async" onError={() => { if (responsive) setFailedSrc(original); }} />;
}

export function DeliHero({ menu, onShare, onSearch, onSelect }: { menu: StandaloneMenu; onShare: () => void; onSearch: () => void; onSelect: (product: StandaloneMenuProduct) => void }) {
  const offers = useVisibleOffers(menu);
  const photographed = menu.products.filter(product => product.available && product.images[0]);
  const feature = photographed.find(product => /حلو|كيك|تشيز|سويس|cake|dessert/i.test(`${product.category} ${product.name}`)) || photographed[0];
  return <section className={s.opening} aria-label={`مرحبًا في ${menu.name}`}>
    <header className={s.header}>
      <a href="#" className={s.brand} aria-label={menu.name}><DeliMark menu={menu} className={s.logo} /></a>
      <p className={s.headerNote}>تفاصيل تُذاق<span dir="ltr">DELI CAKE</span></p>
      <div className={s.actions}><button type="button" onClick={onSearch} aria-label="البحث في المنيو"><Search aria-hidden="true" /></button><button type="button" onClick={onShare} aria-label="مشاركة المنيو"><Share2 aria-hidden="true" /></button><MenuServices menu={menu} compact /></div>
    </header>
    <div className={`${s.hero}${feature ? "" : ` ${s.withoutImage}`}`}>
      <div className={s.heroCopy}>
        <p className={s.eyebrow}><span />من ديلي كيك إلى لحظتك</p>
        <h1>للحظات الحلوة<br /><em>تفاصيل ديلي</em></h1>
        <p className={s.heroDescription}>قطعة حلا وقهوتك المفضلة<br />اختر ما يشبه مزاجك</p>
        <a href="#rast-menu-items" className={s.explore}>اكتشف المنيو<ArrowDownLeft aria-hidden="true" /></a>
        <div className={s.heroLinks}>
          {menu.loyaltyEnabled && <a href="#deli-membership"><WalletCards aria-hidden="true" />بطاقتك لدى ديلي</a>}
          {!!offers.length && <a href="#deli-offers"><Tag aria-hidden="true" />العروض الحالية</a>}
        </div>
      </div>
      {feature && <div className={s.confection}>
        <span className={s.handwritten} dir="ltr" aria-hidden="true">A little sweetness</span>
        <button type="button" className={s.feature} onClick={() => onSelect(feature)} aria-label={`اكتشف ${feature.name}`}>
          <span className={s.plate}>
            <HeroPhoto product={feature} />
          </span>
          <span className={s.featureCaption}><span><small>من منيو ديلي</small><strong>{menuDisplayText(feature.name)}</strong></span><ArrowUpLeft aria-hidden="true" /></span>
        </button>
        <span className={s.seal} aria-hidden="true">حلاها<br /><b>في تفاصيلها</b><span>DELI CAKE</span></span>
      </div>}
    </div>
    <div className={s.signature}><span>حلا يليق بلحظتك</span><span className={s.signatureEnglish} dir="ltr">SWEET MOMENTS, DELI DETAILS</span><a href="#rast-menu-items">على ذوقك<ArrowDownLeft aria-hidden="true" /></a></div>
  </section>;
}

export function DeliLoyalty({ menu }: { menu: StandaloneMenu }) {
  if (!menu.loyaltyEnabled) return null;
  return <section className={s.membership} id="deli-membership" aria-label="بطاقتك لدى ديلي كيك">
    <Link href={`/loyalty/${encodeURIComponent(menu.slug)}?source=menu`} className={s.memberLink}
      onClick={() => trackBrandEngagement(menu.slug, "menu_loyalty_click")}
      onAuxClick={event => { if (event.button === 1) trackBrandEngagement(menu.slug, "menu_loyalty_click"); }}>
      <span className={s.memberCard} aria-hidden="true"><DeliMark menu={menu} className={s.cardLogo} /><WalletCards /></span>
      <span className={s.memberCopy}><small>أهلًا بك في ديلي</small><strong>مساحة خاصة لبطاقتك</strong><span>تفاصيل بطاقة الولاء من هنا</span></span>
      <LoyaltyLinkContent className={s.memberAction} label="اكتشف بطاقتك" />
    </Link>
  </section>;
}

export function DeliOffers({ menu, onSelect }: { menu: StandaloneMenu; onSelect: (product: StandaloneMenuProduct) => void }) {
  const offers = useVisibleOffers(menu);
  if (!offers.length) return null;
  return <section className={s.offers} id="deli-offers" aria-labelledby="deli-offers-title">
    <div className={s.sectionIntro}><div><p>اختيارات تزيد اللحظة حلا</p><h2 id="deli-offers-title">عروض ديلي</h2></div><Tag aria-hidden="true" /></div>
    <div className={s.offerGrid}>{offers.map(offer => {
      const product = menu.products.find(item => item.id === offer.productId && item.available);
      return <article className={s.offer} key={offer.id}>
        {offer.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={s.offerImage} src={offer.imageUrl} alt="" width={600} height={400} loading="lazy" decoding="async" />
        )}
        <div className={s.offerCopy}><span className={s.offerLabel}><Tag aria-hidden="true" />{offer.discountPercent != null ? `خصم ${offer.discountPercent}٪` : "عرض من ديلي"}</span>
          <h3>{menuDisplayText(offer.title)}</h3><p>{menuDisplayText(offer.description)}</p>
          {offer.productName && <p>{menuDisplayText(offer.productName)}</p>}
          {offer.code && <p>كود العرض <bdi>{offer.code}</bdi></p>}
          {offer.eventDate && <p>الموعد <bdi>{offer.eventDate}</bdi> {offer.eventTime && <bdi>{offer.eventTime}</bdi>}</p>}
          {offer.eventLocation && <p>{offer.eventLocation}</p>}
          {product && <button type="button" onClick={() => onSelect(product)}>تفاصيل المنتج<ArrowUpLeft aria-hidden="true" /></button>}
        </div>
      </article>;
    })}</div>
  </section>;
}

const origins = [
  { name: "كولومبيا", image: "/deli-cake/cards/cards-01.webp" },
  { name: "كولومبيا إل ديفيسو", image: "/deli-cake/cards/cards-02.webp" },
  { name: "إثيوبيا", image: "/deli-cake/cards/cards-03.webp" },
  { name: "أوغندا بوجوكو", image: "/deli-cake/cards/cards-04.webp" },
];

export function DeliOrigins() {
  return <section className={s.origins} aria-labelledby="deli-origins-title">
    <div className={s.sectionIntro}><div><p>وراء كل كوب حكاية</p><h2 id="deli-origins-title">تعرّف على قهوتك</h2></div><Coffee aria-hidden="true" /></div>
    <div className={s.originGrid}>{origins.map(origin => <details className={s.origin} key={origin.image}>
      <summary><span><small>بطاقة البن</small><strong>{origin.name}</strong></span><ChevronDown aria-hidden="true" /></summary>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={origin.image} alt={`بطاقة ${origin.name} الأصلية من ديلي كيك وتفاصيل منشأ البن وإيحاءاته`} width={900} height={1599} loading="lazy" decoding="async" />
      <a href={origin.image} target="_blank" rel="noopener noreferrer">فتح البطاقة بحجم كامل<ArrowUpLeft aria-hidden="true" /></a>
    </details>)}</div>
  </section>;
}

export function DeliClosing({ menu }: { menu: StandaloneMenu }) {
  return <section className={s.closing} aria-label={menu.name}><DeliMark menu={menu} className={s.closingLogo} /><div><p>كل لحظة حلوة تستاهل ديلي</p><h2>نختمها <em>بحلا</em></h2><a href="#rast-menu-items">ارجع لاختيارك المفضل<ArrowUpLeft aria-hidden="true" /></a></div><span className={s.closingNote} dir="ltr">Until the<br /><em>next sweet moment</em></span></section>;
}
