"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUpLeft, ArrowDown, ArrowLeft, ArrowRight, Search, ShoppingBag, Shirt, Truck, X, SlidersHorizontal, Star, Heart, Eye, Grid2X2, Home } from "lucide-react";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { matchesMenuSearch } from "@/lib/menu/standalone-menu";
import { giftOrderInputSchema, type GiftOrderReceipt, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { giftProductAvailable, productMinimumPrice, type GiftCartLine } from "@/lib/commerce/storefront-cart";
import { GiftCheckoutDialog, GiftProductDialog, GiftTrackingDialog, StoreRetailContext, StoreDialog } from "./gift-store-dialogs";
import { FawaselBranches } from "./fawasel-branches";
import { FawaselCampaignHero } from "./fawasel-campaign-hero";
import { useFawaselMotion } from "./use-fawasel-motion";
import { shouldAnimateMenu } from "@/lib/menu/motion-foundations";
import s from "./fawasel-store.module.css";
import { FawaselBrandMark } from "./fawasel-brand-mark";

const money = (amount: number) => amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
const memory = new Map<string, string>();
function subscribe(listener: () => void) {
  const changed = (event: StorageEvent) => { if (event.key) memory.delete(event.key); listener(); };
  window.addEventListener("storage", changed); window.addEventListener("fawasel-cart", listener);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener("fawasel-cart", listener); };
}
function subscribeLocation(listener: () => void) { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }
function useSaved(key: string) {
  const value = useSyncExternalStore(subscribe, () => { try { return memory.get(key) ?? localStorage.getItem(key) ?? ""; } catch { return memory.get(key) ?? ""; } }, () => "");
  return [value, (next: string) => { try { localStorage.setItem(key, next); memory.delete(key); } catch { memory.set(key, next); } window.dispatchEvent(new Event("fawasel-cart")); }] as const;
}
function readCart(value: string): GiftCartLine[] {
  try { const parsed = giftOrderInputSchema.shape.items.safeParse(JSON.parse(value)); return parsed.success ? parsed.data.map((line, index) => ({ ...line, key: `saved-${index}` })) : []; } catch { return []; }
}
function Photo({ src, alt, eager = false }: { src?: string; alt: string; eager?: boolean }) {
  const [failed, setFailed] = useState("");
  if (!src || failed === src) return <span className={s.placeholder}><Shirt aria-hidden="true" /><span>{alt}</span></span>;
  // Original catalog photography; keep the native aspect ratio and lazy load below the opening.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" onError={() => setFailed(src)} />;
}
function productAction(product: StandaloneMenuProduct) {
  return product.commerceDetails?.options?.some(option => /مقاس|مقاسات|قياس/.test(option.label)) ? "اختر مقاسك" : "تفاصيل المنتج";
}
const categoryArtwork: Record<string, string> = { "شنط سفر": "7", "شوزات رجالية": "8", "شوزات نسائية": "9", "تيشيرتات": "10", "تطريز حسب الطلب": "11", "ميداليه": "12", "استيكرات": "13", "عطور": "14", "اساور": "15", "شراريب": "16", "دعسات طبيه": "17", "شنط نسائية": "18" };
function ProductTile({ product, favorite, select, toggle }: { product: StandaloneMenuProduct; favorite: boolean; select: () => void; toggle: () => void }) {
  return <article className={s.product}><div className={s.productMedia}><button className={s.productImage} onClick={select} aria-label={`تفاصيل ${product.name}`}><Photo src={product.images[0]?.url} alt={product.name} />{!giftProductAvailable(product) && <span className={s.soldOut}>نفد حاليًا</span>}<span className={s.quick}>{productAction(product)} <ArrowUpLeft aria-hidden="true" /></span></button><div className={s.productActions}><button onClick={toggle} aria-pressed={favorite} aria-label={`${favorite ? "إزالة من" : "إضافة إلى"} المفضلة ${product.name}`}><Heart fill={favorite ? "currentColor" : "none"} aria-hidden="true" /></button><button onClick={select} aria-label={`معاينة سريعة ${product.name}`}><Eye aria-hidden="true" /></button></div></div><div className={s.productMeta}><span>{product.category}</span></div><h3><button onClick={select}>{product.name}</button></h3><p className={s.price}>{Boolean(product.commerceDetails?.options?.length) && <small>من </small>}<bdi>{money(productMinimumPrice(product))}</bdi><span>ريال</span></p><button className={s.chooseProduct} onClick={select}><ShoppingBag size={16} aria-hidden="true" />{productAction(product)}</button></article>;
}

function ProductShelf({ title, subtitle, browse, children }: { title: string; subtitle: string; browse: () => void; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  function move(direction: number) { const element = rail.current; if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: shouldAnimateMenu() ? "smooth" : "instant" }); }
  return <section className={s.shelf} data-fawasel-reveal aria-label={title}><div className={s.sectionHeading}><div><p className={s.kicker}>{subtitle}</p><h2>{title}</h2></div><div className={s.shelfActions}><button className={s.seeAll} onClick={browse}>عرض الكل <ArrowUpLeft aria-hidden="true" /></button><div className={s.railControls}><button aria-label={`المنتجات السابقة في ${title}`} onClick={() => move(1)}><ArrowRight aria-hidden="true" /></button><button aria-label={`المنتجات التالية في ${title}`} onClick={() => move(-1)}><ArrowLeft aria-hidden="true" /></button></div></div></div><div ref={rail} className={s.productRail}>{children}</div></section>;
}

export function FawaselStore({ menu, settings, loyalty }: { menu: StandaloneMenu; settings: GiftStoreSettings | null; loyalty: { purchasesRequired: number; rewardName: string } | null }) {
  const storeRef = useFawaselMotion();
  const [allCollections, setAllCollections] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const [available, setAvailable] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [savedFavorites, saveFavorites] = useSaved(`fawasel-favorites:${menu.slug}`);
  const favoriteIds: string[] = (() => { try { const values: unknown = JSON.parse(savedFavorites); return Array.isArray(values) ? [...new Set(values.filter((id): id is string => typeof id === "string" && menu.products.some(p => p.id === id)))].slice(0, 200) : []; } catch { return []; } })();
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<StandaloneMenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<GiftOrderReceipt | null>(null);
  const [trackingOverride, setTracking] = useState<string | null>(null);
  const location = useSyncExternalStore(subscribeLocation, () => window.location.search, () => "");
  const queryToken = new URLSearchParams(location).get("order") ?? "";
  const tracking = trackingOverride ?? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryToken) ? queryToken : "");
  const [saved, save] = useSaved(`fawasel-cart:${menu.slug}`);
  const [lastOrder, saveOrder] = useSaved(`fawasel-order:${menu.slug}`);
  const lines = readCart(saved);
  const setLines = (value: GiftCartLine[]) => save(JSON.stringify(value));
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  const filtered = menu.products.filter(product => (category === "all" || category === product.categoryId) && matchesMenuSearch(product, query) && (!available || giftProductAvailable(product)) && (!favoritesOnly || favoriteIds.includes(product.id)));
  if (sort !== "featured") filtered.sort((a, b) => (productMinimumPrice(a) - productMinimumPrice(b)) * (sort === "low" ? 1 : -1));
  const collections = menu.categories.flatMap(item => { const product = menu.products.find(p => p.categoryId === item.id && p.images.length); return product ? [{ ...item, product }] : []; });
  const ordering = settings?.enabled === true;
  const currentProduct = selected && menu.products.find(p => p.id === selected.id);
  function browse(id = "all") { setCategory(id); setQuery(""); setAvailable(false); setFavoritesOnly(false); setLimit(24); document.getElementById("fawasel-products")?.scrollIntoView({ block: "start" }); }
  function favorites() { browse(); setFavoritesOnly(true); }
  function tile(product: StandaloneMenuProduct) { return <ProductTile key={product.id} product={product} favorite={favoriteIds.includes(product.id)} select={() => setSelected(product)} toggle={() => saveFavorites(JSON.stringify(favoriteIds.includes(product.id) ? favoriteIds.filter(id => id !== product.id) : [...favoriteIds, product.id].slice(-200)))} />; }
  const featured = menu.products.filter(p => giftProductAvailable(p) && p.images.length).slice(0, 8);
  const shoeCategory = menu.categories.find(c => /شوزات رجالية/.test(c.name));
  const bagCategory = menu.categories.find(c => /شنط نسائية/.test(c.name));
  const sockCategory = menu.categories.find(c => /شراريب/.test(c.name));
  const travelCategory = menu.categories.find(c => /شنط سفر/.test(c.name));
  const womenCategory = menu.categories.find(c => /شوزات نسائية/.test(c.name));
  const categoryProducts = (id: string) => [...menu.products.filter(p => p.categoryId === id && giftProductAvailable(p)), ...menu.products.filter(p => p.categoryId === id && !giftProductAvailable(p))].slice(0, 8);
  function shelf(title: string, items: StandaloneMenuProduct[], id = "all", subtitle = "") { return items.length > 0 && <ProductShelf title={title} subtitle={subtitle} browse={() => browse(id)}>{items.map(tile)}</ProductShelf>; }
  function add(product: StandaloneMenuProduct, line: Omit<GiftCartLine, "key" | "productId">) {
    if (!ordering) return "الطلبات متوقفة مؤقتًا";
    if (lines.length >= 30) return "يمكن إضافة ٣٠ صنفًا في الطلب الواحد";
    setLines([...lines, { ...line, productId: product.id, key: crypto.randomUUID() }]);
    setSelected(null); setNotice(`أضفنا ${product.name} إلى سلتك`); return null;
  }
  return <StoreRetailContext.Provider value={true}><main ref={storeRef} className={s.store} dir="rtl">
    <a className={s.skip} href="#fawasel-products">انتقل إلى المنتجات</a>
    <div className={s.announcement}><span>اختيارات يومية بحضور مختلف</span><span dir="ltr">FAWASEL / EVERYDAY WEAR</span></div>
    <header className={s.header}>
      <a className={s.brand} href="#fawasel-top" aria-label="فواصل الرئيسية"><FawaselBrandMark logoUrl={menu.logoUrl} /></a>
      <nav aria-label="التنقل الرئيسي"><a href="#fawasel-products" onClick={() => browse()}>تسوّق الآن</a>{loyalty && <a href="#fawasel-club">نادي فواصل</a>}<a href="#fawasel-branches">فروعنا</a></nav>
      <div className={s.headerActions}><button className={s.searchTrigger} aria-label="ابحث عن قطعة" onClick={() => { browse(); document.getElementById("fawasel-search")?.focus({ preventScroll: true }); }}><Search aria-hidden="true" /></button><button className={s.cart} onClick={() => setCartOpen(true)} aria-label={`حقيبة التسوق ${count} قطعة`}><ShoppingBag aria-hidden="true" /><span>الحقيبة</span><b>{count}</b></button></div>
    </header>
    <FawaselCampaignHero products={menu.products} onSelect={setSelected} onBrowse={() => browse()} />
    <div className={s.ribbon}><span>اختَر ما يشبهك</span><span>{menu.products.length.toLocaleString("ar-SA")} قطعة</span><span>{menu.categories.length.toLocaleString("ar-SA")} قسم</span><a href="#fawasel-products" onClick={() => browse()}>تصفّح الكل <ArrowUpLeft aria-hidden="true" /></a></div>
    <section className={s.campaignGrid} data-fawasel-reveal aria-label="اكتشف مجموعات فواصل">{[{ category: shoeCategory, image: "4", label: "خطوة لها حضور", english: "THE EVERYDAY EDIT" }, { category: travelCategory, image: "5", label: "وين الوجهة؟", english: "READY TO GO" }, { category: womenCategory, image: "6", label: "على ذوقك", english: "YOUR OWN WAY" }].filter(item => item.category).map(item => <button key={item.image} onClick={() => browse(item.category!.id)}><span className={s.campaignPhoto}><Photo src={categoryProducts(item.category!.id).find(product => product.images.length)?.images[0]?.url} alt={item.category!.name} /></span><span className={s.campaignCopy}><small dir="ltr">{item.english}</small><strong>{item.label}</strong><span>{item.category!.name}<ArrowUpLeft aria-hidden="true" /></span></span></button>)}</section>
    {shelf("اختيارات فواصل", featured, "all", "قطع تستاهل تكون في إطلالتك")}
    {!!collections.length && <section className={s.collections} data-fawasel-reveal id="fawasel-collections" aria-labelledby="collections-title"><div className={s.sectionHeading}><div><p className={s.kicker}>كل أسلوب له مكان</p><h2 id="collections-title">على أي مزاج؟</h2></div><button className={s.seeAll} aria-expanded={allCollections} aria-controls="fawasel-category-list" onClick={() => setAllCollections(value => !value)}>{allCollections ? "عرض مختصر" : "كل الأقسام"}<Grid2X2 aria-hidden="true" /></button></div><div id="fawasel-category-list" className={`${s.categoryGrid} ${allCollections ? s.categoriesExpanded : ""}`}>{collections.map(item => <button key={item.id} onClick={() => browse(item.id)}><span className={s.categoryPicture}><Photo src={categoryArtwork[item.name] ? `/fawasel/editorial/${categoryArtwork[item.name]}-image.webp` : item.product.images[0]?.url} alt={item.name} /></span><strong>{item.name}</strong><span>{menu.products.filter(p => p.categoryId === item.id).length} قطعة</span></button>)}</div></section>}
    {shoeCategory && shelf("خطوة تكمّل ستايلك", categoryProducts(shoeCategory.id), shoeCategory.id, "الشوزات الرجالية")}
    {bagCategory && <><button className={s.editorialBanner} onClick={() => browse(bagCategory.id)} aria-label="اكتشف مجموعة الشنط النسائية"><Photo src="/fawasel/editorial/19-image.webp" alt="شنط تكمّل إطلالتك" /></button>{shelf("شنط تلفت النظر", categoryProducts(bagCategory.id), bagCategory.id, "تفصيلتك المفضّلة")}</>}
    {sockCategory && <><button className={s.editorialBanner} onClick={() => browse(sockCategory.id)} aria-label="اكتشف مجموعة الشراريب"><Photo src="/fawasel/editorial/20-image.webp" alt="تفاصيل يومية من فواصل" /></button>{shelf("التفاصيل تصنع الفرق", categoryProducts(sockCategory.id), sockCategory.id, "اختيارات لكل يوم")}</>}
    <section className={s.catalog} data-fawasel-reveal id="fawasel-products" aria-labelledby="catalog-title"><div className={s.sectionHeading}><div><p className={s.kicker}>تفاصيل تفرق</p><h2 id="catalog-title">إطلالتك الجاية هنا</h2></div><span className={s.english} dir="ltr">FIND YOUR FIT</span></div>
      <div className={s.toolbar}><label className={s.search}><Search aria-hidden="true" /><input id="fawasel-search" type="search" placeholder="ابحث عن قطعتك الجاية" aria-label="ابحث في المنتجات" value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} /></label><label className={s.sort}><SlidersHorizontal aria-hidden="true" /><span>رتّب حسب</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="featured">اختيارات المتجر</option><option value="low">الأقل سعرًا</option><option value="high">الأعلى سعرًا</option></select></label></div>
      <nav className={s.tabs} aria-label="تصنيفات المنتجات">{[{ id: "all", name: "الكل" }, ...menu.categories].map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setLimit(24); }}>{item.name}</button>)}</nav>
      <div className={s.results}><p role="status">{filtered.length} منتج</p><div><label><input type="checkbox" checked={favoritesOnly} onChange={event => { setFavoritesOnly(event.target.checked); setLimit(24); }} />المفضلة</label><label><input type="checkbox" checked={available} onChange={event => { setAvailable(event.target.checked); setLimit(24); }} />المتاح فقط</label></div></div>
      <div className={s.grid}>{filtered.slice(0, limit).map(tile)}</div>
      {!filtered.length && <div className={s.empty}><Search aria-hidden="true" /><h3>{favoritesOnly ? "احفظ القطع اللي تحبّها بقلب المفضلة" : "ما لقينا منتج يطابق بحثك"}</h3><button onClick={() => browse()}>عرض كل المنتجات</button></div>}
      {filtered.length > limit && <button className={s.more} onClick={() => setLimit(value => value + 24)}>شوف أكثر <ArrowDown aria-hidden="true" /></button>}
    </section>
    {loyalty && menu.loyaltyEnabled && <section className={s.club} data-fawasel-reveal id="fawasel-club"><div><p className={s.kicker}>لأنك من أهل فواصل</p><h2>ستايل يكافئك</h2><p>اجمع أختامك في بطاقة واحدة<br />ومع {loyalty.purchasesRequired} أختام تنتظرك مكافأتك</p><a className={s.primary} href={`/loyalty/${menu.slug}`}>انضم لنادي فواصل<ArrowUpLeft aria-hidden="true" /></a></div><div className={s.cardStage}><span className={s.clubWord} aria-hidden="true" dir="ltr">THE CLUB</span><a className={s.clubCard} href={`/loyalty/${menu.slug}`} aria-label="افتح بطاقة ولاء فواصل"><span className={s.cardTop}>FAWASEL<span>MEMBER CLUB</span></span><strong>لك مكان<br /><em>بين أهل الستايل</em></strong><div className={s.cardStamps} aria-hidden="true">{Array.from({ length: Math.min(loyalty.purchasesRequired, 8) }, (_, i) => <span key={i}><Shirt /></span>)}</div><span className={s.cardBottom}>{loyalty.rewardName}<ArrowUpLeft aria-hidden="true" /></span></a></div></section>}
    <FawaselBranches />
    <footer className={s.footer}><div><strong>فواصل</strong><span dir="ltr">STYLE FOR EVERYDAY</span></div><nav aria-label="خدمة العملاء"><a href="https://fawasell.com/ar/سياسة-الاستبدال-والاسترجاع/page-2043920405" target="_blank" rel="noopener noreferrer">الاستبدال والاسترجاع</a><a href="https://fawasell.com/ar/الخصوصيه/page-1270411030" target="_blank" rel="noopener noreferrer">الخصوصية</a><a href="tel:+966559565777">تواصل معنا</a></nav><a href="#fawasel-top">العودة للأعلى ↑</a></footer>
    <nav className={s.bottomNav} aria-label="التسوق السريع"><a href="#fawasel-top"><Home aria-hidden="true" /><span>الرئيسية</span></a><a href="#fawasel-collections"><Grid2X2 aria-hidden="true" /><span>الأقسام</span></a><button onClick={favorites} aria-label={`المفضلة ${favoriteIds.length} قطعة`}><Heart aria-hidden="true" /><span>المفضلة</span>{favoriteIds.length > 0 && <b>{favoriteIds.length}</b>}</button>{loyalty && menu.loyaltyEnabled && <a href={`/loyalty/${menu.slug}`}><Star aria-hidden="true" /><span>بطاقتك</span></a>}<button onClick={() => setCartOpen(true)}><ShoppingBag aria-hidden="true" /><span>الحقيبة</span>{count > 0 && <b>{count}</b>}</button></nav>
    {notice && <div className={s.notice} role="status"><span>{notice}</span><button onClick={() => { setCartOpen(true); setNotice(""); }}>افتح الحقيبة</button><button aria-label="إغلاق الإشعار" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {currentProduct && <GiftProductDialog key={currentProduct.id} slug={menu.slug} product={currentProduct} close={() => setSelected(null)} add={add} orderingEnabled={ordering} />}
    {cartOpen && settings && <GiftCheckoutDialog slug={menu.slug} lines={lines} products={menu.products} settings={settings} setLines={setLines} close={() => setCartOpen(false)} onReceipt={value => { setReceipt(value); setTracking(value.trackingToken); saveOrder(value.trackingToken); setCartOpen(false); }} />}
    {cartOpen && !settings && <StoreDialog title="حقيبة التسوق" close={() => setCartOpen(false)}><div className={s.empty}><ShoppingBag aria-hidden="true" /><h3>نجهّز استقبال طلباتكم</h3><p>تصفّح المنتجات وتفاصيلها إلى أن يفتح المتجر الطلبات</p><button onClick={() => { setCartOpen(false); browse(); }}>تابع التسوق</button></div></StoreDialog>}
    {lastOrder && !tracking && <button className={s.track} onClick={() => setTracking(lastOrder)}><Truck aria-hidden="true" />تابع طلبك</button>}
    {tracking && <GiftTrackingDialog slug={menu.slug} token={tracking} receipt={receipt} close={() => setTracking("")} />}
  </main></StoreRetailContext.Provider>;
}
