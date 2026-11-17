"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImageIcon, Search } from "lucide-react";
import type { MenuBranch } from "@/lib/data/menu-branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import { setMenuBranchSourceAction } from "@/app/actions/menu-branches";
import styles from "./branch-menus-page.module.css";

function ProductImage({ product }: { product: MenuProduct }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = product.imageDataUrl?.trim() ?? "";
  const safe = /^(https?:\/\/|\/[^/]|data:image\/(png|jpeg|webp|gif);base64,)/i.test(source);
  return <div className={styles.productImage}>{source && safe && failedSource !== source
    // Existing product URLs can be stored outside the image optimizer's configured hosts
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={source} alt="" loading="lazy" onError={() => setFailedSource(source)} />
    : <ImageIcon size={38} aria-hidden="true" />}</div>;
}
function priceLabel(product: MenuProduct) {
  if (product.priceMode === "cashier") return "يحدد السعر لدى الكاشير";
  const options = product.priceOptions?.filter(value => Number.isFinite(value) && value >= 0) ?? [];
  const format = (value: number) => new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(value);
  if (options.length > 1 && Math.min(...options) !== Math.max(...options)) return `${format(Math.min(...options))} – ${format(Math.max(...options))} ر س`;
  return `${format(options[0] ?? product.price)} ر س`;
}

export function BranchInheritedMenu({ branch, products, categories, mainMenuHref }: { branch: MenuBranch; products: MenuProduct[]; categories: MenuCategoryRecord[]; mainMenuHref: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  const filtered = products.filter(product => `${product.name} ${product.category}`.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar")));
  async function useIndependentMenu() {
    if (pending.current || branch.brandMenuRoot) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await setMenuBranchSourceAction({ id: branch.id, expectedUpdatedAt: branch.updatedAt, usesBrandMenu: false });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) && cause.message.length < 240 ? cause.message : "تعذر تفعيل منيو الفرع المستقل أعد المحاولة");
      pending.current = false; setBusy(false);
    }
  }
  return <div className={styles.page} dir="rtl"><div><Link href="/dashboard/branches" className={styles.textButton}><ArrowRight size={17} aria-hidden="true" />العودة إلى الفروع</Link></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <section className={styles.inherited}><h2>منيو {branch.name}</h2><p>هذا الفرع يعتمد المنيو الأساسي للعلامة الأصناف والصور والأسعار تتحدث تلقائيًا عند تعديل المنيو الأساسي</p><p>يمكنك استعادة منيو مستقل لهذا الفرع مع الاحتفاظ بأصنافه الخاصة السابقة</p><div className={styles.actions}><Link href={mainMenuHref} className={styles.primary}>إدارة المنيو الأساسي للعلامة</Link><button type="button" className={styles.secondary} onClick={useIndependentMenu} disabled={busy || branch.brandMenuRoot}>{busy ? "جارٍ فتح منيو الفرع" : "استعادة منيو الفرع المستقل"}</button></div></section>
    <div className={styles.toolbar}><div><h2>الأصناف المعتمدة للفرع</h2><p>{products.length} صنف · {categories.length} قسم</p></div><label className={`${styles.field} ${styles.search}`} htmlFor="branch-menu-search"><span><Search size={15} aria-hidden="true" /> البحث في المنيو</span><input id="branch-menu-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم الصنف أو القسم" /></label></div>
    {filtered.length ? <div className={styles.products}>{filtered.map(product => <article key={product.id} className={styles.product}><ProductImage product={product} /><div className={styles.productBody}><h3>{product.name}</h3><p>{product.category}</p><strong>{priceLabel(product)}</strong><p>{product.available ? "متاح للعملاء" : "غير متاح حاليًا"}</p></div></article>)}</div> : <section className={styles.empty}><ImageIcon size={34} aria-hidden="true" /><h2>{products.length ? "لا توجد أصناف تطابق البحث" : "لا توجد أصناف في المنيو الأساسي بعد"}</h2><p>{products.length ? "جرّب اسم صنف أو قسم آخر" : "أضف الأصناف من إدارة المنيو الأساسي لتظهر في هذا الفرع"}</p></section>}
  </div>;
}
