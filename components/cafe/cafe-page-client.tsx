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
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import {
  InternalAdPanel,
  PremiumSectionHeader,
  SocialProofPanel,
} from "@/components/cafe/themes/customer-experience-primitives";
import {
  AppLoyaltyCard,
  CustomerBottomDock,
  MobileBrandMasthead,
  ProductPosterCard,
  defaultCustomerDockItems,
} from "@/components/cafe/themes/customer-mobile-experience";
import { useCafeThemePage } from "@/lib/cafe/use-cafe-theme-page";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";
import { buildCustomIdentityCssVars, defaultCustomIdentityTheme, OVERLAY_OPACITY } from "@/lib/mock/custom-identity-theme";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { getCafePath, getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { resolveProductCategoryLabel } from "@/lib/cafe/menu-category-utils";
import { getCustomerSession, type BarndaksaCustomerSession } from "@/lib/customer/session";
import { formatSar } from "@/lib/format";
import type { CafeOffer } from "@/lib/mock/offers";
import type { ExperienceCampaign } from "@/lib/mock/experience-campaigns";
import {
  isPromoActive,
  productFinalPrice,
  promoBadgeText,
  type MenuProduct,
} from "@/lib/mock/menu";
import { trackCafeVisitAction } from "@/app/actions/platform-upgrade";
import { sendBranchProximityEmailAction } from "@/app/actions/customer";
import { fetchCustomerAccountSnapshotAction } from "@/app/actions/customer-account";

type HomeLoyaltySnapshot = Awaited<ReturnType<typeof fetchCustomerAccountSnapshotAction>>["data"]["loyalty"];

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

function offerCardHref(slug: string, offer: CafeOffer, previewThemeId?: string | null) {
  if (offer.targetType === "reservation" || offer.type === "عرض حجز") {
    return getCafePath(slug, "reserve", previewThemeId);
  }
  if (offer.linkedProductId) {
    return getCafePath(slug, `product/${offer.linkedProductId}`, previewThemeId);
  }
  return getCafePath(slug, "products/offers", previewThemeId);
}

function offerDestinationLabel(offer: CafeOffer) {
  if (offer.targetType === "reservation" || offer.type === "عرض حجز") return "الحجوزات";
  if (offer.targetType === "experience_campaign") return "توثيق التجربة";
  return "المنتجات";
}

function campaignRewardLabel(campaign: ExperienceCampaign) {
  if (campaign.rewardType === "free_order") return "طلب مجاني";
  if (campaign.rewardType === "reservation") return "حجز مجاني";
  if (campaign.rewardType === "discount") {
    return campaign.rewardDiscountPercent ? `خصم ${campaign.rewardDiscountPercent}%` : "خصم";
  }
  return "منتج مجاني";
}

function campaignMetaLabel(campaign: ExperienceCampaign) {
  return `${campaignRewardLabel(campaign)} · ${campaign.startDate} إلى ${campaign.endDate}`;
}

function promoTitleClass(title: string) {
  const length = title.trim().length;
  if (length > 56) return "text-sm leading-6";
  if (length > 34) return "text-base leading-6";
  return "text-lg leading-7";
}

function promoSubtitle(value: string) {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= 92) return compacted;
  return `${compacted.slice(0, 89).trim()}...`;
}

function PromoVisual({
  title,
  subtitle,
  imageAssetId,
  accentLabel,
  destinationLabel,
  metaLabel,
}: {
  title: string;
  subtitle: string;
  imageAssetId?: string;
  accentLabel: string;
  destinationLabel: string;
  metaLabel?: string;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--ci-primary-bg)]">
      {imageAssetId ? (
        <LocalAssetImage
          assetId={imageAssetId}
          publicBucket="offer-banners"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          fallback={
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--ci-primary-bg) 0%, var(--ci-secondary-bg) 54%, var(--ci-accent-bg) 100%)",
              }}
            />
          }
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, var(--ci-primary-bg) 0%, var(--ci-secondary-bg) 54%, var(--ci-accent-bg) 100%)",
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/38 to-black/14" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.42))]" />
      <div className="relative flex h-full min-h-0 flex-col justify-between p-4 text-white">
        <span className="max-w-full self-start truncate rounded-full bg-white/88 px-3 py-1 text-[10px] font-black text-[#311912] shadow-sm">
          {accentLabel}
        </span>
        <div className="min-h-0">
          <h3 className={`line-clamp-2 font-black ${promoTitleClass(title)}`}>{title}</h3>
          {subtitle ? (
            <p className="mt-1.5 line-clamp-2 text-[11px] font-bold leading-5 text-white/86">
              {promoSubtitle(subtitle)}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-black text-white/82">
            <span className="truncate">{destinationLabel}</span>
            {metaLabel ? <span className="min-w-0 truncate text-white/72">{metaLabel}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function HomePromoSections({
  slug,
  offers,
  campaigns,
  previewThemeId,
}: {
  slug: string;
  offers: CafeOffer[];
  campaigns: ExperienceCampaign[];
  previewThemeId?: string | null;
}) {
  const visibleOffers = offers.slice(0, 8);
  const visibleCampaigns = campaigns.filter((campaign) => campaign.status === "active").slice(0, 8);

  if (!visibleOffers.length && !visibleCampaigns.length) return null;

  return (
    <div className="mt-8 space-y-8">
      {visibleOffers.length ? (
        <section>
          <PremiumSectionHeader eyebrow="العروض" title="بطاقات مختارة لك" />
          <div className="flex snap-x gap-4 overflow-x-auto pb-3">
            {visibleOffers.map((offer) => (
              <Link
                key={offer.id}
                href={offerCardHref(slug, offer, previewThemeId)}
                className="relative block h-[188px] w-[238px] shrink-0 snap-start overflow-hidden rounded-[24px] border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] shadow-[0_14px_34px_rgba(49,25,18,0.12)] transition active:scale-[0.98]"
              >
                <PromoVisual
                  title={offer.promoProductName || offer.title}
                  subtitle={offer.promoProductDescription || offer.description || "عرض متاح لفترة محدودة"}
                  imageAssetId={offer.cardStoragePath || offer.bannerAssetId}
                  accentLabel={offer.discountPercent ? `خصم ${offer.discountPercent}%` : offer.type}
                  destinationLabel={offerDestinationLabel(offer)}
                />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {visibleCampaigns.length ? (
        <section>
          <PremiumSectionHeader eyebrow="حملات توثيق التجربة" title="شارك تجربتك واستفد" />
          <div className="flex snap-x gap-4 overflow-x-auto pb-3">
            {visibleCampaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={getCafePath(slug, "account", previewThemeId)}
                className="relative block h-[188px] w-[238px] shrink-0 snap-start overflow-hidden rounded-[24px] border border-[var(--ci-border)] bg-[var(--ci-surface-bg)] shadow-[0_14px_34px_rgba(49,25,18,0.12)] transition active:scale-[0.98]"
              >
                <PromoVisual
                  title={campaign.title}
                  subtitle={campaign.description || campaign.terms || "وثّق تجربتك واحصل على مكافأة"}
                  imageAssetId={campaign.cardStoragePath}
                  accentLabel="وثّق تجربتك"
                  destinationLabel="المكافآت والتوثيق"
                  metaLabel={campaignMetaLabel(campaign)}
                />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
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
  const { products, offers, branches, categories, experienceCampaigns, loading, error: menuError } = usePublicCafeMenu(slug);
  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);
  const [customerChecked, setCustomerChecked] = useState(false);
  const [homeLoyalty, setHomeLoyalty] = useState<HomeLoyaltySnapshot | null>(null);
  const [branchWelcome, setBranchWelcome] = useState<{
    branchName: string;
    message: string;
    distance: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCustomerChecked(false);
    void getCustomerSession(slug).then((session) => {
      if (cancelled) return;
      setCustomer(session);
      setCustomerChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!customer || !hasFeature("loyalty")) {
      setHomeLoyalty(null);
      return;
    }

    let cancelled = false;
    void fetchCustomerAccountSnapshotAction(slug)
      .then((result) => {
        if (cancelled) return;
        setHomeLoyalty(result.success ? result.data.loyalty : null);
      })
      .catch(() => {
        if (!cancelled) setHomeLoyalty(null);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, customer?.id, features, hydrated]);

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

  const loadError = cafeLoadError;
  const menuFallbackActive = Boolean(menuError);
  const internalAdHref = activeOffers[0]?.linkedProductId
    ? getCafePath(slug, `product/${activeOffers[0].linkedProductId}`, previewThemeId)
    : hasFeature("offers")
      ? getCafePath(slug, "products/offers", previewThemeId)
      : hasFeature("menu")
        ? getCafePath(slug, "products/popular", previewThemeId)
        : getCafePath(slug, "", previewThemeId);

  useEffect(() => {
    if (menuFallbackActive && process.env.NODE_ENV === "development") {
      console.warn("[cafe-page] using empty menu fallback", { slug });
    }
  }, [menuFallbackActive, slug]);

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



      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <MobileBrandMasthead
          cafeName={cafeName}
          logoUrl={appliedLogoUrl}
          subtitle={settings.description}
        />

        {hasFeature("loyalty") ? (
          <div className="mx-auto mt-6 max-w-xl lg:max-w-3xl">
            <AppLoyaltyCard
              customerName={homeLoyalty?.card.customerName || customer?.fullName}
              code={homeLoyalty?.card.cardCode || customer?.id?.slice(0, 8).toUpperCase()}
              points={homeLoyalty?.card.availableRewards ?? 0}
              current={homeLoyalty?.card.stampsInCycle ?? 0}
              required={homeLoyalty?.program.purchasesRequired ?? 7}
              isAuthenticated={Boolean(customer)}
              loginHref={customerChecked ? getCustomerLoginHref(slug, `/c/${slug}`, previewThemeId) : undefined}
              onClickHref={customer ? getCafePath(slug, "account", previewThemeId) : undefined}
              businessCategory={settings.businessCategory}
            />
          </div>
        ) : null}

        <div className="mx-auto mt-5 flex max-w-xl justify-center lg:max-w-3xl">
          <BrandPwaInstallSection slug={slug} cafeName={cafeName} compact />
        </div>

        {hasFeature("menu") && featuredProducts.length ? (
          <section className="mt-8">
            <div className="flex items-start justify-between gap-3">
              <PremiumSectionHeader
                eyebrow="أحدث المنتجات"
                title="منتجات مختارة"
              />
              <Link
                href={getCafePath(slug, "products/latest", previewThemeId)}
                className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-2xl bg-[var(--ci-button-bg)] px-4 py-2 text-xs font-black text-[var(--ci-button-fg)]"
              >
                كل المنتجات
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex snap-x gap-4 overflow-x-auto pb-3">
              {featuredProducts.concat(featuredProducts).slice(0, 10).map((product, index) => (
                <div key={`${product.id}-${index}`} className="snap-start">
                  <ProductPosterCard
                    product={product}
                    href={getCafePath(slug, `product/${product.id}`, previewThemeId)}
                    compact
                  />
                </div>
              ))}
            </div>
          </section>
        ) : hasFeature("menu") ? (
          <section className="mt-8 rounded-[28px] border border-dashed border-[var(--ci-border)] bg-[var(--ci-surface-bg)]/75 p-6 text-center">
            <p className="text-sm font-black text-[var(--ci-muted-fg)]">
              {menuFallbackActive ? "تعذر تحميل المنيو الآن، وستظهر المنتجات عند توفرها." : "لا توجد منتجات متاحة حاليا."}
            </p>
          </section>
        ) : null}



        <HomePromoSections
          slug={slug}
          offers={activeOffers}
          campaigns={hasFeature("experience_reviews") ? experienceCampaigns : []}
          previewThemeId={previewThemeId}
        />
      </div>
      <CustomerBottomDock
        {...defaultCustomerDockItems({
          slug,
          previewThemeId,
          isCustomer: Boolean(customer),
          hasProducts: hasFeature("menu"),
          hasOrders: hasFeature("reservations") || hasFeature("menu"),
          hasRewards: hasFeature("loyalty"),
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
