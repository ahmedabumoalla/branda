"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowUpLeft, Check, ChevronLeft, ChevronRight, Gift, Camera, MapPin, Music2, Pause, Play, Search, Share2 } from "lucide-react";
import { kormaContacts, signatureAsset, type SignatureBrand } from "@/lib/menu/signature-brands";
import { DEFAULT_SIGNATURE_HERO } from "@/lib/menu/default-signature";
import { hulmPhotoFraming } from "@/lib/menu/hulm-framing";
import { matchesMenuSearch, menuDisplayText, type StandaloneHighlight, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { productFinalPrice } from "@/lib/mock/menu";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { menuEntryUrl, startMenuAtTop } from "@/lib/menu/menu-entry-scroll";
import { ProductDetails } from "./bistro-menu";
import { MenuServices } from "./menu-services";
import { BrandLoyaltyEntry } from "./brand-loyalty-entry";
import base from "./bistro-menu.module.css";
import s from "./signature-menu.module.css";

type Loyalty = { purchasesRequired: number; rewardName: string };

function photoDisclosure(brand: SignatureBrand, product: StandaloneMenuProduct) {
  return ["hadiqa", "damascus", "et1", "dabab"].includes(brand.key) && product.description?.includes("صورة توضيحية") && product.images.length > 0 ? "صورة توضيحية" : undefined;
}

export function SignatureMark({ brand, src, small = false }: { brand: SignatureBrand; src?: string | null; small?: boolean }) {
  const cutout = (brand.key === "once" || brand.key === "black") && (!src || src === signatureAsset(brand.logo));
  if (brand.key === "default" && !src) return <span className={s.wordmark} data-small={small}>{brand.name}</span>;
  return <span className={s.mark} data-mark={brand.key} data-small={small} data-cutout={cutout}>
    <Image src={src || signatureAsset(brand.logo)} alt={brand.name} width={800} height={500} unoptimized loading="eager" />
  </span>;
}

function Photo({ src, alt, eager = false }: { src?: string | null; alt: string; eager?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <span className={s.fallback} role="img" aria-label={alt}><span>الصورة غير متاحة</span><strong>{alt}</strong></span>;
  // Immutable, precompressed files share one URL in tiles and the detail dialog.
  return <Image src={src} alt={alt} width={900} height={900} unoptimized loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(src)} />;
}

function Price({ product }: { product: StandaloneMenuProduct }) {
  const values = product.priceRange ? [product.priceRange.min, product.priceRange.max] : product.priceOptions?.length ? product.priceOptions : [product.price];
  const separator = product.priceRange ? "–" : " / ";
  return <span className={s.price} data-price-range={!!product.priceRange || undefined}><bdi>{values.map(value => productFinalPrice(value, product.promo).toLocaleString("en-US", { maximumFractionDigits: 2 })).join(separator)}</bdi><span>ريال</span>{productFinalPrice(product.price, product.promo) < product.price && <del>{(product.priceRange ? values : [product.price]).map(value => value.toLocaleString("en-US")).join(separator)}</del>}</span>;
}

function ProductPhoto({ brand, product }: { brand: SignatureBrand; product: StandaloneMenuProduct }) {
  if (brand.key === "dabab" && !product.images[0]?.url) return <span className={s.brandPlaceholder} data-brand-placeholder="dabab" aria-hidden="true"><strong>ضباب</strong><span lang="en" dir="ltr">DABAB</span></span>;
  return <Photo src={product.images[0]?.url} alt={product.name} />;
}

function Spotlight({ offers, menu, onSelect }: { offers: StandaloneHighlight[]; menu: StandaloneMenu; onSelect: (id: string) => void }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const current = index % Math.max(offers.length, 1);
  const offer = offers[current];
  const playing = !paused && !reduce && !hovered && !focused && visible;
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .2 });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing || offers.length < 2) return;
    const timer = window.setInterval(() => { if (!document.hidden) setIndex(i => (i + 1) % offers.length); }, 6500);
    return () => window.clearInterval(timer);
  }, [playing, offers.length]);
  if (!offer) return null;
  const product = menu.products.find(p => p.id === offer.productId);
  function step(direction: number) { setPaused(true); setIndex((current + direction + offers.length) % offers.length); }
  return <section className={s.spotlight} ref={root} id="signature-offers" aria-labelledby="signature-offers-title" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
    <div className={s.heading}><div><span className={s.eyebrow}>خلّ ذوقك يختار</span><h2 id="signature-offers-title">تستاهل <em>التجربة</em></h2></div><span className={s.counter} dir="ltr">{String(current + 1).padStart(2, "0")} / {String(offers.length).padStart(2, "0")}</span></div>
    <AnimatePresence initial={false} mode="wait"><motion.article className={s.feature} key={offer.id} aria-roledescription="شريحة" aria-label={`${current + 1} من ${offers.length}`} aria-live={playing ? "off" : "polite"} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .28 }}>
      <div className={s.featurePhoto}><Photo src={offer.imageUrl || product?.images[0]?.url} alt={offer.title} /></div>
      <div className={s.featureCopy}><span className={s.featureTag}>{offer.discountPercent ? `خصم ${offer.discountPercent}٪` : "من اختياراتنا لك"}</span><h3>{menuDisplayText(offer.title)}</h3>{offer.description && <p>{menuDisplayText(offer.description)}</p>}{offer.code && <p>كود العرض <bdi>{offer.code}</bdi></p>}{offer.eventDate && <p>{offer.eventDate} {offer.eventTime}</p>}{offer.eventLocation && <p>{offer.eventLocation}</p>}<div className={s.featureBottom}>{product && <Price product={product} />}{product ? <button type="button" className={s.round} onClick={() => onSelect(product.id)} aria-label={`اكتشف ${product.name}`}><ArrowUpLeft aria-hidden="true" /></button> : <a href="#signature-catalog" className={s.round} aria-label="تصفح المنيو"><ArrowDownLeft aria-hidden="true" /></a>}</div></div>
    </motion.article></AnimatePresence>
    {offers.length > 1 && <div className={s.featureControls}><div className={s.dots}>{offers.map((item, i) => <button type="button" key={item.id} aria-label={`عرض ${item.title}`} aria-pressed={current === i} onClick={() => { setPaused(true); setIndex(i); }}><span /></button>)}</div><div className={s.arrows}><button type="button" className={s.round} onClick={() => step(-1)} aria-label="الاختيار السابق"><ChevronRight aria-hidden="true" /></button>{!reduce && <button type="button" className={s.round} onClick={() => setPaused(v => !v)} aria-label={paused ? "تشغيل تبديل الاختيارات" : "إيقاف تبديل الاختيارات"} aria-pressed={!paused}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}<button type="button" className={s.round} onClick={() => step(1)} aria-label="الاختيار التالي"><ChevronLeft aria-hidden="true" /></button></div></div>}
  </section>;
}

export function SignatureMenu({ menu: source, brand, loyalty }: { menu: StandaloneMenu; brand: SignatureBrand; loyalty: Loyalty | null }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState("original");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failedHero, setFailedHero] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(source.highlights?.asOf ?? 0);
  useEffect(() => startMenuAtTop(root.current), [source.slug]);
  useEffect(() => { const timer = window.setInterval(() => setAsOf(Date.now()), 30000); return () => { window.clearInterval(timer); if (toastTimer.current) clearTimeout(toastTimer.current); }; }, []);
  const activeOffers = (source.highlights?.items ?? []).filter(o => !o.expiresAt || o.expiresAt > asOf);
  const highlights = source.highlights ? { ...source.highlights, items: activeOffers } : undefined;
  const hospitalMenu = brand.key === "dabab" && brand.variant === "hospital";
  const menu = { ...source, logoUrl: hospitalMenu ? signatureAsset(brand.logo) : source.logoUrl, highlights, products: source.products.filter(p => p.available).map(p => ({ ...p, promo: getPublishedOfferPromo(p, highlights, asOf), offers: getProductOffers(p, highlights, asOf) })) };
  const offers = activeOffers.filter(o => o.showInSpotlight !== false && (!o.productId || menu.products.some(p => p.id === o.productId)));
  const categories = menu.categories.filter(c => menu.products.some(p => p.categoryId === c.id));
  const visible = menu.products.filter(p => (category === "all" || p.categoryId === category) && matchesMenuSearch(p, query));
  if (order !== "original") visible.sort((a, b) => (productFinalPrice(a.price, a.promo) - productFinalPrice(b.price, b.promo)) * (order === "low" ? 1 : -1));
  const sections = order === "original" ? [...categories.map(c => ({ ...c, items: visible.filter(p => p.categoryId === c.id) })), { id: "other", name: "اختيارات أخرى", items: visible.filter(p => !categories.some(c => c.id === p.categoryId)) }].filter(c => c.items.length) : [{ id: "sorted", name: "اختياراتك", items: visible }].filter(c => c.items.length);
  const selected = menu.products.find(p => p.id === selectedId);
  const browsing = selected && !visible.some(p => p.id === selected.id) ? menu.products : visible;
  const lightLoyaltyLogo = ["arabi", "masala", "damascus", "hadiqa", "box"].includes(brand.key);
  const hero = brand.key === "default" ? (failedHero === brand.hero ? DEFAULT_SIGNATURE_HERO : brand.hero) : signatureAsset(brand.hero);
  function browse(direction: number) { const index = browsing.findIndex(p => p.id === selectedId); setSelectedId(browsing[(index + direction + browsing.length) % browsing.length]?.id ?? null); }
  function focusSearch() { document.getElementById("signature-catalog")?.scrollIntoView({ behavior: reduce ? "instant" : "smooth" }); search.current?.focus({ preventScroll: true }); }
  async function share() {
    const entry = new URL(menuEntryUrl(window.location.origin, menu.slug));
    if (menu.branch) entry.searchParams.set("branch", menu.branch.slug);
    const url = entry.href;
    try { if (navigator.share) { await navigator.share({ title: menu.name, url }); return; } await navigator.clipboard.writeText(url); setMessage("تم نسخ رابط المنيو"); } catch (error) { if (error instanceof Error && error.name === "AbortError") return; setMessage("يمكنك مشاركة رابط المنيو من شريط العنوان"); }
    if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setMessage(""), 3200);
  }
  return <main ref={root} className={`${base.menu} ${s.menu}`} style={brand.cssVariables as CSSProperties} data-signature={brand.key} data-signature-variant={brand.variant} dir="rtl">
    <a href="#signature-catalog" className={base.skipLink}>انتقل إلى المنتجات</a>
    <section className={s.hero} id="signature-top" aria-labelledby="signature-title">
      <picture className={s.backdrop}>{brand.key !== "default" && <source media="(max-width: 700px)" srcSet={signatureAsset(brand.hero, true)} />}<Image src={hero} alt="" fill unoptimized fetchPriority="high" loading="eager" sizes="100vw" onError={brand.key === "default" ? () => setFailedHero(brand.hero) : undefined} /></picture>
      <div className={s.heroShade} aria-hidden="true" /><div className={s.lightSweep} aria-hidden="true" />
      <header className={s.header}>{brand.key === "dabab" ? <div className={s.headerBrand}><SignatureMark brand={brand} src={menu.logoUrl} small />{brand.variant !== "hospital" && <span className={s.headerNote}>{brand.arabic}<span>{brand.headerNote}</span></span>}</div> : <span className={s.headerNote}>{brand.arabic}<span>{brand.headerNote || (brand.key === "korma" ? "نكهات من قلب الهند" : "لحظتك على ذوقك")}</span></span>}<nav aria-label="خدمات المنيو"><MenuServices menu={menu} compact showBranches={brand.key !== "dabab"} /><button type="button" className={s.round} onClick={share} aria-label="شارك المنيو"><Share2 aria-hidden="true" /></button><button type="button" className={s.round} onClick={focusSearch} aria-label="ابحث في المنيو"><Search aria-hidden="true" /></button></nav></header>
      <div className={s.heroCenter}><SignatureMark brand={brand} src={menu.logoUrl} /><span className={s.signature} dir={brand.key === "default" ? "auto" : "ltr"}>{brand.signature}</span><h1 id="signature-title">{brand.headline}{" "}<em>{brand.emphasis}</em></h1><p>{brand.note}</p><a className={s.primary} href="#signature-catalog">اكتشف المنيو<ArrowDownLeft aria-hidden="true" /></a>{menu.loyaltyEnabled && loyalty && <a className={s.heroLoyalty} href="#signature-loyalty"><Gift aria-hidden="true" />كل زيارة تقرّب مكافأتك<ArrowDownLeft aria-hidden="true" /></a>}</div>
      <div className={s.heroBottom}><span>{menu.products.length} اختيارًا على ذوقك</span>{brand.locationUrl && <a href={brand.locationUrl} target="_blank" rel="noopener noreferrer"><MapPin aria-hidden="true" />{brand.key === "dabab" ? "موقع ضباب" : "موقع المطعم"}</a>}{brand.key === "korma" && <nav className={s.brandContacts} aria-label="حسابات كورما وموقع المطعم"><a href={kormaContacts.instagram} target="_blank" rel="noopener noreferrer" aria-label="حساب كورما على إنستغرام"><Camera aria-hidden="true" />إنستغرام</a><a href={kormaContacts.tiktok} target="_blank" rel="noopener noreferrer" aria-label="حساب كورما على تيك توك"><Music2 aria-hidden="true" />تيك توك</a><a href={kormaContacts.maps} target="_blank" rel="noopener noreferrer" aria-label="موقع مطعم كورما على خرائط قوقل"><MapPin aria-hidden="true" />موقعنا</a></nav>}{offers.length > 0 && <a href="#signature-offers">تستاهل التجربة<ArrowDownLeft aria-hidden="true" /></a>}</div>
    </section>
    {menu.loyaltyEnabled && loyalty && <BrandLoyaltyEntry id="signature-loyalty" slug={menu.slug} name={menu.name} logoUrl={menu.logoUrl || (brand.key === "default" ? null : signatureAsset(brand.logo))} logoEmphasis={lightLoyaltyLogo || ["korma", "rast", "sadeem"].includes(brand.key)} palette={{ background: "var(--brand)", foreground: "var(--white)", muted: "var(--gold)", cardBackground: brand.key === "default" ? "var(--hero-paper)" : lightLoyaltyLogo ? "var(--brand)" : "#fffaf1", cardForeground: brand.key === "default" ? "var(--hero-ink)" : lightLoyaltyLogo ? "var(--white)" : "var(--brand)", cardBack: "var(--tone)", actionBackground: "#fffaf1", actionForeground: "#241610" }} />}
    <Spotlight menu={menu} offers={offers} onSelect={setSelectedId} />
    <section id="signature-catalog" className={s.catalog} aria-labelledby="signature-catalog-title"><div className={s.heading}><div><span className={s.eyebrow}>منيو {brand.arabic}</span><h2 id="signature-catalog-title">{brand.catalog}</h2></div><span className={s.catalogCount}>{menu.products.length}<small>اختيارًا</small></span></div>
      {hospitalMenu && <p className={s.weeklyNote}>تصفح القهوة والكروسان أو اختر يومًا للاطلاع على قائمة وجباته</p>}
      <div className={s.toolbar}><nav className={s.categories} aria-label="تصنيفات المنيو">{[{ id: "all", name: "الكل" }, ...categories].map(c => <button type="button" key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{menuDisplayText(c.name)}</button>)}</nav><div className={s.filters}><label className={s.search}><Search aria-hidden="true" /><input ref={search} type="search" aria-label={`ابحث في منيو ${brand.arabic}`} placeholder="وش خاطرك فيه؟" value={query} onChange={e => setQuery(e.target.value)} /></label><label className={s.order}><span className={base.screenReaderOnly}>ترتيب المنتجات</span><select value={order} onChange={e => setOrder(e.target.value)}><option value="original">ترتيب المنيو</option><option value="low">الأقل سعرًا</option><option value="high">الأعلى سعرًا</option></select></label></div></div>
      <p className={query ? s.results : base.screenReaderOnly} role="status">{visible.length} صنفًا{query && " يطابق بحثك"}</p>
      {sections.map(section => <section key={section.id} className={s.category} aria-labelledby={`section-${section.id}`}><div className={s.categoryTitle}><h3 id={`section-${section.id}`}>{menuDisplayText(section.name)}</h3><span>{section.items.length} اختيارات</span></div><div className={s.grid} data-buffet={brand.key === "hadiqa" && section.id === "82748ee4-2cb7-4c13-8c88-75b1cc2d4daf"}>{section.items.map(p => <motion.article className={s.product} key={p.id} initial={false} whileInView={reduce ? undefined : { y: [12, 0] }} viewport={{ once: true, amount: .1 }} transition={{ duration: .45 }}><button type="button" onClick={() => setSelectedId(p.id)} aria-label={`تفاصيل ${p.name}`}><span className={s.productPhoto} style={hulmPhotoFraming(menu.slug, p.id, p.images[0]?.url)}><ProductPhoto brand={brand} product={p} />{photoDisclosure(brand, p) && <span data-photo-disclosure>{photoDisclosure(brand, p)}</span>}<span className={s.productArrow}><ArrowUpLeft aria-hidden="true" /></span></span><span className={s.productInfo}><strong dir="auto">{menuDisplayText(p.name)}</strong><Price product={p} /></span></button></motion.article>)}</div></section>)}
      {!visible.length && <div className={s.empty}><Search aria-hidden="true" /><h3>{menu.products.length ? "ما لقينا هذا الاختيار" : "اختياراتنا تتجهّز لك"}</h3>{menu.products.length > 0 && <button type="button" className={s.loyaltyAction} onClick={() => { setQuery(""); setCategory("all"); }}>عرض كل المنتجات</button>}</div>}
    </section>
    <footer className={s.footer}><SignatureMark brand={brand} src={menu.logoUrl} small /><p>{brand.note}</p><a href="#signature-top">نرجع للبداية<ArrowUpLeft aria-hidden="true" /></a><Link href="/" className={s.powered}>بواسطة برندة</Link></footer>
    {message && <div className={base.toast} role="status"><Check aria-hidden="true" />{message}</div>}
    <AnimatePresence>{selected && <ProductDetails imageDisclosure={photoDisclosure(brand, selected)} brandCaption={brand.signature} key={selected.id} brandSlug={menu.slug} product={selected} products={menu.products} close={() => setSelectedId(null)} browse={browse} position={browsing.findIndex(p => p.id === selected.id)} total={browsing.length} />}</AnimatePresence>
  </main>;
}
