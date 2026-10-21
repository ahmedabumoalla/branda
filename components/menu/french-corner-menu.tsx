"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowDownLeft, ArrowUpLeft, Check, Coffee, Flame, MapPin, Search, Share2, WalletCards, X } from "lucide-react";
import { matchesMenuSearch, menuDisplayText, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { productFinalPrice } from "@/lib/mock/menu";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { ProductDetails } from "./bistro-menu";
import { ProductOfferBadge, ProductOfferDetails } from "./product-offer-details";
import { MenuServices } from "./menu-services";
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

export function FrenchCornerMenu({ menu: source }: { menu: StandaloneMenu }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState("original");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(source.highlights?.asOf ?? 0);
  const search = useRef<HTMLInputElement>(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (navigator.share) await navigator.share({ title: `${menu.name} | المنيو`, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); setMessage("تم نسخ رابط المنيو"); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("يمكنك نسخ الرابط من شريط العنوان"); }
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setMessage(""), 4000);
  }
  const trackLoyalty = () => trackBrandEngagement(menu.slug, "menu_loyalty_click");
  return <main className={`${base.menu} ${s.page}`} dir="rtl" data-french-corner="salon-v1">
    <a href="#french-catalog" className={base.skipLink}>انتقل إلى الأصناف</a>
    <header className={s.header}>
      <a className={s.brand} href="#french-top" aria-label={menu.name}><FrenchImage src={menu.logoUrl} alt="" eager /><span>الركن الفرنسي<small lang="fr" dir="ltr">LE COIN FRANÇAIS</small></span></a>
      <nav className={s.headerNav} aria-label="التنقل في منيو الركن الفرنسي"><a href="#french-catalog">القائمة</a>{menu.loyaltyEnabled && <Link href={loyaltyHref} onClick={trackLoyalty}>بطاقة الولاء<ArrowUpLeft aria-hidden="true" /></Link>}</nav>
      <div className={s.actions}><button type="button" aria-label="البحث في المنيو" onClick={focusSearch}><Search aria-hidden="true" /></button><button type="button" aria-label="مشاركة المنيو" onClick={share}><Share2 aria-hidden="true" /></button><MenuServices menu={menu} compact /></div>
    </header>
    <section className={s.hero} id="french-top" aria-labelledby="french-title">
      <div className={s.heroCopy}>
        <p className={s.eyebrow}><span /> قهوة وحلويات وأكثر</p>
        <h1 id="french-title">ركنٌ للمذاق<br /><em>ومساحةٌ للمزاج</em></h1>
        <p className={s.heroDescription}>من أول رشفة قهوة إلى آخر لقمة حلا<br />خذ وقتك واستمتع بتفاصيل الركن الفرنسي</p>
        <a className={s.explore} href="#french-catalog">على ذوقك نبدأ<ArrowDownLeft aria-hidden="true" /></a>
        <div className={s.heroSignature}><span lang="fr" dir="ltr">Un coin à vous</span><small>مكانك للحظة تستاهل</small></div>
      </div>
      <div className={s.heroArt}>
        <div className={s.arch}><FrenchImage src="/french-corner/salon.webp" alt="جلسات الركن الفرنسي بإضاءتها الدافئة وتفاصيلها الخشبية" eager /><span className={s.photoLabel} lang="fr" dir="ltr">LE SALON</span></div>
        <figure className={s.dessertFrame}><FrenchImage src="/french-corner/dessert.webp" alt="بانكيك من الركن الفرنسي بتشكيلة من الصوصات" eager /><figcaption><span>تفاصيل تُذاق</span><ArrowUpLeft aria-hidden="true" /></figcaption></figure>
        <span className={s.artCaption} lang="fr" dir="ltr">CAFÉ · DESSERTS · BON TEMPS</span>
        <span className={s.seal} aria-hidden="true">Le Coin<br /><i>Français</i></span>
      </div>
      <div className={s.heroBottom}><span>أهلًا بك في الركن الفرنسي</span><a href="#french-catalog">اكتشف القائمة<ArrowDownLeft aria-hidden="true" /></a><span lang="fr" dir="ltr">L’ART DE PRENDRE SON TEMPS</span></div>
    </section>
    {menu.loyaltyEnabled && <section className={s.membership} aria-labelledby="french-membership-title">
      <div className={s.membershipMark} aria-hidden="true"><WalletCards /><span lang="fr">Le Cercle</span></div>
      <div><p className={s.eyebrow}>لأنك من أهل الركن</p><h2 id="french-membership-title">كل زيارة تترك أثرًا</h2><p>بطاقتك تجمع زياراتك وتقرّبك من مكافأتك</p></div>
      <Link className={s.membershipLink} href={loyaltyHref} onClick={trackLoyalty}>افتح بطاقة الولاء<ArrowUpLeft aria-hidden="true" /></Link>
    </section>}
    <section className={s.catalog} id="french-catalog" aria-labelledby="french-catalog-title">
      <div className={s.catalogHeading}><div><p className={s.eyebrow}>اختيارات الركن الفرنسي</p><h2 id="french-catalog-title">وش يكمّل <em>مزاجك؟</em></h2></div><span lang="fr" dir="ltr">La Carte<small>COFFEE & SWEET PLEASURES</small></span></div>
      <div className={s.catalogTools}>
        <label className={s.search}><Search aria-hidden="true" /><input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="قهوة؟ حلا؟ ابحث عن اللي في بالك" aria-label="ابحث في الأصناف والمكونات" />{query && <button type="button" aria-label="مسح البحث" onClick={() => { setQuery(""); search.current?.focus(); }}><X aria-hidden="true" /></button>}</label>
        <label className={s.sort}><span>ترتيب الأصناف</span><select value={order} onChange={e => setOrder(e.target.value)}><option value="original">اختيارات المنيو</option><option value="low">السعر الأقل أولًا</option><option value="high">السعر الأعلى أولًا</option></select></label>
      </div>
      <nav className={s.categories} aria-label="أقسام المنيو">{[{ id: "all", name: "كل الأصناف" }, ...categories].map(c => <button type="button" key={c.id} aria-pressed={category === c.id} onClick={() => selectCategory(c.id)}>{menuDisplayText(c.name)}<small>{c.id === "all" ? menu.products.length : menu.products.filter(p => (p.categoryId || "uncategorized") === c.id).length}</small></button>)}</nav>
      <p role="status" className={query ? s.results : base.screenReaderOnly}>{visible.length} صنفًا{query ? ` يطابق بحثك عن ${query}` : ""}</p>
      {sections.map(section => <section className={s.menuSection} key={section.id} aria-labelledby={`french-${section.id}`}><div className={s.sectionHeading}><h3 id={`french-${section.id}`}>{menuDisplayText(section.name)}</h3><span>{section.products.length} اختيارات</span><i /></div>{section.description && <p className={s.sectionDescription}>{section.description}</p>}<div className={s.productGrid}>
        {section.products.map(product => <article className={s.product} key={product.id} data-product-id={product.id} data-no-photo={!product.images.length && !product.videos.length || undefined}>
          <button className={s.productButton} type="button" onClick={() => setSelectedId(product.id)} aria-label={`عرض تفاصيل ${product.name}`}>
            <div className={s.productPhoto}><FrenchImage src={product.images[0]?.url} alt={product.name} /><span className={s.productArrow} aria-hidden="true"><ArrowUpLeft /></span><ProductOfferBadge product={product} products={menu.products} /></div>
            <div className={s.productCopy}><span className={s.productCategory}>{menuDisplayText(section.name)}</span><h4 dir="auto">{menuDisplayText(product.name)}</h4>{product.description && <p>{menuDisplayText(product.description)}</p>}<div className={s.productBottom}><FrenchPrice product={product} />{product.calories != null && <span><Flame aria-hidden="true" />{product.calories} سعرة</span>}</div></div>
          </button><ProductOfferDetails product={product} products={menu.products} />
        </article>)}
      </div></section>)}
      {!visible.length && <div className={s.empty}><Coffee aria-hidden="true" /><h3>{menu.products.length ? "خلّنا نجرّب اختيارًا ثانيًا" : "قائمتنا قيد التحضير"}</h3><p>{menu.products.length ? "غيّر كلمة البحث أو ارجع لتصفح القائمة كاملة" : "ننتظرك قريبًا مع أصنافنا"}</p>{menu.products.length > 0 && <button type="button" onClick={() => { setQuery(""); setCategory("all"); setOrder("original"); }}>عرض كل الأصناف</button>}</div>}
    </section>
    <section className={s.visit}><FrenchImage src="/french-corner/drink.webp" alt="موهيتو الركن الفرنسي" /><div><p className={s.eyebrow}>نفس الركن مزاج جديد</p><h2>للمرّة الجاية<br /><em>مكانك محفوظ بقلوبنا</em></h2><a href="https://maps.app.goo.gl/aYZppeoyQbPAGBh19" target="_blank" rel="noopener noreferrer"><MapPin aria-hidden="true" />تفضّل على ركنك<ArrowUpLeft aria-hidden="true" /></a></div></section>
    <footer className={s.footer}><a href="#french-top" className={s.footerBrand} lang="fr" dir="ltr">Le Coin <i>Français</i></a><div><span>قهوة وحلويات وأكثر</span><a href="https://barndaksa.com" aria-label="بواسطة برندة">بواسطة برندة<ArrowUpLeft aria-hidden="true" /></a><a href="#french-catalog">العودة للقائمة ↑</a></div></footer>
    {message && <div className={s.toast} role="status"><Check aria-hidden="true" />{message}</div>}
    <AnimatePresence mode="wait">{selected && <ProductDetails key={selected.id} brandSlug={menu.slug} product={selected} products={menu.products} close={() => setSelectedId(null)} browse={browse} position={browseProducts.findIndex(p => p.id === selected.id)} total={browseProducts.length} />}</AnimatePresence>
  </main>;
}
