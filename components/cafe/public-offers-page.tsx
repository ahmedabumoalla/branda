"use client";

import { Gift } from "lucide-react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { PublicBrowserNav } from "@/components/cafe/public-browser-nav";
import { PublicFeatureUnavailable } from "@/components/cafe/public-feature-guard";
import { OfferCard } from "@/components/offers/offer-card";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { getCafePath } from "@/lib/cafe/theme-links";
import { publicFeatureAllows } from "@/lib/platform/public-feature-access";

export function PublicOffersPage({ slug }: { slug: string }) {
  const { theme, settings, previewThemeId, features } = useCafePageContext(slug);
  const enabled = publicFeatureAllows(features, "offers");
  const { offers, loading, error } = usePublicCafeMenu(slug, {
    resource: "offers",
    limit: 100,
    enabled,
  });

  if (!enabled) {
    return (
      <CafeLayout slug={slug}>
        <PublicFeatureUnavailable slug={slug} feature="offers" previewThemeId={previewThemeId} />
      </CafeLayout>
    );
  }

  return (
    <CafeLayout slug={slug} maxWidth="max-w-6xl">
      <PublicBrowserNav
        slug={slug}
        previewThemeId={previewThemeId}
        features={features}
        active="offers"
      />
      <main className="min-w-0 pb-8">
        <header className="mb-6 min-w-0 sm:mb-8">
          <p className={`text-sm font-black ${theme.accent}`}>{settings.cafeName || slug}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black sm:text-4xl">العروض</h1>
              <p className={`mt-2 max-w-2xl text-sm font-bold leading-7 ${theme.muted}`}>
                اكتشف العروض النشطة والمتاحة الآن في الفرع الإلكتروني.
              </p>
            </div>
            {!loading && !error ? (
              <span className={`rounded-full px-3 py-1.5 text-xs font-black ${theme.badge}`}>
                {offers.length} عرض نشط
              </span>
            ) : null}
          </div>
        </header>

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="aspect-[3/2] animate-pulse rounded-[24px] bg-black/5" />
            ))}
          </div>
        ) : error ? (
          <div className={`rounded-2xl border border-black/5 p-6 text-center font-bold ${theme.card}`}>
            {error}
          </div>
        ) : offers.length ? (
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            {offers.map((offer, index) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                featured={index === 0}
                className={index === 0 ? "md:col-span-2 md:aspect-[2/1]" : ""}
                href={
                  offer.linkedProductId
                    ? getCafePath(slug, `product/${offer.linkedProductId}`, previewThemeId)
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className={`rounded-2xl border border-black/5 p-8 text-center ${theme.card}`}>
            <Gift className={`mx-auto h-8 w-8 ${theme.accent}`} />
            <h2 className="mt-3 text-xl font-black">لا توجد عروض نشطة حاليًا</h2>
            <p className={`mt-2 text-sm font-bold ${theme.muted}`}>ستظهر العروض الجديدة هنا عند نشرها.</p>
          </div>
        )}
      </main>
    </CafeLayout>
  );
}
