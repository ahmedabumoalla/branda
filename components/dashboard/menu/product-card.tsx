"use client";
import { Scissors, Clock3, ChevronDown, Coffee, Copy, Eye, EyeOff, Flame, Gift, Pencil, Trash2 } from "lucide-react";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { formatSar } from "@/lib/format";
import { isPromoActive, promoBadgeText, productFinalPrice, type MenuProduct } from "@/lib/mock/menu";
import { getBusinessCopy } from "@/lib/platform/business-copy";
import styles from "./menu-dashboard.module.css";

type Props = {
  product: MenuProduct; index?: number; busy?: boolean; categoryLabel?: string;
  freeProductLabel?: string; businessCategory?: string;
  onEdit: () => void; onDuplicate: () => void; onToggleAvailability: () => void; onDelete: () => void;
};
export function MenuProductCard({ product, busy = false, categoryLabel, freeProductLabel, onEdit, onDuplicate, onToggleAvailability, onDelete, businessCategory }: Props) {
  const isEvents = getBusinessCopy(businessCategory).kind === "events";
  const isSalon = businessCategory === "hair_salons";
  const promoOn = product.promo != null && isPromoActive(product.promo);
  const finalPrice = productFinalPrice(product.price, product.promo);
  const discounted = promoOn && finalPrice < product.price;
  const hasDetails = !!(product.description || product.ingredients.length || product.promo);
  return <article data-menu-product-id={product.id} aria-busy={busy} className={styles.productCard}>
    <div className={styles.productOverview}>
      <div className={styles.media}>
        <ProductMediaDisplay ownerMenu product={product} alt="" className={styles.mediaAsset}
          fallback={<div className={styles.mediaFallback}>{isSalon ? <Scissors aria-hidden="true" /> : <Coffee aria-hidden="true" />}<span>بدون صورة</span></div>} />
      </div>
      <div className={styles.productIdentity}>
        <p className={styles.categoryLabel}>{categoryLabel ?? product.category}</p>
        <h3 className={styles.productName}>{product.name}</h3>
        <span className={`${styles.availability} ${product.available ? styles.availabilityOn : ""}`}>
          {product.available ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
          {isSalon ? (product.available ? "ظاهر في صفحة الصالون" : "مخفي من صفحة الصالون") : product.available ? "ظاهر في المنيو" : "مخفي من المنيو"}
        </span>
      </div>
    </div>
    <div className={styles.priceRow}>
      <div><span className={styles.priceLabel}>{isEvents ? "رسوم الدخول" : "السعر"}</span><div className={styles.priceValues}>
        <strong className={styles.price}>{formatSar(discounted ? finalPrice : product.price)}</strong>
        {discounted && <del className={styles.originalPrice}>{formatSar(product.price)}</del>}
      </div></div>
      {isEvents ? <span className={styles.secondaryInfo}>السعة {product.eventTicketSettings?.capacity?.toLocaleString("ar-SA") ?? "غير محددة"}<br />{product.eventTicketSettings?.checkinPolicy === "multi_use" ? "دخول متعدد" : "دخول مرة واحدة"}</span>
        : isSalon ? <span className={styles.secondaryInfo}>{product.catalogKind === "service" ? "خدمة" : "منتج"}{product.catalogKind === "service" && product.preparationTimeMinutes ? <><Clock3 size={14} aria-hidden="true" />{product.preparationTimeMinutes} دقيقة</> : null}</span> : product.calories !== undefined && <span className={styles.secondaryInfo}><Flame size={14} aria-hidden="true" />{product.calories.toLocaleString("ar-SA")} سعرة</span>}
    </div>
    {promoOn && product.promo && <p className={styles.activePromo}><Gift size={14} aria-hidden="true" />{promoBadgeText(product.promo)}</p>}
    {hasDetails && <details className={styles.productDetails}>
      <summary>تفاصيل {isEvents ? "التذكرة" : "الصنف"}{product.promo && !promoOn ? " والعرض غير النشط" : ""}<ChevronDown size={14} aria-hidden="true" /></summary>
      {product.description && <p className={styles.description}>{product.description}</p>}
      {product.ingredients.length > 0 && <div className={styles.ingredientList}>{product.ingredients.map(ingredient => <span key={ingredient} className={styles.ingredient}>{ingredient}</span>)}</div>}
      {product.promo && <p className={styles.notice}>فترة العرض <bdi>{product.promo.startDate}</bdi> إلى <bdi>{product.promo.endDate}</bdi></p>}
      {product.promo?.kind === "منتج مجاني مع الطلب" && freeProductLabel && <p className={styles.freeNotice}>يشمل {freeProductLabel}</p>}
    </details>}
    <div className={styles.cardActions}>
      <button type="button" disabled={busy} onClick={onEdit} className={`${styles.cardButton} ${styles.editButton}`} aria-label={`تعديل ${product.name}`}><Pencil size={15} aria-hidden="true" />تعديل</button>
      <button type="button" disabled={busy} onClick={onToggleAvailability} className={`${styles.cardButton} ${styles.toggleButton}`} aria-label={`${product.available ? "إخفاء" : "إظهار"} ${product.name}`}>{product.available ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}{product.available ? "إخفاء" : "إظهار"}</button>
      <button type="button" disabled={busy} onClick={onDuplicate} className={styles.iconButton} aria-label={`تكرار ${product.name}`} title="تكرار الصنف"><Copy size={17} aria-hidden="true" /></button>
      <button type="button" disabled={busy} onClick={onDelete} className={`${styles.iconButton} ${styles.deleteButton}`} aria-label={`حذف ${product.name}`} title="حذف الصنف"><Trash2 size={17} aria-hidden="true" /></button>
    </div>
  </article>;
}
