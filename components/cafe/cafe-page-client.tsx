"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { CafeThemeRenderer } from "@/components/cafe/themes/cafe-theme-renderer";
import { runCustomIdentityMigrationOnce } from "@/lib/cafe/theme-storage-sync";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { useResolvedCafeTheme } from "@/lib/cafe/use-resolved-cafe-theme";
import { getCustomerSession, type BrandaCustomerSession } from "@/lib/customer/session";
import { mockMenuProducts, type MenuProduct } from "@/lib/mock/menu";
import { mockOffers, type CafeOffer } from "@/lib/mock/offers";
import {
  CAFE_SETTINGS_KEY,
  mockCafeSettings,
  type CafeSettings,
} from "@/lib/mock/cafe-settings";
import {
  mockLoyaltyRewards,
  mockLoyaltySettings,
  type LoyaltyReward,
  type LoyaltySettings,
} from "@/lib/mock/loyalty";
const MENU_KEY = "branda_qatrah_menu";
const OFFERS_KEY = "branda_qatrah_offers";

function productScore(product: MenuProduct, index: number) {
  return Number(product.loyaltyPoints || 0) + Number(product.price || 0) + (100 - index);
}

function CafePageInner({ slug }: { slug: string }) {
  const { themeId, theme, isPreview, previewThemeId } = useResolvedCafeTheme();
  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [products, setProducts] = useState<MenuProduct[]>(mockMenuProducts);
  const [offers, setOffers] = useState<CafeOffer[]>(mockOffers);
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(mockCafeSettings);
  const [loyaltySettings] = useState<LoyaltySettings>(mockLoyaltySettings);
  const [activeRewards] = useState<LoyaltyReward[]>(
    mockLoyaltyRewards.filter((r) => r.active)
  );

  useEffect(() => {
    void runCustomIdentityMigrationOnce();
    setCustomer(getCustomerSession(slug));
    const savedMenu = localStorage.getItem(MENU_KEY);
    const savedOffers = localStorage.getItem(OFFERS_KEY);
    const savedSettings = localStorage.getItem(CAFE_SETTINGS_KEY);

    if (savedMenu) setProducts(JSON.parse(savedMenu));
    if (savedOffers) setOffers(JSON.parse(savedOffers));
    if (savedSettings) setCafeSettings(JSON.parse(savedSettings));
  }, [slug]);

  const cafeLogoUrl = useResolvedCafeLogoUrl(cafeSettings);

  const availableProducts = products.filter((p) => p.available);

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

  return (
    <>
      <CafeThemeRenderer
        slug={slug}
        cafeSettings={cafeSettings}
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
