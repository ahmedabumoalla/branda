"use client";

import { BadgePercent, Gift } from "lucide-react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { PublicBrowserNav } from "@/components/cafe/public-browser-nav";
import { PublicFeatureUnavailable } from "@/components/cafe/public-feature-guard";
import { OfferCard } from "@/components/offers/offer-card";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { getCafePath } from "@/lib/cafe/theme-links";
import { publicFeatureAllows } from "@/lib/platform/public-feature-access";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import {
  CustomerBottomDock,
  CustomerPageHeader,
  defaultCustomerDockItems,
} from "@/components/cafe/themes/customer-mobile-experience";

export function PublicOffersPage({ slug }: { slug: string }) {
  const { theme, settings, previewThemeId, features } = useCafePageContext(slug);
  const logoUrl = useResolvedCafeLogoUrl(settings);
  const enabled = publicFeatureAllows(features, "offers");
  const { offers, loading, error } = usePublicCafeMenu(slug, {
    resource: "offers",
    limit: 100,
    enabled,
  });

  if (!enabled) {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <PublicFeatureUnavailable slug={slug} feature="offers" previewThemeId={previewThemeId} />
      </CafeLayout>
    );
  }

  return (
    <CafeLayout slug={slug} maxWidth="max-w-6xl" hideHeader hideFooter hideQuickDock>
      <PublicBrowserNav
        slug={slug}
        previewThemeId={previewThemeId}
        features={features}
        active="offers"
      />
      <main className="min-w-0 pb-8">
        <CustomerPageHeader
          cafeName={settings.cafeName || slug}
          logoUrl={logoUrl}
          title="العروض"
          subtitle="أسعار وفرص مختارة متاحة لفترة محدودة"
          action={
            !loading && !error ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)] px-3 text-xs font-black text-[var(--ci-button-bg,#6B3A25)] shadow-sm">
                <BadgePercent className="h-4 w-4" />
                {offers.length.toLocaleString("ar-SA")}
              </span>
            ) : undefined
          }
        />

        <div className="mb-4 mt-5">
          <p className="text-[11px] font-bold text-[var(--ci-muted-fg,#806A5E)]">متاحة الآن</p>
          <h2 className="text-lg font-black text-[var(--ci-page-fg,#311912)]">اختر العرض المناسب لك</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="aspect-[4/3] animate-pulse rounded-[18px] bg-black/5" />
            ))}
          </div>
        ) : error ? (
          <div className={`rounded-2xl border border-black/5 p-6 text-center font-bold ${theme.card}`}>
            {error}
          </div>
        ) : offers.length ? (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {offers.map((offer, index) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                featured={index === 0}
                className={index === 0 ? "sm:col-span-2 sm:aspect-[2/1]" : ""}
                href={
                  offer.linkedProductId
                    ? getCafePath(slug, `product/${offer.linkedProductId}`, previewThemeId)
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className={`rounded-[18px] border border-dashed border-[var(--ci-border,#E7D7C6)] p-8 text-center ${theme.card}`}>
            <Gift className={`mx-auto h-8 w-8 ${theme.accent}`} />
            <h2 className="mt-3 text-xl font-black">لا توجد عروض نشطة حاليًا</h2>
            <p className={`mt-2 text-sm font-bold ${theme.muted}`}>ستظهر العروض الجديدة هنا عند نشرها.</p>
          </div>
        )}
      </main>
      <CustomerBottomDock
        {...defaultCustomerDockItems({
          slug,
          previewThemeId,
          active: "offers",
          businessCategory: settings.businessCategory,
        })}
      />
    </CafeLayout>
  );
}
