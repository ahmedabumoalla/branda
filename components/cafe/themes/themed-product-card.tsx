"use client";

import Link from "next/link";
import { Clock, Coffee, Gift, ShoppingBag, Sparkles } from "lucide-react";
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
};

export function getCollectionGridClass(_collection?: unknown) {
  return "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4";
}

export function ThemedProductCard({ product, experience, href }: Props) {
  const { theme } = experience;
  const promoOn = product.promo ? isPromoActive(product.promo) : false;
  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscount = promoOn && finalPrice < product.price;
  const category = resolveProductCategoryLabel(product);

  return (
    <Link
      href={href}
      className={`${theme.card} ${theme.cardHover} barndaksa-premium-card barndaksa-product-motion group flex h-full min-h-[430px] flex-col overflow-hidden rounded-[30px] border border-black/5 transition active:scale-[0.985]`}
    >
      <div className="relative aspect-[1.05/1] overflow-hidden bg-[var(--ci-page-bg,var(--barndaksa-cream-base))]">
        <ProductMediaDisplay
          product={product}
          alt={product.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--ci-primary-bg,var(--barndaksa-coffee-brown))] to-[var(--ci-secondary-bg,var(--barndaksa-brand-brown))]">
              <Coffee className="h-12 w-12 text-white/85" />
            </div>
          }
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/42 to-transparent" />

        {product.promo ? (
          <span className={`absolute right-3 top-3 inline-flex max-w-[85%] items-center gap-1 rounded-full px-3 py-1 text-xs font-black shadow-lg backdrop-blur ${theme.badge}`}>
            <Gift className="h-3.5 w-3.5" />
            <span className="truncate">{promoOn ? promoBadgeText(product.promo) : "عرض غير نشط"}</span>
          </span>
        ) : null}

        <span className="absolute bottom-3 right-3 inline-flex max-w-[78%] items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]" />
          <span className="truncate">{category}</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-[11px] font-black ${theme.accent}`}>{category}</p>
            <h3 className="mt-1 line-clamp-2 text-xl font-black leading-snug">{product.name}</h3>
          </div>
          {product.preparationTimeMinutes ? (
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-2xl px-2.5 py-1.5 text-[11px] font-black ${theme.badge}`}>
              <Clock className="h-3.5 w-3.5" />
              {product.preparationTimeMinutes} د
            </span>
          ) : null}
        </div>

        {product.description ? (
          <p className={`mt-3 line-clamp-3 text-sm font-bold leading-7 ${theme.muted}`}>
            {product.description}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {product.ingredients?.slice(0, 4).map((ingredient) => (
            <span key={ingredient} className={`rounded-full px-3 py-1 text-[11px] font-black ${theme.badge}`}>
              {ingredient}
            </span>
          ))}
        </div>

        {product.promo ? (
          <p className={`mt-4 rounded-2xl border border-black/5 px-3 py-2 text-xs font-bold ${theme.badge}`}>
            {promoBadgeText(product.promo)}
            <span className="block opacity-70">
              من {product.promo.startDate} إلى {product.promo.endDate}
            </span>
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className={`text-xs font-black ${theme.muted}`}>السعر شامل الضريبة</p>
            <p className="text-2xl font-black leading-tight">
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
          <span className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-black shadow-sm ${theme.button}`}>
            <ShoppingBag className="h-4 w-4" />
            التفاصيل
          </span>
        </div>
      </div>
    </Link>
  );
}
