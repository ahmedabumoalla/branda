"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowDownLeft, ArrowUpLeft, Check, Coffee, Flame, Gift, MapPin, Search, Share2, WalletCards, X } from "lucide-react";
import { matchesMenuSearch, menuDisplayText, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { productFinalPrice } from "@/lib/mock/menu";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { menuEntryUrl, startMenuAtTop } from "@/lib/menu/menu-entry-scroll";
import { ProductDetails } from "./bistro-menu";
import { ProductOfferBadge, ProductOfferDetails } from "./product-offer-details";
import { MenuServices } from "./menu-services";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import base from "./bistro-menu.module.css";
import s from "./french-corner-menu.module.css";

function FrenchImage({ src, alt, className = "", eager = false }: { src?: string | null; alt: string; className?: string; eager?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!src || src === failedSource) return <span className={`${s.photoFallback} ${className}`} role="img" aria-label={alt}><Coffee aria-hidden="true" /><span>Le Coin Français</span></span>;
  // Original brand photography and fresh tenant-scoped signed product assets.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" onError={() => setFailedSource(src)} />;
}

function FrenchPrice({ product }: { product: StandaloneMenuProduct }) {
  const price = productFinalPrice(product.price, product.promo);
  return <span className={s.price}>{price !== product.price && <del>{product.price.toLocaleString("en-US")}</del>}<b dir="ltr">{price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b><small>ريال</small></span>;
}

export function FrenchCornerMenu({ menu: source, loyalty }: { menu: StandaloneMenu; loyalty?: { purchasesRequired: number; rewardName: string } | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState("original");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(source.highlights?.asOf ?? 0);
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => startMenuAtTop(root.current), []);
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);
  useEffect(() => {
    if (!source.highlights?.items.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [source.highlights]);
  const menu = { ...source, products: source.products.map(product => ({ ...product, promo: getPublishedOfferPromo(product, source.highlights, now), offers: getProductOffers(product, source.highlights, now) })) };
  const categories = [...menu.categories];
  if (menu.products.some(p => !p.categoryId)) categories.push({ id: "uncategorized", name: "أصناف أخرى", description: null });
  const visible = menu.products.filter(p => (category === "all" || (p.categoryId || "uncategorized") === category) && matchesMenuSearch(p, query));
  if (order !== "original") visible.sort((a, b) => (productFinalPrice(a.price, a.promo) - productFinalPrice(b.price, b.promo)) * (order === "low" ? 1 : -1));
  const sections = categories.map(c => ({ ...c, products: visible.filter(p => (p.categoryId || "uncategorized") === c.id) })).filter(c => c.products.length);
  const selected = menu.products.find(p => p.id === selectedId);
  const browseProducts = selected && !visible.some(p => p.id === selected.id) ? menu.products : sections.flatMap(c => c.products);
  const loyaltyHref = `/loyalty/${encodeURIComponent(menu.slug)}?source=menu`;
  const feature = menu.products.find(p => p.images.length && /بانكيك|وافل|كيك/.test(p.name)) || menu.products.find(p => p.images.length);
  const stampTarget = loyalty && Number.isInteger(loyalty.purchasesRequired) && loyalty.purchasesRequired > 0 && loyalty.purchasesRequired <= 100 ? loyalty.purchasesRequired : null;
  function browse(direction: number) {
    const index = browseProducts.findIndex(p => p.id === selectedId);
    if (browseProducts.length) setSelectedId(browseProducts[(index + direction + browseProducts.length) % browseProducts.length].id);
  }
  function selectCategory(id: string) {
    setCategory(id);
    document.getElementById("french-catalog")?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function focusSearch() {
    search.current?.scrollIntoView({ block: "center", behavior: "instant" });
    search.current?.focus({ preventScroll: true });
  }
  async function share() {
    try {
      const url = menuEntryUrl(window.location.origin, menu.slug);
      if (navigator.share) await navigator.share({ title: `${menu.name} | المنيو`, url });
      else { await navigator.clipboard.writeText(url); setMessage("تم نسخ رابط المنيو"); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("يمكنك نسخ الرابط من شريط العنوان"); }
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setMessage(""), 4000);
  }
  const trackLoyalty = () => trackBrandEngagement(menu.slug, "menu_loyalty_click");
  return <main ref={root} className={`${base.menu} ${s.page}`} dir="rtl" data-french-corner="atelier-v3">
    <a href="#french-catalog" className={base.skipLink}>انتقل إلى الأصناف</a>
    <header className={s.header}>
      <a className={s.brand} href="#french-top" aria-label={menu.name}><FrenchImage src={menu.logoUrl} alt="" eager /><span>الركن الفرنسي<small lang="fr" dir="ltr">LE COIN FRANÇAIS</small></span></a>
      <nav className={s.headerNav} aria-label="التنقل في منيو الركن الفرنسي"><a href="#french-catalog">القائمة</a>{menu.loyaltyEnabled && <Link href={loyaltyHref} onClick={trackLoyalty}>بطاقة الولاء<ArrowUpLeft aria-hidden="true" /></Link>}</nav>
      <div className={s.actions}><button type="button" aria-label="البحث في المنيو" onClick={focusSearch}><Search aria-hidden="true" /></button><button type="button" aria-label="مشاركة المنيو" onClick={share}><Share2 aria-hidden="true" /></button><MenuServices menu={menu} compact /></div>
    </header>
    <section className={s.hero} id="french-top" aria-labelledby="french-title">
      <div className={s.heroBackdrop} aria-hidden="true"><FrenchImage src="/french-corner/salon.webp" alt="" eager /></div>
      <div className={s.heroCopy}>
        <FrenchImage src={menu.logoUrl} alt="مقهى الركن الفرنسي" className={s.heroLogo} eager />
        <p className={s.eyebrow}>مقهى الركن الفرنسي</p>
        <h1 id="french-title">على مهل<br /><em>يحلو المذاق</em></h1>
        <p className={s.heroDescription}>قهوتك وحلاك ولحظة على ذوقك<br />أهلًا بك في ركنك الفرنسي</p>
        <div className={s.heroCtas}><a className={s.explore} href="#french-catalog">اكتشف القائمة<ArrowDownLeft aria-hidden="true" /></a>{menu.loyaltyEnabled && <a className={s.heroLoyalty} href="#french-membership"><WalletCards aria-hidden="true" />بطاقة الولاء</a>}</div>
      </div>
      <div className={s.tastingStage}><span className={s.stageSignature} lang="fr" dir="ltr">Le goût des beaux moments</span>{feature ? <button className={s.heroFeature} type="button" onClick={() => setSelectedId(feature.id)} aria-label={`اكتشف ${feature.name}`}><FrenchImage src={feature.images[0]?.url} alt={feature.name} eager /><span className={s.featureCaption}><span><small>من ركننا إلى ذوقك</small><strong>{menuDisplayText(feature.name)}</strong></span><FrenchPrice product={feature} /><ArrowUpLeft aria-hidden="true" /></span></button> : <FrenchImage src="/french-corner/salon.webp" alt="جلسات مقهى الركن الفرنسي" className={s.stageFallback} eager />}<span className={s.stageSeal} aria-hidden="true">لحظتك<br /><b>تستاهل</b><small>FRENCH CORNER</small></span></div>
      <div className={s.heroBottom}><span lang="fr" dir="ltr">FRENCH CORNER CAFE</span><span>قهوة وحلويات وأكثر</span><a href="#french-catalog">القائمة بين يديك<ArrowDownLeft aria-hidden="true" /></a></div>
    </section>
    {menu.loyaltyEnabled && <section className={s.membership} id="french-membership" aria-labelledby="french-membership-title">
      <Link className={s.membershipWholeLink} href={loyaltyHref} onClick={trackLoyalty} onAuxClick={event => { if (event.button === 1) trackLoyalty(); }}>
        <div className={s.memberCard} aria-hidden="true"><div><span lang="fr">FRENCH CORNER</span><WalletCards /></div><div className={s.cardIdentity}><FrenchImage src={menu.logoUrl} alt="" /><span>بطاقة الولاء<small>لك مكان ولك تقدير</small></span></div>{stampTarget && stampTarget <= 12 && <div className={s.stampRow}>{Array.from({ length: stampTarget }, (_, index) => <span key={index}>{index === stampTarget - 1 ? <Gift /> : <Coffee />}</span>)}</div>}<p>{loyalty?.rewardName || "مكافآت تستاهلها"}</p><small>كل زيارة تقرّبك</small></div>
        <div className={s.memberCopy}><p className={s.eyebrow}><Gift aria-hidden="true" />بطاقة الولاء والمكافآت</p><h2 id="french-membership-title">لك في كل زيارة<br /><em>شي يستاهل الرجعة</em></h2><p>{stampTarget ? <>اجمع <strong>{stampTarget.toLocaleString("ar-SA")} أختام</strong> واستمتع بمكافأتك</> : "بطاقتك وزياراتك ومكافآتك في مكان واحد"}</p>{loyalty?.rewardName && <strong className={s.rewardHighlight}>{loyalty.rewardName}</strong>}<LoyaltyLinkContent className={s.membershipLink} label="افتح بطاقة الولاء" /></div>
      </Link>
    </section>}
    {categories.length > 0 && <section className={s.discovery} aria-labelledby="french-discovery-title"><div className={s.discoveryHeading}><p className={s.eyebrow}>كل مزاج له اختيار</p><h2 id="french-discovery-title">من وين نبدأ؟</h2><span lang="fr">À votre goût</span></div><div className={s.discoveryRail}>{categories.map((c, index) => { const photo = menu.products.find(p => (p.categoryId || "uncategorized") === c.id && p.images.length)?.images[0]?.url; return <button type="button" className={s.discoveryCard} key={c.id} onClick={() => selectCategory(c.id)} aria-label={`تصفح ${menuDisplayText(c.name)}`}><FrenchImage src={photo} alt="" /><span className={s.discoveryNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className={s.discoveryName}>{menuDisplayText(c.name)}<ArrowDownLeft aria-hidden="true" /></span></button>; })}</div></section>}
    <section className={s.catalog} id="french-catalog" aria-labelledby="french-catalog-title">
      <div className={s.catalogHeading}><div><p className={s.eyebrow}>قائمة الركن الفرنسي</p><h2 id="french-catalog-title">تفاصيل تُذاق <em>وتنحب</em></h2></div><span lang="fr" dir="ltr">La Carte<small>COFFEE & SWEET PLEASURES</small></span></div>
      <div className={s.catalogTools}>
        <label className={s.search}><Search aria-hidden="true" /><input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="قهوة؟ حلا؟ ابحث عن اللي في بالك" aria-label="ابحث في الأصناف والمكونات" />{query && <button type="button" aria-label="مسح البحث" onClick={() => { setQuery(""); search.current?.focus(); }}><X aria-hidden="true" /></button>}</label>
        <label className={s.sort}><span>ترتيب الأصناف</span><select value={order} onChange={e => setOrder(e.target.value)}><option value="original">اختيارات المنيو</option><option value="low">السعر الأقل أولًا</option><option value="high">السعر الأعلى أولًا</option></select></label>
      </div>
      <nav className={s.categories} aria-label="أقسام المنيو">{[{ id: "all", name: "كل الأصناف" }, ...categories].map(c => <button type="button" key={c.id} aria-pressed={category === c.id} onClick={() => selectCategory(c.id)}>{menuDisplayText(c.name)}<small>{c.id === "all" ? menu.products.length : menu.products.filter(p => (p.categoryId || "uncategorized") === c.id).length}</small></button>)}</nav>
      <p role="status" className={query ? s.results : base.screenReaderOnly}>{visible.length} صنفًا{query ? ` يطابق بحثك عن ${query}` : ""}</p>
      {sections.map((section, index) => <section className={s.menuSection} key={section.id} aria-labelledby={`french-${section.id}`}><div className={s.sectionHeading}><span className={s.sectionNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h3 id={`french-${section.id}`}>{menuDisplayText(section.name)}</h3><span>{section.products.length} اختيارات</span><i /></div>{section.description && <p className={s.sectionDescription}>{section.description}</p>}<div className={s.productGrid}>
        {section.products.map(product => <article className={s.product} key={product.id} data-product-id={product.id} data-no-photo={!product.images.length && !product.videos.length || undefined}>
          <button className={s.productButton} type="button" onClick={() => setSelectedId(product.id)} aria-label={`عرض تفاصيل ${product.name}`}>
            <div className={s.productPhoto}><FrenchImage src={product.images[0]?.url} alt={product.name} /><span className={s.productArrow} aria-hidden="true"><ArrowUpLeft /></span><ProductOfferBadge product={product} products={menu.products} /></div>
            <div className={s.productCopy}><span className={s.productCategory}>{menuDisplayText(section.name)}</span><h4 dir="auto">{menuDisplayText(product.name)}</h4>{product.description && <p>{menuDisplayText(product.description)}</p>}<div className={s.productBottom}><FrenchPrice product={product} />{product.calories != null && <span><Flame aria-hidden="true" />{product.calories} سعرة</span>}</div></div>
          </button><ProductOfferDetails product={product} products={menu.products} />
        </article>)}
      </div></section>)}
      {!visible.length && <div className={s.empty}><Coffee aria-hidden="true" /><h3>{menu.products.length ? "خلّنا نجرّب اختيارًا ثانيًا" : "قائمتنا قيد التحضير"}</h3><p>{menu.products.length ? "غيّر كلمة البحث أو ارجع لتصفح القائمة كاملة" : "ننتظرك قريبًا مع أصنافنا"}</p>{menu.products.length > 0 && <button type="button" onClick={() => { setQuery(""); setCategory("all"); setOrder("original"); }}>عرض كل الأصناف</button>}</div>}
    </section>
    <section className={s.visit}><FrenchImage src="/french-corner/drink.webp" alt="موهيتو الركن الفرنسي" /><div><p className={s.eyebrow}>نفس الركن مزاج جديد</p><h2>بعض الأماكن نزورها<br /><em>وبعضها يصير ركننا</em></h2><a href="https://maps.app.goo.gl/aYZppeoyQbPAGBh19" target="_blank" rel="noopener noreferrer"><MapPin aria-hidden="true" />ننتظرك في الركن الفرنسي<ArrowUpLeft aria-hidden="true" /></a></div></section>
    <footer className={s.footer}><a href="#french-top" className={s.footerBrand} lang="fr" dir="ltr">Le Coin <i>Français</i></a><div><span>قهوة وحلويات وأكثر</span><a href="https://barndaksa.com" aria-label="بواسطة برندة">بواسطة برندة<ArrowUpLeft aria-hidden="true" /></a><a href="#french-catalog">العودة للقائمة ↑</a></div></footer>
    {message && <div className={s.toast} role="status"><Check aria-hidden="true" />{message}</div>}
    <nav className={s.mobileDock} aria-label="اختصارات المنيو"><a href="#french-catalog"><Coffee aria-hidden="true" />القائمة</a><button type="button" onClick={focusSearch}><Search aria-hidden="true" />البحث</button>{menu.loyaltyEnabled && <Link href={loyaltyHref} onClick={trackLoyalty}><WalletCards aria-hidden="true" />بطاقتي</Link>}<button type="button" onClick={share}><Share2 aria-hidden="true" />مشاركة</button></nav>
    <AnimatePresence mode="wait">{selected && <ProductDetails key={selected.id} brandSlug={menu.slug} product={selected} products={menu.products} close={() => setSelectedId(null)} browse={browse} position={browseProducts.findIndex(p => p.id === selected.id)} total={browseProducts.length} />}</AnimatePresence>
  </main>;
}
