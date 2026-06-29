"use client";

import Link from "next/link";
import { Clock, Coffee, Gift, ShoppingBag, Sparkles, Star } from "lucide-react";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { resolveProductCategoryLabel } from "@/lib/cafe/menu-category-utils";
import { formatSar } from "@/lib/format";
import {
  isPromoActive,
  productFinalPrice,
  promoBadgeText,
  type MenuProduct,
} from "@/lib/mock/menu";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

type Props = {
  slug?: string;
  product: MenuProduct;
  experience: ThemeExperience;
  href: string;
  showPoints?: boolean;
};

export function getCollectionGridClass(_collection?: unknown) {
  return "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4";
}

export function ThemedProductCard({ product, experience, href, showPoints = true }: Props) {
  const { theme } = experience;
  const promoOn = product.promo ? isPromoActive(product.promo) : false;
  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscount = promoOn && finalPrice < product.price;
  const category = resolveProductCategoryLabel(product);
  const earnedPoints = Math.max(1, Math.round(finalPrice / 10));

  return (
    <Link
      href={href}
      className={`${theme.card} ${theme.cardHover} barndaksa-premium-card barndaksa-product-motion group flex h-full min-h-[340px] flex-col overflow-hidden rounded-[16px] border border-black/5 transition active:scale-[0.985]`}
    >
      <div className="relative aspect-[1.12/1] overflow-hidden bg-[var(--ci-page-bg,var(--barndaksa-cream-base))]">
        <ProductMediaDisplay
          product={product}
          alt={product.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--ci-primary-bg,var(--barndaksa-coffee-brown))] to-[var(--ci-secondary-bg,var(--barndaksa-brand-brown))]">
              <Coffee className="h-10 w-10 text-white/85" />
            </div>
          }
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/42 to-transparent" />

        {product.promo ? (
          <span className={`absolute right-2.5 top-2.5 inline-flex max-w-[85%] items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black shadow-lg backdrop-blur ${theme.badge}`}>
            <Gift className="h-3.5 w-3.5" />
            <span className="truncate">{promoOn ? promoBadgeText(product.promo) : "عرض غير نشط"}</span>
          </span>
        ) : null}

        <span className="absolute bottom-2.5 right-2.5 inline-flex max-w-[70%] items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]" />
          <span className="truncate">{category}</span>
        </span>
        {showPoints ? (
        <span className="absolute bottom-2.5 left-2.5 inline-flex max-w-[70%] items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] shadow-sm backdrop-blur">
          <Star className="h-3.5 w-3.5 text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]" />
          <span className="truncate">يكسب {earnedPoints} نقطة</span>
        </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-[10px] font-black ${theme.accent}`}>{category}</p>
            <h3 className="mt-1 line-clamp-2 text-[15px] font-black leading-6 sm:text-base">{product.name}</h3>
          </div>
          {product.preparationTimeMinutes ? (
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-[10px] font-black ${theme.badge}`}>
              <Clock className="h-3.5 w-3.5" />
              {product.preparationTimeMinutes} د
            </span>
          ) : null}
        </div>

        {product.description ? (
          <p className={`mt-2 line-clamp-2 text-xs font-bold leading-6 ${theme.muted}`}>
            {product.description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {product.ingredients?.slice(0, 3).map((ingredient) => (
            <span key={ingredient} className={`rounded-full px-2.5 py-1 text-[10px] font-black ${theme.badge}`}>
              {ingredient}
            </span>
          ))}
        </div>

        {product.promo ? (
          <p className={`mt-3 rounded-xl border border-black/5 px-3 py-2 text-[11px] font-bold ${theme.badge}`}>
            {promoBadgeText(product.promo)}
            <span className="block opacity-70">
              من {product.promo.startDate} إلى {product.promo.endDate}
            </span>
          </p>
        ) : null}

        {showPoints ? (
        <p className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[10px] font-black ${theme.badge}`}>
          <Star className="h-3.5 w-3.5" />
          يكسب {earnedPoints} نقطة ولاء
        </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className={`text-[10px] font-black ${theme.muted}`}>السعر شامل الضريبة</p>
            <p className="text-xl font-black leading-tight">
              {hasDiscount ? (
                <span className="inline-flex flex-col leading-tight">
                  <span>{formatSar(finalPrice)}</span>
                  <span className="text-xs opacity-60 line-through">{formatSar(product.price)}</span>
                </span>
              ) : (
                <span>{formatSar(product.price)}</span>
              )}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black shadow-sm ${theme.button}`}>
            <ShoppingBag className="h-4 w-4" />
            التفاصيل
          </span>
        </div>
      </div>
    </Link>
  );
}
