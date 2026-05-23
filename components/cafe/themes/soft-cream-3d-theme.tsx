"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import { getCafePath } from "@/lib/cafe/theme-links";
import {
  CafeIdentityBlock,
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  buildCafeNavItems,
} from "./theme-shared";

export function SoftCream3dTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers, previewThemeId } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={cafeSettings.logoDataUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <div className="mx-auto max-w-5xl px-5 py-8">
        <section className={`rounded-3xl p-8 ${theme.hero}`}>
          <CafeIdentityBlock
            cafeName={cafeSettings.cafeName}
            logoUrl={cafeSettings.logoDataUrl}
            description={cafeSettings.description}
            theme={theme}
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={getCafePath(slug, "products/popular", previewThemeId)} className={`rounded-2xl px-6 py-3 font-black ${theme.button}`}>
              تصفح المنيو
            </Link>
            <Link href={getCafePath(slug, "reserve", previewThemeId)} className={`rounded-2xl px-6 py-3 font-black ${theme.buttonOutline}`}>
              احجز طاولة
            </Link>
          </div>
        </section>

        <nav className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {buildCafeNavItems(slug, previewThemeId).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-2xl py-4 text-center text-xs font-black ${theme.card}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} previewThemeId={previewThemeId} variant="soft" />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-black">مختارات الكوفي</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} previewThemeId={previewThemeId} size="compact" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}
