"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  buildCafeNavItems,
} from "./theme-shared";

export function MagazineEditorialTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <header className={`border-b-2 px-6 py-4 ${theme.header}`}>
        <div className="mx-auto flex max-w-6xl items-end justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Issue · 2026</p>
            <h1 className="mt-1 break-words text-3xl font-black sm:text-4xl lg:text-6xl">
              {cafeSettings.cafeName}
            </h1>
          </div>
          <nav className="hidden gap-6 text-sm font-black md:flex">
            {buildCafeNavItems(slug).map(({ href, label }) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section className={`px-6 py-16 ${theme.hero}`}>
        <p className="mx-auto max-w-3xl text-center text-lg leading-relaxed opacity-90">
          {cafeSettings.description || "تحرير خاص بقهوة المختصين."}
        </p>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-12">
        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel
            slug={slug}
            offers={bannerOffers}
            theme={theme}
            variant="editorial"
          />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-12 space-y-10">
            {popularProducts.map((p, i) => (
              <div key={p.id}>
                <p className={`mb-2 text-xs font-black ${theme.accent}`}>
                  {String(i + 1).padStart(2, "0")} — قصة المنتج
                </p>
                <ThemeProductCard slug={slug} product={p} theme={theme} size="story" />
              </div>
            ))}
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}
