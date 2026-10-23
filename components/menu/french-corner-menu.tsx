"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowDownLeft, ArrowUpLeft, CakeSlice, Check, ChevronDown, Coffee, CupSoda, Flame, Gift, Grid2X2, IceCreamBowl, Search, Share2, Utensils, WalletCards, X } from "lucide-react";
import { matchesMenuSearch, menuDisplayText, type StandaloneHighlight, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { productFinalPrice } from "@/lib/mock/menu";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { menuEntryUrl, startMenuAtTop } from "@/lib/menu/menu-entry-scroll";
import { ProductDetails } from "./bistro-menu";
import { ProductOfferBadge, ProductOfferDetails } from "./product-offer-details";
import { MenuServices } from "./menu-services";
import { LoyaltyLinkContent } from "./loyalty-link-content";
import { FrenchSocialIcons } from "./french-social-icons";
import base from "./bistro-menu.module.css";
import s from "./french-corner-menu.module.css";
import h from "./french-corner-hero.module.css";

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

function FrenchCategoryIcon({ name, all }: { name: string; all: boolean }) {
  const Icon = all ? Grid2X2 : /عصير|عصيرات|موهيتو|بارد|ميلك|مشروب/.test(name) ? CupSoda : /آيس كريم|ايس كريم/.test(name) ? IceCreamBowl : /حلا|حلو|كيك|وافل|بانكيك/.test(name) ? CakeSlice : /قهوة|قهو|شاي|شاهي|ساخن/.test(name) ? Coffee : Utensils;
  return <Icon aria-hidden="true" />;
}

export function FrenchCornerMenu({ menu: source, loyalty }: { menu: StandaloneMenu; loyalty?: { purchasesRequired: number; rewardName: string } | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState("original");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(source.highlights?.asOf ?? 0);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
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
  const menu = { ...source, contacts: { ...source.contacts, instagramUrl: null, location: {
    label: "مقهى الركن الفرنسي",
    googleUrl: "https://maps.app.goo.gl/ZA1JH1LjR72skeEo7",
    appleUrl: "https://maps.apple.com/?daddr=18.2040338,42.515748&dirflg=d",
  } }, products: source.products.map(product => ({ ...product, promo: getPublishedOfferPromo(product, source.highlights, now), offers: getProductOffers(product, source.highlights, now) })) };
  const featured = ["دلوتشي بيكان", "ايس اسبانش لاتيه", "بلو اوشن", "كيك دبي"].flatMap(name => {
    const product = menu.products.find(product => product.name === name && product.images.length > 0);
    return product ? [product] : [];
  });
  const experienceProducts = menu.products.filter(product => product.available && product.categoryId !== "983f681e-c2c3-466a-9199-d99a6f37a042");
  const experienceOffers = (menu.highlights?.items ?? []).filter(offer => offer.showInSpotlight !== false
    && (offer.expiresAt == null || offer.expiresAt >= now)
    && [offer.productId, offer.buyProductId, offer.freeProductId].every(id => !id || experienceProducts.some(product => product.id === id)));
  const discovery = featured.find(product => product.available) ?? experienceProducts.find(product => product.images.length > 0);
  const experienceItems: StandaloneHighlight[] = experienceOffers.length ? experienceOffers : discovery ? [{
    id: `discover-${discovery.id}`, title: discovery.name, description: discovery.description,
    imageUrl: discovery.images[0]?.url ?? null, productId: discovery.id, discountPercent: null, code: null, expiresAt: null,
  }] : [];
  const categories = [...menu.categories];
  if (menu.products.some(p => !p.categoryId)) categories.push({ id: "uncategorized", name: "أصناف أخرى", description: null });
  const categoryOptions = [{ id: "all", name: "كل الأصناف" }, ...categories];
  const compactCategories = categoryOptions.slice(0, 6);
  const selectedCategory = categoryOptions.find(c => c.id === category);
  if (selectedCategory && !compactCategories.some(c => c.id === category)) compactCategories[5] = selectedCategory;
  const shownCategories = categoriesExpanded ? categoryOptions : compactCategories;
  const visible = menu.products.filter(p => (category === "all" || (p.categoryId || "uncategorized") === category) && matchesMenuSearch(p, query));
  if (order !== "original") visible.sort((a, b) => (productFinalPrice(a.price, a.promo) - productFinalPrice(b.price, b.promo)) * (order === "low" ? 1 : -1));
  const sections = categories.map(c => ({ ...c, products: visible.filter(p => (p.categoryId || "uncategorized") === c.id) })).filter(c => c.products.length);
  const selected = menu.products.find(p => p.id === selectedId);
  const browseProducts = selected && !visible.some(p => p.id === selected.id) ? menu.products : sections.flatMap(c => c.products);
  const loyaltyHref = `/loyalty/${encodeURIComponent(menu.slug)}?source=menu`;
  const stampTarget = loyalty && Number.isInteger(loyalty.purchasesRequired) && loyalty.purchasesRequired > 0 && loyalty.purchasesRequired <= 100 ? loyalty.purchasesRequired : null;
  function browse(direction: number) {
    const index = browseProducts.findIndex(p => p.id === selectedId);
    if (browseProducts.length) setSelectedId(browseProducts[(index + direction + browseProducts.length) % browseProducts.length].id);
  }
  function selectCategory(id: string) {
    setCategory(id);
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
    <section className={h.opening} id="french-top" aria-labelledby="french-title" data-french-opening="salon">
      <div className={h.backdrop} aria-hidden="true"><FrenchImage src="/french-corner/salon.webp" alt="" eager /></div>
      <header className={h.header}>
        <span className={h.wordmark} lang="en" dir="ltr">FRENCH<br /><span>CORNER CAFÉ</span></span>
        <div className={h.actions}><button type="button" aria-label="البحث في المنيو" onClick={focusSearch}><Search aria-hidden="true" /></button><button type="button" aria-label="مشاركة المنيو" onClick={share}><Share2 aria-hidden="true" /></button><MenuServices menu={menu} compact /></div>
      </header>
      <div className={h.scene}>
      <div className={h.introduction}>
        <a className={h.brand} href="#french-top" aria-label={menu.name}><FrenchImage src={menu.logoUrl} alt="مقهى الركن الفرنسي" eager /></a>
        <p className={h.kicker}>أهلًا بك في الركن الفرنسي</p>
        <h1 id="french-title">هنا يحلو<br /><em>الوقت</em></h1>
        <p className={h.description}>قهوة تُرتشف على مهل<br />وحلوى تجعل للحظة مذاقًا آخر</p>
        <div className={h.links}><a className={h.explore} href="#french-catalog"><span>اكتشف المنيو<small lang="fr" dir="ltr">À votre goût</small></span><ArrowDownLeft aria-hidden="true" /></a>{menu.loyaltyEnabled && <a className={h.loyalty} href="#french-membership"><WalletCards aria-hidden="true" />بطاقتك في الركن الفرنسي</a>}</div>
      </div>
      </div>
      <footer className={h.openingFooter}><FrenchSocialIcons /><span className={h.footerNote}>لك ركن وللحظة مذاق</span></footer>
    </section>
    {menu.loyaltyEnabled && <section className={s.compactMembership} id="french-membership" aria-labelledby="french-membership-title">
      <Link className={s.compactMemberLink} href={loyaltyHref} onClick={trackLoyalty} onAuxClick={event => { if (event.button === 1) trackLoyalty(); }}>
        <div className={s.compactMemberCopy}>
          <h2 id="french-membership-title"><WalletCards aria-hidden="true" />بطاقة الولاء</h2>
          <p>{stampTarget ? <>اجمع <strong>{stampTarget.toLocaleString("ar-SA")} أختام</strong><br />ومكافأتك علينا</> : "كل زيارة تقرّبك من مكافأتك"}</p>
        </div>
        <span className={s.compactMemberReward}><small>مكافأتك</small><strong>{loyalty?.rewardName || "لحظة أحلى"}</strong></span>
        <LoyaltyLinkContent className={s.compactMemberAction} label="افتح بطاقة الولاء" />
      </Link>
    </section>}
    {experienceItems.length > 0 && <section className={h.experience} id="french-offers" aria-labelledby="french-offers-title">
      <div className={h.experienceHeading}><div><p>اختيارات من الركن الفرنسي</p><h2 id="french-offers-title">تستاهل <em>التجربة</em></h2></div><span lang="fr" dir="ltr">À découvrir</span></div>
      <div className={h.offerList}>{experienceItems.map(offer => {
        const product = experienceProducts.find(product => product.id === offer.productId);
        return <article key={offer.id} className={h.offerCard} data-french-offer={offer.id}>
          <div className={h.offerCopy}>
            <span className={h.offerLabel}>{!experienceOffers.length ? "اختيار من قائمتنا" : offer.discountPercent ? `خصم ${offer.discountPercent}٪` : offer.kind === "event" ? "موعدنا في الركن الفرنسي" : "عرض من الركن الفرنسي"}</span>
            <h3>{menuDisplayText(offer.title)}</h3>
            {offer.description && <p>{menuDisplayText(offer.description)}</p>}
            {offer.productName && offer.productName !== offer.title && <p>{menuDisplayText(offer.productName)}</p>}
            {offer.code && <p>كود العرض <bdi>{offer.code}</bdi></p>}
            {offer.eventDate && <p>الموعد <bdi>{offer.eventDate}</bdi>{offer.eventTime && <> <bdi>{offer.eventTime}</bdi> بتوقيت السعودية</>}</p>}
            {offer.eventLocation && <p>{menuDisplayText(offer.eventLocation)}</p>}
            {product && <FrenchPrice product={product} />}
            {product ? <button type="button" onClick={() => setSelectedId(product.id)}>اكتشف الصنف<ArrowUpLeft aria-hidden="true" /></button> : <a href="#french-catalog">تصفح القائمة<ArrowDownLeft aria-hidden="true" /></a>}
          </div>
          <div className={h.offerPhoto}>{offer.imageUrl ? <FrenchImage src={offer.imageUrl} alt="" /> : <div className={h.offerArt}><span lang="en" dir="ltr">FRENCH CORNER</span><strong>{offer.discountPercent ? <>{offer.discountPercent}<small>٪</small></> : <Gift aria-hidden="true" />}</strong><span>لحظتك تستاهل</span></div>}</div>
        </article>;
      })}</div>
    </section>}
    <section className={s.catalog} id="french-catalog" aria-labelledby="french-catalog-title">
      <h2 id="french-catalog-title" className={base.screenReaderOnly}>قائمة الركن الفرنسي</h2>
      <div className={s.categoryPicker}>
        <nav id="french-category-options" className={s.categoryGrid} aria-label="أقسام المنيو">{shownCategories.map(c => <button type="button" key={c.id} aria-pressed={category === c.id} onClick={() => selectCategory(c.id)}><FrenchCategoryIcon name={menuDisplayText(c.name)} all={c.id === "all"} /><span>{menuDisplayText(c.name)}</span></button>)}</nav>
        {categoryOptions.length > 6 && <button className={s.categoryToggle} type="button" aria-expanded={categoriesExpanded} aria-controls="french-category-options" onClick={() => setCategoriesExpanded(value => !value)}>{categoriesExpanded ? "اختصار الأقسام" : "بقية الأقسام"}<ChevronDown aria-hidden="true" /></button>}
      </div>
      <div className={s.catalogTools}>
        <label className={s.search}><Search aria-hidden="true" /><input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="قهوة؟ حلا؟ ابحث عن اللي في بالك" aria-label="ابحث في الأصناف والمكونات" />{query && <button type="button" aria-label="مسح البحث" onClick={() => { setQuery(""); search.current?.focus(); }}><X aria-hidden="true" /></button>}</label>
        <label className={s.sort}><span>ترتيب الأصناف</span><select value={order} onChange={e => setOrder(e.target.value)}><option value="original">اختيارات المنيو</option><option value="low">السعر الأقل أولًا</option><option value="high">السعر الأعلى أولًا</option></select></label>
      </div>
      <p role="status" className={query ? s.results : base.screenReaderOnly}>{visible.length} صنفًا{query ? ` يطابق بحثك عن ${query}` : ""}</p>
      {sections.map(section => <section className={s.menuSection} key={section.id} aria-labelledby={`french-${section.id}`}><div className={s.sectionHeading}><h3 id={`french-${section.id}`}>{menuDisplayText(section.name)}</h3></div>{section.description && <p className={s.sectionDescription}>{section.description}</p>}<div className={s.productGrid}>
        {section.products.map(product => <article className={s.product} key={product.id} data-product-id={product.id} data-no-photo={!product.images.length && !product.videos.length || undefined}>
          <button className={s.productButton} type="button" onClick={() => setSelectedId(product.id)} aria-label={`عرض تفاصيل ${product.name}`}>
            <div className={s.productPhoto}><FrenchImage src={product.images[0]?.url} alt={product.name} /><span className={s.productArrow} aria-hidden="true"><ArrowUpLeft /></span><ProductOfferBadge product={product} products={menu.products} /></div>
            <div className={s.productCopy}><span className={s.productCategory}>{menuDisplayText(section.name)}</span><h4 dir="auto">{menuDisplayText(product.name)}</h4>{product.description && <p>{menuDisplayText(product.description)}</p>}<div className={s.productBottom}><FrenchPrice product={product} />{product.calories != null && <span><Flame aria-hidden="true" />{product.calories} سعرة</span>}</div></div>
          </button><ProductOfferDetails product={product} products={menu.products} />
        </article>)}
      </div></section>)}
      {!visible.length && <div className={s.empty}><Coffee aria-hidden="true" /><h3>{menu.products.length ? "خلّنا نجرّب اختيارًا ثانيًا" : "قائمتنا قيد التحضير"}</h3><p>{menu.products.length ? "غيّر كلمة البحث أو ارجع لتصفح القائمة كاملة" : "ننتظرك قريبًا مع أصنافنا"}</p>{menu.products.length > 0 && <button type="button" onClick={() => { setQuery(""); setCategory("all"); setOrder("original"); }}>عرض كل الأصناف</button>}</div>}
    </section>
    <section className={s.visit}><FrenchImage src="/french-corner/drink.webp" alt="موهيتو الركن الفرنسي" /><div><p className={s.eyebrow}>نفس الركن مزاج جديد</p><h2>بعض الأماكن نزورها<br /><em>وبعضها يصير ركننا</em></h2></div></section>
    <footer className={s.footer}><a href="#french-top" className={s.footerBrand} lang="fr" dir="ltr">Le Coin <i>Français</i></a><div><span>قهوة وحلويات وأكثر</span><a href="https://barndaksa.com" aria-label="بواسطة برندة">بواسطة برندة<ArrowUpLeft aria-hidden="true" /></a><a href="#french-catalog">العودة للقائمة ↑</a></div></footer>
    {message && <div className={s.toast} role="status"><Check aria-hidden="true" />{message}</div>}
    <AnimatePresence mode="wait">{selected && <ProductDetails key={selected.id} brandSlug={menu.slug} product={selected} products={menu.products} close={() => setSelectedId(null)} browse={browse} position={browseProducts.findIndex(p => p.id === selected.id)} total={browseProducts.length} />}</AnimatePresence>
  </main>;
}
