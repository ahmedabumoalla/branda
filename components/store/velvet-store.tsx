"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowLeft, ArrowUpLeft, Check, Flower2, MapPin, Search, ShoppingBag } from "lucide-react";
import { useFlowerStore, type FlowerStoreProps } from "@/components/store/use-flower-store";
import { BrandLoyaltyEntry } from "@/components/menu/brand-loyalty-entry";
import { giftProductAvailable, productMinimumPrice } from "@/lib/commerce/storefront-cart";
import { GiftProductDialog, StoreMoney, StorePhoto, StoreRetailContext } from "./gift-store-dialogs";
import { MeramCart, MeramTracking } from "./meram-cart";
import s from "./velvet-store.module.css";

const phrases = ["وردٌ يحمل اسمك", "هدايا تُنسّق بعناية", "لكل مناسبة حكاية"];
const ease = [0.22, 1, 0.36, 1] as const;

export function VelvetStore(props: FlowerStoreProps) {
  const { menu, settings, loyaltyEnabled } = props;
  const shop = useFlowerStore(props);
  const reduce = useReducedMotion();
  const logo = menu.logoUrl && !menu.logoUrl.startsWith("/brand/barndaksa-logo") ? menu.logoUrl : "/velvet-box/logo.jpeg";
  const photographed = menu.products.filter(product => product.images[0]?.url);
  const featured = photographed.find(product => product.name.includes("هدية ثيم الأحرف") && product.name.includes("وردي")) ?? photographed[0];
  const news = [...shop.saleOffers, ...shop.announcements];
  const used = new Set<string>();
  const collections = shop.categories.flatMap(category => {
    const product = photographed.find(item => item.categoryId === category.id && !used.has(item.id))
      ?? photographed.find(item => item.commerceDetails?.sourceCategoryIds?.includes(category.id) && !used.has(item.id));
    if (!product) return [];
    used.add(product.id);
    return [{ category, product }];
  }).slice(0, 4);
  function browse(id = "") {
    shop.setCategory(id); shop.setQuery(""); shop.setLimit(12);
    document.getElementById("velvet-collection")?.scrollIntoView({ block: "start", behavior: reduce ? "instant" : "smooth" });
  }
  const reveal = (index = 0) => reduce ? {} : { initial: { opacity: 0, y: 26 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.15 }, transition: { duration: 0.7, delay: index * 0.07, ease } };

  return <StoreRetailContext.Provider value><main dir="rtl" id="velvet-top" className={s.store} data-velvet-store="atelier-v2">
    <a className={s.skip} href="#velvet-collection">انتقل إلى الهدايا</a>

    <div className={s.opening}>
      <div className={s.backdrop} aria-hidden="true">{featured && <StorePhoto src={featured.images[0].url} alt="" eager sizes="100vw"/>}</div>
      <header className={s.header}>
        <nav className={s.nav} aria-label="أقسام المتجر">
          <a href="#velvet-collection" onClick={() => browse()}>الهدايا</a>
          {collections.length > 0 && <a href="#velvet-occasions">المناسبات</a>}
          {loyaltyEnabled && <a href="#velvet-loyalty">بطاقة الولاء</a>}
          {shop.lastToken && <button onClick={() => shop.setTracking(shop.lastToken)}>متابعة طلبي</button>}
        </nav>
        <a className={s.wordmark} href="#velvet-top" aria-label="فيلفت بوكس الرئيسية"><span lang="en" dir="ltr">Velvet Box</span></a>
        <div className={s.actions}>
          <button aria-label="البحث في الهدايا" onClick={() => { browse(); setTimeout(() => shop.productSearch.current?.focus({ preventScroll: true }), reduce ? 0 : 450); }}><Search aria-hidden="true"/></button>
          <button className={s.bag} onClick={() => shop.setCartOpen(true)} aria-label={`فتح السلة وفيها ${shop.count} قطع`}><ShoppingBag aria-hidden="true"/><b>{shop.count}</b></button>
        </div>
      </header>

      <section className={s.hero} aria-labelledby="velvet-title">
        <motion.img className={s.emblem} src={logo} alt="" width="120" height="150" {...(reduce ? {} : { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 1.1, ease } })}/>
        <p className={s.signature} lang="en" dir="ltr">Flowers that carry your name</p>
        <h1 id="velvet-title">وردٌ يحمل <em>اسمك</em></h1>
        <p className={s.lead}>اختر تنسيق الورد وأضف اسم من تهديه وكلماتك له</p>
        <div className={s.heroActions}>
          <a className={s.primary} href="#velvet-collection" onClick={() => browse()}>تسوّق الهدايا<ArrowDownLeft aria-hidden="true"/></a>
          {featured && <button className={s.ghost} onClick={() => shop.setSelected(featured)}>هدية الموسم<ArrowUpLeft aria-hidden="true"/></button>}
        </div>
      </section>
      <div className={s.scrollCue} aria-hidden="true"><span/></div>
    </div>

    <div className={s.ribbon} aria-hidden="true"><div className={s.ribbonTrack}>{[0, 1].map(copy => <div className={s.ribbonGroup} key={copy}>{[...phrases, ...phrases].map((phrase, index) => <span key={`${phrase}-${index}`}><Flower2/>{phrase}</span>)}</div>)}</div></div>

    {loyaltyEnabled && <BrandLoyaltyEntry id="velvet-loyalty" className={s.loyalty} slug={menu.slug} name="فيلفت بوكس" logoUrl={logo} eyebrow="لأنك من أهل فيلفت" description="احمل بطاقة الولاء واجمع أختامك مع كل هدية"
      palette={{ background: "#1c1418", foreground: "#f6e6da", muted: "#cdb6a8", cardBackground: "#000000", cardForeground: "#e9bfa5", cardBack: "#b98468", actionBackground: "#e9c3ab", actionForeground: "#21171b" }}/>}

    {collections.length > 0 && <section className={s.occasions} id="velvet-occasions" aria-labelledby="velvet-occasions-title">
      <div className={s.sectionTitle}><div><p className={s.eyebrow}>لكل لحظة هديتها</p><h2 id="velvet-occasions-title">تسوّق حسب <em>المناسبة</em></h2></div><span lang="en" dir="ltr">OCCASIONS</span></div>
      <div className={s.occasionRail}>{collections.map(({ category, product }, index) => <motion.button key={category.id} className={s.occasion} onClick={() => browse(category.id)} {...reveal(index)}>
        <StorePhoto src={product.images[0].url} alt="" sizes="(max-width: 700px) 70vw, 25vw"/>
        <span className={s.occasionLabel}><small>{String(index + 1).padStart(2, "0")}</small><strong>{category.name}</strong></span>
        <span className={s.occasionArrow}><ArrowUpLeft aria-hidden="true"/></span>
      </motion.button>)}</div>
    </section>}

    <section className={s.collection} id="velvet-collection" aria-labelledby="velvet-collection-title">
      <div className={s.sectionTitle}><div><p className={s.eyebrow}>اختر هديتك</p><h2 id="velvet-collection-title">مجموعة <em>الهدايا</em></h2></div><span lang="en" dir="ltr">THE VELVET COLLECTION</span></div>
      <div className={s.toolbar}>
        <label className={s.search}><Search aria-hidden="true"/><input ref={shop.productSearch} type="search" value={shop.query} aria-label="بحث في الهدايا" placeholder="ابحث عن هدية أو مناسبة" onChange={event => { shop.setQuery(event.target.value); shop.setLimit(12); }}/></label>
        <p role="status">{shop.products.length} هدية</p>
      </div>
      {shop.categories.length > 0 && <div className={s.tabs} role="group" aria-label="تصفية الهدايا حسب المناسبة">
        {[{ id: "", name: "الكل" }, ...shop.categories].map(item => <button key={item.id} onClick={() => { shop.setCategory(item.id); shop.setLimit(12); }} aria-pressed={shop.category === item.id}>{item.name}</button>)}
      </div>}
      {shop.lastToken && <button className={s.textLink} onClick={() => shop.setTracking(shop.lastToken)}>متابعة طلبي الأخير<ArrowLeft aria-hidden="true"/></button>}
      {shop.products.length ? <div className={s.grid}>{shop.products.slice(0, shop.limit).map((product, index) => {
        const promotion = shop.activePromotions.find(item => item.kind === "products" && item.productId === product.id);
        return <motion.button key={product.id} className={s.product} onClick={() => shop.setSelected(product)} aria-label={`تفاصيل ${product.name}`} {...reveal(index % 4)}>
          <span className={s.image}><StorePhoto src={product.images[0]?.url} alt={product.images[0]?.alt || product.name} sizes="(max-width: 640px) 46vw, (max-width: 1000px) 30vw, 23vw"/>
            {!giftProductAvailable(product) && <span className={s.soldOut}>نفدت الكمية</span>}
            {promotion && <span className={s.promo}>{promotion.title}</span>}
            <span className={s.arrow}><ArrowUpLeft aria-hidden="true"/></span>
          </span>
          <span className={s.productInfo}>{product.category && <small>{product.category}</small>}<strong>{product.name}</strong>
            <span className={s.price}>{product.commerceDetails?.quoteOnly ? "حسب الطلب" : <>{product.commerceDetails?.options?.length ? <small>ابتداءً من</small> : null}<StoreMoney amount={productMinimumPrice(product)}/></>}</span>
          </span>
        </motion.button>;
      })}</div> : <div className={s.empty}><Search aria-hidden="true"/>{shop.query || shop.category ? <><p>لا توجد هدايا تطابق بحثك</p><button onClick={() => browse()}>عرض جميع الهدايا</button></> : <p>تظهر الهدايا هنا عند نشرها</p>}</div>}
      {shop.limit < shop.products.length && <button className={s.more} onClick={() => shop.setLimit(value => value + 12)}>اكتشف المزيد <span>{Math.min(shop.limit, shop.products.length)} / {shop.products.length}</span><ArrowDownLeft aria-hidden="true"/></button>}
    </section>

    {news.length > 0 && <section className={s.highlights} aria-label="عروض وإعلانات المتجر">{news.map(item => <article key={item.id}>
      {item.imageUrl && <StorePhoto src={item.imageUrl} alt="" sizes="160px"/>}<div><h2>{item.title}</h2>{item.description && <p>{item.description}</p>}
      {item.discountPercent && <p>خصم {item.discountPercent}٪</p>}{item.code && <p>رمز العرض <bdi>{item.code}</bdi></p>}{item.eventLocation && <p>{item.eventLocation}</p>}{item.eventDate && <p>{item.eventDate} {item.eventTime}</p>}
      {item.productId && <button className={s.textLink} onClick={() => shop.setSelected(menu.products.find(product => product.id === item.productId) ?? null)}>عرض الهدية<ArrowLeft aria-hidden="true"/></button>}</div>
    </article>)}</section>}

    <footer className={s.footer}>
      <div className={s.footerTop}>
        <a href="#velvet-top" className={s.footerBrand}><img src={logo} alt="" width="64" height="80"/><span><strong lang="en" dir="ltr">Velvet Box</strong><small>ورد وهدايا تحمل اسمك</small></span></a>
        <nav aria-label="روابط فيلفت بوكس">
          <a href="#velvet-collection" onClick={() => browse()}>الهدايا</a>
          {loyaltyEnabled && <a href="#velvet-loyalty">بطاقة الولاء</a>}
          {shop.lastToken && <button onClick={() => shop.setTracking(shop.lastToken)}>متابعة طلبي</button>}
          {menu.contacts.instagramUrl && <a href={menu.contacts.instagramUrl} target="_blank" rel="noreferrer">إنستغرام<ArrowUpLeft aria-hidden="true"/></a>}
          {menu.contacts.location && <a href={menu.contacts.location.googleUrl} target="_blank" rel="noreferrer">موقع المتجر<MapPin aria-hidden="true"/></a>}
          <Link href="/">بواسطة برندة</Link>
        </nav>
      </div>
      <span className={s.footerWord} lang="en" dir="ltr" aria-hidden="true">Velvet Box</span>
    </footer>

    {shop.count > 0 && !shop.cartOpen && !shop.selected && !shop.tracking && <button className={s.floatingCart} onClick={() => shop.setCartOpen(true)}><ShoppingBag aria-hidden="true"/><span>سلة هداياك</span><strong>{shop.count}</strong><ArrowUpLeft aria-hidden="true"/></button>}
    <div role="status" className={shop.notice ? s.toast : s.toastIdle}>{shop.notice && <><Check aria-hidden="true"/><span>{shop.notice}</span></>}</div>
    {shop.selected && <GiftProductDialog key={shop.selected.id} slug={menu.slug} product={shop.selected} close={() => shop.setSelected(null)} add={shop.add} orderingEnabled={shop.ordering}/>}
    {shop.cartOpen && <MeramCart slug={menu.slug} products={menu.products} lines={shop.lines} setLines={shop.setLines} settings={settings} close={() => shop.setCartOpen(false)} onReceipt={shop.received}/>}
    {shop.tracking && <MeramTracking key={shop.tracking} slug={menu.slug} token={shop.tracking} receipt={shop.receipt?.trackingToken === shop.tracking ? shop.receipt : null} close={() => shop.setTracking("")}/>}
  </main></StoreRetailContext.Provider>;
}
