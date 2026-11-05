"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowUpLeft, Check, ChevronLeft, ChevronRight, Coffee, Search, Share2, Sparkles, WalletCards, Pause, Play, Palette, PartyPopper } from "lucide-react";
import { matchesMenuSearch, menuDisplayText, type StandaloneHighlight, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { productFinalPrice } from "@/lib/mock/menu";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { menuEntryUrl, startMenuAtTop } from "@/lib/menu/menu-entry-scroll";
import { ProductDetails } from "./bistro-menu";
import { MenuServices } from "./menu-services";
import { BrandLoyaltyEntry } from "./brand-loyalty-entry";
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

export function LocoSpotlight({ offers, menu, onSelect }: { offers: StandaloneHighlight[]; menu: StandaloneMenu; onSelect: (id: string) => void }) {
  const reduce = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const pointer = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const offerKey = offers.map(o => o.id).join("|");
  const current = index % Math.max(offers.length, 1);
  const active = offers[current];
  const playing = !reduce && !paused && !hovered && !focused && inView;
  useEffect(() => {
    const target = section.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .2 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing || offers.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex(i => (i + 1) % offers.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [playing, offerKey, offers.length]);
  if (!active) return null;
  const product = menu.products.find(p => p.id === active.productId);
  const isExperience = Boolean(product && /تجارب|مناسبات/.test(product.category));
  const isParty = Boolean(product && /مناسبات/.test(product.category));
  const Symbol = isParty ? PartyPopper : Palette;
  function step(direction: number) { setPaused(true); setIndex((current + direction + offers.length) % offers.length); }
  return <section ref={section} className={s.experience} id="loco-offers" aria-labelledby="loco-offers-title" aria-roledescription="عارض العروض والتجارب"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
    <div className={s.sectionHeading}><div><p className={s.kicker}>لحظات لوكو</p><h2 id="loco-offers-title">تستاهل <em>التجربة</em></h2></div><span dir="ltr">A LITTLE EXTRA LOCO</span></div>
    <div className={s.offerViewport} onPointerDown={e => { pointer.current = e.clientX; }} onPointerCancel={() => { pointer.current = null; }} onPointerUp={e => {
      if (pointer.current !== null && Math.abs(e.clientX - pointer.current) > 60) step(e.clientX > pointer.current ? 1 : -1);
      pointer.current = null;
    }}>
      <AnimatePresence initial={false} mode="wait">
        <motion.article key={active.id} className={s.offer} data-experience={isExperience} aria-roledescription="شريحة" aria-label={`${current + 1} من ${offers.length}`} aria-live={playing ? "off" : "polite"}
          initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -10 }} transition={{ duration: .32 }}>
          <div className={s.offerCopy}>
            <span className={s.offerLabel}>{active.discountPercent ? `خصم ${active.discountPercent}٪` : isParty ? "لمّتك في لوكو" : isExperience || active.kind === "event" ? "تجربة تستاهل وقتك" : "اختيار يحلّي يومك"}</span>
            <h3>{menuDisplayText(active.title)}</h3>
            {active.description && <p>{menuDisplayText(active.description)}</p>}
            {active.code && <p>كود العرض <bdi>{active.code}</bdi></p>}
            {active.eventDate && <p>الموعد <bdi>{active.eventDate}</bdi> <bdi>{active.eventTime}</bdi></p>}
            {active.eventLocation && <p>{active.eventLocation}</p>}
            <div className={s.offerBottom}>{product && <Price product={product} />}{product ? <button className={s.offerAction} type="button" onClick={() => onSelect(product.id)}>{isExperience ? "تفاصيل التجربة" : "اكتشفه الآن"}<ArrowUpLeft aria-hidden="true" /></button> : <a className={s.offerAction} href="#loco-catalog">تصفح المنيو<ArrowDownLeft aria-hidden="true" /></a>}</div>
          </div>
          <div className={s.offerPhoto}>
            {isExperience ? <div className={s.experienceArt} aria-hidden="true"><span className={s.artOrbit} /><Symbol /><span className={s.artCaption}>{isParty ? "لمّة حلوة" : "خلّك فنان"}</span><span className={s.artSignature} dir="ltr">LOCÓ MOMENTS</span></div> : <Photo src={active.imageUrl || product?.images[0]?.url} alt={active.title} />}
            <span className={s.offerSerial} dir="ltr">{String(current + 1).padStart(2, "0")} / {String(offers.length).padStart(2, "0")}</span>
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
    {offers.length > 1 && <div className={s.offerNavigation}><nav className={s.offerTabs} aria-label="اختر العرض أو التجربة">{offers.map((offer, i) => <button key={offer.id} type="button" aria-pressed={current === i} onClick={() => { setPaused(true); setIndex(i); }}><span className={s.offerDot} aria-hidden="true" />{offer.title}</button>)}</nav><div className={s.offerControls}>
      <button type="button" aria-label="العرض السابق" onClick={() => step(-1)}><ChevronRight aria-hidden="true" /></button>
      {!reduce && <button type="button" aria-label={paused ? "تشغيل تبديل العروض" : "إيقاف تبديل العروض"} aria-pressed={!paused} onClick={() => setPaused(p => !p)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}
      <button type="button" aria-label="العرض التالي" onClick={() => step(1)}><ChevronLeft aria-hidden="true" /></button>
    </div></div>}
  </section>;
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
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(source.highlights?.asOf ?? 0);
  useEffect(() => startMenuAtTop(root.current), []);
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);
  useEffect(() => {
    if (!source.highlights?.items.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [source.highlights]);
  const highlights = source.highlights && { ...source.highlights, items: source.highlights.items.map(offer => ({ ...offer,
    description: offer.description?.replace(/\s+في (?:الدرايف ثرو|فرع المروج)\s*$/u, ""),
  })) };
  const menu: StandaloneMenu = { ...source, highlights, products: source.products.map(p => ({ ...p, promo: getPublishedOfferPromo(p, highlights, now), offers: getProductOffers(p, highlights, now) })) };
  const drive = menu.branch?.slug === "drive-thru";
  const experienceIds = new Set(menu.categories.filter(c => /تجارب|مناسبات/.test(c.name)).map(c => c.id));
  const experiences = menu.products.filter(p => p.categoryId && experienceIds.has(p.categoryId));
  const catalogProducts = menu.products.filter(p => !p.categoryId || !experienceIds.has(p.categoryId));
  const photos = catalogProducts.filter(p => p.images.length && p.available);
  const hero = photos.find(p => drive ? /بوكس ميني/.test(p.name) : /بريوش دجاج/.test(p.name)) ?? photos[0];
  const second = photos.find(p => /سبانش/.test(p.name)) ?? photos.find(p => p.id !== hero?.id);
  const published = (menu.highlights?.items ?? []).filter(o => o.showInSpotlight !== false && (o.expiresAt == null || o.expiresAt >= now));
  const offers: StandaloneHighlight[] = [...published, ...experiences.filter(p => !published.some(o => o.productId === p.id)).map(p => ({ id: `experience-${p.id}`, title: p.name, description: p.description, imageUrl: p.images[0]?.url ?? null, productId: p.id, discountPercent: null, code: null, expiresAt: null }))];
  const categories = menu.categories.filter(c => !experienceIds.has(c.id));
  if (catalogProducts.some(p => !p.categoryId)) categories.push({ id: "uncategorized", name: "أصناف أخرى", description: null });
  const visible = catalogProducts.filter(p => (category === "all" || (p.categoryId || "uncategorized") === category) && matchesMenuSearch(p, query));
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
  const logo = "/loco/logo.svg";
  return <main ref={root} className={`${base.menu} ${s.page}`} dir="rtl" data-loco-menu="editorial-v3" data-branch={drive ? "drive" : "murooj"}>
    <a href="#loco-catalog" className={base.skipLink}>انتقل إلى الأصناف</a>
    <section className={s.opening} id="loco-top" aria-labelledby="loco-title">
      <header className={s.header}>
        <a className={s.headerMood} href="#loco-top">قهوة وحلا <span>ومزاج لوكو</span><Sparkles aria-hidden="true" /></a>
        <div className={s.actions}><button type="button" onClick={focusSearch} aria-label="البحث في المنيو"><Search aria-hidden="true" /></button><button type="button" onClick={share} aria-label="مشاركة المنيو"><Share2 aria-hidden="true" /></button><MenuServices menu={menu} compact /></div>
      </header>
      <div className={s.hero}>
        <div className={s.heroIdentity}><p className={s.identityOverline}>كل مزاج وله</p><Photo className={s.heroLogo} src={logo} alt="LOCO لوكو" eager /><span className={s.identityNote} dir="ltr">COFFEE · BITES · GOOD TIMES</span><Sparkles className={s.identitySpark} aria-hidden="true" /></div>
        <div className={s.heroCopy}><p className={s.kicker}>لحظتك الحلوة تبدأ هنا</p><h1 id="loco-title"><span>{drive ? "خذ مزاجك" : "خذ وقتك"}</span><em>{drive ? "معك" : "خلّها لوكو"}</em></h1><p className={s.description}>{drive ? "قهوة تضبط الطريق ودونات تحلّي المشوار" : "فطور على رواق وقهوة ولحظة تستاهل تعيشها"}</p><a className={s.primary} href="#loco-catalog">اكتشف المنيو<ArrowDownLeft aria-hidden="true" /></a><div className={s.heroLinks}>{menu.loyaltyEnabled && loyalty && <a href="#loco-loyalty"><WalletCards aria-hidden="true" />بطاقتك في لوكو</a>}{offers.length > 0 && <a href="#loco-offers">تستاهل التجربة<ArrowDownLeft aria-hidden="true" /></a>}</div></div>
        {hero && <div className={s.heroStage}><span className={s.sunburst} aria-hidden="true">{drive ? <>خذها<br />معك</> : <>على<br />رواقك</>}</span><motion.button className={s.heroDish} type="button" onClick={() => setSelectedId(hero.id)} initial={reduce ? false : { y: 45, rotate: -7, scale: .94 }} animate={{ y: 0, rotate: -2, scale: 1 }} transition={{ duration: .95, ease: [.22, 1, .36, 1] }} aria-label={`اكتشف ${hero.name}`}><Photo src={hero.images[0]?.url} alt={hero.name} eager /><span><b>{menuDisplayText(hero.name)}</b><Price product={hero} /><ArrowUpLeft aria-hidden="true" /></span></motion.button>{second && <button className={s.heroSip} type="button" onClick={() => setSelectedId(second.id)} aria-label={`اكتشف ${second.name}`}><Photo src={second.images[0]?.url} alt={second.name} /><span>{menuDisplayText(second.name)}<ArrowUpLeft aria-hidden="true" /></span></button>}<span className={s.stageCaption} dir="ltr">{drive ? "GOOD MOOD. TO GO." : "SLOW DOWN. STAY LOCO."}</span></div>}
      </div>
      <div className={s.ribbon} aria-hidden="true"><span>رشفة</span><Sparkles /><span>لقمة</span><Sparkles /><span>لحظة حلوة</span><Sparkles /><span dir="ltr">LOCÓ MOOD</span></div>
    </section>
    <LocoSpotlight key={menu.branch?.id ?? menu.slug} offers={offers} menu={menu} onSelect={setSelectedId} />
    {menu.loyaltyEnabled && loyalty && <BrandLoyaltyEntry id="loco-loyalty" slug={menu.slug} name={menu.name} logoUrl={menu.logoUrl || logo} eyebrow="للّي لوكو على باله" palette={{ background: "var(--loco-ink)", foreground: "var(--loco-cream)", muted: "var(--loco-pink)", cardBackground: "var(--loco-cream)", cardForeground: "var(--loco-ink)", cardBack: "var(--loco-red)" }} />}
    <section className={s.catalog} id="loco-catalog" aria-labelledby="loco-catalog-title"><div className={s.sectionHeading}><div><p className={s.kicker}>منيو لوكو</p><h2 id="loco-catalog-title">اختيارات <em>تفتح النفس</em></h2></div><span dir="ltr">PICK YOUR MOOD</span></div><div className={s.toolbar}><nav className={s.categories} aria-label="أقسام المنيو">{[{ id: "all", name: "الكل" }, ...categories].map(c => <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => chooseCategory(c.id)}>{menuDisplayText(c.name)}</button>)}</nav><div className={s.tools}><label className={s.search}><Search aria-hidden="true" /><input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="وش خاطرك فيه؟" aria-label="ابحث في منيو لوكو" /></label><label className={s.order}><span>الترتيب</span><select value={order} onChange={e => setOrder(e.target.value)}><option value="original">ترتيب المنيو</option><option value="low">الأقل سعرًا</option><option value="high">الأعلى سعرًا</option></select></label></div></div><p className={query ? s.result : base.screenReaderOnly} role="status">{visible.length} صنفًا{query && " يطابق بحثك"}</p>{sections.map(section => <section key={section.id} className={s.categorySection} aria-labelledby={`loco-${section.id}`}><div className={s.categoryHeading}><h3 id={`loco-${section.id}`}>{menuDisplayText(section.name)}</h3><span>{section.products.length} اختيارات</span></div><div className={s.grid}>{section.products.map(p => <motion.article key={p.id} className={s.product} initial={false} whileInView={reduce ? undefined : { y: [18, 0] }} viewport={{ once: true, amount: .12 }} transition={{ duration: .45 }}><button type="button" className={s.productButton} data-has-photo={p.images.length > 0} onClick={() => setSelectedId(p.id)} aria-label={`تفاصيل ${p.name}`}>{p.images.length > 0 && <span className={s.productPhoto}><Photo src={p.images[0]?.url} alt={p.name} /><span className={s.productOpen}><ArrowUpLeft aria-hidden="true" /></span></span>}<span className={s.productInfo}><span className={s.productCategory}>{menuDisplayText(p.category)}</span><strong>{menuDisplayText(p.name)}</strong><Price product={p} /></span></button></motion.article>)}</div></section>)}{!sections.length && <div className={s.empty}><Search aria-hidden="true" /><h3>{menu.products.length ? "ما لقينا صنف بهذا البحث" : "المنيو يتجهّز لك"}</h3>{menu.products.length > 0 && <button type="button" onClick={() => { setQuery(""); setCategory("all"); setOrder("original"); }}>عرض كل الأصناف</button>}</div>}</section>
    <footer className={s.footer}><Photo src={logo} alt="لوكو" /><p>كل مزاج وله لوكو</p><a href="#loco-top">نرجع للبداية<ArrowUpLeft aria-hidden="true" /></a><Link href="/" className={s.powered}>بواسطة برندة</Link></footer>{message && <div className={base.toast} role="status"><Check aria-hidden="true" />{message}</div>}<AnimatePresence mode="wait">{selected && <ProductDetails key={selected.id} brandSlug={menu.slug} product={selected} products={menu.products} close={() => setSelectedId(null)} browse={browse} position={browseProducts.findIndex(p => p.id === selected.id)} total={browseProducts.length} />}</AnimatePresence>
  </main>;
}
