"use client";

import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import { CafeHeader } from "@/components/cafe/cafe-header";
import {
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
} from "./theme-shared";

export function ReservationLoungeTheme(props: CafeThemePageProps) {
  const { slug, cafeSettings, themeId, theme, popularProducts, bannerOffers } = props;

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <CafeHeader
        slug={slug}
        cafeName={cafeSettings.cafeName}
        logoUrl={props.cafeLogoUrl}
        themeId={themeId}
        customer={props.customer}
      />

      <section className={`${theme.hero} px-6 py-16 md:py-20`}>
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-bold opacity-80">احجز تجربتك</p>
          <h1 className="mt-3 break-words text-3xl font-black sm:text-4xl lg:text-5xl">
            {cafeSettings.cafeName}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base opacity-90">
            {cafeSettings.description || "جلسات هادئة، طاولات مريحة، وحجز بخطوة واحدة."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href={`/c/${slug}/reserve`}
              className={`inline-flex items-center gap-2 rounded-xl px-8 py-4 font-black ${theme.button}`}
            >
              <CalendarDays className="h-5 w-5" />
              احجز طاولة الآن
            </Link>
            <Link
              href={`/c/${slug}/products/branches`}
              className={`inline-flex items-center gap-2 rounded-xl px-8 py-4 font-black ${theme.buttonOutline}`}
            >
              <MapPin className="h-5 w-5" />
              الفروع
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        <ThemeCategoryStrip slug={slug} theme={theme} className="py-4" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {bannerOffers.length > 0 ? (
          <ThemeBannerCarousel slug={slug} offers={bannerOffers} theme={theme} variant="wide" />
        ) : null}

        {popularProducts.length > 0 ? (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">قبل زيارتك — جرّب المنيو</h2>
              <Link href={`/c/${slug}/products/popular`} className={`text-sm font-black ${theme.link}`}>
                عرض الكل
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {popularProducts.slice(0, 4).map((p) => (
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
