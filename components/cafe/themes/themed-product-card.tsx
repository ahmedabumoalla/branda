"use client";

import Link from "next/link";
import { Coffee, Gift } from "lucide-react";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
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
  return "grid gap-5 md:grid-cols-2 xl:grid-cols-3";
}

export function ThemedProductCard({ product, experience, href }: Props) {
  const { theme } = experience;
  const promoOn = product.promo ? isPromoActive(product.promo) : false;
  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscount = promoOn && finalPrice < product.price;

  return (
    <Link href={href} className={`${theme.card} ${theme.cardHover} barndaksa-premium-card barndaksa-product-motion group block overflow-hidden transition`}>
      <div className="relative aspect-[4/3] overflow-hidden">
        <ProductMediaDisplay
          product={product}
          alt={product.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3A2117] to-[#9B6A34]">
              <Coffee className="h-12 w-12 text-white/85" />
            </div>
          }
        />

        {product.promo ? (
          <span className={`absolute right-3 top-3 inline-flex max-w-[85%] items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>
            <Gift className="h-3.5 w-3.5" />
            <span className="truncate">{promoOn ? promoBadgeText(product.promo) : "عرض غير نشط"}</span>
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <p className={`text-xs font-black ${theme.accent}`}>{product.category}</p>
        <h3 className="mt-2 text-lg font-black">{product.name}</h3>

        {product.description ? (
          <p className={`mt-2 line-clamp-3 text-sm font-bold leading-7 ${theme.muted}`}>
            {product.description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {product.ingredients?.slice(0, 4).map((ingredient) => (
            <span key={ingredient} className={`rounded-full px-3 py-1 text-[11px] font-black ${theme.badge}`}>
              {ingredient}
            </span>
          ))}
          {product.preparationTimeMinutes ? (
            <span className={`rounded-full px-3 py-1 text-[11px] font-black ${theme.badge}`}>
              {product.preparationTimeMinutes} دقيقة
            </span>
          ) : null}
        </div>

        {product.promo ? (
          <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-bold ${theme.badge}`}>
            {promoBadgeText(product.promo)}
            <span className="block opacity-70">
              من {product.promo.startDate} إلى {product.promo.endDate}
            </span>
          </p>
        ) : null}

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className={`text-xs font-black ${theme.muted}`}>السعر شامل الضريبة</p>
            <p className="text-xl font-black">
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
          <span className={`rounded-2xl px-4 py-2 text-sm font-black ${theme.button}`}>
            التفاصيل
          </span>
        </div>
      </div>
    </Link>
  );
}
