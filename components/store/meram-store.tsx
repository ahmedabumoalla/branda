"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowUpLeft, Flower2, MapPin, Megaphone, Plus, Search, ShoppingBag, Ticket, WalletCards, X } from "lucide-react";
import { giftOrderInputSchema, type GiftOrderReceipt, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { giftProductAvailable, productMinimumPrice, type GiftCartLine } from "@/lib/commerce/storefront-cart";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";
import { matchesMenuSearch, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { GiftProductDialog, StorePhoto, StoreRetailContext } from "./gift-store-dialogs";
import { MeramCart, MeramTracking } from "./meram-cart";
import s from "./meram-store.module.css";

type Props = { menu: StandaloneMenu; settings: GiftStoreSettings | null; loyaltyEnabled: boolean; initialTracking?: string };
const storageEvent = "meram-cart-change";
const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  const changed = (event: StorageEvent) => { if (event.key) memory.delete(event.key); else memory.clear(); listener(); };
  window.addEventListener("storage", changed);
  window.addEventListener(storageEvent, listener);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener(storageEvent, listener); };
}

function useStored(key: string) {
  const value = useSyncExternalStore(subscribe, () => {
    try { return memory.get(key) ?? localStorage.getItem(key) ?? ""; } catch { return memory.get(key) ?? ""; }
  }, () => "");
  return [value, (next: string) => {
    try { localStorage.setItem(key, next); memory.delete(key); } catch { memory.set(key, next); }
    window.dispatchEvent(new Event(storageEvent));
  }] as const;
}

function readLines(stored: string): GiftCartLine[] {
  try {
    const parsed = giftOrderInputSchema.shape.items.safeParse(JSON.parse(stored || "[]"));
    return parsed.success ? parsed.data.map((line, index) => ({ ...line, key: String(index) })) : [];
  } catch { return []; }
}

export function MeramStore({ menu, settings, loyaltyEnabled, initialTracking = "" }: Props) {
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const [selected, setSelected] = useState<StandaloneMenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [stored, writeCart] = useStored(`gift-cart:${menu.slug}`);
  const [lastToken, writeToken] = useStored(`gift-last-order:${menu.slug}`);
  const [tracking, setTracking] = useState(initialTracking);
  useEffect(() => {
    function openTrackedOrder() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("order");
      if (token && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)) setTracking(token);
    }
    openTrackedOrder();
    window.addEventListener("hashchange", openTrackedOrder);
    return () => window.removeEventListener("hashchange", openTrackedOrder);
  }, []);
  const [receipt, setReceipt] = useState<GiftOrderReceipt | null>(null);
  const [notice, setNotice] = useState("");
  const productSearch = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const logo = menu.logoUrl && !menu.logoUrl.startsWith("/brand/barndaksa-logo") ? menu.logoUrl : "/meram/wordmark.webp";
  const lines = readLines(stored);
  const setLines = (next: GiftCartLine[]) => writeCart(JSON.stringify(next));
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const [asOf, setAsOf] = useState(menu.highlights?.asOf ?? 0);
  const activePromotions = (menu.highlights?.items ?? []).filter(item => (!item.expiresAt || item.expiresAt > asOf) && (!item.productId || menu.products.some(product => product.id === item.productId)));
  const offers = activePromotions.filter(item => item.showInSpotlight !== false);
  const saleOffers = offers.filter(item => item.kind !== "announcement" && item.kind !== "event" && (item.kind === "general" || item.kind === "products" || item.productId || item.discountPercent || item.code || item.offerType));
  const announcements = offers.filter(item => !saleOffers.includes(item));
  const categories = menu.categories.filter(item => menu.products.some(product => product.categoryId === item.id));
  const products = menu.products.filter(product => (!category || product.categoryId === category) && matchesMenuSearch(product, query));
  const featured = menu.products.find(product => product.name.includes("فازة الجمال الوردي"));
  const ordering = Boolean(settings?.enabled && settings.deliveryEnabled && settings.paymentMethods.includes("bank_transfer"));

  useEffect(() => {
    const future = (menu.highlights?.items ?? []).map(item => item.expiresAt).filter((value): value is number => Boolean(value && value > asOf));
    if (!future.length) return;
    const timer = setTimeout(() => setAsOf(Date.now()), Math.max(50, Math.min(2147480000, Math.min(...future) - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [menu.highlights, asOf]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function add(product: StandaloneMenuProduct, item: Omit<GiftCartLine, "key" | "productId">) {
    if (!ordering) return "استقبال الطلبات متوقف مؤقتًا";
    if (lines.length >= 30) return "يمكن إضافة ٣٠ صنفًا للطلب الواحد";
    if (lines.length && (product.commerceDetails?.quoteOnly || lines.some(line => menu.products.find(p => p.id === line.productId)?.commerceDetails?.quoteOnly))) return "أكمل طلب التصميم بشكل مستقل";
    setLines([...lines, { ...item, key: crypto.randomUUID(), productId: product.id }]);
    setSelected(null);
    setNotice(`أُضيف ${product.name} إلى السلة`);
    return null;
  }
  function received(order: GiftOrderReceipt) {
    writeToken(order.trackingToken); setReceipt(order); setTracking(order.trackingToken); setCartOpen(false); setLines([]);
  }
  function openSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => productSearch.current?.focus());
  }

  return <StoreRetailContext.Provider value><main className={s.store} dir="rtl" id="meram-top">
    <a className={s.skip} href="#meram-collection">انتقل إلى الهدايا</a>
    <button className={s.bag} onClick={() => setCartOpen(true)} aria-label={count ? `فتح السلة وفيها ${count} قطع` : "فتح السلة"}>
      <ShoppingBag size={21} aria-hidden="true" />
    </button>
    <section className={s.hero} aria-labelledby="meram-title">
      <div className={s.heroPhoto}>
        <img src="/meram/hero.webp" alt="فازة الجمال الوردي من ميرام" width={1080} height={1080} fetchPriority="high" decoding="async" />
      </div>
      <div className={s.stageLight} aria-hidden="true" />
      <div className={s.petals} aria-hidden="true"><i /><i /><i /></div>

      <header className={s.header}>
        <a className={s.logo} href="#meram-top" aria-label="ميرام الرئيسية">
          <img src={logo} alt="" width="54" height="54" />
          <span>ميرام<small lang="en">MERAM</small></span>
        </a>

      </header>

      <div className={s.heroText}>
        <h1 id="meram-title"><span>قوليها</span>{" "}<em>بالورد</em></h1>
        <p className={s.intro}>اختاري الهدية واكتبي لها كلماتك على بطاقة الإهداء</p>
        <div className={s.heroActions}>
          <a className={s.heroCta} href="#meram-collection">اختاري هديتك <span><ArrowDownLeft size={18} /></span></a>
          {featured && <button className={s.featuredLink} onClick={() => setSelected(featured)}>{featured.name}<ArrowUpLeft size={15} /></button>}
        </div>
      </div>
      <div className={s.collectionLead} id="meram-collection" tabIndex={-1}>
        <h2 id="meram-products-title">هدايا ميرام</h2>
        <button className={s.collectionSearch} onClick={openSearch} aria-expanded={searchOpen} aria-label="بحث في الهدايا"><Search size={20} /></button>
      </div>
    </section>

    <section className={s.collection} aria-labelledby="meram-products-title">
      {lastToken && <div className={s.orderLink}><button onClick={() => setTracking(lastToken)}><ShoppingBag size={16} />متابعة طلبي الأخير<ArrowUpLeft size={16} /></button></div>}
      {searchOpen && <div className={s.search}><Search size={18} /><input ref={productSearch} type="search" value={query} placeholder="اسم الهدية أو وصفها" aria-label="ابحث في منتجات ميرام" onChange={event => { setQuery(event.target.value); setLimit(12); }} /><button className={s.icon} aria-label="إغلاق البحث" onClick={() => { setQuery(""); setSearchOpen(false); }}><X size={18} /></button></div>}
      {categories.length > 0 && <div className={s.tabs} role="group" aria-label="تصفية حسب المجموعة">{[{ id: "", name: "جميع الهدايا" }, ...categories].map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setLimit(12); }}>{item.name}</button>)}</div>}
      {products.length ? <div className={s.productGrid}>{products.slice(0,limit).map(product => {
        const available = giftProductAvailable(product);
        const promo = activePromotions.find(item => item.kind === "products" && item.productId === product.id);
        return <button className={s.product} key={product.id} onClick={() => setSelected(product)} aria-label={`تفاصيل ${product.name}`}>
          <span className={s.productImage}><StorePhoto src={product.images[0]?.url} alt={product.images[0]?.alt || product.name} sizes="(max-width: 700px) 46vw, (max-width: 1050px) 30vw, 23vw" />{!available && <span className={s.soldOut}>نفدت الكمية</span>}<span className={s.plus}><Plus size={18} /></span></span>
          <span className={s.productInfo}>{product.category && <small>{product.category}</small>}<strong>{product.name}</strong>{promo && <small className={s.productPromo}><Ticket size={13}/>{promo.title}{promo.code && <bdi>{promo.code}</bdi>}</small>}<span>{product.commerceDetails?.quoteOnly ? "حسب الطلب" : <>{product.commerceDetails?.options?.length ? "ابتداءً من " : ""}<bdi>{productMinimumPrice(product).toLocaleString("ar-SA")}</bdi> ر.س</>}</span></span>
        </button>;
      })}</div> : <p className={s.empty}>{query || category ? "ما لقينا هدايا تطابق بحثك" : "تُضاف هدايا ميرام هنا عند نشرها"}</p>}
      {limit < products.length && <button className={s.outline} onClick={() => setLimit(value => value + 12)}>عرض المزيد من الهدايا<Plus size={16} /></button>}
    </section>

    <section className={s.cards} aria-label="بطاقات ميرام">
      {loyaltyEnabled && <article className={s.membership} id="meram-loyalty" aria-labelledby="meram-loyalty-title">
        <div className={s.membershipCopy}>
          <p className={s.kicker}><WalletCards size={16} aria-hidden="true" />ولاء ميرام</p>
          <h2 id="meram-loyalty-title">كل زيارة تقرّبك من هديتك</h2>
          <p>احفظي بطاقتك وأبرزيها عند الشراء</p>
        </div>
        <div className={s.walletMock} aria-hidden="true">
          <Flower2 size={13} /><img src={logo} alt="" width="56" height="56" />
          <span>بطاقة الولاء</span>
        </div>
        <a className={s.cardAction} href={`/loyalty/${encodeURIComponent(menu.slug)}?source=menu`} onClick={() => trackBrandEngagement(menu.slug,"menu_loyalty_click")}>
          أضيفي بطاقتك للمحفظة<ArrowLeft size={18} aria-hidden="true" />
        </a>
      </article>}
      <div className={s.offersCard} id="meram-offers"><p className={s.kicker}><Ticket size={18} />بطاقة العروض</p><h2>عروض ميرام</h2>
        {saleOffers.length ? <div className={s.offerList}><p>اذكر اسم العرض أو رمزه في ملاحظات الطلب لتؤكد ميرام قيمته معك قبل الدفع</p>{saleOffers.map(item => <article key={item.id}>
          {item.imageUrl && <StorePhoto src={item.imageUrl} alt="" className={s.promoPhoto} />}
          <h3>{item.title}</h3>{item.description && <p>{item.description}</p>}{item.discountPercent && <small>خصم {item.discountPercent}٪</small>}{item.code && <small>رمز العرض <bdi>{item.code}</bdi></small>}
          {item.productId && <button className={s.textButton} onClick={() => setSelected(menu.products.find(p => p.id === item.productId) ?? null)}>عرض الهدية<ArrowLeft size={16} /></button>}
        </article>)}</div> : <p>لا توجد عروض نشطة حاليًا</p>}
      </div>
    </section>

    {announcements.length > 0 && <section id="meram-news" className={s.news}><p className={s.kicker}><Megaphone size={17} />إعلانات المتجر</p><h2>جديد ميرام</h2><div className={s.newsGrid}>{announcements.map(item => <article key={item.id}>{item.imageUrl && <StorePhoto src={item.imageUrl} alt="" />}<div><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}{item.eventLocation && <small><MapPin size={14}/>{item.eventLocation}</small>}{item.eventDate && <small>{item.eventDate} {item.eventTime}</small>}{item.productId && <button className={s.textButton} onClick={() => setSelected(menu.products.find(product => product.id === item.productId) ?? null)}>عرض الهدية<ArrowLeft size={16}/></button>}</div></article>)}</div></section>}

    <footer className={s.footer}><img src={logo} alt="ميرام" width="88" height="48" /><span>ورود وهدايا ميرام</span><nav aria-label="التواصل مع ميرام">{menu.contacts.instagramUrl && <a href={menu.contacts.instagramUrl} target="_blank" rel="noreferrer">إنستغرام<ArrowUpLeft size={14}/></a>}{menu.contacts.location && <a href={menu.contacts.location.googleUrl} target="_blank" rel="noreferrer">موقع المتجر<MapPin size={14}/></a>}<a href="#meram-top">العودة للأعلى</a></nav></footer>
    <div role="status" className={notice ? s.toast : undefined}>{notice}</div>
    {selected && <GiftProductDialog key={selected.id} slug={menu.slug} product={selected} close={() => setSelected(null)} add={add} orderingEnabled={ordering} />}
    {cartOpen && <MeramCart slug={menu.slug} products={menu.products} lines={lines} setLines={setLines} settings={settings} close={() => setCartOpen(false)} onReceipt={received} />}
    {tracking && <MeramTracking key={tracking} slug={menu.slug} token={tracking} receipt={receipt?.trackingToken === tracking ? receipt : null} close={() => setTracking("")} />}
  </main></StoreRetailContext.Provider>;
}
