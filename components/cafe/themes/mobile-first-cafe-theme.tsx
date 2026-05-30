"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

export function MobileFirstCafeTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers, customer } =
    props;
  const nav = buildCafeNavItems(slug);

  return (
    <main dir="rtl" className={`min-h-screen pb-24 ${theme.page}`}>
      <header className={`${theme.header} px-4 py-4`}>
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-3">
            <CafeLogo name={cafeSettings.cafeName} logoUrl={props.cafeLogoUrl} size="sm" />
            <div>
              <h1 className="font-black">{cafeSettings.cafeName}</h1>
              <p className={`text-xs ${theme.muted}`}>مرحبًا بك</p>
            </div>
          </div>
          <Link
            href={customer ? `/c/${slug}/account` : `/c/${slug}/login`}
            className={`rounded-2xl p-2.5 ${theme.button}`}
          >
            <UserRound className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <section className={`mx-auto max-w-lg px-4 py-6 ${theme.hero}`}>
        <h2 className="text-2xl font-black">ماذا تطلب اليوم؟</h2>
        <p className="mt-2 text-sm opacity-90">{cafeSettings.description?.slice(0, 60)}</p>
        <Link
          href={`/c/${slug}/products/popular`}
          className={`mt-4 inline-block rounded-2xl px-6 py-3 font-black ${theme.button}`}
        >
          ابدأ الطلب
        </Link>
      </section>

      <div className="mx-auto max-w-lg px-4">
        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} variant="strip" />
        ) : null}

        <ThemeCategoryStrip slug={slug} theme={theme} className="mt-4" />

        {popularProducts.length > 0 ? (
          <section className="mt-6">
            <h3 className="mb-3 font-black">الأكثر طلبًا</h3>
            <div className="grid grid-cols-3 gap-3">
              {popularProducts.map((p) => (
                <ThemeProductCard key={p.id} slug={slug} product={p} theme={theme} size="round" />
              ))}
            </div>
          </section>
        ) : null}

        <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
      </div>

      <nav
        className={`fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 px-2 py-2 safe-area-pb ${theme.nav}`}
      >
        {nav.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-black"
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
