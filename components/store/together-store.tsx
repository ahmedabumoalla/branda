"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpLeft, Check, Gift, Leaf, Pause, Play, Search, ShoppingBag, Sprout, X } from "lucide-react";
import { giftOrderInputSchema, type GiftOrderReceipt, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { productMinimumPrice, type GiftCartLine } from "@/lib/commerce/storefront-cart";
import { matchesMenuSearch, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { GiftCheckoutDialog, GiftProductDialog, GiftTrackingDialog, StoreMoney, StorePhoto } from "./gift-store-dialogs";
import s from "./together-store.module.css";
import partnerCollection from "@/data/together-partners.json";

type Props = { menu: StandaloneMenu; settings: GiftStoreSettings | null; loyalty: { purchasesRequired: number; rewardName: string } | null };

const memoryStorage = new Map<string, string>();
function subscribeStorage(listener: () => void) {
  const changed = (event: StorageEvent) => { if (event.key) memoryStorage.delete(event.key); else memoryStorage.clear(); listener(); };
  window.addEventListener("storage", changed);
  window.addEventListener("gift-store-storage", listener);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener("gift-store-storage", listener); };
}
function useStoredString(key: string) {
  const value = useSyncExternalStore(subscribeStorage, () => {
    try { return memoryStorage.get(key) ?? localStorage.getItem(key) ?? ""; } catch { return memoryStorage.get(key) ?? ""; }
  }, () => "");
  return [value, (next: string) => {
    try { localStorage.setItem(key, next); memoryStorage.delete(key); } catch { memoryStorage.set(key, next); }
    window.dispatchEvent(new Event("gift-store-storage"));
  }] as const;
}
function subscribeLocation(listener: () => void) { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }
function readCart(value: string): GiftCartLine[] {
  try { const parsed = giftOrderInputSchema.shape.items.safeParse(JSON.parse(value || "[]")); return parsed.success ? parsed.data.map((line, i) => ({ ...line, key: `saved-${i}` })) : []; } catch { return []; }
}

function subscribeVisibility(listener: () => void) { document.addEventListener("visibilitychange", listener); return () => document.removeEventListener("visibilitychange", listener); }

export function selectHeroPlants(products: StandaloneMenuProduct[]) {
  const eligible = products.filter(product => product.available && product.catalogKind !== "service" && product.images.length);
  const chosen: StandaloneMenuProduct[] = [];
  function pick(matches: (product: StandaloneMenuProduct) => boolean) {
    const product = eligible.find(item => matches(item) && !chosen.some(selected => selected.id === item.id || selected.images[0].url === item.images[0].url));
    if (product && chosen.length < 3) chosen.push(product);
    return product;
  }
  if (!pick(product => /مونستيرا/.test(product.name))) pick(() => true);
  pick(product => /غابات|مصغرة|terrarium/i.test(`${product.category} ${product.name}`));
  pick(product => /هدايا|أهدي|بونساي|انتوريوم|صبار/.test(`${product.category} ${product.name}`));
  for (const candidate of eligible) { if (chosen.length === 3) break; pick(product => product.id === candidate.id); }
  return chosen;
}

export function TogetherHero({ products, onSelect }: { products: StandaloneMenuProduct[]; onSelect: (product: StandaloneMenuProduct) => void }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  const current = index % Math.max(products.length, 1);
  const product = products[current];
  const identity = products.map(item => item.id).join("|");
  const playing = !reduce && !paused && !hovered && !focused && inView && visible;
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing || products.length < 2) return;
    const timer = window.setInterval(() => { if (!document.hidden) setIndex(value => (value + 1) % products.length); }, 6000);
    return () => window.clearInterval(timer);
  }, [playing, products.length, identity]);
  return <section ref={root} className={s.gardenHero} data-together-hero="botanical-atelier-v3" id="together-top" aria-labelledby="together-title" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className={s.gardenAtmosphere} aria-hidden="true"><picture><source media="(max-width: 700px)" srcSet="/together/hero-mobile.webp" /><StorePhoto src="/together/hero.webp" alt="" eager /></picture><span /><span /></div>
    <span className={s.heroWord} dir="ltr" aria-hidden="true">Together</span>
    <div className={s.gardenCopy}><p className={s.eyebrow}><Sprout aria-hidden="true" />من عسير إلى قلبك</p><h1 id="together-title"><motion.span initial={false} whileInView={reduce ? undefined : { opacity: [.4, 1], y: [24, 0] }} viewport={{ once: true }} transition={{ duration: .8 }}>لأن بعض الهدايا</motion.span><motion.em initial={false} whileInView={reduce ? undefined : { opacity: [.4, 1], y: [30, 0] }} viewport={{ once: true }} transition={{ duration: .9, delay: .15 }}>تعيش</motion.em></h1><p className={s.gardenPromise}>أهدِ حبًّا ينمو</p><p className={s.gardenDescription}>غرسة تفتح لها مكانًا<br />وتفتح في يومك حياة</p><div className={s.gardenActions}><a className={s.lightButton} href="#together-products">اختر هديتك الحيّة<ArrowDownLeft aria-hidden="true" /></a><span dir="ltr">A LITTLE GREEN<br />A LOT OF LIFE</span></div></div>
    <motion.div className={s.plantStage} initial={false} whileInView={reduce ? undefined : { opacity: [.45, 1], y: [28, 0], rotate: [-2, 0] }} viewport={{ once: true, amount: .15 }} transition={{ duration: 1.1, ease: [.22, 1, .36, 1] }}>
      <span className={s.orbitLabel} dir="ltr" aria-hidden="true">LIVING GIFTS / TOGETHER PLANTS</span><span className={s.plantOrbit} aria-hidden="true" /><span className={s.botanicalNote} aria-hidden="true"><Leaf /><span>قليل من الأخضر<br /><strong>كثير من الحياة</strong></span></span>
      <div className={s.plantPortal}>
        <span className={s.portalEyebrow}>نباتات حقيقية لحياة أجمل</span>
        <AnimatePresence initial={false} mode="sync">{product && <motion.button key={product.id} className={s.portalProduct} type="button" aria-label={`اكتشف ${product.name}`} onClick={() => onSelect(product)} initial={reduce ? false : { opacity: 0, scale: .94, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, scale: 1.04 }} transition={{ duration: reduce ? 0 : .8, ease: [.22, 1, .36, 1] }}><StorePhoto src={product.images[0]?.url} alt={product.name} eager /><span className={s.portalOpen}><ArrowUpLeft aria-hidden="true" /></span></motion.button>}</AnimatePresence>
        {!product && <div className={s.portalEmpty}><Sprout aria-hidden="true" /><span>كل غرسة بداية حلوة</span></div>}
        <span className={s.portalFloor} aria-hidden="true" />
      </div>
      {product && <div className={s.plantCaption} aria-live={playing ? "off" : "polite"}><div><small>اختيار ينمو معك</small><strong>{product.name}</strong></div><StoreMoney amount={productMinimumPrice(product)} /></div>}
      {products.length > 1 && <div className={s.gardenControls}><nav className={s.gardenThumbs} aria-label="اختر غرسة الافتتاحية">{products.map((item, itemIndex) => <button type="button" key={item.id} aria-label={`عرض ${item.name}`} aria-pressed={current === itemIndex} onClick={() => { setPaused(true); setIndex(itemIndex); }}><StorePhoto src={item.images[0]?.url} alt="" /><span>{String(itemIndex + 1).padStart(2, "0")}</span></button>)}</nav>{!reduce && <button className={s.gardenPause} type="button" aria-label={paused ? "تشغيل تبديل الغراس" : "إيقاف تبديل الغراس"} aria-pressed={!paused} onClick={() => setPaused(value => !value)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}</div>}
    </motion.div>
    <div className={s.gardenSignature}><Leaf aria-hidden="true" /><span>هدية تبقى وتكبر</span><span dir="ltr">TOGETHER WE GROW</span></div>
  </section>;
}

export function TogetherPartners() {
  const root = useRef<HTMLElement>(null);
  const gallery = useRef<HTMLUListElement>(null);
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  const playing = !reduce && !paused && !hovered && !focused && inView && visible;
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const element = gallery.current;
      if (!element || document.hidden) return;
      const end = element.scrollWidth - element.clientWidth;
      if (end <= 1) return;
      if (Math.abs(element.scrollLeft) >= end - 4) element.scrollTo({ left: 0, behavior: "smooth" });
      else element.scrollBy({ left: -((element.firstElementChild?.getBoundingClientRect().width ?? element.clientWidth / 2) + 16), behavior: "smooth" });
    }, 4200);
    return () => window.clearInterval(timer);
  }, [playing]);
  function move(direction: number) {
    setPaused(true);
    const element = gallery.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * .8, behavior: reduce ? "instant" : "smooth" });
  }
  return <section ref={root} className={s.partners} id="together-partners" data-partners-motion="automatic" aria-labelledby="together-partners-title" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className={s.partnersHeading}><div><p className={s.eyebrow}><Sprout aria-hidden="true" />معًا نترك أثرًا أخضر</p><h2 id="together-partners-title">غراسنا <em>في أماكن نحبّها</em></h2></div><span dir="ltr" aria-hidden="true">ROOTED IN<br />GOOD COMPANY</span></div>
    <ul ref={gallery} className={s.partnerGallery} tabIndex={0} aria-label="معرض شعارات غراسنا قابل للتمرير" dir="rtl" onPointerDown={() => setPaused(true)} onWheel={() => setPaused(true)}>{partnerCollection.partners.map((partner, index) => <motion.li key={partner.id} initial={false} whileInView={reduce ? undefined : { opacity: [.5, 1], y: [18, 0] }} viewport={{ once: true, amount: .25 }} transition={{ duration: .65, delay: (index % 3) * .08 }}><div className={s.partnerFrame}><StorePhoto src={partner.path} alt={partner.alt} /></div><Leaf className={s.partnerLeaf} aria-hidden="true" /></motion.li>)}</ul>
    <div className={s.partnersFooter}><p>غراس تجمعنا <span>وحكايات تكبر معنا</span></p><div><button type="button" aria-label="الشعارات السابقة" onClick={() => move(1)}><ArrowRight aria-hidden="true" /></button>{!reduce && <button type="button" aria-label={paused ? "تشغيل حركة الشعارات" : "إيقاف حركة الشعارات"} aria-pressed={!paused} onClick={() => setPaused(value => !value)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}<button type="button" aria-label="الشعارات التالية" onClick={() => move(-1)}><ArrowLeft aria-hidden="true" /></button></div></div>
  </section>;
}

export function TogetherStore({ menu, settings, loyalty }: Props) {
  const reduce = useReducedMotion();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("original");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<StandaloneMenuProduct | null>(null);
  const [storedCart, setStoredCart] = useStoredString(`gift-cart:${menu.slug}`);
  const lines = readCart(storedCart);
  const setLines = (next: GiftCartLine[]) => setStoredCart(JSON.stringify(next));
  const [checkout, setCheckout] = useState(false);
  const [trackingOverride, setTracking] = useState<string | null>(null);
  const locationSearch = useSyncExternalStore(subscribeLocation, () => window.location.search, () => "");
  const queryToken = new URLSearchParams(locationSearch).get("order") ?? "";
  const tracking = trackingOverride ?? (/^[a-zA-Z0-9_-]{32,150}$/.test(queryToken) ? queryToken : "");
  const [lastToken, setLastToken] = useStoredString(`gift-last-order:${menu.slug}`);
  const [receipt, setReceipt] = useState<GiftOrderReceipt | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 5000); return () => window.clearTimeout(timer); }, [notice]);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const filtered = menu.products.filter(p => (category === "all" || p.categoryId === category) && (kind === "all" || (p.catalogKind ?? "product") === kind) && (!availableOnly || p.available) && matchesMenuSearch(p, query));
  if (sort === "low" || sort === "high") filtered.sort((a, b) => (productMinimumPrice(a) - productMinimumPrice(b)) * (sort === "low" ? 1 : -1));
  const categories = menu.categories.filter(c => menu.products.some(p => p.categoryId === c.id && (kind === "all" || (p.catalogKind ?? "product") === kind)));
  const collections = ["أصدقاء الظل", "غابات", "أهد"].flatMap(text => { const c = menu.categories.find(item => item.name.includes(text)); const p = menu.products.find(item => item.categoryId === c?.id && item.images.length); return c && p ? [{ category: c, product: p }] : []; });
  const service = menu.products.find(p => p.commerceDetails?.quoteOnly);
  const heroProducts = selectHeroPlants(menu.products);
  function browse(nextKind = "all", nextCategory = "all") { setKind(nextKind); setCategory(nextCategory); setQuery(""); setLimit(24); document.getElementById("together-products")?.scrollIntoView({ block: "start", behavior: reduce ? "instant" : "smooth" }); }
  function add(product: StandaloneMenuProduct, line: Omit<GiftCartLine, "key" | "productId">) {
    const existingQuote = lines.some(item => menu.products.find(p => p.id === item.productId)?.commerceDetails?.quoteOnly);
    if (lines.length && (existingQuote || product.commerceDetails?.quoteOnly)) return "أكمل طلبك الحالي أولًا لتقديم طلب التصميم بشكل مستقل";
    if (lines.length >= 30) return "يمكن إضافة ٣٠ صنفًا في الطلب الواحد";
    setLines([...lines, { ...line, productId: product.id, key: crypto.randomUUID() }]); setSelected(null);
    if (product.commerceDetails?.quoteOnly) setCheckout(true); else setNotice(`أضيف ${product.name} إلى سلتك`);
    return null;
  }
  function received(value: GiftOrderReceipt) { setReceipt(value); setTracking(value.trackingToken); setLastToken(value.trackingToken); setCheckout(false); }
  const brandLogo = menu.logoUrl || "/together/logo.webp";
  return <main className={s.store} dir="rtl" data-together-store="living-garden-v2">
    <a className={s.skipLink} href="#together-products">انتقل إلى المنتجات والخدمات</a>
    <div className={s.topline}><Sprout aria-hidden="true" /><span>معًا نزرع حياة</span><span dir="ltr">PLANTS & PEOPLE THRIVE</span></div>
    <header className={s.header}>
      <a href="#together-top" className={s.wordmark} aria-label="Together Plants الرئيسية"><StorePhoto src={brandLogo} alt="Together Plants" eager /><span><b dir="ltr">Together Plants</b><small>معًا للنباتات</small></span></a>
      <nav className={s.desktopNav} aria-label="أقسام المتجر"><a href="#together-products" onClick={() => browse()}>غراسنا</a><button onClick={() => browse("service")}>خدمات وتجارب</button>{loyalty && <a href="#together-loyalty">رفاق الطبيعة</a>}{lastToken && <button onClick={() => setTracking(lastToken)}>متابعة طلبي</button>}</nav>
      <div className={s.headerActions}><button className={s.iconButton} aria-label="البحث في المنتجات" onClick={() => { search.current?.scrollIntoView({ block: "center" }); search.current?.focus({ preventScroll: true }); }}><Search /></button><button className={s.cartButton} aria-label={`السلة ${count} أصناف`} onClick={() => setCheckout(true)}><ShoppingBag /><span className={s.cartCount}>{count}</span></button></div>
    </header>
    <TogetherHero products={heroProducts} onSelect={setSelected} />
    {menu.loyaltyEnabled && loyalty && <section className={s.loyalty} id="together-loyalty" aria-labelledby="together-loyalty-title" data-loyalty-design="signature-card">
      <div className={s.loyaltyInvitation}><p className={s.eyebrow}><Gift aria-hidden="true" />الولاء والمكافآت</p><h2 id="together-loyalty-title">غراس منك <em>ومكافآت لك</em></h2><p>اجمع <strong>{loyalty.purchasesRequired.toLocaleString("ar-SA")} أختام</strong> واحصل على <strong>{loyalty.rewardName}</strong></p></div>
      <Link className={s.loyaltyCard} href={`/loyalty/${menu.slug}?source=menu`} aria-label="بطاقة ولاء Together Plants">
        <div><div className={s.memberName}><span dir="ltr">Together Plants</span><small>بطاقة الولاء والمكافآت</small></div><span className={s.memberEmblem}><StorePhoto src="/together/logo.webp" alt="شعار توقذر بلانتس" /></span></div>
        <div className={s.stampRow} aria-hidden="true">{Array.from({ length: Math.min(10, loyalty.purchasesRequired) }, (_, i) => <span key={i}>{i === loyalty.purchasesRequired - 1 ? <Gift /> : <Leaf />}</span>)}</div>
        <footer><span>مكافأتك بعد {loyalty.purchasesRequired.toLocaleString("ar-SA")} أختام</span><strong>{loyalty.rewardName}</strong></footer>
      </Link>
      <Link className={s.loyaltyLink} href={`/loyalty/${menu.slug}?source=menu`} onClick={() => trackBrandEngagement(menu.slug, "menu_loyalty_click")}>افتح بطاقة الولاء والمكافآت<ArrowUpLeft aria-hidden="true" /></Link>
    </section>}
    <section className={s.introduction} aria-label="عالم Together"><p className={s.eyebrow}>أشياء صغيرة تصنع فرقًا</p><h2>مساحة تحبّها<br /><span>وحياة تنمو معها</span></h2><p>من نبتة ترافق يومك إلى هدية تعبّر عنك<br />غراس اخترناها لتجد مكانها عندك</p><span className={s.botanicalSeal} aria-hidden="true"><Sprout /><span dir="ltr">TOGETHER, WE GROW</span></span></section>
    {!!collections.length && <nav className={s.collections} aria-label="مجموعات الغراس">{collections.map(({ category: c, product }, i) => <button key={c.id} onClick={() => browse("product", c.id)}><div><StorePhoto src={product.images[0].url} alt={c.name} /></div><span><small>{i === 0 ? "رفاق البيت" : i === 1 ? "عالم صغير" : "لمن تحب"}</small><strong>{c.name}</strong></span><ArrowUpLeft aria-hidden="true" /></button>)}</nav>}
    <section className={s.catalog} id="together-products" aria-labelledby="together-catalog-title">
      <div className={s.sectionTitle}><div><p className={s.eyebrow}>اكتشف عالمنا الأخضر</p><h2 id="together-catalog-title">غراسنا <em>واختياراتك</em></h2></div><span dir="ltr">THE GREEN COLLECTION</span></div>
      <div className={s.catalogToolbar}><nav className={s.kindTabs} aria-label="نوع العرض">{[["all", "الكل"], ["product", "النباتات والهدايا"], ["service", "الخدمات والورش"]].map(([value, label]) => <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setCategory("all"); setLimit(24); }}>{label}</button>)}</nav><div className={s.catalogTools}><label className={s.search}><Search /><input ref={search} type="search" placeholder="ابحث عن غرسة أو تجربة" aria-label="ابحث عن منتج أو خدمة" value={query} onChange={e => { setQuery(e.target.value); setLimit(24); }} /></label><label className={s.sort}><span>الترتيب</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="original">اختيارات المتجر</option><option value="low">الأقل سعرًا</option><option value="high">الأعلى سعرًا</option></select></label></div></div>
      <nav className={s.categoryTabs} aria-label="تصنيفات المنتجات">{[{ id: "all", name: "جميع التصنيفات" }, ...categories].map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => { setCategory(c.id); setLimit(24); }}>{c.name}</button>)}</nav>
      <div className={s.results}><p role="status">{filtered.length} {kind === "service" ? "خدمة وتجربة" : "اختيارًا"}</p><label><input type="checkbox" checked={availableOnly} onChange={e => { setAvailableOnly(e.target.checked); setLimit(24); }} />المتاح الآن فقط</label></div>
      <div className={s.productGrid}>{filtered.slice(0, limit).map((product, productIndex) => <motion.article className={s.productCard} key={product.id} initial={false} whileInView={reduce ? undefined : { opacity: [.45, 1], y: [24, 0] }} viewport={{ once: true, amount: .1 }} transition={{ duration: .65, delay: (productIndex % 4) * .06 }}>
        <button className={s.productCardButton} onClick={() => setSelected(product)} aria-label={`تفاصيل ${product.name}`}><span className={s.productImage}><StorePhoto src={product.images[0]?.url} alt={product.name} />{!product.available ? <span className={s.stockBadge}>نفد حاليًا</span> : product.catalogKind === "service" ? <span className={s.serviceBadge}>خدمة وتجربة</span> : null}<span className={s.productArrow}><ArrowUpLeft /></span></span><span className={s.productCategory}>{product.category}</span><h3>{product.name}</h3><span className={s.productPrice}>{product.commerceDetails?.quoteOnly ? <strong>طلب عرض سعر</strong> : <>{Boolean(product.commerceDetails?.options?.length || product.commerceDetails?.optionGroups?.length) && <small>ابتداءً من</small>}<StoreMoney amount={productMinimumPrice(product)} /></>}</span></button>
      </motion.article>)}</div>
      {!filtered.length && <div className={s.empty}><Search /><h3>ما لقينا نتيجة تطابق بحثك</h3><button className={s.secondary} onClick={() => { setQuery(""); setKind("all"); setCategory("all"); setAvailableOnly(false); }}>عرض كل الاختيارات</button></div>}
      {limit < filtered.length && <button className={s.loadMore} onClick={() => setLimit(n => n + 24)}>اكتشف المزيد <span>{Math.min(limit, filtered.length)} / {filtered.length}</span><ArrowDownLeft /></button>}
    </section>
    {service && <motion.section initial={false} whileInView={reduce ? undefined : { opacity: [.55, 1], y: [28, 0] }} viewport={{ once: true, amount: .15 }} transition={{ duration: .8 }} className={s.designService} aria-labelledby="together-design-title"><div className={s.designVisual}><StorePhoto src={service.images[0]?.url || "/together/hero.webp"} alt="تصاميم لمساحاتكم الخاصة" /><span>مساحتك<br /><em>بروح خضراء</em></span></div><div className={s.designCopy}><p className={s.eyebrow}>خدمة | تصميم</p><h2 id="together-design-title">تصاميم لمساحاتكم الخاصة</h2><p>تطوير وتشغيل مزارع ذكية بمعايير مستدامة</p><p>تعليم وتجربة: رحلات مدرسية وبرامج تفاعلية</p><button className={s.primary} onClick={() => setSelected(service)}>خلّنا نعرف مساحتك<ArrowUpLeft /></button><button className={s.textLink} onClick={() => browse("service")}>استكشف الخدمات والورش<ArrowLeftIcon /></button></div></motion.section>}
    <TogetherPartners />
    <footer className={s.footer}><div><StorePhoto src={brandLogo} alt="شعار Together Plants" /><p>سياحة بيئية: وجهتكم الأولى للاستدامة في قلب عسير</p></div><nav aria-label="روابط المتجر"><a href="#together-products">المنتجات والخدمات</a><a href="#together-partners">غراسنا</a><a href="https://wa.me/966567874278" target="_blank" rel="noopener noreferrer">تواصل معنا</a>{lastToken && <button onClick={() => setTracking(lastToken)}>متابعة طلبي</button>}{menu.contacts.instagramUrl && <a href={menu.contacts.instagramUrl} target="_blank" rel="noopener noreferrer">إنستغرام</a>}<a href="https://linktr.ee/together2000" target="_blank" rel="noopener noreferrer">كل روابط Together<ArrowUpLeft aria-hidden="true" /></a><Link href="/">بواسطة برندة</Link></nav><span className={s.footerWord} dir="ltr">Together, we grow.</span></footer>
    {count > 0 && !checkout && !selected && !tracking && <button className={s.floatingCart} onClick={() => setCheckout(true)}><ShoppingBag /><span>سلة اختياراتك</span><strong>{count}</strong><ArrowUpLeft /></button>}
    {notice && <div className={s.toast} role="status"><Check /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="إغلاق التنبيه"><X /></button></div>}
    {selected && <GiftProductDialog key={selected.id} product={selected} close={() => setSelected(null)} add={add} orderingEnabled={Boolean(settings?.enabled)} />}
    {checkout && settings && <GiftCheckoutDialog slug={menu.slug} lines={lines} products={menu.products} settings={settings} setLines={setLines} close={() => setCheckout(false)} onReceipt={received} />}
    {checkout && !settings && <div className={s.toast} role="status"><span>المتجر يجهّز خيارات الطلب تواصل معنا للمساعدة</span><button onClick={() => setCheckout(false)} aria-label="إغلاق"><X /></button></div>}
    {tracking && <GiftTrackingDialog key={tracking} slug={menu.slug} token={tracking} receipt={receipt?.trackingToken === tracking ? receipt : null} close={() => setTracking("")} />}
  </main>;
}

function ArrowLeftIcon() { return <ArrowUpLeft aria-hidden="true" />; }
