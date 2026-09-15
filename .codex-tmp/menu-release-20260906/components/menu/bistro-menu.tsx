"use client";

import { ArrowUpLeft, ArrowRight, CakeSlice, Check, ChevronLeft, ChevronRight, Clock3, Coffee, CookingPot, Flame, GlassWater, LayoutGrid, List, Search, Share2, SlidersHorizontal, Utensils, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { menuMotion, menuSprings } from "@/lib/menu/motion-foundations";
import { isPromoActive, productFinalPrice, promoBadgeText } from "@/lib/mock/menu";
import { matchesMenuSearch, menuDisplayText, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import s from "./bistro-menu.module.css";
import { MenuServices } from "./menu-services";
import { DishMotion } from "./menu-motion";

function FoodImage({ src, alt, className = "", priority = false }: { src?: string; alt: string; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={`${s.imageFallback} ${className}`} role="img" aria-label={alt}><Utensils aria-hidden="true" /></span>;
  // Original, signed Storage and imported menu images; never substitute stock photography.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => setFailed(true)} />;
}

function Price({ product }: { product: StandaloneMenuProduct }) {
  const final = productFinalPrice(product.price, product.promo);
  return <span className={s.price}>
    {final !== product.price && <del>{product.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</del>}
    <b dir="ltr">{final.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b><span>ريال</span>
  </span>;
}

function CategoryIcon({ name, all }: { name: string; all: boolean }) {
  const Icon = all ? LayoutGrid : /باردة/.test(name) ? GlassWater : /مشروبات/.test(name) ? Coffee : /حلا|حلو/.test(name) ? CakeSlice : /إفطار/.test(name) ? CookingPot : Utensils;
  return <Icon aria-hidden="true" />;
}

function ProductDetails({ product, close, browse, position, total }: { product: StandaloneMenuProduct; close: () => void; browse: (direction: number) => void; position: number; total: number }) {
  const reduce = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const media = [...product.images.map((item) => ({ ...item, type: "image" as const })), ...product.videos.map((item) => ({ ...item, type: "video" as const }))];
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
        {current?.type === "video" ? <video key={current.url} src={current.url} controls playsInline preload="metadata" aria-label={current.alt} />
          : <FoodImage key={current?.url ?? product.id} src={current?.url} alt={current?.alt || product.name} priority />}
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
        {product.promo && isPromoActive(product.promo) && <p className={s.promo}>{promoBadgeText(product.promo)}</p>}
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

export function BistroMenu({ menu }: { menu: StandaloneMenu }) {
  const reduce = useReducedMotion();
  const isDoubleB = menu.slug === "double-b-bistro";
  const displayName = isDoubleB ? "دبل بي" : menuDisplayText(menu.name);
  const heroImage = isDoubleB ? "/menu-art/double-b-hero.webp" : menu.products.find((product) => product.images.length)?.images[0]?.url;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
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
  const browseProducts = sections.flatMap((section) => section.products);

  function selectCategory(id: string) {
    setCategory(id);
    // Switching categories from deep in the catalog must reveal the new results
    document.getElementById("menu-catalog")?.scrollIntoView({ block: "start", behavior: "instant" });
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

  return <main className={`${s.menu} ${s.venueMenu} ${s.referenceMenu}`} dir="rtl">
    <a href="#menu-catalog" className={s.skipLink}>انتقل إلى الأصناف</a>
    <section className={`${s.referenceHero} ${!isDoubleB ? s.brandHero : ""}`} aria-label={`مرحبًا في ${displayName}`}>
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
    </section>
    <div className={s.catalog} id="menu-catalog">
      <div className={s.toolbar}>
        <LayoutGroup id={`menu-categories-${menu.slug}`}><nav className={s.categories} aria-label="أقسام المنيو">
          {[{ id: "all", name: "الكل" }, ...categories].map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => selectCategory(item.id)}>
            {category === item.id && <motion.span className={s.activeCategory} layoutId={reduce ? undefined : "active-category"} initial={false} transition={reduce ? { duration: 0 } : menuSprings.snappy} />}
            <CategoryIcon name={menuDisplayText(item.name)} all={item.id === "all"} />
            <span className={s.categoryLabel}>{menuDisplayText(item.name)} <small>{item.id === "all" ? menu.products.length : menu.products.filter((product) => (product.categoryId || "uncategorized") === item.id).length}</small></span>
          </button>)}
        </nav></LayoutGroup>
        <div className={s.tools}>
          <label className={s.search}><Search size={18} aria-hidden="true" /><input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ما الذي تشتهيه اليوم؟" aria-label="ابحث في الأصناف والمكونات" /></label>
          <button className={s.filterToggle} type="button" aria-expanded={filterOpen} aria-controls="menu-filters" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal aria-hidden="true" /><span>تصفية{(availableOnly || priceOrder !== "original") && <span aria-label="تصفية مفعلة"> ✓</span>}</span></button>
        </div>
        {filterOpen && <div id="menu-filters" className={s.filterPanel}>
          <label><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />المتوفر حاليًا فقط</label>
          <label>ترتيب الأصناف<select value={priceOrder} onChange={(event) => setPriceOrder(event.target.value as typeof priceOrder)}><option value="original">ترتيب المنيو</option><option value="asc">الأقل سعرًا داخل القسم</option><option value="desc">الأعلى سعرًا داخل القسم</option></select></label>
          <div className={s.viewSwitch} role="group" aria-label="طريقة عرض المنيو"><button type="button" aria-label="عرض الصور" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={18} aria-hidden="true" /></button><button type="button" aria-label="عرض القائمة" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={20} aria-hidden="true" /></button></div>
          <button className={s.resetFilters} type="button" onClick={() => { setAvailableOnly(false); setPriceOrder("original"); setQuery(""); setCategory("all"); }}>إعادة ضبط التصفية</button>
        </div>}
      </div>
      <p className={query ? s.resultCount : s.screenReaderOnly} role="status">{query ? `${visible.length} نتيجة بحث` : `${visible.length} صنفًا`}</p>
      {sections.map((section, sectionIndex) => <section key={section.id} className={s.categorySection} aria-labelledby={`category-${section.id}`}>
        <div className={s.sectionHeading}><h2 id={`category-${section.id}`}>{menuDisplayText(section.name)}<small>{section.products.length}</small></h2>
          {section.description && <details className={s.categoryDescription}><summary aria-label={`عن قسم ${menuDisplayText(section.name)}`}>عن القسم</summary><p>{menuDisplayText(section.description)}</p></details>}
        </div>
        <div className={`${s.productGrid} ${view === "list" ? s.listView : ""}`}>
          {section.products.map((product, productIndex) => <DishMotion key={product.id} id={product.id}>
            <button type="button" className={s.productButton} onClick={() => setSelected(product)} aria-label={`عرض تفاصيل ${product.name}`}>
              <div className={s.productImage} data-dish-photo>
                <FoodImage src={product.images[0]?.url} alt={product.name} priority={sectionIndex === 0 && productIndex < 2} />
                {!product.available && <span className={s.unavailable}>غير متوفر حاليًا</span>}
                <span className={s.imageArrow} aria-hidden="true"><ArrowUpLeft size={19} /></span>
              </div>
              <div className={s.productBody}>
                <div className={s.productName}><h3 dir="auto">{menuDisplayText(product.name)}</h3></div>
                {product.description && <p className={s.productDescription} dir="auto">{menuDisplayText(product.description)}</p>}
                <div className={s.productMeta}>{product.calories != null && <span><Flame size={13} aria-hidden="true" />{product.calories} سعرة</span>}<Price product={product} /></div>
              </div>
            </button>
          </DishMotion>)}
        </div>
      </section>)}
      {!visible.length && <div className={s.empty}><Utensils aria-hidden="true" /><h3>{menu.products.length ? "لم نجد ما تبحث عنه" : "قائمتنا قيد التحضير"}</h3><p>{menu.products.length ? "جرّب اسمًا آخر أو تصفّح جميع الأصناف" : "عد قريبًا لاكتشاف أصنافنا"}</p>{menu.products.length > 0 && <button onClick={() => { setQuery(""); setCategory("all"); setAvailableOnly(false); setPriceOrder("original"); }}>عرض كل المنيو</button>}</div>}
    </div>
    <footer className={s.footer}>
      <section className={s.brandSignature} aria-label={menu.name}>{menu.logoUrl ? <FoodImage src={menu.logoUrl} alt={menu.name} className={s.footerLogo} /> : <span className={s.footerName}>{displayName}</span>}<p>لحظتك أحلى مع {displayName}</p><a href="#menu-catalog" className={s.signatureReturn}>نرجع لشي تشتهيه <span aria-hidden="true">↑</span></a></section>
      <div><span>المنيو الرقمي</span><span>بواسطة <b>برندة</b></span></div>
    </footer>
    {shareMessage && <div className={s.toast} role="status"><Check size={18} aria-hidden="true" />{shareMessage}</div>}
    <AnimatePresence mode="wait">{selected && <ProductDetails key={selected.id} product={selected} close={() => setSelected(null)} browse={browseDish} position={browseProducts.findIndex((product) => product.id === selected.id)} total={browseProducts.length} />}</AnimatePresence>
  </main>;
}
