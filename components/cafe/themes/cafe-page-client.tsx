"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Coffee, Gift, MapPin, Search, WalletCards } from "lucide-react";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { BrandPwaInstallSection } from "@/components/cafe/brand-pwa-install-section";
import { PublicExperienceSupportSection } from "@/components/cafe/public-experience-support-section";
import { PublicLoyaltyCardSection } from "@/components/cafe/public-loyalty-card-section";
import { ThemedCafeShell } from "@/components/cafe/themes/themed-cafe-shell";
import { useCafeThemePage } from "@/lib/cafe/use-cafe-theme-page";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { getCafePath } from "@/lib/cafe/theme-links";
import { publicFeatureAllows } from "@/lib/platform/public-feature-access";
import { resolveProductCategoryLabel } from "@/lib/cafe/menu-category-utils";
import { getCustomerSession, type BarndaksaCustomerSession } from "@/lib/customer/session";
import { formatSar } from "@/lib/format";
import { isPromoActive, productFinalPrice, promoBadgeText, type MenuProduct } from "@/lib/mock/menu";
import { trackCafeVisitAction } from "@/app/actions/platform-upgrade";

function productScore(product: MenuProduct, index: number) {
  return Number(product.price || 0) + (100 - index);
}

function CafeHomeProductCard({
  slug,
  product,
  previewThemeId,
}: {
  slug: string;
  product: MenuProduct;
  previewThemeId?: string | null;
}) {
  const promoOn = product.promo ? isPromoActive(product.promo) : false;
  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscount = promoOn && finalPrice < product.price;

  return (
    <Link
      href={getCafePath(slug, `product/${product.id}`, previewThemeId)}
      className="barndaksa-premium-card barndaksa-product-motion block overflow-hidden rounded-[28px] border border-[#E7D7C6] bg-white shadow-[0_14px_38px_rgba(49,25,18,0.08)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#FCF8F3]">
        <ProductMediaDisplay
          product={product}
          alt={product.name}
          className="h-full w-full object-cover"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#6B3A25] to-[#D9A33F]">
              <Coffee className="h-12 w-12 text-white/85" />
            </div>
          }
        />
        {product.promo ? (
          <span className="absolute right-3 top-3 inline-flex rounded-full bg-[#6B3A25] px-3 py-1 text-[11px] font-black text-white">
            {promoOn ? promoBadgeText(product.promo) : "عرض غير نشط"}
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <p className="text-xs font-black text-[#D9A33F]">{resolveProductCategoryLabel(product)}</p>
        <h3 className="mt-1 text-lg font-black text-[#311912]">{product.name}</h3>

        {product.description ? (
          <p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-[#806A5E]">
            {product.description}
          </p>
        ) : null}

        {product.ingredients?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {product.ingredients.slice(0, 3).map((ingredient) => (
              <span key={ingredient} className="rounded-full bg-[#FCF8F3] px-3 py-1 text-[11px] font-black text-[#6B3A25]">
                {ingredient}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black text-[#806A5E]">السعر شامل الضريبة</p>
            <p className="text-xl font-black text-[#311912]">
              {hasDiscount ? (
                <span className="inline-flex flex-col leading-tight">
                  <span>{formatSar(finalPrice)}</span>
                  <span className="text-xs text-[#806A5E] line-through">{formatSar(product.price)}</span>
                </span>
              ) : (
                formatSar(product.price)
              )}
            </p>
          </div>
          <span className="rounded-2xl bg-[#6B3A25] px-4 py-2 text-sm font-black text-white">
            عرض
          </span>
        </div>
      </div>
    </Link>
  );
}

function CafePageInner({ slug }: { slug: string }) {
  const { theme, settings, previewThemeId, loadError: cafeLoadError, features } = useCafeThemePage(slug);
  const hasFeature = (feature: Parameters<typeof publicFeatureAllows>[1]) =>
    features.length > 0 && publicFeatureAllows(features, feature);
  const { products, offers, loading, error: menuError } = usePublicCafeMenu(slug);
  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  useEffect(() => {
    const key = `barndaksa_visit_session_${slug}`;
    let sessionId = sessionStorage.getItem(key);

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(key, sessionId);
    }

    const path = window.location.pathname;
    const pingKey = `barndaksa_visit_ping_${slug}_${path}`;
    const lastPing = Number(sessionStorage.getItem(pingKey) ?? 0);
    if (Date.now() - lastPing < 15 * 60_000) return;
    sessionStorage.setItem(pingKey, String(Date.now()));

    void trackCafeVisitAction({
      slug,
      sessionId,
      path,
      referrer: document.referrer || undefined,
    });
  }, [slug]);

  const availableProducts = products.filter((product) => product.available);
  const featuredProducts = useMemo(
    () =>
      [...availableProducts]
        .sort((a, b) => productScore(b, 0) - productScore(a, 0))
        .slice(0, 4),
    [availableProducts]
  );

  const categories = useMemo(() => {
    const unique = new Map<string, string>();
    availableProducts.forEach((product) => {
      const label = resolveProductCategoryLabel(product);
      if (label) unique.set(label, label);
    });
    return Array.from(unique.values()).slice(0, 8);
  }, [availableProducts]);

  const activeOffers = offers.filter((offer) => offer.status === "نشط" && offer.visibleInCafe);
  const loadError = cafeLoadError || menuError;

  if (loading) {
    return (
      <ThemedCafeShell slug={slug} maxWidth="max-w-md">
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">جاري التحميل...</p>
        </div>
      </ThemedCafeShell>
    );
  }

  if (loadError) {
    return (
      <ThemedCafeShell slug={slug} maxWidth="max-w-md">
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">{loadError}</p>
        </div>
      </ThemedCafeShell>
    );
  }

  return (
    <ThemedCafeShell slug={slug} maxWidth="max-w-md">
      <section className="barndaksa-premium-hero rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#D9A33F]">مرحبًا بك في</p>
            <h1 className="mt-1 text-3xl font-black text-[#311912]">{settings.cafeName}</h1>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
              {settings.description || "منيو رقمي وطلبات وحجوزات وبطاقة ولاء في تجربة واحدة"}
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-[#6B3A25] text-white">
            <Coffee className="h-7 w-7" />
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link href={getCafePath(slug, "products/popular", previewThemeId)} className="barndaksa-cta-motion flex items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-4 py-3 text-sm font-black text-white">
            <Search className="h-4 w-4" />
            تصفح المنيو
          </Link>
          <Link href={getCafePath(slug, "reserve", previewThemeId)} className="barndaksa-cta-motion flex items-center justify-center gap-2 rounded-2xl border border-[#6B3A25] px-4 py-3 text-sm font-black text-[#6B3A25]">
            <CalendarDays className="h-4 w-4" />
            احجز
          </Link>
        </div>

        {customer ? (
          <Link href="#loyalty-card" className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-[#FCF8F3] px-4 py-3 text-sm font-black text-[#6B3A25]">
            <WalletCards className="h-4 w-4" />
            بطاقة الولاء
          </Link>
        ) : null}
      </section>

      <section className="barndaksa-premium-card barndaksa-offer-motion mt-5 overflow-hidden rounded-[32px] border border-[#E7D7C6] bg-gradient-to-l from-[#6B3A25] to-[#3A2117] p-5 text-white shadow-[0_18px_45px_rgba(49,25,18,0.12)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black text-[#D9A33F]">
              {activeOffers[0]?.title || "عروض ومنتجات جديدة"}
            </p>
            <h2 className="mt-1 text-2xl font-black">
              {activeOffers[0]?.promoProductName || activeOffers[0]?.description || "اكتشف أحدث ما تقدمه العلامة"}
            </h2>
          </div>
          <Gift className="h-10 w-10 text-[#D9A33F]" />
        </div>
        <Link href={getCafePath(slug, "products/offers", previewThemeId)} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#6B3A25]">
          مشاهدة العروض
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </section>

      {categories.length ? (
        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-black text-[#311912]">الأقسام</h2>
            <Link href={getCafePath(slug, "products/popular", previewThemeId)} className="text-sm font-black text-[#6B3A25]">
              الكل
            </Link>
          </div>
          <div className="barndaksa-stagger-grid flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <Link
                key={category}
                href={`${getCafePath(slug, "products/popular", previewThemeId)}?category=${encodeURIComponent(category)}`}
                className="barndaksa-premium-card shrink-0 rounded-2xl border border-[#E7D7C6] bg-white px-4 py-3 text-sm font-black text-[#6B3A25]"
              >
                {category}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-[#D9A33F]">المنتجات</p>
            <h2 className="text-2xl font-black text-[#311912]">الأكثر طلبًا</h2>
          </div>
          <Link href={getCafePath(slug, "products/popular", previewThemeId)} className="inline-flex items-center gap-2 rounded-2xl border border-[#6B3A25] px-4 py-2 text-sm font-black text-[#6B3A25]">
            عرض الكل
          </Link>
        </div>

        <div className="barndaksa-stagger-grid grid gap-4">
          {featuredProducts.length ? (
            featuredProducts.map((product) => (
              <CafeHomeProductCard
                key={product.id}
                slug={slug}
                product={product}
                previewThemeId={previewThemeId}
              />
            ))
          ) : (
            <div className="rounded-[28px] border border-[#E7D7C6] bg-white p-6 text-center font-black text-[#806A5E]">
              لا توجد منتجات متاحة حاليًا
            </div>
          )}
        </div>
      </section>

      <section className="barndaksa-premium-card mt-6 rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
        <div className="flex items-center gap-3">
          <MapPin className="h-6 w-6 text-[#6B3A25]" />
          <div>
            <p className="text-sm font-black text-[#D9A33F]">الفروع</p>
            <h2 className="text-xl font-black text-[#311912]">اعرف أقرب فرع</h2>
          </div>
        </div>
        <Link href={getCafePath(slug, "products/branches", previewThemeId)} className="mt-4 flex items-center justify-center rounded-2xl bg-[#6B3A25] px-4 py-3 text-sm font-black text-white">
          عرض الفروع
        </Link>
      </section>

      <BrandPwaInstallSection slug={slug} cafeName={settings.cafeName || slug} />

      {hasFeature("loyalty") ? (
        <PublicLoyaltyCardSection
          slug={slug}
          cafeName={settings.cafeName || slug}
          program={{
            enabled: true,
            cardTitle: "بطاقة الولاء",
            cardSubtitle: "اجمع الأختام واحصل على مكافأتك",
            purchasesRequired: 7,
            rewardName: "منتج مجاني",
            cardBackground: "#F6BE18",
            cardForeground: "#17212B",
            cardAccent: "#64BFA9",
          }}
        />
      ) : null}

      {hasFeature("experience_reviews") ? (
        <PublicExperienceSupportSection slug={slug} cafeName={settings.cafeName || slug} />
      ) : null}
    </ThemedCafeShell>
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
