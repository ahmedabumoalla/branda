"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { CafeThemeRenderer } from "@/components/cafe/themes/cafe-theme-renderer";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { useCafeThemePage } from "@/lib/cafe/use-cafe-theme-page";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { getCustomerSession, type BrandaCustomerSession } from "@/lib/customer/session";
import type { MenuProduct } from "@/lib/mock/menu";
import { BrandPwaInstallSection } from "@/components/cafe/brand-pwa-install-section";
import { PublicLoyaltyCardSection } from "@/components/cafe/public-loyalty-card-section";
import { PublicInfoPagesSection } from "@/components/cafe/public-info-pages-section";
import { trackCafeVisitAction } from "@/app/actions/platform-upgrade";

function productScore(product: MenuProduct, index: number) {
  return Number(product.price || 0) + (100 - index);
}

function CafePageInner({ slug }: { slug: string }) {
  const { themeId, theme, isPreview, previewThemeId, settings, loadError: cafeLoadError } =
    useCafeThemePage(slug);
  const {
    products,
    offers,
    loyaltySettings,
    loyaltyRewards,
    pages,
    reservationServices,
    loading,
    error: menuError,
  } = usePublicCafeMenu(slug);
  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  useEffect(() => {
    const startedAt = Date.now();
    const key = `branda_visit_session_${slug}`;
    let sessionId = sessionStorage.getItem(key);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(key, sessionId);
    }
    void trackCafeVisitAction({ slug, sessionId, path: window.location.pathname, referrer: document.referrer || undefined });
    return () => {
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      void trackCafeVisitAction({ slug, sessionId: sessionId || "anonymous", path: window.location.pathname, referrer: document.referrer || undefined, durationSeconds });
    };
  }, [slug]);

  const cafeLogoUrl = useResolvedCafeLogoUrl(settings);
  const availableProducts = products.filter((p) => p.available);
  const activeRewards = loyaltyRewards.filter((r) => r.active);

  const bannerOffers = offers.filter(
    (o) =>
      o.status === "نشط" &&
      o.visibleInCafe &&
      ((o.placement ?? "كلاهما") === "بانر الكوفي" ||
        (o.placement ?? "كلاهما") === "كلاهما")
  );

  const popularProducts = useMemo(
    () =>
      [...availableProducts]
        .sort((a, b) => productScore(b, 0) - productScore(a, 0))
        .slice(0, 4),
    [availableProducts]
  );

  const latestProducts = useMemo(
    () => [...availableProducts].slice(-4).reverse(),
    [availableProducts]
  );

  const loadError = cafeLoadError || menuError;

  if (loading) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#e8e4df]">
        <p className="font-black text-[#4a4540]">جاري التحميل...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#e8e4df] px-4">
        <p className="text-center font-black text-[#4a4540]">{loadError}</p>
      </main>
    );
  }

  return (
    <>
      <CafeThemeRenderer
        slug={slug}
        cafeSettings={settings}
        cafeLogoUrl={cafeLogoUrl}
        themeId={themeId}
        theme={theme}
        previewThemeId={previewThemeId}
        customer={customer}
        products={products}
        offers={offers}
        availableProducts={availableProducts}
        popularProducts={popularProducts}
        latestProducts={latestProducts}
        bannerOffers={bannerOffers}
        activeRewards={activeRewards}
        loyaltySettings={loyaltySettings}
        isPreview={isPreview}
      />
      <PublicInfoPagesSection pages={pages} />
      <BrandPwaInstallSection slug={slug} cafeName={settings.cafeName || slug} />
      <PublicLoyaltyCardSection
        slug={slug}
        cafeName={settings.cafeName || slug}
        program={{
          enabled: true,
          cardTitle: "بطاقة الولاء",
          cardSubtitle: "اجمع الأختام واحصل على مكافأتك",
          purchasesRequired: 7,
          rewardName: "منتج مجاني",
          cardBackground: "#4A281D",
          cardForeground: "#FCF8F3",
          cardAccent: "#D9A33F",
        }}
      />
    </>
  );
}

export function CafePageClient({ slug }: { slug: string }) {
  return (
    <Suspense
      fallback={
        <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#e8e4df]">
          <p className="font-black text-[#4a4540]">جاري التحميل...</p>
        </main>
      }
    >
      <CafePageInner slug={slug} />
    </Suspense>
  );
}
