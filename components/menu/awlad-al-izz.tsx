"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowDownLeft, ArrowUpLeft, Coffee, Search, Sparkles, X } from "lucide-react";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { matchesMenuSearch } from "@/lib/menu/standalone-menu";
import { AWLAD_ASSETS, awladSectionMenu } from "@/lib/menu/awlad-al-izz";
import { AWLAD_CATEGORY_IDS } from "@/lib/menu/awlad-al-izz-catalog";
import { currencyByCode, formatAccountAmount } from "@/lib/currency/account-currency";
import { AwladBrandFooter } from "./awlad-brand";
import { BrandLoyaltyEntry } from "./brand-loyalty-entry";
import s from "./awlad-al-izz.module.css";

const categoryArt: Record<string, { image: string; english: string; phrase: string }> = {
  [AWLAD_CATEGORY_IDS.hot]: { image: "coffee.webp", english: "SOMETHING WARM", phrase: "على مهل وعلى مزاجك" },
  [AWLAD_CATEGORY_IDS.cold]: { image: "cold-drinks.webp", english: "A FRESH MOMENT", phrase: "انتعاش يكمّل الجلسة" },
  [AWLAD_CATEGORY_IDS.bakery]: { image: "bakery.webp", english: "THE LITTLE EXTRAS", phrase: "شيء خفيف مع قهوتك" },
};

export function AwladAlIzz({ menu, view = "cafe", showLoyalty = false }: { menu: StandaloneMenu; view?: "cafe" | "laser"; showLoyalty?: boolean }) {
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StandaloneMenuProduct | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const laser = view === "laser";
  const catalog = awladSectionMenu(menu, view);
  const loyaltyFirst = laser && catalog.products.length === 0 && showLoyalty;
  const products = catalog.products.filter(product => (!category || product.categoryId === category) && matchesMenuSearch(product, query));
  const currency = currencyByCode(menu.currencyCode ?? "IQD");
  const price = (amount: number) => formatAccountAmount(amount, currency.currencyCode, "ar-IQ");

  useEffect(() => {
    const element = dialog.current;
    if (!element || !selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = previousOverflow; };
  }, [selected]);

  function row(item: StandaloneMenuProduct) {
    const photo = item.images[0];
    // Product WebPs are already thumbnail-sized. Serve the same file in the list and dialog.
    const resizePhoto = photo?.url.startsWith(AWLAD_ASSETS + "/") && !photo.url.startsWith(AWLAD_ASSETS + "/products/");
    return <button key={item.id} className={s.menuRow} type="button" onClick={() => setSelected(item)} aria-label={`تفاصيل ${item.name}`}>
      {photo && <Image className={s.productThumb} src={photo.url}
        width={96} height={96} sizes="(max-width: 760px) 68px, 84px" alt="" loading="lazy"
        unoptimized={!resizePhoto} />}
      <span className={s.itemCopy}><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}</span>
      <span className={s.price}><bdi>{price(item.price)}</bdi><small>{currency.currencyLabel}</small></span>
      <ArrowUpLeft className={s.rowArrow} aria-hidden="true" />
    </button>;
  }

  return <main className={s.page} dir="rtl" id="awlad-top" data-awlad-view={view}>
    <a className={s.skip} href="#awlad-content">انتقل إلى المحتوى</a>
    <section className={s.cafeHero} aria-labelledby="awlad-hero-title">
        <div className={s.heroPhoto}><Image src={`${AWLAD_ASSETS}/${laser ? "laser-care" : "coffee"}.webp`}
          alt={laser ? "جهاز العناية بالليزر مع نظارات الحماية" : "قهوة تركية في ضيافة أولاد العز"}
          width={960} height={640} priority sizes="(max-width: 760px) 100vw, 76vw" /></div>
        <div className={s.heroCopy}>
          <p className={s.eyebrow}>{laser ? "أولاد العز للعناية بالرجل" : "في ضيافة أولاد العز"}</p>
          <h1 id="awlad-hero-title">{laser ? "عناية الليزر" : "للمزاج"}<br /><em>{laser ? "للرجل" : "أولاد العز"}</em></h1>
          {!laser && <p className={s.heroDescription}>فنجان على ذوقك<br />ولحظة تستاهل تأخذ وقتك فيها</p>}
          {(!laser || catalog.products.length > 0 || loyaltyFirst) && <a className={s.heroAction} href={loyaltyFirst ? "#awlad-loyalty" : "#awlad-content"}><span>{loyaltyFirst ? "بطاقة الولاء" : laser ? "اكتشف الخدمات" : "اكتشف المنيو"}</span><ArrowDownLeft aria-hidden="true" /></a>}
        </div>
        <Image className={s.heroLogo} src={`${AWLAD_ASSETS}/logo.jpeg`} alt="شعار أولاد العز" width={112} height={112} sizes="(max-width: 760px) 88px, 112px" />
      </section>
      {showLoyalty && <BrandLoyaltyEntry id="awlad-loyalty" slug={menu.slug} name={menu.name} logoUrl={`${AWLAD_ASSETS}/logo.jpeg`}
        eyebrow="ولاء أولاد العز" palette={{ background: "var(--aw-deep)", foreground: "#fff", muted: "#e0e3ff",
          cardBackground: "#fff", cardForeground: "var(--aw-blue)", cardBack: "#9694ef", actionBackground: "#fff", actionForeground: "var(--aw-deep)" }} />}

    <section id="awlad-content" className={s.catalog} aria-labelledby="awlad-menu-title">
      <div className={s.catalogHeading}><h2 id="awlad-menu-title">{view === "cafe" ? "منيو الضيافة" : "خدمات الليزر"}</h2>{catalog.products.length > 0 && <p>الأسعار بعملة {currency.currencyName}</p>}</div>
      {catalog.products.length > 0 && <div className={s.menuTools}><div className={s.filters} aria-label={view === "cafe" ? "تصنيفات المنيو" : "تصنيفات الخدمات"}><button type="button" aria-pressed={!category} onClick={() => setCategory("")}>الكل</button>{catalog.categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}</div><label className={s.search}><Search aria-hidden="true" /><span className={s.srOnly}>ابحث في القائمة</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={laser ? "ابحث عن خدمة" : "وش على مزاجك؟"} type="search" />{query && <button type="button" onClick={() => setQuery("")} aria-label="مسح البحث"><X aria-hidden="true" /></button>}</label></div>}
      {products.length ? <div className={s.menuGroups}>{catalog.categories.filter(item => !category || category === item.id).map(group => {
        const items = products.filter(product => product.categoryId === group.id);
        if (!items.length) return null;
        const art = categoryArt[group.id];
        return <section key={group.id} className={s.menuGroup} aria-labelledby={`category-${group.id}`}>
          {laser ? <h3 id={`category-${group.id}`} className={s.serviceHeading}>{group.name}</h3> : <div className={s.groupStory}>{art && <div className={s.groupPhoto}><Image src={`${AWLAD_ASSETS}/${art.image}`} width={960} height={640} alt="" sizes="(max-width: 760px) 100vw, 36vw" /></div>}<div className={s.groupCaption}><span dir="ltr">{art?.english ?? "AWLAD AL IZZ"}</span><h3 id={`category-${group.id}`}>{group.name}</h3>{(art?.phrase || group.description) && <p>{art?.phrase || group.description}</p>}</div></div>}
          <div className={s.menuRows}>{items.map(row)}</div>
        </section>;
      })}{products.filter(product => !catalog.categories.some(item => item.id === product.categoryId)).map(row)}</div> : laser && !catalog.products.length ? <p className={s.emptyLaser}>لم تُضف خدمات لهذا القسم بعد</p> : <div className={s.noResults} role="status">{laser ? <Sparkles aria-hidden="true" /> : <Coffee aria-hidden="true" />}<h3>{query || category ? "ما لقينا أصنافًا مطابقة" : "قائمتنا تتجهز لك"}</h3>{(query || category) && <button type="button" className={s.outlineButton} onClick={() => { setQuery(""); setCategory(""); }}>{laser ? "عرض كل الخدمات" : "عرض كل الأصناف"}</button>}</div>}
    </section>
    <AwladBrandFooter name={menu.name} contacts={menu.contacts} section={view} />
    <dialog ref={dialog} className={s.productDialog} aria-labelledby="awlad-product-title" onCancel={() => setSelected(null)} onClose={() => setSelected(null)}>
      <button className={s.dialogClose} type="button" onClick={() => setSelected(null)} aria-label={laser ? "إغلاق تفاصيل الخدمة" : "إغلاق تفاصيل الصنف"}><X aria-hidden="true" /></button>
      {selected && <>{selected.images[0] && <Image className={s.dialogPhoto} src={selected.images[0].url} alt={selected.images[0].alt || selected.name} width={960} height={640} sizes="(max-width: 600px) 100vw, 540px" unoptimized />}<div className={s.dialogBody}><p className={s.eyebrow}>{laser ? "خدمات الليزر" : "من اختيارات أولاد العز"}</p><h2 id="awlad-product-title">{selected.name}</h2>{selected.description && <p>{selected.description}</p>}<span className={s.price}><bdi>{price(selected.price)}</bdi><small>{currency.currencyLabel}</small></span></div></>}
    </dialog>
  </main>;
}
