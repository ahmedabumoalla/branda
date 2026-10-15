"use client";

import { ArrowDownLeft, ArrowUpLeft, ArrowRight, CakeSlice, Check, ChevronLeft, ChevronRight, Clock3, Coffee, CookingPot, Flame, GlassWater, LayoutGrid, List, Search, Share2, SlidersHorizontal, Utensils, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion } from "motion/react";
import { menuMotion, menuSprings } from "@/lib/menu/motion-foundations";
import { isPromoActive, productFinalPrice } from "@/lib/mock/menu";
import { matchesMenuSearch, menuDisplayText, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import s from "./bistro-menu.module.css";
import { MenuServices } from "./menu-services";
import { DishMotion } from "./menu-motion";
import { RastConnect } from "./rast-connect";
import { RastLoyaltyEntry } from "./rast-loyalty-entry";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { ProductOfferBadge, ProductOfferDetails } from "./product-offer-details";
import spotlight from "./rast-spotlight.module.css";
import kath from "./kath-menu.module.css";
import { KathLoyaltyEntry } from "./kath-loyalty-entry";
import { kathResponsiveImage } from "@/lib/menu/kath-images";
import { editorialBrand } from "@/lib/menu/editorial-brand";
import shahi from "./shahi-menu.module.css";
import majlis from "./shahi-majlis.module.css";
import { ShahiHero, ShahiLoyalty, ShahiClosing } from "./shahi-menu-scenes";
import taza from "./taza-menu.module.css";
import { TazaHero, TazaLoyalty, TazaClosing } from "./taza-menu-scenes";
import deli from "./deli-menu.module.css";
import { DeliBackground, DeliHero, DeliLoyalty, DeliOffers, DeliOrigins, DeliClosing } from "./deli-menu-scenes";

const KathImages = createContext(false);

function RastSpotlight({ menu, onSelect }: { menu: StandaloneMenu; onSelect: (product: StandaloneMenuProduct) => void }) {
  const brandName = menu.slug === "rast" ? "مقهى الكواكب" : editorialBrand(menu.slug).name;
  const [selectedId, setSelectedId] = useState("");
  const [now, setNow] = useState(menu.highlights?.asOf ?? 0);
  const hasExpiry = menu.highlights?.items.some((item) => item.expiresAt != null);
  useEffect(() => {
    if (!hasExpiry) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [hasExpiry]);
  const offers = (menu.highlights?.items ?? []).filter((item) => item.showInSpotlight !== false && (item.expiresAt == null || item.expiresAt >= now));
  const fallback = menu.products.find((product) => product.available && product.images.length) ?? menu.products.find((product) => product.available);
  const items = offers.length ? offers : fallback ? [{
    id: `discover-${fallback.id}`, title: fallback.name, description: fallback.description,
    imageUrl: fallback.images[0]?.url ?? null, productId: fallback.id, discountPercent: null, code: null, expiresAt: null,
  }] : [];
  const active = items.find((item) => item.id === selectedId) ?? items[0];
  if (!active || (menu.slug === "shahi-w-hail" && !offers.length)) return null;
  const product = menu.products.find((item) => item.id === active.productId && item.available);
  const discountPrice = product && active.discountPercent != null ? Math.round(product.price * (1 - active.discountPercent / 100) * 100) / 100 : null;
  const displayPrice = discountPrice ?? (product ? productFinalPrice(product.price, product.promo) : null);

  return <section className={`${spotlight.section}${menu.slug === "shahi-w-hail" ? ` ${majlis.spotlight}` : ""}`} aria-labelledby="rast-spotlight-title">
    <div className={spotlight.heading}>
      <div><p className={s.rastEyebrow}>مساحة لمزاج مختلف</p><h2 id="rast-spotlight-title">تستاهل <span>التجربة</span></h2></div>
      <span className={spotlight.edition} dir="ltr">WORTH A TASTE</span>
    </div>
    <article className={spotlight.feature} aria-label={menuDisplayText(active.title)}>
      <div className={spotlight.copy} aria-live="polite">
        <span className={spotlight.badge}>{offers.length ? active.discountPercent ? `خصم ${active.discountPercent}%` : `اختيار ${brandName}` : "اكتشف من قائمتنا"}</span>
        <h3 dir="auto">{menuDisplayText(active.title)}</h3>
        <p className={spotlight.description} dir="auto">{menuDisplayText(active.description || "خذ لك لحظة واكتشف تفاصيلها على ذوقك")}</p>
        {active.code && <p className={spotlight.code}>كود العرض <b dir="ltr">{active.code}</b></p>}
        <div className={spotlight.bottom}>
          {product && displayPrice != null && <div className={spotlight.price}>{displayPrice !== product.price && <del>{product.price.toLocaleString("en-US")}</del>}<b dir="ltr">{displayPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b><span>ريال</span></div>}
          {product ? <button type="button" className={spotlight.action} onClick={() => onSelect(product)}>اكتشف الصنف<ArrowUpLeft aria-hidden="true" /></button>
            : <a className={spotlight.action} href="#rast-menu-items">تصفح القائمة<ArrowUpLeft aria-hidden="true" /></a>}
        </div>
      </div>
      <div className={spotlight.media}>
        {active.imageUrl ? <FoodImage key={active.imageUrl} src={active.imageUrl} alt={menuDisplayText(active.title)} />
          : <span className={spotlight.typographicArt} aria-hidden="true">{menu.slug === "rast" ? "KAWAKIB" : editorialBrand(menu.slug).wordmark}<span>على ذوقك</span></span>}
        <span className={spotlight.photoCaption} aria-hidden="true" dir="ltr">A MOMENT WORTH CHOOSING</span>
      </div>
    </article>
    {items.length > 1 && <nav className={spotlight.choices} aria-label={`مختارات وعروض ${brandName}`}>
      {items.map((item, index) => <button type="button" key={item.id} aria-pressed={item.id === active.id} onClick={() => setSelectedId(item.id)}>
        <span className={spotlight.choiceNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span dir="auto">{menuDisplayText(item.title)}</span>
      </button>)}
    </nav>}
  </section>;
}

function FoodImage({ src, alt, className = "", priority = false, sizes = "(max-width: 1000px) 50vw, 400px" }: { src?: string; alt: string; className?: string; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  const [originalFallback, setOriginalFallback] = useState(false);
  const isKath = useContext(KathImages);
  const responsive = isKath && src && !originalFallback ? kathResponsiveImage(src, sizes) : null;
  if (!src || failed) return <span className={`${s.imageFallback} ${className}`} role="img" aria-label={alt}><Utensils aria-hidden="true" /></span>;
  // Original, signed Storage and imported menu images; never substitute stock photography.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} {...responsive} alt={alt} className={className} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => responsive ? setOriginalFallback(true) : setFailed(true)} />;
}

function Price({ product }: { product: StandaloneMenuProduct }) {
  const final = productFinalPrice(product.price, product.promo);
  return <span className={s.price}>
    {final !== product.price && <del>{product.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</del>}
    <b dir="ltr">{final.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b><span>ريال</span>
  </span>;
}

function FoodVideo({ src, alt, poster, paused = false }: { src: string; alt: string; poster?: string; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inView = useInView(videoRef, { amount: 0.2 });
  const reduce = useReducedMotion();
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView && !reduce && !paused) {
      video.muted = true;
      void video.play().catch(() => { /* Native controls remain available if autoplay is blocked. */ });
    } else {
      video.pause();
    }
    return () => video.pause();
  }, [inView, reduce, paused, src]);

  if (failedSource === src) return <FoodImage src={poster} alt={alt} />;
  return <video ref={videoRef} src={src} poster={poster} controls muted loop playsInline
    preload="metadata" aria-label={alt} onError={() => setFailedSource(src)} />;
}

function CategoryIcon({ name, all }: { name: string; all: boolean }) {
  const Icon = all ? LayoutGrid : /باردة/.test(name) ? GlassWater : /مشروبات/.test(name) ? Coffee : /حلا|حلو/.test(name) ? CakeSlice : /إفطار/.test(name) ? CookingPot : Utensils;
  return <Icon aria-hidden="true" />;
}

function ProductDetails({ product, products, close, browse, position, total }: { product: StandaloneMenuProduct; products: StandaloneMenuProduct[]; close: () => void; browse: (direction: number) => void; position: number; total: number }) {
  const reduce = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const media = [...product.videos.map((item) => ({ ...item, type: "video" as const })), ...product.images.map((item) => ({ ...item, type: "image" as const }))];
  const current = media[mediaIndex];
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return <motion.dialog ref={dialog} className={`${s.dialog} ${s.dishDialog}`} aria-labelledby="dish-title" onCancel={(event) => { event.preventDefault(); close(); }}
    initial={{ opacity: 0, y: reduce ? 0 : menuMotion.distance.large, scale: reduce ? 1 : menuMotion.scale.press }}
    animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduce ? 0 : menuMotion.distance.small, scale: reduce ? 1 : menuMotion.scale.press }}
    transition={{ duration: reduce ? menuMotion.duration.fast : menuMotion.duration.normal, ease: menuMotion.easing }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className={s.dialogInner}>
      <button type="button" className={s.close} onClick={close} aria-label="إغلاق تفاصيل المنتج" autoFocus><X aria-hidden="true" /></button>
      <div className={s.detailMedia}>
        <span className={s.dishWatermark} aria-hidden="true">{product.category}</span>
        <AnimatePresence mode="wait" initial={false}>
        <motion.div key={current?.url ?? product.id} className={s.detailPhotoFrame}
          initial={{ opacity: 0, scale: reduce ? 1 : menuMotion.scale.photo }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }} transition={{ duration: reduce ? menuMotion.duration.fast : menuMotion.duration.normal, ease: menuMotion.easing }}>
        {current?.type === "video" ? <FoodVideo key={current.url} src={current.url} alt={current.alt} poster={product.images[0]?.url} />
          : <FoodImage key={current?.url ?? product.id} src={current?.url} alt={current?.alt || product.name} priority sizes="(max-width: 640px) 100vw, 60vw" />}
        </motion.div>
        </AnimatePresence>
        {media.length > 1 && <div className={s.galleryControls}>
          <button type="button" aria-label="الصورة السابقة" onClick={() => setMediaIndex((index) => (index - 1 + media.length) % media.length)}><ChevronRight aria-hidden="true" /></button>
          <span aria-live="polite">{mediaIndex + 1} / {media.length}</span>
          <button type="button" aria-label="الصورة التالية" onClick={() => setMediaIndex((index) => (index + 1) % media.length)}><ChevronLeft aria-hidden="true" /></button>
        </div>}
      </div>
      <motion.div className={s.detailContent} initial={{ opacity: 0, y: reduce ? 0 : menuMotion.distance.normal }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? menuMotion.duration.fast : menuMotion.duration.normal, ease: menuMotion.easing }}>
        <p className={s.eyebrow}>{menuDisplayText(product.category)}</p>
        <h2 id="dish-title" dir="auto">{menuDisplayText(product.name)}</h2>
        <div className={s.detailPrice}><Price product={product} />{!product.available && <span className={s.unavailable}>غير متوفر حاليًا</span>}</div>
        <ProductOfferDetails product={product} products={products} detailed />
        <div className={s.facts}>
          {product.calories != null && <span><Flame aria-hidden="true" />{product.calories} سعرة حرارية</span>}
          {product.preparationTimeMinutes != null && <span><Clock3 aria-hidden="true" />التحضير: {product.preparationTimeMinutes} دقيقة</span>}
        </div>
        {product.description && <p className={s.fullDescription} dir="auto">{menuDisplayText(product.description)}</p>}
        {product.ingredients.length > 0 && <div className={s.ingredients}>
          <h3>المكونات</h3><ul>{product.ingredients.map((ingredient, index) => <li key={`${index}-${ingredient}`}>{menuDisplayText(ingredient)}</li>)}</ul>
        </div>}
        <p className={s.detailFooter}>Good food <i>Beautiful moments</i></p>
      </motion.div>
    </div>
    {total > 1 && <nav className={s.dishNavigation} aria-label="استكشف الأطباق">
      <button type="button" onClick={() => browse(-1)}><ChevronRight size={18} aria-hidden="true" /><span>الطبق السابق</span></button>
      <span dir="ltr" aria-label={`الطبق ${position + 1} من ${total}`}>{position + 1} / {total}</span>
      <button type="button" onClick={() => browse(1)}><span>الطبق التالي</span><ChevronLeft size={18} aria-hidden="true" /></button>
    </nav>}
  </motion.dialog>;
}

function RastHero({ menu, onSearch, onShare }: { menu: StandaloneMenu; onSearch: () => void; onShare: () => void }) {
  const isCustomEditorial = menu.slug !== "rast";
  const isShahi = menu.slug === "shahi-w-hail";
  const brand = editorialBrand(menu.slug);
  const brandName = isCustomEditorial ? brand.name : "مقهى الكواكب";
  return <section className={`${s.rastHero}${isCustomEditorial ? ` ${kath.hero}` : ""}${isShahi ? ` ${shahi.hero}` : ""}`} aria-label={`مرحبًا في ${brandName}`}>
    {/* Decorative brand atmosphere behind the entire opening, never a catalog product. */}
    <div className={`${s.rastHeroBackdrop}${isCustomEditorial ? ` ${kath.heroBackdrop}` : ""}`} aria-hidden="true">
      <FoodImage src={isCustomEditorial ? brand.hero : "/menu-art/rast-coffee-editorial-v1.webp"} alt="" priority />
    </div>
    <header className={s.rastHeader}>
      <div className={s.heroActions}>
        <MenuServices menu={menu} compact />
        <button type="button" className={s.heroIcon} onClick={onSearch} aria-label="البحث في المنيو"><Search aria-hidden="true" /></button>
      </div>
      <p className={s.rastHeaderNote}>{isShahi ? brand.note : "قهوة تفاصيل لحظات"}</p>
      <button type="button" className={s.heroIcon} onClick={onShare} aria-label="مشاركة رابط المنيو"><Share2 aria-hidden="true" /></button>
    </header>
    <div className={s.rastMasthead}>
      <FoodImage src={menu.logoUrl || (isCustomEditorial ? brand.logo : "/menu-logos/kawakib-transparent-20261008.png")} alt={menu.name} className={`${s.rastWordmark}${isCustomEditorial ? ` ${kath.wordmark}` : ""}${isShahi ? ` ${shahi.wordmark}` : ""}`} priority />
      <div className={s.rastMastheadCaption}><span>مساحتك للحظة أحلى</span><span dir="ltr">{isShahi ? brand.caption : "COFFEE & GOOD MOMENTS"}</span></div>
    </div>
    <div className={s.rastHeroGrid}>
      <div className={s.rastHeroCopy}>
        <p className={s.rastEyebrow}>أهلًا بك في {brandName}</p>
        <h1>خذ وقتك<br /><span>هذا مزاجك</span></h1>
        <p className={s.rastHeroDescription}>{isShahi ? brand.description : "قهوة تحبّها حلا يكمّلها ولحظة تستاهل تعيشها على مهلك"}</p>
        <a href="#rast-menu-items" className={s.rastExplore}>اكتشف قائمتنا<ArrowDownLeft aria-hidden="true" /></a>
        <p className={s.rastHeroFootnote}><span aria-hidden="true" />لكل وقت اختيار يليق به</p>
      </div>
    </div>
    <div className={`${s.rastRibbon}${isCustomEditorial ? ` ${kath.ribbon}` : ""}${isShahi ? ` ${shahi.ribbon}` : ""}`} aria-hidden="true"><span>{brandName} على ذوقك</span><span>{isShahi ? brand.mood : "قهوة ومزاج"}</span><span dir="ltr">{isShahi ? brand.wordmark : isCustomEditorial ? "KATH COFFEE & MORE" : "SLOW DOWN SIP ENJOY"}</span></div>
  </section>;
}

export function BistroMenu({ menu: sourceMenu }: { menu: StandaloneMenu }) {
  const [offerTime, setOfferTime] = useState(sourceMenu.highlights?.asOf ?? 0);
  useEffect(() => {
    if (!sourceMenu.highlights) return;
    setOfferTime(Date.now());
    const timer = window.setInterval(() => setOfferTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [sourceMenu.highlights]);
  const menu = sourceMenu.highlights ? { ...sourceMenu, products: sourceMenu.products.map((product) => ({ ...product, promo: getPublishedOfferPromo(product, sourceMenu.highlights, offerTime), offers: getProductOffers(product, sourceMenu.highlights, offerTime) })) } : sourceMenu;
  const reduce = useReducedMotion();
  const isDoubleB = menu.slug === "double-b-bistro";
  const isRast = menu.slug === "rast";
  const isKath = menu.slug === "kat-coffe";
  const isShahi = menu.slug === "shahi-w-hail";
  const isTaza = menu.slug === "taza";
  const isDeli = menu.slug === "delicake";
  const isCustomEditorial = isKath || isShahi || isTaza || isDeli;
  const isEditorial = isRast || isCustomEditorial;
  const displayName = isDoubleB ? "دبل بي" : menuDisplayText(menu.name);
  const heroImage = isDoubleB ? "/menu-art/double-b-hero.webp" : menu.products.find((product) => product.images.length)?.images[0]?.url;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"grid" | "list">(isShahi ? "list" : "grid");
  const [filterOpen, setFilterOpen] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [priceOrder, setPriceOrder] = useState<"original" | "asc" | "desc">("original");
  const searchInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<StandaloneMenuProduct | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);

  const categories = [...menu.categories];
  if (menu.products.some((product) => !product.categoryId)) categories.push({ id: "uncategorized", name: "أصناف أخرى", description: null });
  const visible = menu.products.filter((product) => (category === "all" || (product.categoryId || "uncategorized") === category) && (!availableOnly || product.available) && matchesMenuSearch(product, query));
  if (priceOrder !== "original") visible.sort((a, b) => (productFinalPrice(a.price, a.promo) - productFinalPrice(b.price, b.promo)) * (priceOrder === "asc" ? 1 : -1));
  const sections = categories.map((item) => ({ ...item, products: visible.filter((product) => (product.categoryId || "uncategorized") === item.id) })).filter((item) => item.products.length);
  const browseProducts = selected && !visible.some((product) => product.id === selected.id) ? menu.products : sections.flatMap((section) => section.products);

  function selectCategory(id: string) {
    setCategory(id);
    // Switching categories from deep in the catalog must reveal the new results
    document.getElementById(isEditorial ? "rast-menu-items" : "menu-catalog")?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function browseDish(direction: number) {
    if (!selected || !browseProducts.length) return;
    const index = browseProducts.findIndex((product) => product.id === selected.id);
    setSelected(browseProducts[(index + direction + browseProducts.length) % browseProducts.length]);
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `${menu.name} — المنيو`, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); setShareMessage("تم نسخ رابط المنيو"); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareMessage("يمكنك نسخ الرابط من شريط العنوان");
    }
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setShareMessage(""), 4000);
  }

  return <KathImages.Provider value={isCustomEditorial}><main className={`${s.menu} ${s.venueMenu} ${s.referenceMenu} ${isEditorial ? s.rastMenu : ""}${isCustomEditorial ? ` ${kath.theme}` : ""}${isShahi ? ` ${majlis.theme}` : ""}${isTaza ? ` ${taza.theme}` : ""}${isDeli ? ` ${deli.theme}` : ""}`} dir="rtl"
    style={isCustomEditorial ? { "--product-image-background": "#fff" } as CSSProperties : undefined}>
    {isDeli && <DeliBackground />}
    <a href={isEditorial ? "#rast-menu-items" : "#menu-catalog"} className={s.skipLink}>انتقل إلى الأصناف</a>
    {isDeli ? <DeliHero menu={menu} onSelect={setSelected} onShare={share} onSearch={() => { searchInput.current?.scrollIntoView({ block: "center" }); searchInput.current?.focus({ preventScroll: true }); }} /> : isTaza ? <TazaHero menu={menu} onSelect={setSelected} onShare={share} onSearch={() => { searchInput.current?.scrollIntoView({ block: "center" }); searchInput.current?.focus({ preventScroll: true }); }} /> : isShahi ? <ShahiHero menu={menu} onShare={share} onSearch={() => { searchInput.current?.scrollIntoView({ block: "center" }); searchInput.current?.focus({ preventScroll: true }); }} /> : isEditorial ? <RastHero menu={menu} onShare={share} onSearch={() => { searchInput.current?.scrollIntoView({ block: "center" }); searchInput.current?.focus({ preventScroll: true }); }} /> : <section className={`${s.referenceHero} ${!isDoubleB ? s.brandHero : ""}`} aria-label={`مرحبًا في ${displayName}`}>
      {/* Decorative artwork from the supplied design reference, not a catalogue product photo */}
      {heroImage && <FoodImage src={heroImage} alt="" className={s.heroBackdrop} priority />}
      <header className={s.referenceHeader}>
        <div className={s.heroActions}><MenuServices menu={menu} compact /><button type="button" className={s.heroIcon} aria-label="البحث في المنيو" onClick={() => { document.getElementById("menu-catalog")?.scrollIntoView({ block: "start" }); searchInput.current?.focus({ preventScroll: true }); }}><Search aria-hidden="true" /></button></div>
        <a href="#" className={`${s.wordmark} ${s.brandWordmark}`} aria-label={menu.name}>{menu.logoUrl ? <FoodImage src={menu.logoUrl} alt={menu.name} className={s.brandLogo} priority /> : <><span dir="auto">{displayName}</span><small>MENU</small></>}</a>
        <button type="button" className={`${s.heroIcon} ${s.heroShare}`} onClick={share} aria-label="مشاركة رابط المنيو"><Share2 aria-hidden="true" /></button>
      </header>
      <div className={s.heroCopy}>
        <p className={s.heroKicker} dir="ltr">GOOD FOOD<br />BRIGHTER DAYS</p>
        <h1>مذاق يليق<br /><span>بيومك</span></h1>
        <p className={s.heroDescription}>{isDoubleB ? <>أطباق مختارة بعناية ومكونات طازجة<br />ولمسة إبداعية</> : <>اكتشف قائمة {displayName}<br />واختر ما تشتهيه اليوم</>}</p>
        <a href="#menu-catalog" className={s.heroExplore}>استكشف قائمتنا<ArrowRight aria-hidden="true" /></a>
      </div>
      <p className={s.heroAside} dir="ltr">SIMPLE<br />INGREDIENTS<br />EXTRAORDINARY<br />FLAVORS</p>
    </section>}
    {isRast && <RastConnect />}
    {isKath && <RastConnect previewBrand={editorialBrand(menu.slug).name} />}
    {isRast && menu.loyaltyEnabled && <RastLoyaltyEntry />}
    {isKath && <KathLoyaltyEntry menu={menu} />}
    {isShahi && <ShahiLoyalty menu={menu} />}
    {isTaza && <TazaLoyalty menu={menu} />}
    {isDeli && <DeliLoyalty menu={menu} />}
    <div className={`${s.catalog}${isShahi ? ` ${majlis.catalog}` : ""}${isTaza ? ` ${taza.catalog}` : ""}${isDeli ? ` ${deli.catalog}` : ""}`} id="menu-catalog">
      {isDeli && <DeliOffers menu={menu} onSelect={setSelected} />}
      {isEditorial && !isTaza && !isDeli && <RastSpotlight menu={menu} onSelect={setSelected} />}
      {isDeli ? <div className={deli.catalogIntro} id="rast-menu-items"><div><p>منيو ديلي كيك</p><h2>لكل لحظة <span>طعم حلو</span></h2></div><span dir="ltr">A LITTLE SLICE OF JOY</span></div> : isTaza ? <div className={taza.catalogIntro} id="rast-menu-items"><div><p>قائمة تازا</p><h2>اختيارات على <span>ذوقك</span></h2></div><p dir="ltr">CRAFTED COFFEE<br />SWEET MOMENTS</p></div> : isShahi ? <div className={majlis.catalogIntro} id="rast-menu-items"><div><p>قائمة شاهي وهيل</p><h2>وش نجهّز لك؟</h2></div><p>من أول رشفة<br />إلى آخر لقمة</p></div> : isEditorial && <div className={s.rastCatalogHeading} id="rast-menu-items">
        <div><p className={s.rastEyebrow}>قائمة {isCustomEditorial ? editorialBrand(menu.slug).name : "مقهى الكواكب"}</p><h2>وش يكمّل <span>مزاجك؟</span></h2></div>
        <p>{isShahi ? "من أول رشفة لآخر لقمة" : "من أول قهوة لآخر لقمة"}<br />اختَر لحظتك المفضّلة</p>
      </div>}
      <div className={s.toolbar}>
        <LayoutGroup id={`menu-categories-${menu.slug}`}><nav className={`${s.categories}${isShahi ? ` ${majlis.categories}` : ""}`} aria-label="أقسام المنيو">
          {[{ id: "all", name: "الكل" }, ...categories].map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => selectCategory(item.id)}>
            {category === item.id && <motion.span className={s.activeCategory} layoutId={reduce ? undefined : "active-category"} initial={false} transition={reduce ? { duration: 0 } : menuSprings.snappy} />}
            <CategoryIcon name={menuDisplayText(item.name)} all={item.id === "all"} />
            <span className={s.categoryLabel}>{menuDisplayText(item.name)} <small>{item.id === "all" ? menu.products.length : menu.products.filter((product) => (product.categoryId || "uncategorized") === item.id).length}</small></span>
          </button>)}
        </nav></LayoutGroup>
        <div className={`${s.tools}${isCustomEditorial ? ` ${kath.compactTools}` : ""}`}>
          <label className={`${s.search}${isCustomEditorial ? ` ${kath.compactSearch}` : ""}`}><Search size={18} aria-hidden="true" /><input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isCustomEditorial ? "ابحث عن صنف" : "ما الذي تشتهيه اليوم؟"} aria-label="ابحث في الأصناف والمكونات" /></label>
          <button className={`${s.filterToggle}${isCustomEditorial ? ` ${kath.compactFilter}` : ""}`} type="button" aria-label={isCustomEditorial ? availableOnly || priceOrder !== "original" ? "تصفية الأصناف مفعلة" : "تصفية الأصناف" : undefined} aria-expanded={filterOpen} aria-controls="menu-filters" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal aria-hidden="true" /><span>تصفية{(availableOnly || priceOrder !== "original") && <span aria-label="تصفية مفعلة"> ✓</span>}</span></button>
          {isCustomEditorial && <div className={`${s.viewSwitch} ${kath.compactViews}`} role="group" aria-label="طريقة عرض المنيو"><button type="button" aria-label="عرض الشبكة" title="عرض الشبكة" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={18} aria-hidden="true" /></button><button type="button" aria-label="عرض القائمة" title="عرض القائمة" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={20} aria-hidden="true" /></button></div>}
        </div>
        {filterOpen && <div id="menu-filters" className={s.filterPanel}>
          <label><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />المتوفر حاليًا فقط</label>
          <label>ترتيب الأصناف<select value={priceOrder} onChange={(event) => setPriceOrder(event.target.value as typeof priceOrder)}><option value="original">ترتيب المنيو</option><option value="asc">الأقل سعرًا داخل القسم</option><option value="desc">الأعلى سعرًا داخل القسم</option></select></label>
          {!isCustomEditorial && <div className={s.viewSwitch} role="group" aria-label="طريقة عرض المنيو"><button type="button" aria-label="عرض الصور" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={18} aria-hidden="true" /></button><button type="button" aria-label="عرض القائمة" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={20} aria-hidden="true" /></button></div>}
          <button className={s.resetFilters} type="button" onClick={() => { setAvailableOnly(false); setPriceOrder("original"); setQuery(""); setCategory("all"); }}>إعادة ضبط التصفية</button>
        </div>}
      </div>
      <p className={query ? s.resultCount : s.screenReaderOnly} role="status">{query ? `${visible.length} نتيجة بحث` : `${visible.length} صنفًا`}</p>
      {sections.map((section, sectionIndex) => <section key={section.id} className={`${s.categorySection}${isShahi ? ` ${majlis.categorySection}` : ""}`} aria-labelledby={`category-${section.id}`}>
        <div className={`${s.sectionHeading}${isShahi ? ` ${majlis.sectionHeading}` : ""}`}><h2 id={`category-${section.id}`}>{menuDisplayText(section.name)}<small>{section.products.length}</small></h2>
          {section.description && <details className={s.categoryDescription}><summary aria-label={`عن قسم ${menuDisplayText(section.name)}`}>عن القسم</summary><p>{menuDisplayText(section.description)}</p></details>}
        </div>
        <div className={`${s.productGrid} ${view === "list" ? s.listView : ""}${isShahi ? ` ${majlis.productGrid}${view === "list" ? ` ${majlis.listView}` : ""}` : ""}${isTaza ? ` ${taza.productGrid}${view === "list" ? ` ${taza.listView}` : ""}` : ""}${isDeli ? ` ${deli.productGrid}${view === "list" ? ` ${deli.listView}` : ""}` : ""}`}>
          {section.products.map((product, productIndex) => <DishMotion key={product.id} id={product.id}>
            {product.videos[0] && <div className={`${s.productImage}${isShahi ? ` ${majlis.productImage}` : ""}${isTaza ? ` ${taza.productImage}` : ""}${isDeli ? ` ${deli.productImage}` : ""}`} data-dish-photo>
              <FoodVideo src={product.videos[0].url} alt={product.name} poster={product.images[0]?.url} paused={Boolean(selected)} />
              <ProductOfferBadge product={product} products={menu.products} />
              {!product.available && <span className={s.unavailable}>غير متوفر حاليًا</span>}
            </div>}
            <button type="button" className={`${s.productButton}${isShahi ? ` ${majlis.productButton}` : ""}${isTaza ? ` ${taza.productButton}` : ""}${isDeli ? ` ${deli.productButton}` : ""}`} onClick={() => setSelected(product)} aria-label={`عرض تفاصيل ${product.name}`} aria-describedby={product.offers?.length || (product.available && product.promo && isPromoActive(product.promo)) ? `product-offers-${product.id}` : undefined}>
              {!product.videos[0] && <div className={`${s.productImage}${isShahi ? ` ${majlis.productImage}` : ""}${isTaza ? ` ${taza.productImage}` : ""}${isDeli ? ` ${deli.productImage}` : ""}`} data-dish-photo>
                <FoodImage src={product.images[0]?.url} alt={product.name} priority={sectionIndex === 0 && productIndex < 2} />
                <ProductOfferBadge product={product} products={menu.products} />
                {!product.available && <span className={s.unavailable}>غير متوفر حاليًا</span>}
                <span className={s.imageArrow} aria-hidden="true"><ArrowUpLeft size={19} /></span>
              </div>}
              <div className={`${s.productBody}${isShahi ? ` ${majlis.productBody}` : ""}${isTaza ? ` ${taza.productBody}` : ""}${isDeli ? ` ${deli.productBody}` : ""}`}>
                <div className={s.productName}><h3 dir="auto">{menuDisplayText(product.name)}</h3></div>
                {product.description && <p className={s.productDescription} dir="auto">{menuDisplayText(product.description)}</p>}
                <ProductOfferDetails product={product} products={menu.products} />
                <div className={s.productMeta}>{product.calories != null && <span><Flame size={13} aria-hidden="true" />{product.calories} سعرة</span>}<Price product={product} /></div>
              </div>
            </button>
          </DishMotion>)}
        </div>
      </section>)}
      {!visible.length && <div className={s.empty}><Utensils aria-hidden="true" /><h3>{menu.products.length ? "لم نجد ما تبحث عنه" : "قائمتنا قيد التحضير"}</h3><p>{menu.products.length ? "جرّب اسمًا آخر أو تصفّح جميع الأصناف" : "عد قريبًا لاكتشاف أصنافنا"}</p>{menu.products.length > 0 && <button onClick={() => { setQuery(""); setCategory("all"); setAvailableOnly(false); setPriceOrder("original"); }}>عرض كل المنيو</button>}</div>}
    </div>
    {isShahi && <RastConnect previewBrand={editorialBrand(menu.slug).name} />}
    {isDeli && <DeliOrigins />}
    <footer className={`${s.footer}${isShahi ? ` ${majlis.footer}` : ""}${isTaza ? ` ${taza.footer}` : ""}${isDeli ? ` ${deli.footer}` : ""}`}>
      {isDeli ? <DeliClosing menu={menu} /> : isTaza ? <TazaClosing menu={menu} /> : isShahi ? <ShahiClosing menu={menu} /> : isEditorial ? <section className={`${s.rastClosing}${isCustomEditorial ? ` ${kath.closing}` : ""}`} aria-label={menu.name}>
        <p className={s.rastEyebrow}>كل مرة لحظة حلوة</p><h2>نفس المكان<br /><span>مزاج يتجدّد</span></h2>
        <a href="#menu-catalog" className={s.rastClosingLink}>نرجع لشي تشتهيه<ArrowUpLeft aria-hidden="true" /></a>
        <FoodImage src={menu.logoUrl || (isCustomEditorial ? editorialBrand(menu.slug).logo : "/menu-logos/kawakib-transparent-20261008.png")} alt={menu.name} className={s.rastClosingLogo} />
      </section> : <section className={s.brandSignature} aria-label={menu.name}>{menu.logoUrl ? <FoodImage src={menu.logoUrl} alt={menu.name} className={s.footerLogo} /> : <span className={s.footerName}>{displayName}</span>}<p>لحظتك أحلى مع {displayName}</p><a href="#menu-catalog" className={s.signatureReturn}>نرجع لشي تشتهيه <span aria-hidden="true">↑</span></a></section>}
      <div><span>المنيو الرقمي</span><a className={s.platformCredit} href="https://barndaksa.com" aria-label="بواسطة برندة — اكتشف المنصة">
        <span>بواسطة</span>
        {/* Small local asset avoids an image optimizer round trip */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/barndaksa-footer-v1.webp" alt="برندة" width={68} height={37} loading="lazy" decoding="async" />
      </a></div>
    </footer>
    {shareMessage && <div className={s.toast} role="status"><Check size={18} aria-hidden="true" />{shareMessage}</div>}
    <AnimatePresence mode="wait">{selected && <ProductDetails key={selected.id} product={menu.products.find((product) => product.id === selected.id) ?? selected} products={menu.products} close={() => setSelected(null)} browse={browseDish} position={browseProducts.findIndex((product) => product.id === selected.id)} total={browseProducts.length} />}</AnimatePresence>
  </main></KathImages.Provider>;
}
