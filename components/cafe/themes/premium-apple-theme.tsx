"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import {
  CafeIdentityBlock,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function PremiumAppleTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={props.cafeLogoUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <section className={`text-center ${theme.hero} rounded-3xl px-6 py-20`}>
          <CafeIdentityBlock
            cafeName={cafeSettings.cafeName}
            logoUrl={props.cafeLogoUrl}
            description={cafeSettings.description}
            theme={theme}
            size="lg"
          />
          <Link
            href={`/c/${slug}/products/popular`}
            className={`mt-10 inline-block rounded-full px-10 py-4 text-lg font-semibold ${theme.button}`}
          >
            استكشف المنيو
          </Link>
        </section>

        <nav className="mt-16 flex flex-wrap justify-center gap-8 text-sm font-medium">
          {buildCafeNavItems(slug).map(({ href, label }) => (
            <Link key={href} href={href} className={theme.link}>
              {label}
            </Link>
          ))}
        </nav>

        <ThemeCategoryStrip
          slug={slug}
          theme={theme}
          previewThemeId={props.previewThemeId}
          className="mt-8 justify-center"
        />

        {popularProducts.length > 0 ? (
          <section className="mt-20 space-y-12">
            <h2 className="text-center text-4xl font-semibold tracking-tight">مختاراتنا</h2>
            <div className="grid gap-8 md:grid-cols-2">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="large" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}
