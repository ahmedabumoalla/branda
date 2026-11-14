"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowUpLeft, ArrowDown, Search, ShoppingBag, MapPin, Shirt, Truck, X, SlidersHorizontal } from "lucide-react";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { matchesMenuSearch } from "@/lib/menu/standalone-menu";
import { giftOrderInputSchema, type GiftOrderReceipt, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { giftProductAvailable, productMinimumPrice, type GiftCartLine } from "@/lib/commerce/storefront-cart";
import { GiftCheckoutDialog, GiftProductDialog, GiftTrackingDialog, StoreRetailContext } from "./gift-store-dialogs";
import s from "./fawasel-store.module.css";

const money = (amount: number) => amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
const memory = new Map<string, string>();
function subscribe(listener: () => void) {
  const changed = (event: StorageEvent) => { if (event.key) memory.delete(event.key); listener(); };
  window.addEventListener("storage", changed); window.addEventListener("fawasel-cart", listener);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener("fawasel-cart", listener); };
}
function useSaved(key: string) {
  const value = useSyncExternalStore(subscribe, () => { try { return memory.get(key) ?? localStorage.getItem(key) ?? ""; } catch { return memory.get(key) ?? ""; } }, () => "");
  return [value, (next: string) => { try { localStorage.setItem(key, next); memory.delete(key); } catch { memory.set(key, next); } window.dispatchEvent(new Event("fawasel-cart")); }] as const;
}
function readCart(value: string): GiftCartLine[] {
  try { const parsed = giftOrderInputSchema.shape.items.safeParse(JSON.parse(value)); return parsed.success ? parsed.data.map((line, index) => ({ ...line, key: `saved-${index}` })) : []; } catch { return []; }
}
function Photo({ src, alt, eager = false }: { src?: string; alt: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={s.placeholder}><Shirt aria-hidden="true" /><span>{alt}</span></span>;
  // Original catalog photography; keep the native aspect ratio and lazy load below the opening.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" onError={() => setFailed(true)} />;
}

export function FawaselStore({ menu, settings, loyalty }: { menu: StandaloneMenu; settings: GiftStoreSettings | null; loyalty: { purchasesRequired: number; rewardName: string } | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const [available, setAvailable] = useState(false);
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<StandaloneMenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<GiftOrderReceipt | null>(null);
  const [tracking, setTracking] = useState("");
  const [saved, save] = useSaved(`fawasel-cart:${menu.slug}`);
  const [lastOrder, saveOrder] = useSaved(`fawasel-order:${menu.slug}`);
  const lines = readCart(saved);
  const setLines = (value: GiftCartLine[]) => save(JSON.stringify(value));
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  const filtered = menu.products.filter(product => (category === "all" || category === product.categoryId) && matchesMenuSearch(product, query) && (!available || giftProductAvailable(product)));
  if (sort !== "featured") filtered.sort((a, b) => (productMinimumPrice(a) - productMinimumPrice(b)) * (sort === "low" ? 1 : -1));
  const collections = menu.categories.flatMap(item => { const product = menu.products.find(p => p.categoryId === item.id && p.images.length); return product ? [{ ...item, product }] : []; });
  const hero = menu.products.find(p => giftProductAvailable(p) && /شوز|حذاء|سنيكر/.test(p.name + p.category) && p.images.length) ?? menu.products.find(p => p.images.length);
  const ordering = settings?.enabled === true;
  const currentProduct = selected && menu.products.find(p => p.id === selected.id);
  function browse(id = "all") { setCategory(id); setQuery(""); setLimit(24); document.getElementById("fawasel-products")?.scrollIntoView({ block: "start" }); }
  function add(product: StandaloneMenuProduct, line: Omit<GiftCartLine, "key" | "productId">) {
    if (!ordering) return "الطلبات متوقفة مؤقتًا";
    if (lines.length >= 30) return "يمكن إضافة ٣٠ صنفًا في الطلب الواحد";
    setLines([...lines, { ...line, productId: product.id, key: crypto.randomUUID() }]);
    setSelected(null); setNotice(`أضفنا ${product.name} إلى سلتك`); return null;
  }
  return <StoreRetailContext.Provider value={true}><main className={s.store} dir="rtl">
    <a className={s.skip} href="#fawasel-products">انتقل إلى المنتجات</a>
    <div className={s.announcement}><span>ستايلك كل يوم</span><span dir="ltr">FAWASEL — FOR CASUAL WEAR</span></div>
    <header className={s.header}>
      <a className={s.brand} href="#fawasel-top" aria-label="فواصل الرئيسية"><Photo src="/fawasel/brand-reference.jpeg" alt="فواصل FAWASEL" eager /></a>
      <nav aria-label="التنقل الرئيسي"><a href="#fawasel-products" onClick={() => browse()}>تسوّق الآن</a>{loyalty && <a href="#fawasel-club">نادي فواصل</a>}<a href="#fawasel-branches">فروعنا</a></nav>
      <button className={s.cart} onClick={() => setCartOpen(true)} aria-label={`حقيبة التسوق ${count} قطعة`}><ShoppingBag aria-hidden="true" /><span>الحقيبة</span><b>{count}</b></button>
    </header>
    <section className={s.hero} id="fawasel-top" aria-labelledby="fawasel-title">
      <div className={s.heroCopy}><p className={s.kicker}>فواصل للأزياء اليومية</p><h1 id="fawasel-title">مو بس لبس<br /><em>هذا ستايلك</em></h1><p>من أول خطوة لآخر تفصيلة<br />اختيارات تكمل إطلالتك وتعبّر عنك</p><a className={s.primary} href="#fawasel-products" onClick={() => browse()}>اختر إطلالتك<ArrowUpLeft aria-hidden="true" /></a><div className={s.heroFoot}><span>أحذية · أزياء · إكسسوارات</span><ArrowDown aria-hidden="true" /></div></div>
      {hero ? <button className={s.heroVisual} onClick={() => setSelected(hero)} aria-label={`تسوّق ${hero.name}`}><span className={s.heroWord} aria-hidden="true">EVERY<br />DAY.</span><Photo src={hero.images[0]?.url} alt={hero.name} eager /><span className={s.heroTag}><span>{hero.name}<b>{money(productMinimumPrice(hero))} ريال</b></span><ArrowUpLeft aria-hidden="true" /></span><span className={s.heroSeal} aria-hidden="true">YOUR STYLE<br />YOUR RULES</span></button> : <div className={s.heroVisual}><Shirt size={120} aria-hidden="true" /></div>}
    </section>
    <div className={s.ribbon} aria-hidden="true"><span>ستايل يبدأ منك</span><span>FAWASEL</span><span>كل يوم بطريقتك</span><span>FAWASEL</span></div>
    {!!collections.length && <section className={s.collections} aria-labelledby="collections-title"><div className={s.sectionHeading}><div><p className={s.kicker}>ابدأ من هنا</p><h2 id="collections-title">على ذوقك</h2></div><a href="#fawasel-products">كل المنتجات <ArrowUpLeft aria-hidden="true" /></a></div><div className={s.collectionGrid}>{collections.slice(0, 5).map(item => <button key={item.id} onClick={() => browse(item.id)}><Photo src={item.product.images[0]?.url} alt={item.name} /><span>{item.name}<ArrowUpLeft aria-hidden="true" /></span></button>)}</div></section>}
    <section className={s.catalog} id="fawasel-products" aria-labelledby="catalog-title"><div className={s.sectionHeading}><div><p className={s.kicker}>تفاصيل تفرق</p><h2 id="catalog-title">إطلالتك الجاية هنا</h2></div><span className={s.english} dir="ltr">FIND YOUR FIT</span></div>
      <div className={s.toolbar}><label className={s.search}><Search aria-hidden="true" /><input type="search" placeholder="وش تدور عليه؟" aria-label="ابحث في المنتجات" value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} /></label><label className={s.sort}><SlidersHorizontal aria-hidden="true" /><span>رتّب حسب</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="featured">اختيارات المتجر</option><option value="low">الأقل سعرًا</option><option value="high">الأعلى سعرًا</option></select></label></div>
      <nav className={s.tabs} aria-label="تصنيفات المنتجات">{[{ id: "all", name: "الكل" }, ...menu.categories].map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setLimit(24); }}>{item.name}</button>)}</nav>
      <div className={s.results}><p role="status">{filtered.length} منتج</p><label><input type="checkbox" checked={available} onChange={event => { setAvailable(event.target.checked); setLimit(24); }} />المتاح فقط</label></div>
      <div className={s.grid}>{filtered.slice(0, limit).map(product => <article className={s.product} key={product.id}><button className={s.productImage} onClick={() => setSelected(product)} aria-label={`تفاصيل ${product.name}`}><Photo src={product.images[0]?.url} alt={product.name} />{!giftProductAvailable(product) && <span className={s.soldOut}>نفد حاليًا</span>}<span className={s.quick}>اختر مقاسك <ArrowUpLeft aria-hidden="true" /></span></button><div className={s.productMeta}><span>{product.category}</span><button onClick={() => setSelected(product)} aria-label={`خيارات ${product.name}`}><ShoppingBag size={18} aria-hidden="true" /></button></div><h3><button onClick={() => setSelected(product)}>{product.name}</button></h3><p className={s.price}>{Boolean(product.commerceDetails?.options?.length) && <small>من </small>}<bdi>{money(productMinimumPrice(product))}</bdi><span>ريال</span></p></article>)}</div>
      {!filtered.length && <div className={s.empty}><Search aria-hidden="true" /><h3>ما لقينا منتج يطابق بحثك</h3><button onClick={() => { setQuery(""); setCategory("all"); setAvailable(false); }}>عرض كل المنتجات</button></div>}
      {filtered.length > limit && <button className={s.more} onClick={() => setLimit(value => value + 24)}>شوف أكثر <ArrowDown aria-hidden="true" /></button>}
    </section>
    {loyalty && menu.loyaltyEnabled && <section className={s.club} id="fawasel-club"><div><p className={s.kicker}>لأنك من أهل فواصل</p><h2>ستايل يكافئك</h2><p>اجمع أختامك في بطاقة واحدة<br />ومع {loyalty.purchasesRequired} أختام تنتظرك مكافأتك</p><a className={s.primary} href={`/loyalty/${menu.slug}`}>انضم لنادي فواصل<ArrowUpLeft aria-hidden="true" /></a></div><a className={s.clubCard} href={`/loyalty/${menu.slug}`} aria-label="افتح بطاقة ولاء فواصل"><span className={s.cardTop}>FAWASEL<span>MEMBER CLUB</span></span><strong>لك مكان<br /><em>بين أهل الستايل</em></strong><div className={s.cardStamps} aria-hidden="true">{Array.from({ length: Math.min(loyalty.purchasesRequired, 8) }, (_, i) => <span key={i}><Shirt /></span>)}</div><span className={s.cardBottom}>{loyalty.rewardName}<ArrowUpLeft aria-hidden="true" /></span></a></section>}
    <section className={s.branches} id="fawasel-branches"><div className={s.sectionHeading}><div><p className={s.kicker}>نخدمك أينما كنت</p><h2>قريبين منك</h2></div><MapPin aria-hidden="true" /></div><div className={s.branchGrid}>{[{ city: "خميس مشيط", place: "طريق المدينة العسكرية", account: "fawasell1" }, { city: "أبها", place: "المنسك · إشارة الأربعين", account: "fawasell2" }, { city: "خميس مشيط", place: "طريق الميه", account: "fawasell3" }, { city: "جازان", place: "مخطط 5", account: "fawasell4" }, { city: "الرياض", place: "طريق الإمام سعود", account: "fawasell5" }, { city: "تبوك", place: "الفيصلية الشمالية · أوتليت", account: "fawasell6" }, { city: "نجران", place: "حي الأثايبة · فاموس", account: "vamos_sa1" }].map(branch => <a key={branch.account} href={`https://www.snapchat.com/add/${branch.account}`} target="_blank" rel="noopener noreferrer"><MapPin aria-hidden="true" /><div><h3>{branch.city}</h3><p>{branch.place}</p><span dir="ltr">@{branch.account}</span></div><ArrowUpLeft aria-hidden="true" /></a>)}</div></section>
    <footer className={s.footer}><div><strong>فواصل</strong><span dir="ltr">STYLE FOR EVERYDAY</span></div><p>أزياء تكمل يومك</p><a href="#fawasel-top">العودة للأعلى ↑</a></footer>
    {notice && <div className={s.notice} role="status"><span>{notice}</span><button onClick={() => { setCartOpen(true); setNotice(""); }}>افتح الحقيبة</button><button aria-label="إغلاق الإشعار" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {currentProduct && <GiftProductDialog key={currentProduct.id} product={currentProduct} close={() => setSelected(null)} add={add} orderingEnabled={ordering} />}
    {cartOpen && settings && <GiftCheckoutDialog slug={menu.slug} lines={lines} products={menu.products} settings={settings} setLines={setLines} close={() => setCartOpen(false)} onReceipt={value => { setReceipt(value); setTracking(value.trackingToken); saveOrder(value.trackingToken); setCartOpen(false); }} />}
    {cartOpen && !settings && <div className={s.notice} role="alert"><span>تعذر تحميل إعدادات الطلبات حاول تحديث الصفحة</span><button onClick={() => setCartOpen(false)}>إغلاق</button></div>}
    {lastOrder && !tracking && <button className={s.track} onClick={() => setTracking(lastOrder)}><Truck aria-hidden="true" />تابع طلبك</button>}
    {tracking && <GiftTrackingDialog slug={menu.slug} token={tracking} receipt={receipt} close={() => setTracking("")} />}
  </main></StoreRetailContext.Provider>;
}
