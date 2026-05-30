"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function NoonCommerceTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, offers, popularProducts, bannerOffers } = props;
  const flashOffers = offers.filter((o) => o.status === "نشط").slice(0, 4);

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={props.cafeLogoUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <div className={`${theme.hero} px-4 py-6`}>
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-black">{cafeSettings.cafeName}</h1>
          <p className="mt-1 text-sm font-bold">عروض اليوم — تسوّق بسرعة</p>
        </div>
      </div>

      {flashOffers.length > 0 ? (
        <div className="border-b border-[#e7e8ef] bg-white py-3">
          <div className="mx-auto flex max-w-6xl gap-3 overflow-x-auto px-4">
            {flashOffers.map((o) => (
              <Link
                key={o.id}
                href={`/c/${slug}/products/offers`}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-black ${theme.badge}`}
              >
                {o.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-5 gap-2">
          {buildCafeNavItems(slug).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-lg py-3 text-center text-xs font-black ${theme.card}`}
            >
              {label}
            </Link>
          ))}
        </div>

        <ThemeCategoryStrip slug={slug} theme={theme} className="mt-4" variant="cards" />

        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} variant="strip" />
        ) : null}

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-black">منتجات مميزة</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {popularProducts.map((p) => (
              <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="compact" />
            ))}
          </div>
        </section>

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}
