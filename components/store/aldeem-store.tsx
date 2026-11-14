"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowUpLeft, CakeSlice, ChevronDown, Grid2X2, Heart, Home, Search, ShoppingBag, Sparkles, Truck, X } from "lucide-react";
import { matchesMenuSearch, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { giftOrderInputSchema, type GiftOrderReceipt, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { giftProductAvailable, productMinimumPrice, type GiftCartLine } from "@/lib/commerce/storefront-cart";
import { GiftCheckoutDialog, GiftProductDialog, GiftTrackingDialog, StoreDialog, StoreRetailContext } from "./gift-store-dialogs";
import s from "./aldeem-store.module.css";

const memory = new Map<string, string>();
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key) memory.delete(event.key); listener(); };
  window.addEventListener("storage", storage); window.addEventListener("aldeem-store", listener);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener("aldeem-store", listener); };
}
function subscribeLocation(listener: () => void) { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }
function useSaved(key: string) {
  const value = useSyncExternalStore(subscribe, () => { try { return memory.get(key) ?? localStorage.getItem(key) ?? ""; } catch { return memory.get(key) ?? ""; } }, () => "");
  return [value, (next: string) => { try { localStorage.setItem(key, next); memory.delete(key); } catch { memory.set(key, next); } window.dispatchEvent(new Event("aldeem-store")); }] as const;
}
function readCart(value: string): GiftCartLine[] {
  try { const result = giftOrderInputSchema.shape.items.safeParse(JSON.parse(value)); return result.success ? result.data.map((line, index) => ({ ...line, key: `saved-${index}` })) : []; } catch { return []; }
}
function Photo({ src, alt, eager = false }: { src?: string | null; alt: string; eager?: boolean }) {
  const [failed, setFailed] = useState("");
  if (!src || failed === src) return <span className={s.placeholder}><CakeSlice aria-hidden="true" /><span>{alt}</span></span>;
  // Brand and catalog imagery retains its original aspect ratio.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" onError={() => setFailed(src)} />;
}
function Price({ product }: { product: StandaloneMenuProduct }) {
  return product.commerceDetails?.quoteOnly ? <span className={s.quote}>السعر عند تأكيد الطلب</span> : <span className={s.price}>{Boolean(product.commerceDetails?.options?.length) && <small>من </small>}<bdi>{productMinimumPrice(product).toLocaleString("en-US", { maximumFractionDigits: 2 })}</bdi><small>ريال</small></span>;
}
function ProductTile({ product, favorite, select, toggle }: { product: StandaloneMenuProduct; favorite: boolean; select: () => void; toggle: () => void }) {
  return <article className={s.product}><div className={s.productMedia}><button className={s.productImage} onClick={select} aria-label={`تفاصيل ${product.name}`}><Photo src={product.images[0]?.url} alt={product.name} /><span className={s.quick}>تفاصيل الحلا <ArrowUpLeft aria-hidden="true" /></span></button><button className={s.favorite} onClick={toggle} aria-pressed={favorite} aria-label={`${favorite ? "إزالة من" : "إضافة إلى"} المفضلة ${product.name}`}><Heart fill={favorite ? "currentColor" : "none"} aria-hidden="true" /></button>{!giftProductAvailable(product) && !product.commerceDetails?.quoteOnly && <span className={s.unavailable}>غير متاح حاليًا</span>}</div><p className={s.productCategory}>{product.category}</p><h3><button onClick={select}>{product.name}</button></h3><div className={s.productBottom}><Price product={product} /><button onClick={select} aria-label={`اختر ${product.name}`}><ArrowUpLeft aria-hidden="true" /></button></div></article>;
}

export function AldeemStore({ menu, settings, loyalty }: { menu: StandaloneMenu; settings: GiftStoreSettings | null; loyalty: { purchasesRequired: number; rewardName: string } | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [limit, setLimit] = useState(16);
  const [selected, setSelected] = useState<StandaloneMenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<GiftOrderReceipt | null>(null);
  const [saved, save] = useSaved(`aldeem-cart:${menu.slug}`);
  const [savedFavorites, saveFavorites] = useSaved(`aldeem-favorites:${menu.slug}`);
  const [lastOrder, saveOrder] = useSaved(`aldeem-order:${menu.slug}`);
  const [trackingOverride, setTracking] = useState<string | null>(null);
  const location = useSyncExternalStore(subscribeLocation, () => window.location.search, () => "");
  const queryToken = new URLSearchParams(location).get("order") ?? "";
  const tracking = trackingOverride ?? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryToken) ? queryToken : "");
  const favoriteIds: string[] = (() => { try { const value: unknown = JSON.parse(savedFavorites); return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && menu.products.some(p => p.id === id)))].slice(0, 200) : []; } catch { return []; } })();
  const lines = readCart(saved);
  const setLines = (value: GiftCartLine[]) => save(JSON.stringify(value));
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  const ordering = settings?.enabled === true;
  const currentProduct = selected && menu.products.find(p => p.id === selected.id);
  const filtered = menu.products.filter(p => (category === "all" || p.categoryId === category) && matchesMenuSearch(p, query) && (!favoritesOnly || favoriteIds.includes(p.id)));
  const collections = menu.categories.flatMap(item => { const product = menu.products.find(p => p.categoryId === item.id && p.images.length); return product ? [{ ...item, product }] : []; });
  const featured = menu.products.filter(p => p.images.length).slice(0, 6);
  function browse(id = "all", favorites = false) { setCategory(id); setFavoritesOnly(favorites); setQuery(""); setLimit(16); document.getElementById("aldeem-products")?.scrollIntoView({ block: "start" }); }
  function tile(product: StandaloneMenuProduct) { return <ProductTile key={product.id} product={product} favorite={favoriteIds.includes(product.id)} select={() => setSelected(product)} toggle={() => saveFavorites(JSON.stringify(favoriteIds.includes(product.id) ? favoriteIds.filter(id => id !== product.id) : [...favoriteIds, product.id].slice(-200)))} />; }
  function add(product: StandaloneMenuProduct, line: Omit<GiftCartLine, "key" | "productId">) {
    if (!ordering) return "استقبال الطلبات غير متاح حاليًا";
    if (product.commerceDetails?.quoteOnly) return "يلزم تأكيد سعر هذا المنتج قبل إضافته للسلة";
    if (lines.length >= 30) return "يمكن إضافة ٣٠ صنفًا في الطلب الواحد";
    setLines([...lines, { ...line, productId: product.id, key: crypto.randomUUID() }]); setSelected(null); setNotice(`أضفنا ${product.name} إلى سلتك`); return null;
  }
  return <StoreRetailContext.Provider value={true}><main className={s.store} dir="rtl" id="aldeem-top">
    <a className={s.skip} href="#aldeem-products">انتقل إلى المنتجات</a>
    <div className={s.announcement}><span>للحظات اللي تستاهل الحلا</span><span dir="ltr">KHAYAL ALDEEM</span></div>
    <header className={s.header}><a className={s.brand} href="#aldeem-top" aria-label="خيال الديم الرئيسية"><Photo src={menu.logoUrl || "/aldeem/logo.webp"} alt="خيال الديم للحلويات" eager /></a><nav aria-label="التنقل الرئيسي"><button onClick={() => browse()}>كل الحلا</button><a href="#aldeem-collections">اختَر مزاجك</a>{loyalty && menu.loyaltyEnabled && <a href="#aldeem-club">مكافآتك</a>}</nav><button className={s.bagButton} onClick={() => setCartOpen(true)} aria-label={`سلة التسوق ${count} منتج`}><ShoppingBag aria-hidden="true" /><span>السلة</span><b>{count}</b></button></header>
    <section className={s.hero} aria-labelledby="aldeem-hero-title"><div className={s.heroCopy}><p className={s.eyebrow}><Sparkles size={15} aria-hidden="true" />من خيال الديم إلى لحظتك</p><h1 id="aldeem-hero-title">حلا يكمّل<br /><em>حلو أيامك</em></h1><p className={s.heroText}>كيك يجمعنا وحلا نشاركه<br />اختَر اللي تحب وخلّ الباقي لحظة حلوة</p><button className={s.primary} onClick={() => browse()}>اكتشف الحلا <ArrowUpLeft aria-hidden="true" /></button><div className={s.heroFoot}><span>حلويات وشوكولاتة</span><span dir="ltr">A LITTLE SWEETER</span></div></div><div className={s.heroVisual}><Photo src={menu.appearance?.heroUrl || "/aldeem/hero.webp"} alt="تشكيلة حلويات خيال الديم" eager /><div className={s.heroSeal}><span>من خيال</span><strong>الديم</strong><Sparkles size={18} aria-hidden="true" /></div><span className={s.heroCaption}>لكل لمّة حلاها</span></div></section>
    <div className={s.ribbon} aria-hidden="true"><span>حلا يليق بلحظتك</span><Sparkles /><span>خيال الديم</span><Sparkles /><span>شاركهم الحلا</span><Sparkles /><span>حلا يليق بلحظتك</span></div>
    {collections.length > 0 && <section className={s.collections} id="aldeem-collections" aria-labelledby="collections-title"><div className={s.heading}><div><p className={s.eyebrow}>كل مزاج وله حلا</p><h2 id="collections-title">وش خاطرك فيه؟</h2></div><button onClick={() => browse()}>كل المنتجات <ArrowUpLeft aria-hidden="true" /></button></div><div className={s.collectionRail}>{collections.map((item, index) => <button className={s.collection} key={item.id} onClick={() => browse(item.id)}><span className={s.collectionPhoto} data-tone={index % 3}><Photo src={item.product.images[0]?.url} alt="" /></span><strong>{item.name}</strong><span>{menu.products.filter(p => p.categoryId === item.id).length} اختيارات <ArrowUpLeft size={14} aria-hidden="true" /></span></button>)}</div></section>}
    {featured.length > 0 && <section className={s.featured} aria-labelledby="featured-title"><div className={s.heading}><div><p className={s.eyebrow}>من تشكيلة الديم</p><h2 id="featured-title">خلّها لحظة حلوة</h2></div><span className={s.handwritten} dir="ltr">Made for sweet moments</span></div><div className={s.productRail}>{featured.map(tile)}</div></section>}
    <section className={s.moment}><span className={s.momentIcon} aria-hidden="true"><CakeSlice /></span><div><p className={s.eyebrow}>من أول قطعة لآخر ضحكة</p><h2>الحلا يحلى<br />مع اللي تحبّهم</h2><p>لزيارتك وللمّة الأهل وللحظة اللي على بالك</p></div><button onClick={() => browse()} className={s.lightButton}>اختَر حلا اللمّة <ArrowUpLeft aria-hidden="true" /></button></section>
    <section className={s.catalog} id="aldeem-products" aria-labelledby="products-title"><div className={s.heading}><div><p className={s.eyebrow}>تشكيلة خيال الديم</p><h2 id="products-title">الحلا على ذوقك</h2></div><span className={s.productCount}>{menu.products.length} منتج</span></div><label className={s.search}><Search aria-hidden="true" /><input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(16); }} placeholder="كيك شوكولاتة أو تشيز أو حلا؟" aria-label="ابحث في منتجات الديم" /></label><nav className={s.tabs} aria-label="تصنيفات الحلا">{[{ id: "all", name: "كل الحلا" }, ...menu.categories].map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setLimit(16); }}>{item.name}</button>)}</nav><div className={s.resultRow}><span role="status">{filtered.length} منتج يناسب اختيارك</span><button aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly(!favoritesOnly); setLimit(16); }}><Heart size={16} aria-hidden="true" />المفضلة</button></div><div className={s.grid}>{filtered.slice(0, limit).map(tile)}</div>{!filtered.length && <div className={s.empty}><CakeSlice aria-hidden="true" /><h3>{favoritesOnly ? "حلاك المفضل يستاهل قلب" : "جرّب اسمًا ثانيًا أو تصنيفًا مختلفًا"}</h3><p>{favoritesOnly ? "اضغط القلب على المنتجات لتجمع اختياراتك هنا" : "تقدر ترجع وتشوف كل تشكيلة الديم"}</p><button onClick={() => browse()}>عرض كل الحلا</button></div>}{filtered.length > limit && <button className={s.more} onClick={() => setLimit(value => value + 16)}>المزيد من الحلا <ChevronDown aria-hidden="true" /></button>}</section>
    {loyalty && menu.loyaltyEnabled && <section className={s.club} id="aldeem-club"><div><p className={s.eyebrow}>لأهل الديم</p><h2>حلا ومكافآت<br />على ذوقك</h2><p>اجمع {loyalty.purchasesRequired} أختام واستمتع بمكافأتك</p><a className={s.primary} href={`/loyalty/${menu.slug}`}>افتح بطاقتك <ArrowUpLeft aria-hidden="true" /></a></div><a className={s.clubCard} href={`/loyalty/${menu.slug}`} aria-label="بطاقة مكافآت خيال الديم"><span>خيال الديم <Sparkles aria-hidden="true" /></span><strong>لحظاتك الحلوة<br />تستاهل أكثر</strong><div aria-hidden="true">{Array.from({ length: Math.min(loyalty.purchasesRequired, 8) }, (_, i) => <CakeSlice key={i} />)}</div><small>{loyalty.rewardName}</small></a></section>}
    <footer className={s.footer}><Photo src={menu.logoUrl || "/aldeem/logo.webp"} alt="خيال الديم للحلويات" /><p>سلسلة خيال الديم للحلويات</p><nav aria-label="تواصل مع خيال الديم">{menu.contacts.instagramUrl && <a href={menu.contacts.instagramUrl} target="_blank" rel="noopener noreferrer">إنستغرام <ArrowUpLeft size={16} aria-hidden="true" /></a>}{menu.contacts.location && <a href={menu.contacts.location.googleUrl} target="_blank" rel="noopener noreferrer">{menu.contacts.location.label} <ArrowUpLeft size={16} aria-hidden="true" /></a>}<a href="#aldeem-top">العودة للأعلى</a></nav></footer>
    <nav className={s.bottomNav} aria-label="التسوق السريع"><a href="#aldeem-top"><Home aria-hidden="true" /><span>الرئيسية</span></a><a href="#aldeem-collections"><Grid2X2 aria-hidden="true" /><span>الأقسام</span></a><button onClick={() => browse("all", true)}><Heart aria-hidden="true" /><span>المفضلة</span>{favoriteIds.length > 0 && <b>{favoriteIds.length}</b>}</button><button className={s.bottomBag} onClick={() => setCartOpen(true)}><ShoppingBag aria-hidden="true" /><span>السلة</span>{count > 0 && <b>{count}</b>}</button></nav>
    {notice && <div className={s.notice} role="status"><span>{notice}</span><button onClick={() => { setCartOpen(true); setNotice(""); }}>افتح السلة</button><button aria-label="إغلاق الإشعار" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {currentProduct && !currentProduct.commerceDetails?.quoteOnly && <GiftProductDialog key={currentProduct.id} slug={menu.slug} product={currentProduct} close={() => setSelected(null)} add={add} orderingEnabled={ordering} />}
    {currentProduct?.commerceDetails?.quoteOnly && <StoreDialog title="تفاصيل الحلا" close={() => setSelected(null)}><div className={s.quoteDetail}><div className={s.quotePhoto}><Photo src={currentProduct.images[0]?.url} alt={currentProduct.name} eager /></div><p className={s.eyebrow}>{currentProduct.category}</p><h2>{currentProduct.name}</h2>{currentProduct.description && <p>{currentProduct.description}</p>}<strong>السعر عند تأكيد الطلب</strong><p>نعرض لك المنتج الآن وسيظهر سعره وخيارات الطلب بعد اعتمادها من المتجر</p>{currentProduct.commerceDetails.attributes?.length ? <dl>{currentProduct.commerceDetails.attributes.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : null}<button className={s.primary} onClick={() => setSelected(null)}>تابع اكتشاف الحلا <ArrowUpLeft aria-hidden="true" /></button></div></StoreDialog>}
    {cartOpen && settings && ordering && <GiftCheckoutDialog slug={menu.slug} lines={lines} products={menu.products} settings={settings} setLines={setLines} close={() => setCartOpen(false)} onReceipt={value => { setReceipt(value); setTracking(value.trackingToken); saveOrder(value.trackingToken); setCartOpen(false); }} />}
    {cartOpen && (!settings || !ordering) && <StoreDialog title="سلة الديم" close={() => setCartOpen(false)}><div className={s.empty}><ShoppingBag aria-hidden="true" /><h3>نجهّز استقبال لحظاتكم الحلوة</h3><p>تصفّح التشكيلة واحفظ اختياراتك في المفضلة إلى أن تتاح الطلبات</p><button onClick={() => { setCartOpen(false); browse(); }}>اكتشف الحلا</button></div></StoreDialog>}
    {lastOrder && !tracking && <button className={s.track} onClick={() => setTracking(lastOrder)}><Truck size={18} aria-hidden="true" />تابع طلبك</button>}
    {tracking && <GiftTrackingDialog slug={menu.slug} token={tracking} receipt={receipt} close={() => setTracking("")} />}
  </main></StoreRetailContext.Provider>;
}
