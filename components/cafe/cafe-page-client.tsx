"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type CSSProperties, type ElementType } from "react";
import {
  ArrowLeft,
  BadgePercent,
  CalendarDays,
  Coffee,
  Gift,
  Heart,
  MapPin,
  Megaphone,
  ShoppingBag,
  Star,
  UserRound,
  WalletCards,
} from "lucide-react";
import { BrandPwaInstallSection } from "@/components/cafe/brand-pwa-install-section";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import {
  CustomerQuickDock,
  InternalAdPanel,
  PremiumSectionHeader,
  SocialProofPanel,
  buildCustomerQuickDockItems,
} from "@/components/cafe/themes/customer-experience-primitives";
import { useCafeThemePage } from "@/lib/cafe/use-cafe-theme-page";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";
import { buildCustomIdentityCssVars, defaultCustomIdentityTheme, OVERLAY_OPACITY } from "@/lib/mock/custom-identity-theme";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { getCafePath } from "@/lib/cafe/theme-links";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { resolveProductCategoryLabel } from "@/lib/cafe/menu-category-utils";
import { getCustomerSession, type BarndaksaCustomerSession } from "@/lib/customer/session";
import { formatSar } from "@/lib/format";
import type { CafeOffer } from "@/lib/mock/offers";
import {
  isPromoActive,
  productFinalPrice,
  promoBadgeText,
  type MenuProduct,
} from "@/lib/mock/menu";
import { trackCafeVisitAction } from "@/app/actions/platform-upgrade";
import { sendBranchProximityEmailAction } from "@/app/actions/customer";

function productScore(product: MenuProduct, index: number) {
  return Number(product.price || 0) + (100 - index);
}

function ProductShowcaseCard({
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
  const category = resolveProductCategoryLabel(product);

  return (
    <Link
      href={getCafePath(slug, `product/${product.id}`, previewThemeId)}
      className="group grid overflow-hidden rounded-[32px] border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] shadow-[0_18px_45px_rgba(49,25,18,0.08)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(49,25,18,0.12)] sm:grid-cols-[220px_1fr]"
    >
      <div className="relative min-h-[220px] overflow-hidden bg-[var(--ci-page-bg)] sm:min-h-full">
        <ProductMediaDisplay
          product={product}
          alt={product.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3A2117] to-[#9B6A34]">
              <Coffee className="h-14 w-14 text-[var(--ci-button-fg)]/85" />
            </div>
          }
        />

        {product.promo ? (
          <span className="absolute right-3 top-3 inline-flex max-w-[85%] items-center gap-1 rounded-full bg-[var(--ci-button-bg)] px-3 py-1 text-xs font-black text-[var(--ci-button-fg)] shadow">
            <Gift className="h-3.5 w-3.5 text-[#D9A33F]" />
            <span className="truncate">{promoOn ? promoBadgeText(product.promo) : "عرض غير نشط"}</span>
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--ci-page-bg)] px-3 py-1 text-xs font-black text-[var(--ci-primary-bg)]">
            {category}
          </span>
          {product.preparationTimeMinutes ? (
            <span className="rounded-full bg-[var(--ci-page-bg)] px-3 py-1 text-xs font-black text-[var(--ci-muted-fg)]">
              {product.preparationTimeMinutes} دقيقة
            </span>
          ) : null}
          {product.availableForPickup === false ? (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
              غير متاح للاستلام
            </span>
          ) : null}
        </div>

        <h3 className="mt-3 text-2xl font-black text-[var(--ci-page-fg)]">{product.name}</h3>

        {product.description ? (
          <p className="mt-2 line-clamp-3 text-sm font-bold leading-7 text-[var(--ci-muted-fg)]">
            {product.description}
          </p>
        ) : null}

        {product.ingredients?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {product.ingredients.slice(0, 5).map((item) => (
              <span key={item} className="rounded-full border border-[var(--ci-border)] px-3 py-1 text-[11px] font-black text-[var(--ci-primary-bg)]">
                {item}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5">
          <div>
            <p className="text-xs font-black text-[var(--ci-muted-fg)]">السعر شامل الضريبة</p>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-3xl font-black text-[var(--ci-page-fg)]">{formatSar(finalPrice)}</span>
              {hasDiscount ? (
                <span className="pb-1 text-sm font-black text-[#9B8B7B] line-through">
                  {formatSar(product.price)}
                </span>
              ) : null}
            </div>
          </div>

          {product.promo ? (
            <span className="rounded-2xl bg-[var(--ci-accent-bg)] px-4 py-2 text-sm font-black text-[var(--ci-page-fg)]">
              {promoBadgeText(product.promo)}
            </span>
          ) : (
            <span className="rounded-2xl bg-[var(--ci-button-bg)] px-4 py-2 text-sm font-black text-[var(--ci-button-fg)]">
              عرض التفاصيل
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CampaignBanner({ slug, previewThemeId }: { slug: string; previewThemeId?: string | null }) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-[var(--ci-border)] bg-gradient-to-l from-[var(--ci-primary-bg)] to-[var(--ci-secondary-bg)] p-5 text-[var(--ci-button-fg)] shadow-[0_18px_45px_rgba(49,25,18,0.12)] sm:p-7">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-black text-[#D9A33F]">
            <Megaphone className="h-4 w-4" />
            وثق تجربتك
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">صوّر تجربتك واستفد من حملات العلامة</h2>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-[var(--ci-secondary-fg)]">
            هذا القسم إعلاني فقط، وكل الإجراءات الخاصة بالمكافآت والتوثيق تتم من حساب العميل داخل صفحة خدماتي أو مكافآتي
          </p>
        </div>
        <Link
          href={getCafePath(slug, "account", previewThemeId)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ci-surface-bg)] px-5 py-3 text-sm font-black text-[var(--ci-primary-bg)]"
        >
          الانتقال لحسابي
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}


function ActiveOfferSlider({
  slug,
  offers,
  previewThemeId,
}: {
  slug: string;
  offers: CafeOffer[];
  previewThemeId?: string | null;
}) {
  const [index, setIndex] = useState(0);

  if (!offers.length) {
    return (
      <div className="mt-8 rounded-[28px] border border-dashed border-[var(--ci-border)] bg-[var(--ci-page-bg)]/60 p-6 text-center">
        <p className="text-sm font-black text-[var(--ci-muted-fg)]">لا توجد عروض نشطة حاليًا</p>
      </div>
    );
  }

  const offer = offers[index] ?? offers[0];
  const offerHref = offer.linkedProductId
    ? getCafePath(slug, `product/${offer.linkedProductId}`, previewThemeId)
    : getCafePath(slug, "products/offers", previewThemeId);

  return (
    <section className="mt-8 overflow-hidden rounded-[30px] border border-[var(--ci-border)] bg-[var(--ci-page-bg)]/70 p-5 shadow-[0_16px_45px_rgba(49,25,18,0.08)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-black text-[var(--ci-accent-bg)]">
            <Gift className="h-4 w-4" />
            عرض خاص الآن
          </p>
          <h3 className="mt-2 line-clamp-1 text-2xl font-black text-[var(--ci-page-fg)]">
            {offer.promoProductName || offer.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm font-bold leading-7 text-[var(--ci-muted-fg)]">
            {offer.promoProductDescription || offer.description || "استفد من العرض قبل انتهائه"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {offer.discountPercent ? (
              <span className="rounded-2xl bg-[var(--ci-accent-bg)] px-4 py-2 text-sm font-black text-[var(--ci-accent-fg)]">
                خصم {offer.discountPercent}%
              </span>
            ) : null}
            {offer.endDate ? (
              <span className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] px-4 py-2 text-xs font-black text-[var(--ci-muted-fg)]">
                ينتهي في {offer.endDate}
              </span>
            ) : null}
          </div>
        </div>

        <Link
          href={offerHref}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--ci-button-bg)] px-5 py-3 text-sm font-black text-[var(--ci-button-fg)]"
        >
          {offer.ctaText || "شاهد العرض"}
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>

      {offers.length > 1 ? (
        <div className="mt-5 flex justify-center gap-1.5">
          {offers.map((item, dotIndex) => (
            <button
              key={item.id}
              type="button"
              aria-label={`عرض ${dotIndex + 1}`}
              onClick={() => setIndex(dotIndex)}
              className={`h-2 rounded-full transition-all ${
                dotIndex === index
                  ? "w-8 bg-[var(--ci-button-bg)]"
                  : "w-2 bg-[var(--ci-muted-fg)]/30"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}


function distanceMeters(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number }
) {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(second.lat - first.lat);
  const dLng = toRad(second.lng - first.lng);
  const lat1 = toRad(first.lat);
  const lat2 = toRad(second.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function branchEmailStorageKey(slug: string, branchId: string, customerId: string) {
  return `barndaksa_branch_email_${slug}*${branchId}*${customerId}_${todayKey()}`;
}

function markBranchEmailPending(slug: string, branchId: string, customerId: string) {
  try {
    const key = branchEmailStorageKey(slug, branchId, customerId);
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "sent");
    return true;
  } catch {
    return false;
  }
}

function CafePageInner({ slug }: { slug: string }) {
  const { settings, previewThemeId, loadError: cafeLoadError, customIdentity, features, hydrated } = useCafeThemePage(slug);
  const hasFeature = (feature: string) => hydrated && featureCodesAllow(features, feature);
  const { products, offers, branches, categories, loading, error: menuError } = usePublicCafeMenu(slug);
  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);
  const [branchWelcome, setBranchWelcome] = useState<{
    branchName: string;
    message: string;
    distance: number;
  } | null>(null);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  useEffect(() => {
    if (!hasFeature("branches") || !branches.length || !navigator.geolocation) return;

    let cancelled = false;
    const activeGeoBranches = branches.filter(
      (branch) => branch.active !== false && branch.lat != null && branch.lng != null
    );

    if (!activeGeoBranches.length) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;

        const customerPoint = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
        };

        const nearest = activeGeoBranches
          .map((branch) => {
            const branchPoint = {
              lat: Number(branch.lat),
              lng: Number(branch.lng),
            };
            return {
              branch,
              distance: distanceMeters(customerPoint, branchPoint),
              radius: Number(branch.geofenceRadiusM ?? 50),
            };
          })
          .filter((item) => item.distance <= item.radius)
          .sort((a, b) => a.distance - b.distance)[0];

        if (!nearest) return;

        const storageKey = `barndaksa_branch_welcome_${slug}_${nearest.branch.id}_${todayKey()}`;
        let shouldShowWelcome = true;

        try {
          shouldShowWelcome = !localStorage.getItem(storageKey);
          if (shouldShowWelcome) {
            localStorage.setItem(storageKey, "shown");
          }
        } catch {
          shouldShowWelcome = true;
        }

        if (shouldShowWelcome) {
          setBranchWelcome({
            branchName: nearest.branch.name,
            message:
              nearest.branch.welcomeMessage ||
              `أهلًا بك في ${nearest.branch.name}، سعداء بزيارتك`,
            distance: Math.round(nearest.distance),
          });
        }

        if (
          customer?.id &&
          customer.email &&
          markBranchEmailPending(slug, nearest.branch.id, customer.id)
        ) {
          void sendBranchProximityEmailAction({
            cafeSlug: slug,
            branchId: nearest.branch.id,
            customerLat: customerPoint.lat,
            customerLng: customerPoint.lng,
          }).catch(() => undefined);
        }
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    return () => {
      cancelled = true;
    };
  }, [branches, slug, features, hydrated, customer?.id, customer?.email]);

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

  const cafeName = settings.cafeName || slug;
  const logoUrl = settings.logoDataUrl ?? settings.logoAssetId;
  const availableProducts = hasFeature("menu") ? products.filter((product) => product.available) : [];
  const activeOffers = hasFeature("offers")
    ? offers.filter(
        (offer) =>
          offer.visibleInCafe &&
          !["غير نشط", "inactive", "منتهي", "expired", "مسودة", "draft"].includes(
            String(offer.status ?? "")
          )
      )
    : [];
  const activeBranches = hasFeature("branches") ? branches.filter((branch) => branch.active !== false) : [];

  const featuredProducts = useMemo(() => {
    const mode = customIdentity?.featuredSectionMode ?? "latest";
    const list = [...availableProducts];

    if (mode === "offers") {
      return list.filter((item) => Boolean(item.promo)).slice(0, 6);
    }

    if (mode === "popular") {
      return list.sort((a, b) => productScore(b, 0) - productScore(a, 0)).slice(0, 6);
    }

    if (mode === "category" && customIdentity?.featuredCategoryId) {
      return list.filter((item) => item.categoryId === customIdentity.featuredCategoryId).slice(0, 6);
    }

    return list.reverse().slice(0, 6);
  }, [availableProducts, customIdentity?.featuredCategoryId, customIdentity?.featuredSectionMode]);
  const heroProduct = featuredProducts[0];

  const categoryLinks = useMemo(
    () =>
      categories
        .filter((category) => category.visible !== false)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 10),
    [categories]
  );

  const identity = customIdentity ?? defaultCustomIdentityTheme();
  const identityStyle = buildCustomIdentityCssVars(identity.palette) as CSSProperties;
  const { logoUrl: identityLogoUrl, backgroundUrl } = useCustomIdentityVisuals(identity);
  const appliedLogoUrl = getPreferredCafeDisplayLogoUrl(logoUrl, identityLogoUrl);
  const showPageBackground =
    Boolean(backgroundUrl) &&
    (identity.backgroundScope === "all-customer-pages" ||
      identity.backgroundScope === "home-only");
  const overlayOpacity = OVERLAY_OPACITY[identity.overlayStrength];

  const loadError = cafeLoadError || menuError;
  const internalAdHref = activeOffers[0]?.linkedProductId
    ? getCafePath(slug, `product/${activeOffers[0].linkedProductId}`, previewThemeId)
    : hasFeature("offers")
      ? getCafePath(slug, "products/offers", previewThemeId)
      : hasFeature("menu")
        ? getCafePath(slug, "products/popular", previewThemeId)
        : getCafePath(slug, "", previewThemeId);

  if (loading || !hydrated) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3]">
        <p className="font-black text-[#4a4540]">جاري التحميل...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3] px-4">
        <p className="text-center font-black text-[#4a4540]">{loadError}</p>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="brand-identity-custom-theme relative min-h-screen overflow-hidden bg-[var(--ci-page-bg)] pb-24 text-[var(--ci-page-fg)] md:pb-0"
      style={identityStyle}
    >
      {showPageBackground ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: identity.backgroundFit,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0"
            style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity})` }}
          />
        </>
      ) : null}

      <div className="relative z-10 min-h-screen">
      {branchWelcome ? (
        <div className="fixed inset-x-4 bottom-4 z-[90] mx-auto max-w-xl rounded-[28px] border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] p-4 shadow-[0_24px_80px_rgba(49,25,18,0.18)]">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ci-button-bg)] text-[var(--ci-button-fg)]">
              <MapPin className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-[var(--ci-accent-bg)]">
                أنت قريب من {branchWelcome.branchName}
              </p>
              <h3 className="mt-1 text-lg font-black text-[var(--ci-page-fg)]">
                {branchWelcome.message}
              </h3>
              <p className="mt-1 text-xs font-bold text-[var(--ci-muted-fg)]">
                تم رصدك داخل نطاق الترحيب، على بعد تقريبًا {branchWelcome.distance} متر
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBranchWelcome(null)}
              className="mr-auto rounded-xl bg-[var(--ci-page-bg)] px-3 py-2 text-xs font-black text-[var(--ci-primary-bg)]"
            >
              إغلاق
            </button>
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-40 border-b border-[var(--ci-border)] bg-[var(--ci-page-bg)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href={getCafePath(slug, "", previewThemeId)} className="flex min-w-0 items-center gap-3">
            <CafeLogo name={cafeName} logoUrl={appliedLogoUrl} size="sm" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black">{cafeName}</h1>
              <p className="text-xs font-bold text-[var(--ci-muted-fg)]">الفرع الإلكتروني</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 lg:flex">
            <Link href={getCafePath(slug, "products/latest", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg)] hover:bg-[var(--ci-surface-bg)]">
              أحدث المنتجات
            </Link>
            {hasFeature("offers") ? (
              <Link href={getCafePath(slug, "products/offers", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg)] hover:bg-[var(--ci-surface-bg)]">
                العروض
              </Link>
            ) : null}
            <Link href={getCafePath(slug, "products/popular", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg)] hover:bg-[var(--ci-surface-bg)]">
              المنتجات
            </Link>
            {hasFeature("branches") ? (
              <Link href={getCafePath(slug, "products/branches", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg)] hover:bg-[var(--ci-surface-bg)]">
                الفروع
              </Link>
            ) : null}
          </nav>

          <div className="flex items-center gap-2">
            {hasFeature("loyalty") ? (
              <Link
                href={getCafePath(slug, "account", previewThemeId)}
                className="hidden items-center gap-2 rounded-2xl border border-[#6B3A25] px-4 py-2 text-sm font-black text-[var(--ci-primary-bg)] sm:inline-flex"
                title="بطاقة الولاء الخاصة بالعلامة التجارية"
              >
                <WalletCards className="h-4 w-4" />
                بطاقة الولاء
              </Link>
            ) : null}
            <Link
              href={customer ? getCafePath(slug, "account", previewThemeId) : getCafePath(slug, "login", previewThemeId)}
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--ci-button-bg)] px-4 py-2 text-sm font-black text-[var(--ci-button-fg)]"
            >
              <UserRound className="h-4 w-4" />
              {customer ? "حسابي" : "دخول"}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="barndaksa-premium-hero overflow-hidden rounded-[40px] border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] p-4 shadow-[0_30px_96px_rgba(49,25,18,0.16)] sm:p-6 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr] lg:items-stretch">
            <div className="flex min-w-0 flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ci-page-bg)] px-3 py-1 text-xs font-black text-[var(--ci-primary-bg)]">
                    <Star className="h-3.5 w-3.5 text-[var(--ci-accent-bg)]" />
                    تجربة جوال مصممة كواجهة تطبيق
                  </span>
                  {activeBranches.length ? (
                    <span className="inline-flex rounded-full bg-[var(--ci-page-bg)] px-3 py-1 text-xs font-black text-[var(--ci-muted-fg)]">
                      {activeBranches.length} فرع
                    </span>
                  ) : null}
                </div>
                <p className="mt-6 text-sm font-black text-[var(--ci-accent-bg)]">مرحبًا بك في</p>
                <h2 className="mt-2 text-balance text-4xl font-black leading-[1.05] text-[var(--ci-page-fg)] sm:text-5xl lg:text-6xl">
                  {cafeName}
                </h2>
                <p className="mt-4 max-w-2xl text-sm font-bold leading-7 text-[var(--ci-muted-fg)] sm:text-base sm:leading-8">
                  {settings.description || "استعرض المنتجات والعروض والحجوزات وبطاقة الولاء من شاشة واحدة مصممة للجوال أولًا."}
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {hasFeature("menu") ? (
                  <Link href={getCafePath(slug, "products/popular", previewThemeId)} className="barndaksa-cta-motion inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--ci-button-bg)] px-5 py-4 font-black text-[var(--ci-button-fg)] shadow-lg transition active:scale-[0.985]">
                    <ShoppingBag className="h-5 w-5" />
                    المنتجات
                  </Link>
                ) : null}
                {hasFeature("offers") ? (
                  <Link href={getCafePath(slug, "products/offers", previewThemeId)} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[var(--ci-primary-bg)] bg-white/25 px-5 py-4 font-black text-[var(--ci-primary-bg)] backdrop-blur transition active:scale-[0.985]">
                    <BadgePercent className="h-5 w-5" />
                    العروض
                  </Link>
                ) : null}
                {hasFeature("reservations") ? (
                  <Link href={getCafePath(slug, "reserve", previewThemeId)} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[var(--ci-primary-bg)] bg-white/25 px-5 py-4 font-black text-[var(--ci-primary-bg)] backdrop-blur transition active:scale-[0.985]">
                    <CalendarDays className="h-5 w-5" />
                    الحجوزات
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_0.72fr] lg:grid-cols-1">
              <div className="barndaksa-premium-card overflow-hidden rounded-[34px] border border-[var(--ci-border)] bg-[var(--ci-page-bg)] shadow-[0_20px_70px_rgba(49,25,18,0.12)]">
                <div className="relative h-72 sm:h-80 lg:h-[420px]">
                  {heroProduct ? (
                    <>
                      <ProductMediaDisplay
                        product={heroProduct}
                        alt={heroProduct.name}
                        className="h-full w-full object-cover"
                        fallback={
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--ci-primary-bg)] to-[var(--ci-secondary-bg)]">
                            <Coffee className="h-16 w-16 text-white/80" />
                          </div>
                        }
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/68 to-transparent p-5 text-white">
                        <p className="text-xs font-black text-[var(--ci-accent-bg)]">مختار من المنيو</p>
                        <h3 className="mt-1 line-clamp-1 text-2xl font-black">{heroProduct.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs font-bold text-white/78">
                          {heroProduct.description || "منتج بارز من العلامة"}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--ci-primary-bg)] to-[var(--ci-secondary-bg)]">
                      <Coffee className="h-16 w-16 text-white/80" />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-[28px] bg-[var(--ci-page-bg)]/76 p-2 backdrop-blur sm:grid-cols-1 lg:grid-cols-3">
                {[
                  [ShoppingBag, "منتجات", availableProducts.length],
                  [Gift, "عروض", activeOffers.length],
                  [Heart, "تجربة", "سريعة"],
                ].map(([Icon, label, value]) => {
                  const I = Icon as ElementType;
                  return (
                    <div key={label as string} className="rounded-2xl bg-[var(--ci-surface-bg)] px-3 py-3 text-center shadow-sm">
                      <I className="mx-auto h-4 w-4 text-[var(--ci-accent-bg)]" />
                      <p className="mt-1 text-[11px] font-black text-[var(--ci-muted-fg)]">{label as string}</p>
                      <p className="font-black text-[var(--ci-page-fg)]">{value as string | number}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <ActiveOfferSlider
            slug={slug}
            offers={activeOffers}
            previewThemeId={previewThemeId}
          />
        </section>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.72fr]">
          <InternalAdPanel
            title={activeOffers[0]?.promoProductName || activeOffers[0]?.title || "مساحة عروض العلامة"}
            eyebrow="إعلان رئيسي داخل التجربة"
            description={activeOffers[0]?.description || "مساحة ذكية بعد الـ Hero تقود العميل مباشرة إلى العروض أو المنتجات بدون مغادرة تجربة الفرع."}
            href={internalAdHref}
            cta={activeOffers[0]?.ctaText || "مشاهدة العرض"}
            metric={activeOffers.length ? `${activeOffers.length} عروض` : `${availableProducts.length} منتج`}
          />
          <BrandPwaInstallSection slug={slug} cafeName={cafeName} compact />
        </div>

        {hasFeature("menu") ? (
          <>
        <section className="mt-8">
          <PremiumSectionHeader
            eyebrow="الأقسام"
            title="تصفح حسب التصنيف"
            description="تصنيفات أفقية سهلة اللمس على الجوال، وتبقى مرتبطة بنفس صفحات المنتجات الحالية."
            action={
              <Link href={getCafePath(slug, "products/popular", previewThemeId)} className="text-sm font-black text-[var(--ci-primary-bg)]">
              كل المنتجات
              </Link>
            }
          />
          <div className="flex gap-3 overflow-x-auto pb-2">
            {categoryLinks.length ? (
              categoryLinks.map((category) => (
                <Link
                  key={category.id}
                  href={`${getCafePath(slug, "products/popular", previewThemeId)}?category=${encodeURIComponent(category.name)}`}
                  className="shrink-0 rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] px-5 py-3 text-sm font-black text-[var(--ci-primary-bg)] shadow-sm"
                >
                  {category.name}
                </Link>
              ))
            ) : (
              <span className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] px-5 py-3 text-sm font-black text-[var(--ci-muted-fg)]">
                لا توجد تصنيفات
              </span>
            )}
          </div>
        </section>

        <section className="mt-8">
          <PremiumSectionHeader
            eyebrow="المنتجات"
            title="منتجات مختارة"
            description="بطاقات واسعة تكشف الصورة والسعر والمكونات بدون نقل العميل بعيدًا عن مسار الشراء."
            action={
              <Link href={getCafePath(slug, "products/latest", previewThemeId)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] px-4 py-2 text-sm font-black text-[var(--ci-primary-bg)]">
              أحدث المنتجات
              <ArrowLeft className="h-4 w-4" />
              </Link>
            }
          />

          <div className="grid gap-5 xl:grid-cols-2">
            {featuredProducts.length ? (
              featuredProducts.map((product) => (
                <ProductShowcaseCard
                  key={product.id}
                  slug={slug}
                  product={product}
                  previewThemeId={previewThemeId}
                />
              ))
            ) : (
              <div className="rounded-[28px] border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] p-8 text-center font-black text-[var(--ci-muted-fg)] xl:col-span-2">
                لا توجد منتجات متاحة حاليًا
              </div>
            )}
          </div>
        </section>
          </>
        ) : null}

        <div className="mt-8">
          <SocialProofPanel
            cafeName={cafeName}
            productCount={availableProducts.length}
            offerCount={activeOffers.length}
            branchCount={activeBranches.length}
          />
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <CampaignBanner slug={slug} previewThemeId={previewThemeId} />

          {hasFeature("branches") ? (
            <section className="rounded-[32px] border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] p-6 shadow-sm">
              <MapPin className="h-8 w-8 text-[#D9A33F]" />
              <h2 className="mt-3 text-2xl font-black">الفروع ومواعيد الاستلام</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-[var(--ci-muted-fg)]">
                {activeBranches.length
                  ? `لديك ${activeBranches.length} فرع متاح للزيارة والاستلام`
                  : "لم يتم إضافة فروع متاحة بعد"}
              </p>
              <Link href={getCafePath(slug, "products/branches", previewThemeId)} className="mt-5 inline-flex rounded-2xl bg-[var(--ci-button-bg)] px-5 py-3 text-sm font-black text-[var(--ci-button-fg)]">
                عرض الفروع
              </Link>
            </section>
          ) : null}
        </div>
      </div>
      <CustomerQuickDock
        items={buildCustomerQuickDockItems({
          slug,
          homeHref: getCafePath(slug, "", previewThemeId),
          productsHref: getCafePath(slug, "products/popular", previewThemeId),
          reserveHref: getCafePath(slug, "reserve", previewThemeId),
          loyaltyHref: getCafePath(slug, "account", previewThemeId),
          accountHref: getCafePath(slug, "account", previewThemeId),
          loginHref: getCafePath(slug, "login", previewThemeId),
          isCustomer: Boolean(customer),
          hasProducts: hasFeature("menu"),
          hasReservations: hasFeature("reservations"),
          hasLoyalty: hasFeature("loyalty"),
          active: "home",
        })}
      />
      </div>
    </main>
  );
}

export function CafePageClient({ slug }: { slug: string }) {
  return (
    <Suspense
      fallback={
        <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3]">
          <p className="font-black text-[#4a4540]">جاري التحميل...</p>
        </main>
      }
    >
      <CafePageInner slug={slug} />
    </Suspense>
  );
}
