"use client";

import Link from "next/link";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { ThemePageFooter, ThemeProductCard, buildCafeNavItems } from "./theme-shared";

export function FastOrderKioskTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, availableProducts } = props;
  const items = availableProducts.slice(0, 8);

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <header className={`${theme.header} px-6 py-5`}>
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <CafeLogo name={cafeSettings.cafeName} logoUrl={cafeSettings.logoDataUrl} size="md" />
          <Link
            href={`/c/${slug}/products/popular`}
            className={`rounded-lg px-6 py-3 text-lg font-black ${theme.buttonOutline}`}
          >
            كل المنيو
          </Link>
        </div>
      </header>

      <section className={`${theme.hero} px-6 py-8 text-center`}>
        <h1 className="text-4xl font-black">اختر واطلب</h1>
        <p className="mt-2 text-lg opacity-90">اضغط على المنتج للتفاصيل والطلب</p>
      </section>

      <div className="mx-auto max-w-4xl space-y-3 px-4 py-6">
        {items.map((p) => (
          <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="kiosk" />
        ))}
      </div>

      <div className={`sticky bottom-0 ${theme.nav} px-4 py-4`}>
        <div className="mx-auto flex max-w-4xl gap-3">
          {buildCafeNavItems(slug).slice(0, 3).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex-1 rounded-lg py-4 text-center font-black"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
    </main>
  );
}
