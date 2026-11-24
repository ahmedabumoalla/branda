"use client";

import Image from "next/image";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { matchesMenuSearch, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import s from "./awj.module.css";

const numbers = new Intl.NumberFormat("ar-SY", { maximumFractionDigits: 2 });

function Prices({ product }: { product: StandaloneMenuProduct }) {
  const choices = Array.from(new Set([product.price, ...(product.priceOptions || [])])).sort((a, b) => a - b);
  return <div className={s.prices}>{choices.map((price, i) =>
    <span key={price}>{choices.length === 2 && <small>{i === 0 ? "صغير" : "كبير"}</small>}<strong>{numbers.format(price)}</strong></span>
  )}</div>;
}

export function AwjCatalog({ menu }: { menu: StandaloneMenu }) {
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const groups = [...menu.categories];
  if (menu.products.some(p => !p.categoryId)) groups.push({ id: "other", name: "أصناف أخرى", description: null });
  const products = menu.products.filter(p => (!category || (p.categoryId || "other") === category) && matchesMenuSearch(p, query));
  return <section className={s.catalog} id="awj-menu" aria-labelledby="awj-heading">
    <div className={s.menuHead}><div><h2 id="awj-heading">منيو أوج</h2><p>الأسعار {menu.currencyCode === "SYP" ? "بالليرة السورية" : menu.currencyLabel || menu.currencyCode}</p></div>
      <label className={s.search}><Search size={18} aria-hidden /><input value={query} onChange={e => setQuery(e.target.value)} type="search" placeholder="ابحث عن مشروب أو صنف" aria-label="ابحث في منيو أوج" /></label>
    </div>
    {groups.length > 0 && <div className={s.filters} role="group" aria-label="أقسام المنيو">
      {[{ id: "", name: "الكل" }, ...groups].map(g => <button type="button" key={g.id} aria-pressed={category === g.id} onClick={() => setCategory(g.id)}>{g.name}</button>)}
    </div>}
    {groups.map(g => {
      const rows = products.filter(p => (p.categoryId || "other") === g.id);
      if (!rows.length) return null;
      return <section key={g.id} className={s.group}>
        <div className={s.groupHead}><h3>{g.name}</h3>{g.description && <span dir="auto">{g.description}</span>}</div>
        <div className={s.grid}>{rows.map(p => <article className={s.product} key={p.id}>
          {p.images[0] && <div className={s.photo}><Image src={p.images[0].url} alt={p.images[0].alt || p.name} fill unoptimized sizes="(max-width: 550px) 46vw, 240px" /></div>}
          <div className={s.info}><h4 dir="auto">{p.name}</h4>{p.description && <p dir="auto">{p.description}</p>}<Prices product={p} /></div>
        </article>)}</div>
      </section>;
    })}
    {!products.length && <div className={s.empty} role="status"><p>{query || category ? "ما لقينا صنف يطابق اختيارك" : "المنيو قيد التجهيز"}</p>
      {(query || category) && <button type="button" onClick={() => { setQuery(""); setCategory(""); }}><X size={16} /> عرض الكل</button>}</div>}
  </section>;
}
