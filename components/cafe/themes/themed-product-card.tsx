"use client";

import Link from "next/link";
import { Coffee, Flame } from "lucide-react";
import { formatSar } from "@/lib/format";
import type { MenuProduct } from "@/lib/mock/menu";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

type Props = {
  slug: string;
  product: MenuProduct;
  experience: ThemeExperience;
  href: string;
};

export function ThemedProductCard({ product, experience, href }: Props) {
  const { theme, collection } = experience;

  if (collection === "kiosk-grid") {
    return (
      <Link
        href={href}
        className={`block p-4 ${theme.card} ${theme.cardHover} rounded-lg`}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-black/5">
            {product.imageDataUrl ? (
              <img src={product.imageDataUrl} alt="" className="max-h-full object-contain" />
            ) : (
              <Flame className="h-8 w-8 opacity-30" />
            )}
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

  if (collection === "mobile-scroll") {
    return (
      <Link
        href={href}
        className={`flex w-36 shrink-0 flex-col items-center p-3 ${theme.card} ${theme.cardHover} rounded-2xl`}
      >
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white shadow">
          {product.imageDataUrl ? (
            <img src={product.imageDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Coffee className="h-8 w-8 opacity-30" />
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-center text-sm font-black">{product.name}</h3>
        <p className={`text-xs font-black ${theme.accent}`}>{formatSar(product.price)}</p>
      </Link>
    );
  }

  if (collection === "gallery") {
    return (
      <Link
        href={href}
        className={`group block p-6 ${theme.card} ${theme.cardHover} rounded-3xl`}
      >
        <div className="flex h-56 items-center justify-center">
          {product.imageDataUrl ? (
            <img
              src={product.imageDataUrl}
              alt=""
              className="max-h-full object-contain transition group-hover:scale-105"
            />
          ) : (
            <Coffee className="h-16 w-16 opacity-20" />
          )}
        </div>
        <p className={`mt-4 text-sm ${theme.muted}`}>{product.category}</p>
        <h3 className="mt-1 text-2xl font-semibold">{product.name}</h3>
        <p className={`mt-2 text-lg ${theme.accent}`}>{formatSar(product.price)}</p>
      </Link>
    );
  }

  if (collection === "editorial") {
    return (
      <Link href={href} className={`grid gap-4 md:grid-cols-2 ${theme.card} ${theme.cardHover}`}>
        <div className="flex min-h-[180px] items-center justify-center p-4">
          {product.imageDataUrl ? (
            <img src={product.imageDataUrl} alt="" className="max-h-[200px] object-contain" />
          ) : (
            <Coffee className="h-12 w-12 opacity-30" />
          )}
        </div>
        <div className="flex flex-col justify-center border-t p-6 md:border-t-0 md:border-r border-inherit">
          <p className={`text-xs font-black uppercase ${theme.accent}`}>{product.category}</p>
          <h3 className="mt-2 text-2xl font-black">{product.name}</h3>
          <p className="mt-3 font-black">{formatSar(product.price)}</p>
        </div>
      </Link>
    );
  }

  const compact = collection === "sidebar-grid" || collection === "deal-strip" || collection === "neon-grid";

  return (
    <Link
      href={href}
      className={`group overflow-hidden transition ${theme.card} ${theme.cardHover} ${
        compact ? "rounded-xl p-3" : "rounded-[28px] p-4"
      }`}
    >
      <div
        className={`relative flex items-center justify-center ${
          compact ? "h-40" : "h-52"
        } rounded-2xl bg-black/5`}
      >
        {product.imageDataUrl ? (
          <img
            src={product.imageDataUrl}
            alt=""
            className="max-h-full w-full object-contain p-3 transition group-hover:scale-[1.03]"
          />
        ) : (
          <Coffee className="h-12 w-12 opacity-30" />
        )}
      </div>
      <p className={`mt-3 text-xs font-black ${theme.accent}`}>{product.category}</p>
      <h3 className={`line-clamp-1 font-black ${compact ? "text-base" : "text-xl"}`}>
        {product.name}
      </h3>
      {!compact ? (
        <p className={`mt-1 line-clamp-2 text-sm ${theme.muted}`}>{product.description}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between">
        <span className="font-black">{formatSar(product.price)}</span>
        <span className={`rounded-lg px-3 py-1.5 text-xs font-black ${theme.badge}`}>
          التفاصيل
        </span>
      </div>
    </Link>
  );
}

export function getCollectionGridClass(collection: ThemeExperience["collection"]) {
  switch (collection) {
    case "sidebar-grid":
    case "neon-grid":
    case "neumo-grid":
    case "deal-strip":
      return "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";
    case "gallery":
      return "grid gap-8 md:grid-cols-2";
    case "editorial":
      return "space-y-8";
    case "mobile-scroll":
      return "flex gap-3 overflow-x-auto pb-2";
    case "kiosk-grid":
      return "space-y-3";
    case "lounge-grid":
      return "grid gap-5 sm:grid-cols-2";
    default:
      return "grid gap-5 sm:grid-cols-2 xl:grid-cols-3";
  }
}
