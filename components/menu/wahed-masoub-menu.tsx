"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowDown, ArrowUpLeft, Search, Share2, Utensils, X } from "lucide-react";
import { matchesMenuSearch, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { getProductOffers, getPublishedOfferPromo } from "@/lib/offers/published-offers";
import { productFinalPrice } from "@/lib/mock/menu";
import { WAHED_MASOUB_LOGO } from "@/lib/menu/wahed-masoub";
import { ProductDetails } from "./bistro-menu";
import { MenuServices } from "./menu-services";
import { BrandLoyaltyEntry } from "./brand-loyalty-entry";
import base from "./bistro-menu.module.css";
import s from "./wahed-masoub-menu.module.css";

function Logo({ src, large = false }: { src: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <Image src={failed ? WAHED_MASOUB_LOGO : src} alt="واحد معصوب" width={large ? 380 : 72} height={large ? 350 : 66} unoptimized loading="eager" onError={() => setFailed(true)} />;
}

function ProductPhoto({ product }: { product: StandaloneMenuProduct }) {
  const [failed, setFailed] = useState<string[]>([]);
  const image = product.images.find(image => !failed.includes(image.url));
  return <span className={s.photo}>{image ? <Image src={image.url} alt={image.alt || product.name} width={500} height={400} unoptimized loading="lazy" onError={() => setFailed(previous => [...previous, image.url])} /> : <span className={s.photoPlaceholder} aria-hidden="true"><Utensils strokeWidth={1.2} size={42} /><span>واحد معصوب</span></span>}</span>;
}

function Price({ product }: { product: StandaloneMenuProduct }) {
  if (product.priceMode === "cashier") return <span className={s.price}>السعر لدى الكاشير</span>;
  const values = product.priceRange ? [product.priceRange.min, product.priceRange.max] : product.priceOptions?.length ? product.priceOptions : [product.price];
  const format = (price: number) => price.toLocaleString("ar-SA", { maximumFractionDigits: 2 });
  return <span className={s.price}><bdi>{values.map(value => format(productFinalPrice(value, product.promo))).join(product.priceRange ? " – " : " / ")}</bdi><small>ريال</small>{values.some(value => productFinalPrice(value, product.promo) < value) && <del><bdi>{values.map(format).join(" / ")}</bdi></del>}</span>;
}

export function WahedMasoubMenu({ menu, loyalty }: { menu: StandaloneMenu; loyalty: { purchasesRequired: number; rewardName: string } | null }) {
  const [category, setCategory] = useState("all"), [query, setQuery] = useState(""), [selectedId, setSelectedId] = useState<string | null>(null), [message, setMessage] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const [asOf, setAsOf] = useState(menu.highlights?.asOf ?? 0);
  useEffect(() => { const timer = window.setInterval(() => setAsOf(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const products = menu.products.filter(product => product.available).map(product => ({ ...product, promo: getPublishedOfferPromo(product, menu.highlights, asOf), offers: getProductOffers(product, menu.highlights, asOf) }));
  const visible = products.filter(product => (category === "all" || product.categoryId === category) && matchesMenuSearch(product, query));
  const selected = products.find(product => product.id === selectedId);
  const logo = menu.logoUrl || WAHED_MASOUB_LOGO;
  function browse(direction: number) { const position = visible.findIndex(product => product.id === selectedId); setSelectedId(visible[(position + direction + visible.length) % visible.length]?.id ?? null); }
  async function share() {
    const url = new URL(`/menu/${menu.slug}`, window.location.origin);
    if (menu.branch) url.searchParams.set("branch", menu.branch.slug);
    try { if (navigator.share) await navigator.share({ title: menu.name, url: url.href }); else { await navigator.clipboard.writeText(url.href); setMessage("تم نسخ رابط المنيو"); } }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setMessage("يمكنك مشاركة رابط المنيو من شريط العنوان"); }
  }
  return <main className={`${base.menu} ${s.menu}`} dir="rtl">
    <a className={s.skip} href="#wahed-catalog">انتقل إلى الأصناف</a>
    <header className={s.header}><a href="#wahed-top" className={s.identity} aria-label="واحد معصوب بداية المنيو"><span className={s.logo}><Logo src={logo} /></span><span>واحد معصوب<small lang="en" dir="ltr">WAHED MASOUB</small></span></a><nav className={s.actions} aria-label="خدمات المنيو"><MenuServices menu={menu} compact /><button type="button" onClick={share} aria-label="مشاركة المنيو"><Share2 size={19} aria-hidden="true" /></button></nav></header>
    <section id="wahed-top" className={s.hero} aria-labelledby="wahed-title"><div className={s.heroCopy}><span className={s.eyebrow}><span aria-hidden="true">١</span> واحد معصوب {menu.branch && <span className={s.branch}>{menu.branch.name}</span>}</span><h1 id="wahed-title">على مزاجك<br /><span>واحد معصوب</span></h1><p>{menu.description || "للمعصوب مكانه ولذوقك اختياره"}</p><a href="#wahed-catalog" className={s.browse}>شوف المنيو<ArrowDown size={19} aria-hidden="true" /></a></div><div className={s.brandArt}><span className={s.giantOne} aria-hidden="true">1</span><div className={s.logoDisc}><Logo src={logo} large /></div><span className={s.seal}>واحد<br /><strong>على ذوقك</strong></span><span className={s.artCaption} lang="en" dir="ltr">ONE NAME. YOUR CHOICE.</span></div></section>
    <div className={s.ribbon} aria-hidden="true"><span>واحد معصوب</span><span>✳</span><span>على مزاجك</span><span>✳</span><span>واحد معصوب</span><span>✳</span><span>على مزاجك</span></div>
    <section id="wahed-catalog" className={s.catalog} aria-labelledby="wahed-catalog-title"><div className={s.catalogHeading}><div><span className={s.kicker}>المنيو</span><h2 id="wahed-catalog-title">وش خاطرك فيه؟</h2></div><span className={s.sectionNumber} aria-hidden="true">01 / MENU</span></div>
      {products.length > 0 ? <><div className={s.tools}><nav className={s.categories} aria-label="أقسام المنيو"><button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>كل الأصناف</button>{menu.categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}</nav><label className={s.search}><Search size={19} aria-hidden="true" /><span className={s.srOnly}>ابحث عن صنف</span><input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن اللي في خاطرك" />{query && <button type="button" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="مسح البحث"><X size={17} aria-hidden="true" /></button>}</label></div><p className={s.results} role="status">{visible.length.toLocaleString("ar-SA")} صنف</p><ul className={s.grid}>{visible.map(product => <li key={product.id}><button type="button" className={s.product} aria-haspopup="dialog" onClick={() => setSelectedId(product.id)}><ProductPhoto product={product} /><span className={s.productBody}><span className={s.productCategory}>{product.category}</span><strong>{product.name}</strong>{product.description && <span className={s.description}>{product.description}</span>}<span className={s.productBottom}><Price product={product} /><span className={s.productArrow}><ArrowUpLeft size={20} aria-hidden="true" /></span></span></span></button></li>)}</ul>{!visible.length && <div className={s.noResults}><h3>ما لقينا صنف مطابق</h3><button type="button" onClick={() => { setCategory("all"); setQuery(""); }}>عرض كل الأصناف</button></div>}</> : <div className={s.comingSoon}><span className={s.emptyIcon}><Utensils size={36} strokeWidth={1.3} aria-hidden="true" /></span><div><span className={s.kicker}>قريبًا على ذوقك</span><h3>المنيو قيد التجهيز</h3><p>هنا بتلقى الأصناف والأسعار والتفاصيل أول ما تكون جاهزة</p></div><span className={s.emptyMark} aria-hidden="true">١</span></div>}
    </section>
    {menu.loyaltyEnabled && loyalty && <BrandLoyaltyEntry id="wahed-loyalty" className={s.loyalty} slug={menu.slug} name={menu.name} logoUrl={logo} eyebrow="كل زيارة لها طعم" description={`اجمع ${loyalty.purchasesRequired} أختام واحصل على ${loyalty.rewardName}`} palette={{ background: "#103e3d", foreground: "#ffffff", muted: "#c5eeec", cardBackground: "#40ceca", cardForeground: "#103e3d", cardBack: "#d9f5f3", actionBackground: "#40ceca", actionForeground: "#103e3d" }} />}
    <footer className={s.footer}><div className={s.footerBrand}><span className={s.logo}><Logo src={logo} /></span><div><strong>واحد معصوب</strong><span>لذوقك اختيار</span></div></div><a href="#wahed-top">ارجع للأعلى<ArrowUpLeft size={17} aria-hidden="true" /></a><Link href="/">بواسطة برندة</Link></footer>
    {message && <div className={s.toast} role="status">{message}<button type="button" onClick={() => setMessage("")} aria-label="إغلاق الإشعار"><X size={18} /></button></div>}
    <AnimatePresence>{selected && <ProductDetails key={selected.id} product={selected} products={products} close={() => setSelectedId(null)} browse={browse} position={visible.findIndex(product => product.id === selected.id)} total={visible.length} brandSlug={menu.slug} brandCaption="واحد معصوب" hideEmptyMedia />}</AnimatePresence>
  </main>;
}
