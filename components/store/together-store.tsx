"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpLeft, Check, Gift, Leaf, Pause, Play, Search, ShoppingBag, Sprout, X } from "lucide-react";
import { giftOrderInputSchema, type GiftOrderReceipt, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { productMinimumPrice, type GiftCartLine } from "@/lib/commerce/storefront-cart";
import { matchesMenuSearch, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { GiftCheckoutDialog, GiftProductDialog, GiftTrackingDialog, StoreMoney, StorePhoto } from "./gift-store-dialogs";
import s from "./together-store.module.css";
import { TogetherBrandMark } from "@/components/store/together-brand-mark";
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

export function TogetherHero({ loyaltyEnabled = false }: { loyaltyEnabled?: boolean }) {
  return <section className={s.canopyHero} data-together-hero="immersive-canopy-v6" id="together-top" aria-labelledby="together-title">
    <div className={s.canopyContent}>
      <TogetherBrandMark className={s.canopyMark} />
      <h1 id="together-title" className={s.canopyTitle}>أهدِ حبًّا <em>ينمو</em></h1>
      <p className={s.canopyDescription}>غراس وهدايا تنمو معها الحكايات</p>
      <div className={s.canopyActions}><a className={s.canopyCta} href="#together-products">اكتشف الغراس والهدايا<ArrowDownLeft aria-hidden="true" /></a>{loyaltyEnabled && <a className={s.canopyLoyalty} href="#together-loyalty"><Gift aria-hidden="true" />الولاء والمكافآت<ArrowDownLeft aria-hidden="true" /></a>}</div>
    </div>
    <div className={s.canopySignature}><span dir="ltr">PLANTS & PEOPLE THRIVE</span><span>من عسير إلى قلبك</span></div>
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

export function TogetherRibbon() {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const phrases = ["معًا نزرع حياة", "أهدِ حبًّا ينمو", "غراس وهدايا تنمو معها الحكايات"];
  return <div className={s.ribbon} data-together-ribbon="wood-to-ivory" data-paused={paused}>
    <p className={s.ribbonDescription}>{phrases.join(" — ")}</p>
    <div className={s.ribbonViewport} aria-hidden="true"><div className={s.ribbonTrack}>{[0, 1].map(copy => <div className={s.ribbonGroup} key={copy}>{phrases.map(phrase => <span dir="rtl" key={phrase}><Leaf />{phrase}</span>)}</div>)}</div></div>
    {!reduce && <button type="button" className={s.ribbonControl} aria-label={paused ? "تشغيل حركة العبارات" : "إيقاف حركة العبارات"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}
  </div>;
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
  return <main className={s.store} dir="rtl" data-together-store="immersive-canopy-v6">
    <a className={s.skipLink} href="#together-products">انتقل إلى المنتجات والخدمات</a>
    <div className={s.immersiveOpening}>
      <div className={s.canopyBackdrop} aria-hidden="true"><picture><source media="(max-width: 760px)" srcSet="/together/atelier-desk-mobile.webp" /><StorePhoto src="/together/atelier-desk.webp" alt="" eager /></picture></div>
      <header className={s.canopyHeader}>
        <a href="#together-top" className={s.canopyHeaderSignature}><Sprout aria-hidden="true" /><span>معًا نزرع حياة</span></a>
        <nav className={s.canopyNav} aria-label="أقسام المتجر"><a href="#together-products" onClick={() => browse()}>الغراس والهدايا</a><button onClick={() => browse("service")}>خدمات وتجارب</button>{loyalty && <a href="#together-loyalty">الولاء والمكافآت</a>}{lastToken && <button onClick={() => setTracking(lastToken)}>متابعة طلبي</button>}</nav>
        <div className={s.canopyHeaderActions}><button aria-label="البحث في المنتجات" onClick={() => { search.current?.scrollIntoView({ block: "center" }); search.current?.focus({ preventScroll: true }); }}><Search /></button><button className={s.canopyCart} aria-label={`السلة ${count} أصناف`} onClick={() => setCheckout(true)}><ShoppingBag /><span>{count}</span></button></div>
      </header>
      <TogetherHero loyaltyEnabled={menu.loyaltyEnabled && Boolean(loyalty)} />
    </div>
    <TogetherRibbon />
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
