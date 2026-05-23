"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeSearchBar,
  buildCafeNavItems,
} from "./theme-shared";

export function CyberEcoDarkTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,230,118,0.08),_transparent_50%)]" />
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={cafeSettings.logoDataUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <div className="relative mx-auto max-w-5xl px-4 py-8">
        <section className={`rounded-lg border p-8 ${theme.hero}`}>
          <p className={`font-mono text-xs ${theme.accent}`}>// eco_mode.on</p>
          <h1 className="mt-2 text-3xl font-black">{cafeSettings.cafeName}</h1>
          <p className={`mt-3 ${theme.muted}`}>{cafeSettings.description}</p>
          <div className="mt-6">
            <ThemeSearchBar slug={slug} theme={theme} placeholder="بحث ذكي في المنيو" />
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-2">
          {buildCafeNavItems(slug).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-lg border px-4 py-2 text-sm font-bold ${theme.buttonOutline}`}
            >
              {label}
            </Link>
          ))}
        </div>

        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} variant="neon" />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-8">
            <h2 className={`mb-4 font-mono text-sm ${theme.accent}`}>featured[]</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="compact" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}
