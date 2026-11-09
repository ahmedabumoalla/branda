"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowDown, ArrowUpLeft, Search, Share2, X } from "lucide-react";
import { matchesMenuSearch, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { TEA_BAKERY_HERO, TEA_BAKERY_LOGO, teaBakeryCategoryStory } from "@/lib/menu/tea-bakery";
import { teaBakeryProductImages, teaBakeryProductMedia } from "@/lib/menu/tea-bakery-products";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { productFinalPrice } from "@/lib/mock/menu";
import { menuEntryUrl, startMenuAtTop } from "@/lib/menu/menu-entry-scroll";
import { ProductDetails } from "./bistro-menu";
import { MenuServices } from "./menu-services";
import { BrandLoyaltyEntry } from "./brand-loyalty-entry";
import base from "./bistro-menu.module.css";
import s from "./tea-bakery-menu.module.css";

type Loyalty = { purchasesRequired: number; rewardName: string };

function Ornament() {
  return <svg className={s.ornament} viewBox="0 0 180 28" fill="none" aria-hidden="true"><path d="M4 14h57m58 0h57M61 14c13 0 13-11 22-11-5 5-5 11 7 11-12 0-12 6-7 11-9 0-9-11-22-11Zm58 0c-13 0-13-11-22-11 5 5 5 11-7 11 12 0 12 6 7 11 9 0 9-11 22-11Z" stroke="currentColor" strokeWidth="1"/><path d="m90 8 5 6-5 6-5-6 5-6Z" fill="currentColor" /></svg>;
}

function MenuPrice({ product }: { product: StandaloneMenuProduct }) {
  const values = product.priceRange ? [product.priceRange.min, product.priceRange.max] : product.priceOptions?.length ? product.priceOptions : [product.price];
  const separator = product.priceRange ? "–" : " / ";
  const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return <span className={s.price}><bdi>{values.map(value => format(productFinalPrice(value, product.promo))).join(separator)}</bdi><span>ريال</span>{values.some(value => productFinalPrice(value, product.promo) < value) && <del><bdi>{values.map(format).join(separator)}</bdi></del>}</span>;
}

function EditorialPhoto({ src, hero = false }: { src: string; hero?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return <div className={s.photoFallback} aria-hidden="true"><Ornament /><span lang="en">Tea &amp; Bakery</span><Ornament /></div>;
  return <Image src={src} alt="" width={1536} height={1024} unoptimized loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : "auto"} decoding="async" sizes="(max-width: 760px) 100vw, 50vw" onError={() => setFailed(src)} />;
}

function ProductPhoto({ product }: { product: StandaloneMenuProduct }) {
  const [failed, setFailed] = useState<string[]>([]);
  const artwork = teaBakeryProductImages[product.id];
  const candidates = product.images.map(image => image.url);
  if (artwork && !candidates.includes(artwork)) candidates.push(artwork);
  const src = candidates.find(url => !failed.includes(url));
  const video = product.videos.find(item => !failed.includes(item.url));
  const ownerVideo = product.primaryMediaType === "video" || !product.images.length ? video : undefined;
  return <span className={s.productPhoto} aria-hidden="true">{ownerVideo ? <video src={ownerVideo.url} muted playsInline preload="metadata" onError={() => setFailed(previous => [...previous, ownerVideo.url])} /> : src ? <Image src={src} alt="" width={768} height={768} unoptimized loading="lazy" decoding="async" sizes="(max-width: 359px) 100vw, (max-width: 760px) 50vw, (max-width: 1199px) 33vw, 25vw" onError={() => setFailed(previous => [...previous, src])} /> : <span className={s.productPhotoFallback}><Image src={TEA_BAKERY_LOGO} alt="" width={100} height={100} unoptimized /></span>}</span>;
}

export function TeaBakeryMenu({ menu: source, loyalty }: { menu: StandaloneMenu; loyalty: Loyalty | null }) {
  const root = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState("original");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [asOf, setAsOf] = useState(source.highlights?.asOf ?? 0);
  useEffect(() => startMenuAtTop(root.current), [source.slug]);
  useEffect(() => { const timer = window.setInterval(() => setAsOf(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const highlights = source.highlights ? { ...source.highlights, items: source.highlights.items.filter(item => !item.expiresAt || item.expiresAt > asOf) } : undefined;
  const menu = { ...source, logoUrl: TEA_BAKERY_LOGO, highlights, products: source.products.filter(product => product.available).map(product => ({ ...teaBakeryProductMedia(product), promo: getPublishedOfferPromo(product, highlights, asOf), offers: getProductOffers(product, highlights, asOf) })) };
  const categories = menu.categories.filter(item => menu.products.some(product => product.categoryId === item.id));
  const visible = menu.products.filter(product => (category === "all" || product.categoryId === category) && matchesMenuSearch(product, query));
  if (order !== "original") visible.sort((a, b) => (productFinalPrice(a.price, a.promo) - productFinalPrice(b.price, b.promo)) * (order === "low" ? 1 : -1));
  const sections = (order === "original" ? [...categories.map(item => ({ ...item, items: visible.filter(product => product.categoryId === item.id) })), { id: "other", name: "اختيارات أخرى", items: visible.filter(product => !categories.some(item => item.id === product.categoryId)) }] : [{ id: "sorted", name: "اختياراتك حسب السعر", items: visible }]).filter(section => section.items.length);
  const selected = menu.products.find(product => product.id === selectedId);
  const browsing = selected && !visible.some(product => product.id === selected.id) ? menu.products : visible;
  function browse(direction: number) { const index = browsing.findIndex(product => product.id === selectedId); setSelectedId(browsing[(index + direction + browsing.length) % browsing.length]?.id ?? null); }
  async function share() {
    const entry = new URL(menuEntryUrl(window.location.origin, menu.slug));
    if (menu.branch) entry.searchParams.set("branch", menu.branch.slug);
    try { if (navigator.share) { await navigator.share({ title: menu.name, url: entry.href }); return; } await navigator.clipboard.writeText(entry.href); setMessage("تم نسخ رابط القائمة"); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setMessage("يمكنك مشاركة رابط القائمة من شريط العنوان"); }
  }
  function resetFilters() { setQuery(""); setCategory("all"); setOrder("original"); }
  return <main ref={root} className={`${base.menu} ${s.menu}`} data-tea-bakery dir="rtl">
    <a href="#tea-catalog" className={s.skipLink}>انتقل إلى القائمة</a>
    <header className={s.header}><a href="#tea-top" className={s.headerIdentity} aria-label="Tea & Bakery بداية القائمة"><Image src={TEA_BAKERY_LOGO} alt="Tea & Bakery" width={90} height={90} unoptimized loading="eager" /><span lang="en" dir="ltr">Tea &amp; Bakery<small>TEA HOUSE &amp; BAKERY</small></span></a><nav className={s.headerActions} aria-label="خدمات القائمة"><MenuServices menu={menu} compact /><button type="button" onClick={share} aria-label="شارك القائمة"><Share2 aria-hidden="true" size={19} /></button></nav></header>
    <section className={s.hero} id="tea-top" aria-labelledby="tea-title"><div className={s.heroCopy}><span className={s.eyebrow}>شاي وقهوة ومخبوزات</span><h1 id="tea-title" lang="en" dir="ltr">Tea <span>&amp;</span> Bakery</h1><Ornament /><p className={s.heroArabic}>على مهل<br /><strong>يحلو اللقاء</strong></p><p className={s.heroNote}>فنجان تختاره ولقمة تُكمل لحظتك</p><a className={s.browseButton} href="#tea-catalog">تصفّح القائمة<ArrowDown size={17} aria-hidden="true" /></a></div><figure className={s.heroPhoto}><div className={s.heroPhotoInner}><EditorialPhoto src={TEA_BAKERY_HERO} hero /></div><figcaption lang="en" dir="ltr">A cup, a bite, a moment</figcaption><div className={s.heroSeal} aria-hidden="true"><Image src={TEA_BAKERY_LOGO} alt="" width={180} height={180} unoptimized /></div></figure></section>
    {menu.loyaltyEnabled && loyalty && <BrandLoyaltyEntry id="tea-loyalty" className={s.loyalty} slug={menu.slug} name={menu.name} logoUrl={TEA_BAKERY_LOGO} eyebrow="للّقاء القادم حلاوة أكثر" description={loyalty.rewardName ? `اجمع ${loyalty.purchasesRequired} أختام واحصل على ${loyalty.rewardName}` : "اجمع أختامك واستمتع بمكافأتك"} palette={{ background: "#5b2230", foreground: "#f8f1e4", muted: "#e8ddc9", cardBackground: "#f8f1e4", cardForeground: "#5b2230", cardBack: "#9c7075", actionBackground: "#f8f1e4", actionForeground: "#5b2230" }} />}
    <section className={s.catalog} id="tea-catalog" aria-labelledby="tea-catalog-title"><div className={s.catalogHeading}><Ornament /><p className={s.eyebrow} lang="en" dir="ltr">THE MENU</p><h2 id="tea-catalog-title">اختيارات على ذوقك</h2></div>
      <div className={s.catalogTools}><nav className={s.categories} aria-label="أقسام القائمة"><button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>القائمة كاملة</button>{categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)} dir="auto">{item.name}</button>)}</nav><div className={s.searchRow}><label className={s.search}><Search size={18} aria-hidden="true" /><span className={s.srOnly}>ابحث في القائمة</span><input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ماذا تشتهي اليوم؟" autoComplete="off" />{query && <button type="button" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="مسح البحث"><X size={17} aria-hidden="true" /></button>}</label><label className={s.sort}><span className={s.srOnly}>ترتيب القائمة</span><select value={order} onChange={event => setOrder(event.target.value)}><option value="original">ترتيب القائمة</option><option value="low">السعر من الأقل</option><option value="high">السعر من الأعلى</option></select></label></div></div>
      <p className={s.resultCount} role="status" aria-live="polite">{visible.length} صنف في القائمة</p>
      <div className={s.chapters}>{sections.map(section => { const story = teaBakeryCategoryStory(section.name); return <section key={section.id} className={s.chapter} aria-labelledby={`tea-category-${section.id}`}><div className={s.chapterIntro}><div><span className={s.chapterKicker} lang="en" dir="ltr">{story?.english || "Made for your moment"}</span><h3 id={`tea-category-${section.id}`} dir="auto">{section.name}</h3></div><Ornament /></div><ul className={s.productList}>{section.items.map(product => <li key={product.id}><button type="button" className={s.product} onClick={() => setSelectedId(product.id)} aria-label={`تفاصيل ${product.name}`} aria-haspopup="dialog" aria-describedby={`${product.description ? `tea-description-${product.id} ` : ""}tea-price-${product.id}`}><ProductPhoto product={product} /><span className={s.productBody}><span className={s.productCopy}><span className={s.productName} dir="auto">{product.name}</span>{product.description && <span id={`tea-description-${product.id}`} className={s.productDescription} dir="auto">{product.description}</span>}</span><span id={`tea-price-${product.id}`} className={s.productPrice}><MenuPrice product={product} /><ArrowUpLeft size={16} aria-hidden="true" /></span></span></button></li>)}</ul></section>; })}</div>
      {!visible.length && <div className={s.empty}><Ornament /><h3>{menu.products.length ? "لم نجد ما يطابق بحثك" : "القائمة قيد التجهيز"}</h3><p>{menu.products.length ? "جرّب اسمًا آخر أو تصفّح القائمة كاملة" : "نجهّز لك اختيارات الشاي والمخبوزات"}</p>{menu.products.length > 0 && <button type="button" onClick={resetFilters}>عرض القائمة كاملة</button>}</div>}
    </section>
    <footer className={s.footer}><Image src={TEA_BAKERY_LOGO} alt="Tea & Bakery" width={110} height={110} unoptimized loading="lazy" /><Ornament /><p lang="en" dir="ltr">Until the next cup</p><span>نلقاكم على خير</span><div className={s.customOrders}><span>لطلبات الكيك الخاصة</span><a href="tel:+966552220972" dir="ltr">055 222 0972</a><a href="https://wa.me/966552220972" target="_blank" rel="noopener noreferrer">تواصل عبر واتساب<ArrowUpLeft size={15} aria-hidden="true" /></a></div><Link href="/">بواسطة برندة</Link></footer>
    {message && <div className={s.toast} role="status">{message}<button type="button" onClick={() => setMessage("")} aria-label="إغلاق الإشعار"><X size={16} aria-hidden="true" /></button></div>}
    <AnimatePresence>{selected && <ProductDetails key={selected.id} product={selected} products={menu.products} close={() => setSelectedId(null)} browse={browse} position={browsing.findIndex(product => product.id === selected.id)} total={browsing.length} brandSlug={menu.slug} brandCaption="Tea & Bakery" hideEmptyMedia />}</AnimatePresence>
  </main>;
}
