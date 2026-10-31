"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowUpLeft, CarFront, Store, Check, ChevronLeft, ChevronRight, Coffee, Gift, Search, Share2, Sparkles, WalletCards } from "lucide-react";
import { matchesMenuSearch, menuDisplayText, type StandaloneHighlight, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { productFinalPrice } from "@/lib/mock/menu";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { menuEntryUrl, startMenuAtTop } from "@/lib/menu/menu-entry-scroll";
import { ProductDetails } from "./bistro-menu";
import { ProductOfferBadge, ProductOfferDetails } from "./product-offer-details";
import { MenuServices } from "./menu-services";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import base from "./bistro-menu.module.css";
import s from "./loco-menu.module.css";

type Loyalty = { purchasesRequired: number; rewardName: string };

function Photo({ src, alt, eager = false, className = "" }: { src?: string | null; alt: string; eager?: boolean; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <span className={`${s.photoFallback} ${className}`} role="img" aria-label={alt}><Coffee aria-hidden="true" /><span>LOCÓ</span></span>;
  // Supplied LOCO photography and later owner uploads retain their original appearance.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" onError={() => setFailed(src)} />;
}

function Price({ product }: { product: StandaloneMenuProduct }) {
  const price = productFinalPrice(product.price, product.promo);
  return <span className={s.price}>{price !== product.price && <del>{product.price.toLocaleString("en-US")}</del>}<bdi>{(product.priceOptions?.length ? product.priceOptions.map(value => productFinalPrice(value, product.promo)) : [price]).map(value => value.toLocaleString("en-US", { maximumFractionDigits: 2 })).join(" / ")}</bdi><span>ريال</span></span>;
}

export function LocoMenu({ menu: source, loyalty }: { menu: StandaloneMenu; loyalty: Loyalty | null }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState("original");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offerId, setOfferId] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(source.highlights?.asOf ?? 0);
  useEffect(() => startMenuAtTop(root.current), []);
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);
  useEffect(() => {
    if (!source.highlights?.items.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [source.highlights]);
  const menu: StandaloneMenu = { ...source, products: source.products.map(p => ({ ...p, promo: getPublishedOfferPromo(p, source.highlights, now), offers: getProductOffers(p, source.highlights, now) })) };
  const photos = menu.products.filter(p => p.images.length && p.available);
  const hero = photos.find(p => /بريوش دجاج/.test(p.name)) ?? photos.find(p => /بيكان/.test(p.name)) ?? photos[0];
  const second = photos.find(p => /سبانش.*بارد/.test(p.name)) ?? photos.find(p => p.id !== hero?.id);
  const published = (menu.highlights?.items ?? []).filter(o => o.showInSpotlight !== false && (o.expiresAt == null || o.expiresAt >= now));
  const discoveries = [hero, second].filter((p): p is StandaloneMenuProduct => Boolean(p));
  const offers: StandaloneHighlight[] = published.length ? published : discoveries.map(p => ({ id: `discover-${p.id}`, title: p.name, description: p.description, imageUrl: p.images[0]?.url ?? null, productId: p.id, discountPercent: null, code: null, expiresAt: null }));
  const activeOffer = offers.find(o => o.id === offerId) ?? offers[0];
  const offerProduct = menu.products.find(p => p.id === activeOffer?.productId);
  const categories = [...menu.categories];
  if (menu.products.some(p => !p.categoryId)) categories.push({ id: "uncategorized", name: "أصناف أخرى", description: null });
  const visible = menu.products.filter(p => (category === "all" || (p.categoryId || "uncategorized") === category) && matchesMenuSearch(p, query));
  if (order !== "original") visible.sort((a, b) => (productFinalPrice(a.price, a.promo) - productFinalPrice(b.price, b.promo)) * (order === "low" ? 1 : -1));
  const sections = categories.map(c => ({ ...c, products: visible.filter(p => (p.categoryId || "uncategorized") === c.id) })).filter(c => c.products.length);
  const selected = menu.products.find(p => p.id === selectedId);
  const browseProducts = selected && !visible.some(p => p.id === selected.id) ? menu.products : sections.flatMap(c => c.products);
  function browse(direction: number) {
    const index = browseProducts.findIndex(p => p.id === selectedId);
    if (browseProducts.length) setSelectedId(browseProducts[(index + direction + browseProducts.length) % browseProducts.length].id);
  }
  function chooseCategory(id: string) {
    setCategory(id);
    document.getElementById("loco-catalog")?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function focusSearch() { search.current?.scrollIntoView({ block: "center" }); search.current?.focus({ preventScroll: true }); }
  async function share() {
    try {
      const url = menuEntryUrl(window.location.origin, menu.slug) + (menu.branch ? `?branch=${encodeURIComponent(menu.branch.slug)}` : "");
      if (navigator.share) await navigator.share({ title: `${menu.name} | المنيو`, url });
      else { await navigator.clipboard.writeText(url); setMessage("تم نسخ رابط المنيو"); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("يمكنك نسخ الرابط من شريط العنوان"); }
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setMessage(""), 4000);
  }
  const loyaltyHref = `/loyalty/${encodeURIComponent(menu.slug)}?source=menu`;
  const logo = menu.logoUrl || "/loco/logo.svg";
  return <main ref={root} className={`${base.menu} ${s.page}`} dir="rtl" data-loco-menu="original-v1">
    <a href="#loco-catalog" className={base.skipLink}>انتقل إلى الأصناف</a>
    <section className={s.opening} id="loco-top" aria-labelledby="loco-title">
      <header className={s.header}>
        <a href="#loco-top" className={s.smallMark} aria-label="لوكو"><Photo src={logo} alt="لوكو" eager /></a>
        <p>قهوة وحلا <span>ومزاج لوكو</span></p>
        <div className={s.actions}><button type="button" onClick={focusSearch} aria-label="البحث في المنيو"><Search aria-hidden="true" /></button><button type="button" onClick={share} aria-label="مشاركة المنيو"><Share2 aria-hidden="true" /></button><MenuServices menu={menu} compact /></div>
      </header>
      {!!menu.branches?.length && <nav className={s.branchBar} aria-label="الفروع">{menu.branches.map(branch => { const Icon = /drive/.test(branch.slug) ? CarFront : Store; return <a key={branch.id} href={`/menu/${menu.slug}?branch=${branch.slug}`} aria-current={menu.branch?.id === branch.id ? "page" : undefined}><Icon aria-hidden="true" />{branch.name}</a>; })}</nav>}
      <div className={s.masthead}><Photo src={logo} alt="LOCÓ" eager /><span className={s.mastheadNote} dir="ltr">A LITTLE<br />MORE LOCO</span><Sparkles className={s.mastheadStar} aria-hidden="true" /></div>
      <div className={s.hero}>
        <div className={s.heroCopy}><p className={s.kicker}>أهلًا بك في لوكو{menu.branch ? ` — ${menu.branch.name}` : ""}</p><h1 id="loco-title">مزاجك له<br /><em>لوكو</em></h1><p className={s.description}>قهوتك المفضلة ولقمة تحبّها<br />اختر لحظتك على ذوقك</p><a className={s.primary} href="#loco-catalog">وش نجهّز لك؟<ArrowDownLeft aria-hidden="true" /></a><div className={s.heroLinks}>{menu.loyaltyEnabled && loyalty && <a href="#loco-loyalty"><WalletCards aria-hidden="true" />بطاقتك في لوكو</a>}{offers.length > 0 && <a href="#loco-offers">تستاهل التجربة<ArrowDownLeft aria-hidden="true" /></a>}</div></div>
        {hero && <div className={s.heroStage}><span className={s.sunburst} aria-hidden="true">على<br />مزاجك</span><motion.button className={s.heroDish} type="button" onClick={() => setSelectedId(hero.id)} initial={reduce ? false : { opacity: 0, y: 28, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: .65 }} aria-label={`اكتشف ${hero.name}`}><Photo src={hero.images[0]?.url} alt={hero.name} eager /><span><b>{menuDisplayText(hero.name)}</b><Price product={hero} /><ArrowUpLeft aria-hidden="true" /></span></motion.button>{second && <button className={s.heroSip} type="button" onClick={() => setSelectedId(second.id)} aria-label={`اكتشف ${second.name}`}><Photo src={second.images[0]?.url} alt={second.name} /><span>{menuDisplayText(second.name)}<ArrowUpLeft aria-hidden="true" /></span></button>}<span className={s.stageCaption} dir="ltr">MADE FOR YOUR KIND OF DAY</span></div>}
      </div>
      <div className={s.ribbon} aria-hidden="true"><span>رشفة</span><Sparkles /><span>لقمة</span><Sparkles /><span>لحظة حلوة</span><Sparkles /><span dir="ltr">LOCÓ MOOD</span></div>
    </section>
    {menu.loyaltyEnabled && loyalty && <section className={s.membership} id="loco-loyalty" aria-labelledby="loco-loyalty-title"><div className={s.membershipCopy}><p className={s.kicker}>للّي لوكو على باله</p><h2 id="loco-loyalty-title">زيارتك تحلى<br /><span>ومكافأتك تقرّب</span></h2><p>اجمع {loyalty.purchasesRequired.toLocaleString("ar-SA")} أختام واحصل على {loyalty.rewardName}</p><Link href={loyaltyHref} onClick={() => trackBrandEngagement(menu.slug, "menu_loyalty_click")} className={s.primary}><LoyaltyLinkContent label="افتح بطاقة الولاء" /><ArrowUpLeft aria-hidden="true" /></Link></div><Link href={loyaltyHref} className={s.memberCard} aria-label="افتح بطاقة ولاء لوكو"><Photo src={logo} alt="لوكو" /><span>بطاقة الولاء</span><div className={s.stamps} aria-hidden="true">{Array.from({ length: Math.min(loyalty.purchasesRequired, 10) }, (_, i) => <span key={i}>{i === Math.min(loyalty.purchasesRequired, 10) - 1 ? <Gift /> : <Coffee />}</span>)}</div><div className={s.cardBottom}><span>مكافأتك<strong>{loyalty.rewardName}</strong></span><WalletCards aria-hidden="true" /></div></Link></section>}
    {activeOffer && <section className={s.experience} id="loco-offers" aria-labelledby="loco-offers-title"><div className={s.sectionHeading}><div><p className={s.kicker}>شي يستاهل تغيّر له مزاجك</p><h2 id="loco-offers-title">تستاهل <em>التجربة</em></h2></div><span dir="ltr">THE LOCO EDIT</span></div><article className={s.offer}><div className={s.offerCopy} aria-live="polite"><span className={s.offerLabel}>{!published.length ? "من اختيارات لوكو" : activeOffer.discountPercent ? `خصم ${activeOffer.discountPercent}٪` : activeOffer.kind === "event" ? "تجربة في لوكو" : "عرض لوكو"}</span><h3>{menuDisplayText(activeOffer.title)}</h3>{activeOffer.description && <p>{menuDisplayText(activeOffer.description)}</p>}{activeOffer.code && <p>كود العرض <bdi>{activeOffer.code}</bdi></p>}{activeOffer.eventDate && <p>الموعد <bdi>{activeOffer.eventDate}</bdi> <bdi>{activeOffer.eventTime}</bdi></p>}{activeOffer.eventLocation && <p>{activeOffer.eventLocation}</p>}{offerProduct && <><Price product={offerProduct} /><button className={s.offerAction} type="button" onClick={() => setSelectedId(offerProduct.id)}>اكتشف الصنف<ArrowUpLeft aria-hidden="true" /></button></>}{!offerProduct && <a className={s.offerAction} href="#loco-catalog">تصفح المنيو<ArrowDownLeft aria-hidden="true" /></a>}</div><div className={s.offerPhoto}><Photo src={activeOffer.imageUrl} alt={activeOffer.title} /></div></article>{offers.length > 1 && <nav className={s.offerControls} aria-label="عروض واختيارات لوكو"><button type="button" aria-label="العرض السابق" onClick={() => setOfferId(offers[(offers.indexOf(activeOffer) - 1 + offers.length) % offers.length].id)}><ChevronRight aria-hidden="true" /></button><span dir="ltr">{offers.indexOf(activeOffer) + 1} / {offers.length}</span><button type="button" aria-label="العرض التالي" onClick={() => setOfferId(offers[(offers.indexOf(activeOffer) + 1) % offers.length].id)}><ChevronLeft aria-hidden="true" /></button></nav>}</section>}
    <section className={s.catalog} id="loco-catalog" aria-labelledby="loco-catalog-title"><div className={s.sectionHeading}><div><p className={s.kicker}>منيو لوكو</p><h2 id="loco-catalog-title">اختيارات <em>تفتح النفس</em></h2></div><span dir="ltr">PICK YOUR MOOD</span></div><div className={s.toolbar}><nav className={s.categories} aria-label="أقسام المنيو">{[{ id: "all", name: "الكل" }, ...categories].map(c => <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => chooseCategory(c.id)}>{menuDisplayText(c.name)}</button>)}</nav><div className={s.tools}><label className={s.search}><Search aria-hidden="true" /><input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="وش خاطرك فيه؟" aria-label="ابحث في منيو لوكو" /></label><label className={s.order}><span>الترتيب</span><select value={order} onChange={e => setOrder(e.target.value)}><option value="original">ترتيب المنيو</option><option value="low">الأقل سعرًا</option><option value="high">الأعلى سعرًا</option></select></label></div></div><p className={query ? s.result : base.screenReaderOnly} role="status">{visible.length} صنفًا{query && " يطابق بحثك"}</p>{sections.map(section => <section key={section.id} className={s.categorySection} aria-labelledby={`loco-${section.id}`}><div className={s.categoryHeading}><h3 id={`loco-${section.id}`}>{menuDisplayText(section.name)}</h3><span>{section.products.length} اختيارات</span></div><div className={s.grid}>{section.products.map(p => <article key={p.id} className={s.product}><button type="button" className={s.productButton} onClick={() => setSelectedId(p.id)} aria-label={`تفاصيل ${p.name}`}><span className={s.productPhoto}><Photo src={p.images[0]?.url} alt={p.name} /><span className={s.productOpen}><ArrowUpLeft aria-hidden="true" /></span></span><span className={s.productInfo}><span className={s.productCategory}>{menuDisplayText(p.category)}</span><strong>{menuDisplayText(p.name)}</strong><Price product={p} /></span></button><ProductOfferBadge product={p} products={menu.products} /><ProductOfferDetails product={p} products={menu.products} /></article>)}</div></section>)}{!sections.length && <div className={s.empty}><Search aria-hidden="true" /><h3>{menu.products.length ? "ما لقينا صنف بهذا البحث" : "المنيو يتجهّز لك"}</h3>{menu.products.length > 0 && <button type="button" onClick={() => { setQuery(""); setCategory("all"); setOrder("original"); }}>عرض كل الأصناف</button>}</div>}</section>
    <footer className={s.footer}><Photo src={logo} alt="لوكو" /><p>كل مزاج وله لوكو</p><a href="#loco-top">نرجع للبداية<ArrowUpLeft aria-hidden="true" /></a><Link href="/" className={s.powered}>بواسطة برندة</Link></footer>{message && <div className={base.toast} role="status"><Check aria-hidden="true" />{message}</div>}<AnimatePresence mode="wait">{selected && <ProductDetails key={selected.id} brandSlug={menu.slug} product={selected} products={menu.products} close={() => setSelectedId(null)} browse={browse} position={browseProducts.findIndex(p => p.id === selected.id)} total={browseProducts.length} />}</AnimatePresence>
  </main>;
}
