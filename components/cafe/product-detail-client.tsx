"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Coffee,
  Sparkles,
  Ticket,
  Utensils,
} from "lucide-react";
import { formatSar } from "@/lib/format";
import {
  promoBadgeText,
  productFinalPrice,
  type EventTicketSettings,
  type MenuProduct,
} from "@/lib/mock/menu";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { PublicBrowserNav } from "@/components/cafe/public-browser-nav";
import { PublicFeatureUnavailable } from "@/components/cafe/public-feature-guard";
import { ThemedProductDetailLayout } from "@/components/cafe/themes/themed-product-detail";
import { getCafePath } from "@/lib/cafe/theme-links";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { ProductCinematicShowcase } from "@/components/cafe/product-cinematic-showcase";
import { resolveProductCategoryLabel } from "@/lib/cafe/menu-category-utils";
import { getBusinessCopy } from "@/lib/platform/business-copy";
import { publicFeatureAllows } from "@/lib/platform/public-feature-access";

type Props = {
  slug: string;
  id: string;
  initialProduct: MenuProduct | null;
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(date);
}

function EventDetails({
  settings,
  mutedClass,
}: {
  settings: EventTicketSettings;
  mutedClass: string;
}) {
  const details = [
    ["نوع التذكرة", settings.ticketType],
    ["الموقع", settings.venueName],
    ["البوابة", settings.gateName],
    ["بداية الفعالية", formatDate(settings.eventStartAt)],
    ["نهاية الفعالية", formatDate(settings.eventEndAt)],
    ["صالحة من", formatDate(settings.ticketValidFrom)],
    ["صالحة حتى", formatDate(settings.ticketValidUntil)],
    [
      "الحد لكل عميل",
      settings.maxPerCustomer
        ? `${settings.maxPerCustomer.toLocaleString("ar-SA")} تذكرة`
        : null,
    ],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  if (!details.length) return null;

  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {details.map(([label, value]) => (
        <div key={label} className="border-b border-black/5 pb-3">
          <dt className={`text-xs font-black ${mutedClass}`}>{label}</dt>
          <dd className="mt-1 break-words text-sm font-black">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProductDetailClient({ slug, id, initialProduct }: Props) {
  const {
    theme,
    settings,
    experience,
    previewThemeId,
    features,
  } = useCafePageContext(slug);
  const copy = getBusinessCopy(settings.businessCategory);
  const isEvents = copy.kind === "events";
  const ProductFallbackIcon =
    copy.kind === "events" ? CalendarDays : copy.kind === "restaurant" ? Utensils : Coffee;
  const menuEnabled = publicFeatureAllows(features, "menu");
  const product = initialProduct?.id === id ? initialProduct : null;
  const productsHref = getCafePath(slug, "products/popular", previewThemeId);

  if (!menuEnabled) {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <PublicBrowserNav
          slug={slug}
          previewThemeId={previewThemeId}
          features={features}
          active="product"
        />
        <PublicFeatureUnavailable
          slug={slug}
          feature="menu"
          previewThemeId={previewThemeId}
        />
      </CafeLayout>
    );
  }

  if (!product) {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <h1 className="text-3xl font-black">
            {isEvents ? "التذكرة غير موجودة" : "المنتج غير موجود"}
          </h1>
          <Link href={productsHref} className={`mt-5 inline-block px-6 py-3 font-black ${theme.button}`}>
            {isEvents ? "استكشف التذاكر" : "استكشف المنتجات"}
          </Link>
        </div>
      </CafeLayout>
    );
  }

  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscount = Boolean(product.promo && finalPrice < product.price);
  const categoryLabel = resolveProductCategoryLabel(product);
  const availabilityLabel = product.available ? "متاح حاليًا" : "غير متاح حاليًا";
  const eventSettings = product.eventTicketSettings ?? null;
  const checkinPolicyLabel =
    eventSettings?.checkinPolicy === "single_use"
      ? "دخول لمرة واحدة"
      : eventSettings?.checkinPolicy === "multi_use"
        ? "دخول متعدد"
        : null;
  const highlights = [
    product.preparationTimeMinutes
      ? {
          icon: Clock,
          label: "وقت التجهيز",
          value: `${product.preparationTimeMinutes} دقيقة`,
        }
      : null,
    product.calories
      ? {
          icon: Sparkles,
          label: "السعرات",
          value: `${product.calories.toLocaleString("ar-SA")} سعرة`,
        }
      : null,
    isEvents && eventSettings?.capacity
      ? {
          icon: Ticket,
          label: "السعة",
          value: `${eventSettings.capacity.toLocaleString("ar-SA")} شخص`,
        }
      : null,
    isEvents && checkinPolicyLabel
      ? {
          icon: Ticket,
          label: "سياسة الدخول",
          value: checkinPolicyLabel,
        }
      : null,
  ].filter((highlight): highlight is NonNullable<typeof highlight> => Boolean(highlight)).slice(0, 4);
  const hasEventDetails = Boolean(
    eventSettings &&
      [
        eventSettings.ticketType,
        eventSettings.venueName,
        eventSettings.gateName,
        eventSettings.eventStartAt,
        eventSettings.eventEndAt,
        eventSettings.ticketValidFrom,
        eventSettings.ticketValidUntil,
        eventSettings.maxPerCustomer,
      ].some(Boolean),
  );
  const hasPromoPeriod = Boolean(product.promo?.startDate || product.promo?.endDate);
  const hasProductDetails = Boolean(
    product.ingredients.length || hasEventDetails || hasPromoPeriod,
  );

  const imageSlot = (
    <div className="premium-product-enter premium-product-enter-media min-w-0">
      <ProductCinematicShowcase
        productName={product.name}
        categoryLabel={categoryLabel}
        availabilityLabel={availabilityLabel}
        hasVideo={Boolean(product.videoAssetId)}
      >
        <ProductMediaDisplay
          product={product}
          alt={product.name}
          className="relative z-10 max-h-full w-full object-contain p-3 sm:p-5"
          fallback={<ProductFallbackIcon className="relative z-10 h-16 w-16 opacity-40" />}
        />
      </ProductCinematicShowcase>
    </div>
  );

  const infoSlot = (
    <div className="min-w-0 lg:py-2">
      <p data-product-field="category" className={`premium-product-enter premium-product-enter-category text-xs font-black sm:text-sm ${theme.accent}`}>
        {categoryLabel}
      </p>
      <h1
        className={`premium-product-enter premium-product-enter-name mt-2 break-words text-3xl font-black leading-[1.15] sm:text-4xl lg:text-[2.75rem] ${experience.headingTracking}`}
      >
        {product.name}
      </h1>
      <span
        data-product-field="availability"
        className={`premium-product-enter mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}
      >
        {availabilityLabel}
      </span>
      {product.description ? (
        <p
          data-product-field="description"
          className={`premium-product-enter premium-product-enter-description mt-4 max-w-[60ch] break-words text-sm font-bold leading-7 sm:text-base ${theme.muted}`}
        >
          {product.description}
        </p>
      ) : null}

      <div data-product-field="price" className="premium-product-enter premium-product-enter-price mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-3xl font-black sm:text-4xl">{formatSar(finalPrice)}</span>
        {hasDiscount ? (
          <span className={`text-sm font-black line-through sm:text-base ${theme.muted}`}>
            {formatSar(product.price)}
          </span>
        ) : null}
        {product.promo ? (
          <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>
            {promoBadgeText(product.promo)}
          </span>
        ) : null}
      </div>

      {highlights.length ? (
        <dl className="premium-product-enter premium-product-enter-highlights mt-6 grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 border-t border-black/5 pt-5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          {highlights.map((highlight) => (
            <div key={highlight.label} className="min-w-0">
              <dt className={`flex items-center gap-1.5 text-[11px] font-black ${theme.muted}`}>
                <highlight.icon className={`h-4 w-4 shrink-0 ${theme.accent}`} />
                <span className="truncate">{highlight.label}</span>
              </dt>
              <dd className="mt-1 break-words text-sm font-black leading-5">{highlight.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );

  return (
    <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
      <div className="min-w-0 pb-8">
        <header className="mb-4 flex min-w-0 items-center sm:mb-6">
          <Link
            href={productsHref}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/5 px-3 text-sm font-black transition hover:-translate-y-0.5 active:translate-y-0 ${theme.card}`}
          >
            <ArrowRight className={`h-4 w-4 ${theme.accent}`} />
            <span>رجوع إلى المنتجات</span>
          </Link>
        </header>

        <main className="min-w-0">
          <ThemedProductDetailLayout
            experience={experience}
            imageSlot={imageSlot}
            infoSlot={infoSlot}
          />

          {hasProductDetails ? (
            <section
              className={`premium-product-reveal mx-auto mt-7 max-w-5xl rounded-2xl border border-black/5 p-5 shadow-[0_14px_40px_rgba(49,25,18,0.06)] sm:mt-9 sm:p-7 ${theme.card}`}
            >
              <h2 className="text-xl font-black sm:text-2xl">تفاصيل المنتج</h2>
            {product.ingredients.length ? (
              <div className="mt-5">
                <h3 className="text-sm font-black">
                  {isEvents ? "محتويات الباقة" : "المكونات"}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.ingredients.map((ingredient) => (
                    <span
                      key={ingredient}
                      className={`max-w-full break-words rounded-full px-3 py-1.5 text-xs font-black sm:text-sm ${theme.badge}`}
                    >
                      {ingredient}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {hasEventDetails && eventSettings ? (
              <div className="mt-7">
                <h3 className="mb-5 text-lg font-black">تفاصيل الفعالية والتذكرة</h3>
                <EventDetails settings={eventSettings} mutedClass={theme.muted} />
              </div>
            ) : null}

            {hasPromoPeriod && product.promo ? (
              <dl className="mt-7 border-t border-black/5 pt-5">
                <div>
                  <dt className={`text-xs font-black ${theme.muted}`}>فترة العرض</dt>
                  <dd className="mt-1 break-words text-sm font-black">
                    {formatDate(product.promo.startDate)} — {formatDate(product.promo.endDate)}
                  </dd>
                </div>
              </dl>
            ) : null}
            </section>
          ) : null}

          <section className="premium-product-reveal mx-auto mt-7 max-w-5xl text-center sm:mt-9">
            <Link
              href={productsHref}
              className={`inline-flex min-h-12 items-center justify-center gap-2 px-6 font-black transition hover:-translate-y-0.5 active:translate-y-0 ${theme.button}`}
            >
              استكشف بقية المنتجات
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </main>
      </div>

      <style jsx global>{`
        .premium-product-enter {
          animation: premium-product-enter 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .premium-product-enter-category { animation-delay: 40ms; }
        .premium-product-enter-name { animation-delay: 90ms; }
        .premium-product-enter-description { animation-delay: 140ms; }
        .premium-product-enter-price { animation-delay: 190ms; }
        .premium-product-enter-offer { animation-delay: 230ms; }
        .premium-product-enter-highlights { animation-delay: 270ms; }
        .premium-product-reveal {
          animation: premium-product-reveal 480ms 220ms ease-out both;
        }
        @keyframes premium-product-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes premium-product-reveal {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .premium-product-enter,
          .premium-product-reveal {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </CafeLayout>
  );
}
