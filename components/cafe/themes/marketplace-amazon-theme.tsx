"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { getCafePath } from "@/lib/cafe/theme-links";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeSearchBar,
  buildCafeNavItems,
} from "./theme-shared";

export function MarketplaceAmazonTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers, customer, previewThemeId } =
    props;
  const nav = buildCafeNavItems(slug, previewThemeId);

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <header className={`${theme.header} sticky top-0 z-50`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href={getCafePath(slug, "", previewThemeId)} className="flex items-center gap-3">
            <CafeLogo name={cafeSettings.cafeName} logoUrl={cafeSettings.logoDataUrl} size="sm" />
            <span className="font-black">{cafeSettings.cafeName}</span>
          </Link>
          <Link
            href={customer ? getCafePath(slug, "account", previewThemeId) : getCafePath(slug, "login", previewThemeId)}
            className={`flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-bold ${theme.button}`}
          >
            <UserRound className="h-4 w-4" />
            {customer ? "حسابي" : "دخول"}
          </Link>
        </div>
        <div className={`${theme.nav} px-4 py-3`}>
          <div className="mx-auto max-w-6xl">
            <ThemeSearchBar slug={slug} theme={theme} previewThemeId={previewThemeId} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <section className={`rounded-sm p-6 ${theme.hero}`}>
          <p className="text-sm font-bold opacity-90">تسوق من {cafeSettings.cafeName}</p>
          <h1 className="mt-2 text-2xl font-black md:text-3xl">
            {cafeSettings.description?.slice(0, 80) || "كل المنتجات في مكان واحد"}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-sm px-4 py-2 text-sm font-bold ${theme.button}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} previewThemeId={previewThemeId} variant="wide" />
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between border-b border-[#d5d9d9] pb-2">
            <h2 className="text-xl font-black">الأكثر مبيعًا</h2>
            <Link href={getCafePath(slug, "products/popular", previewThemeId)} className={`text-sm font-bold ${theme.link}`}>
              عرض الكل ←
            </Link>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {popularProducts.map((p) => (
              <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} previewThemeId={previewThemeId} size="compact" />
            ))}
          </div>
        </section>

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>
    </main>
  );
}
