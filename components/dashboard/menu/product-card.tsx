"use client";

import {
  Coffee,
  Flame,
  Gift,
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
} from "lucide-react";
import type { CSSProperties } from "react";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { formatSar } from "@/lib/format";
import {
  isPromoActive,
  promoBadgeText,
  productFinalPrice,
  type MenuImageVariant,
  type MenuProduct,
} from "@/lib/mock/menu";
import { getBusinessCopy } from "@/lib/platform/business-copy";
import styles from "@/components/dashboard/menu/menu-dashboard.module.css";

const variantGradient: Record<MenuImageVariant, string> = {
  latte: "from-[#3b2416] via-[#5c3d2e] to-[#c78a45]",
  cold: "from-[#1e3a4a] via-[#496b4a] to-[#7eb8b8]",
  cake: "from-[#4a2c3d] via-[#8b5a6b] to-[#d4a59a]",
  bakery: "from-[#5c4a3a] via-[#8b7355] to-[#e8dcc8]",
  tea: "from-[#3d4f3f] via-[#496b4a] to-[#a8c4a9]",
};

type Props = {
  product: MenuProduct;
  index?: number;
  categoryLabel?: string;
  freeProductLabel?: string;
  onEdit: () => void;
  onToggleAvailability: () => void;
  onDelete: () => void;
  businessCategory?: string;
};

export function MenuProductCard({
  product,
  index = 0,
  categoryLabel,
  freeProductLabel,
  onEdit,
  onToggleAvailability,
  onDelete,
  businessCategory,
}: Props) {
  const copy = getBusinessCopy(businessCategory);
  const isEvents = copy.kind === "events";
  const promoOn = product.promo != null && isPromoActive(product.promo);
  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscountedPrice = promoOn && finalPrice < product.price;

  return (
    <article
      className={styles.productCard}
      style={{ "--card-order": index % 8 } as CSSProperties}
    >
      <div className={styles.media}>
        <ProductMediaDisplay
          product={product}
          alt=""
          className={styles.mediaAsset}
          fallback={
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${variantGradient[product.imageVariant]}`}
            >
              <Coffee className={styles.fallbackIcon} />
            </div>
          }
        />

        <div className={styles.mediaOverlay} />

        {product.promo ? (
          <span className={styles.badge}>
            <Gift className="h-3.5 w-3.5 text-[#8B5E3C]" />
            <span className="truncate">
              {promoOn ? promoBadgeText(product.promo) : "عرض غير نشط"}
            </span>
          </span>
        ) : null}

        <span
          className={`${styles.availability} ${
            product.available
              ? styles.availabilityOn
              : ""
          }`}
        >
          {product.available ? "متاح" : "غير متاح"}
        </span>
      </div>

      <div className={styles.productBody}>
        <div className={styles.cardHeading}>
          <div className="min-w-0">
            <p className={styles.categoryLabel}>
              {categoryLabel ?? product.category}
            </p>

            <h3 className={styles.productName}>
              {product.name}
            </h3>
          </div>

          <span className={styles.moreIcon}>
            <MoreHorizontal className="h-5 w-5" />
          </span>
        </div>

        <p className={styles.description}>
          {product.description}
        </p>

        <div className={styles.ingredientList}>
          {product.ingredients.slice(0, 4).map((ing) => (
            <span
              key={ing}
              className={styles.ingredient}
            >
              {ing}
            </span>
          ))}
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <p className={styles.statLabel}>
              {isEvents ? "رسوم الدخول" : "السعر"}
            </p>
            <p className={styles.statValue}>
              {hasDiscountedPrice ? formatSar(finalPrice) : formatSar(product.price)}
            </p>
            {hasDiscountedPrice ? (
              <p className="text-[10px] font-black text-[#9B8B7B] line-through">
                {formatSar(product.price)}
              </p>
            ) : null}
          </div>

          <div className={styles.stat}>
            <p className={styles.statLabel}>
              <Flame className="h-3 w-3 text-[#8B5E3C]" />
              {isEvents ? "السعة" : "سعرات"}
            </p>

            <p className={styles.statValue}>
              {isEvents
                ? product.eventTicketSettings?.capacity == null
                  ? "غير محدد"
                  : product.eventTicketSettings.capacity.toLocaleString("ar-SA")
                : product.calories === undefined
                  ? "غير محدد"
                  : product.calories.toLocaleString("ar-SA")}
            </p>
          </div>

          <div className={styles.stat}>
            <p className={styles.statLabel}>
              {isEvents ? "الدخول" : "الاستلام"}
            </p>
            <p className={`${styles.statValue} ${styles.statAccent}`}>
              {isEvents
                ? product.eventTicketSettings?.checkinPolicy === "multi_use"
                  ? "متعدد"
                  : "مرة"
                : product.availableForPickup === false ? "لا" : "متاح"}
            </p>
          </div>
        </div>

        {product.promo ? (
          <p className={styles.notice}>
            فترة العرض {product.promo.startDate} إلى {product.promo.endDate}
          </p>
        ) : null}

        {product.promo?.kind === "منتج مجاني مع الطلب" && freeProductLabel ? (
          <p className={styles.freeNotice}>
            يشمل: <span className="font-black">{freeProductLabel}</span>
          </p>
        ) : null}

        <div className={styles.cardActions}>
          <button
            type="button"
            onClick={onEdit}
            className={`${styles.cardButton} ${styles.editButton}`}
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </button>

          <button
            type="button"
            onClick={onToggleAvailability}
            className={`${styles.cardButton} ${styles.toggleButton}`}
          >
            <Power className="h-4 w-4" />
            {product.available ? "إيقاف" : "تفعيل"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            className={`${styles.cardButton} ${styles.deleteButton}`}
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </button>
        </div>
      </div>
    </article>
  );
}
