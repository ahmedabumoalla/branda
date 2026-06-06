"use client";

import Link from "next/link";
import { useEffect, useState, type ElementType } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Flame,
  Gift,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { formatSar } from "@/lib/format";
import { CafeFooter } from "@/components/cafe/cafe-footer";
import { OfferBannerImage } from "@/components/cafe/offer-banner-image";
import { ProductImage } from "@/components/cafe/product-image";
import { resolveProductCategoryLabel, getVisibleCategoryNames } from "@/lib/cafe/menu-category-utils";
import { mockMenuProducts, type MenuProduct } from "@/lib/mock/menu";
import { defaultMenuCategories, type MenuCategoryRecord } from "@/lib/mock/menu-categories";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import type { CafeOffer } from "@/lib/mock/offers";
import type { CafeThemeId, ThemeClasses } from "@/lib/mock/cafe-theme";
import { getCafePath } from "@/lib/cafe/theme-links";

export type NavItem = {
  href: string;
  icon: ElementType;
  label: string;
};

export function buildCafeNavItems(slug: string, previewThemeId?: string | null): NavItem[] {
  return [
    { href: getCafePath(slug, "products/offers", previewThemeId), icon: Gift, label: "العروض" },
    { href: getCafePath(slug, "products/latest", previewThemeId), icon: Sparkles, label: "أحدث" },
    { href: getCafePath(slug, "products/popular", previewThemeId), icon: Flame, label: "الأكثر طلبًا" },
    { href: getCafePath(slug, "reserve", previewThemeId), icon: CalendarDays, label: "حجز" },
    { href: getCafePath(slug, "products/branches", previewThemeId), icon: MapPin, label: "الفروع" },
  ];
}

export function useBannerCarousel(offers: CafeOffer[]) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (offers.length <= 1) return;
    const t = setInterval(() => setIndex((c) => (c + 1) % offers.length), 5000);
    return () => clearInterval(t);
  }, [offers.length]);

  return { index, current: offers[index], setIndex };
}

type BannerProps = {
  slug: string;
  offers: CafeOffer[];
  theme: ThemeClasses;
  previewThemeId?: string | null;
  variant?: "wide" | "strip" | "cinematic" | "neon" | "soft" | "editorial";
};

export function ThemeBannerCarousel({
  slug,
  offers,
  theme,
  previewThemeId,
  variant = "wide",
}: BannerProps) {
  const { index, current } = useBannerCarousel(offers);
  if (!current) return null;

  const shell =
    variant === "strip"
      ? "rounded-xl overflow-hidden"
      : variant === "cinematic"
        ? "rounded-none overflow-hidden min-h-[220px] sm:min-h-[280px] lg:min-h-[320px]"
        : variant === "neon"
          ? "rounded-lg border border-[#00e676]/20 overflow-hidden"
          : variant === "editorial"
            ? "border-2 border-[#1a1a1a] overflow-hidden"
            : "rounded-[28px] overflow-hidden border";

  return (
    <section className={`mt-6 animate-branda-fade ${shell} ${theme.card}`}>
      <div
        className={
          variant === "strip"
            ? "flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
            : "grid min-h-[220px] md:grid-cols-2"
        }
      >
        <div
          className={`flex items-center justify-center p-4 ${
            variant === "strip" ? "sm:w-40 shrink-0" : "min-h-[180px]"
          }`}
        >
          <OfferBannerImage
            offer={current}
            className="max-h-[200px] w-full object-contain"
            fallbackSrc="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800&auto=format&fit=crop"
          />
        </div>
        <div className="flex flex-col justify-center p-4 md:p-6">
          <p className={`text-xs font-black ${theme.accent}`}>
            {current.promoProductCategory || current.type}
          </p>
          <h3 className="mt-1 text-xl font-black leading-snug md:text-2xl">
            {current.promoProductName || current.title}
          </h3>
          <p className={`mt-2 line-clamp-2 text-sm font-bold ${theme.muted}`}>
            {current.promoProductDescription || current.description}
          </p>
          <Link
            href={
              current.linkedProductId
                ? getCafePath(slug, `product/${current.linkedProductId}`, previewThemeId)
                : getCafePath(slug, "products/offers", previewThemeId)
            }
            className={`mt-4 inline-flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black ${theme.button}`}
          >
            {current.ctaText || "عرض التفاصيل"}
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {offers.length > 1 ? (
            <div className="mt-3 flex gap-1.5">
              {offers.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? `w-6 ${theme.badge}` : `w-1.5 opacity-40 ${theme.muted}`
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type ProductCardProps = {
  slug: string;
  product: MenuProduct;
  theme: ThemeClasses;
  previewThemeId?: string | null;
  className?: string;
  size?: "compact" | "large" | "round" | "kiosk" | "story";
};

export function ThemeProductCard({
  slug,
  product,
  theme,
  previewThemeId,
  className = "",
  size = "compact",
}: ProductCardProps) {
  const productHref = getCafePath(slug, `product/${product.id}`, previewThemeId);
  const categoryLabel = resolveProductCategoryLabel(product);
  const base = `${theme.card} ${theme.cardHover} group block overflow-hidden transition ${className}`;

  if (size === "kiosk") {
    return (
      <Link href={productHref} className={`${base} rounded-lg p-4`}>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-[#f5f5f5]">
            <ProductImage
              product={product}
              alt=""
              className="max-h-full object-contain"
              fallback={<Flame className="h-8 w-8 opacity-30" />}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black">{product.name}</h3>
            <p className={`text-2xl font-black ${theme.accent}`}>{formatSar(product.price)}</p>
          </div>
          <span className={`shrink-0 rounded-lg px-4 py-3 text-sm font-black ${theme.button}`}>
            طلب
          </span>
        </div>
      </Link>
    );
  }

  if (size === "large") {
    return (
      <Link href={productHref} className={`${base} rounded-3xl p-6`}>
        <div className="flex h-56 items-center justify-center">
          <ProductImage
            product={product}
            alt=""
            className="max-h-full object-contain transition group-hover:scale-105"
            fallback={<Flame className="h-16 w-16 opacity-20" />}
          />
        </div>
        <p className={`mt-4 text-sm ${theme.muted}`}>{categoryLabel}</p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight">{product.name}</h3>
        <p className={`mt-2 text-lg ${theme.accent}`}>{formatSar(product.price)}</p>
      </Link>
    );
  }

  if (size === "round") {
    return (
      <Link href={productHref} className={`${base} flex flex-col items-center rounded-2xl p-3 text-center`}>
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white shadow-md">
          <ProductImage
            product={product}
            alt=""
            className="h-full w-full object-cover"
            fallback={<Flame className="h-8 w-8 opacity-30" />}
          />
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-black">{product.name}</h3>
        <p className={`text-xs font-black ${theme.accent}`}>{formatSar(product.price)}</p>
      </Link>
    );
  }

  if (size === "story") {
    return (
      <Link href={productHref} className={`${base} grid gap-4 md:grid-cols-2`}>
        <div className="flex min-h-[200px] items-center justify-center p-4">
          <ProductImage
            product={product}
            alt=""
            className="max-h-[220px] object-contain"
            fallback={<Flame className="h-12 w-12 opacity-30" />}
          />
        </div>
        <div className="flex flex-col justify-center border-t border-[#e5e5e5] p-6 md:border-t-0 md:border-r">
          <p className={`text-xs font-black uppercase tracking-widest ${theme.accent}`}>
            {categoryLabel}
          </p>
          <h3 className="mt-2 text-3xl font-black leading-tight">{product.name}</h3>
          <p className={`mt-3 text-sm ${theme.muted}`}>
            {product.ingredients.slice(0, 4).join(" · ") || "منتج مختار بعناية"}
          </p>
          <p className="mt-4 text-xl font-black">{formatSar(product.price)}</p>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className={`${base} rounded-2xl p-4`}>
      <div className="flex h-36 items-center justify-center">
        <ProductImage
          product={product}
          alt=""
          className="max-h-full object-contain transition group-hover:scale-[1.03]"
          fallback={<Flame className="h-10 w-10 opacity-30" />}
        />
      </div>
      <p className={`mt-2 text-xs font-black ${theme.accent}`}>{categoryLabel}</p>
      <h3 className="line-clamp-1 font-black">{product.name}</h3>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-black">{formatSar(product.price)}</span>
        <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${theme.badge}`}>
          التفاصيل
        </span>
      </div>
    </Link>
  );
}

export function ThemeCategoryStrip({
  slug,
  theme,
  previewThemeId,
  className = "",
  variant = "chips",
  categories = defaultMenuCategories,
}: {
  slug: string;
  theme: ThemeClasses;
  previewThemeId?: string | null;
  className?: string;
  variant?: "chips" | "cards";
  categories?: MenuCategoryRecord[];
}) {
  const [names, setNames] = useState<string[]>(() => getVisibleCategoryNames(categories));

  useEffect(() => {
    setNames(getVisibleCategoryNames(categories));
  }, [categories]);

  if (!names.length) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {names.map((name) => (
        <Link
          key={name}
          href={getCafePath(
            slug,
            `products/popular?category=${encodeURIComponent(name)}`,
            previewThemeId
          )}
          className={
            variant === "cards"
              ? `min-w-[7rem] rounded-2xl px-4 py-3 text-center text-sm font-black ${theme.card} ${theme.cardHover}`
              : `rounded-full px-4 py-2 text-sm font-black ${theme.badge} ${theme.cardHover}`
          }
        >
          {name}
        </Link>
      ))}
    </div>
  );
}

export function ThemeSearchBar({
  slug,
  theme,
  previewThemeId,
  placeholder = "ابحث في المنيو...",
}: {
  slug: string;
  theme: ThemeClasses;
  previewThemeId?: string | null;
  placeholder?: string;
}) {
  return (
    <Link
      href={getCafePath(slug, "products/popular", previewThemeId)}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 ${theme.input} ${theme.card}`}
    >
      <Search className={`h-5 w-5 shrink-0 ${theme.muted}`} />
      <span className={`text-sm font-bold ${theme.muted}`}>{placeholder}</span>
    </Link>
  );
}

export function ThemePageFooter({
  slug,
  cafeName,
  themeId,
}: {
  slug: string;
  cafeName: string;
  themeId: CafeThemeId;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8">
      <CafeFooter slug={slug} cafeName={cafeName} themeId={themeId} />
    </div>
  );
}

export function CafeIdentityBlock({
  cafeName,
  logoUrl,
  description,
  theme,
  size = "md",
}: {
  cafeName: string;
  logoUrl?: string;
  description?: string;
  theme: ThemeClasses;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <CafeLogo name={cafeName} logoUrl={logoUrl} size={size === "lg" ? "lg" : "md"} />
      <div className="min-w-0">
        <h2 className="text-3xl font-black leading-tight md:text-4xl">{cafeName}</h2>
        {description ? (
          <p className={`mt-2 max-w-xl text-sm font-bold leading-7 ${theme.muted}`}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
