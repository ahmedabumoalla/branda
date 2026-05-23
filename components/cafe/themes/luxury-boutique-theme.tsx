"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  buildCafeNavItems,
} from "./theme-shared";

export function LuxuryBoutiqueTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers } = props;
  const hero = popularProducts[0];

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <nav className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-5 ${theme.nav}`}>
        <CafeLogo name={cafeSettings.cafeName} logoUrl={cafeSettings.logoDataUrl} size="sm" />
        <div className="flex gap-6 text-sm font-medium tracking-wide">
          {buildCafeNavItems(slug).slice(0, 3).map(({ href, label }) => (
            <Link key={href} href={href} className={theme.link}>
              {label}
            </Link>
          ))}
          <Link href={`/c/${slug}/account`} className={theme.accent}>
            الحساب
          </Link>
        </div>
      </nav>

      <section className={`relative min-h-[70vh] pt-24 ${theme.hero}`}>
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-20 text-center">
          <p className={`text-xs tracking-[0.3em] uppercase ${theme.accent}`}>تجربة حصرية</p>
          <h1 className="mt-6 font-serif text-5xl font-light md:text-7xl">{cafeSettings.cafeName}</h1>
          <p className={`mt-6 max-w-2xl text-lg leading-relaxed ${theme.muted}`}>
            {cafeSettings.description || "قصة كل كوب تبدأ هنا."}
          </p>
          {hero ? (
            <Link
              href={`/c/${slug}/product/${hero.id}`}
              className={`mt-10 inline-block px-10 py-4 text-sm tracking-widest ${theme.button}`}
            >
              اكتشف {hero.name}
            </Link>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-12">
        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel
            slug={slug}
            offers={bannerOffers}
            theme={theme}
            variant="cinematic"
          />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-16 space-y-8">
            <h2 className={`text-center text-sm tracking-[0.2em] ${theme.accent}`}>المجموعة</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="story" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}
