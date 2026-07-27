"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Coffee,
  MapPin,
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
    ["السعة", settings.capacity ? `${settings.capacity.toLocaleString("ar-SA")} شخص` : null],
    [
      "سياسة الدخول",
      settings.checkinPolicy === "single_use"
        ? "دخول لمرة واحدة"
        : settings.checkinPolicy === "multi_use"
          ? "دخول متعدد"
          : null,
    ],
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
    {
      icon: product.available ? Coffee : Clock,
      label: "التوفر",
      value: availabilityLabel,
    },
    isEvents && eventSettings?.capacity
      ? {
          icon: Ticket,
          label: "السعة",
          value: `${eventSettings.capacity.toLocaleString("ar-SA")} شخص`,
        }
      : null,
  ].filter((highlight): highlight is NonNullable<typeof highlight> => Boolean(highlight)).slice(0, 4);

  const imageSlot = (
    <div className="premium-product-enter premium-product-enter-media">
      <ProductCinematicShowcase
        productName={product.name}
        categoryLabel={categoryLabel}
        promoLabel={product.promo ? promoBadgeText(product.promo) : undefined}
        availabilityLabel={availabilityLabel}
        hasVideo={Boolean(product.videoAssetId)}
      >
        <ProductMediaDisplay
          product={product}
          alt={product.name}
          className="relative z-10 max-h-full w-full object-contain p-5 sm:p-8"
          fallback={<ProductFallbackIcon className="relative z-10 h-16 w-16 opacity-40" />}
        />
      </ProductCinematicShowcase>
    </div>
  );

  const infoSlot = (
    <div className="min-w-0">
      <p className={`premium-product-enter premium-product-enter-category text-sm font-black ${theme.accent}`}>
        {categoryLabel}
      </p>
      <h1
        className={`premium-product-enter premium-product-enter-name mt-2 break-words text-3xl font-black leading-[1.18] sm:text-4xl lg:text-5xl ${experience.headingTracking}`}
      >
        {product.name}
      </h1>
      {product.description ? (
        <p
          className={`premium-product-enter premium-product-enter-description mt-5 max-w-[62ch] break-words text-base font-bold leading-8 ${theme.muted}`}
        >
          {product.description}
        </p>
      ) : null}

      <div className="premium-product-enter premium-product-enter-price mt-6 flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="text-3xl font-black sm:text-4xl">{formatSar(finalPrice)}</span>
        {hasDiscount ? (
          <span className={`pb-1 text-base font-black line-through ${theme.muted}`}>
            {formatSar(product.price)}
          </span>
        ) : null}
      </div>

      {product.promo ? (
        <div
          className={`premium-product-enter premium-product-enter-offer mt-4 border-r-4 border-[var(--ci-accent,var(--barndaksa-coffee-brown))] py-1 pr-4 ${theme.accent}`}
        >
          <p className="text-xs font-black">العرض الحالي</p>
          <p className="mt-1 text-lg font-black">{promoBadgeText(product.promo)}</p>
        </div>
      ) : null}

      <div className="premium-product-enter premium-product-enter-highlights mt-7 flex flex-wrap gap-x-6 gap-y-3 border-y border-black/5 py-4">
        {highlights.map((highlight) => (
          <div
            key={highlight.label}
            className="group flex min-w-[132px] items-center gap-3 rounded-xl px-2 py-1 transition hover:-translate-y-0.5 hover:bg-black/[0.025]"
          >
            <highlight.icon className={`h-5 w-5 shrink-0 ${theme.accent}`} />
            <div>
              <p className={`text-[11px] font-black ${theme.muted}`}>{highlight.label}</p>
              <p className="mt-0.5 text-sm font-black">{highlight.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
      <div className="min-w-0 space-y-6 pb-8">
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-black/5 pb-4">
          <div className="min-w-0">
            <p className={`truncate text-xs font-black ${theme.muted}`}>
              {settings.cafeName || slug}
            </p>
            <p className="truncate text-sm font-black">{categoryLabel}</p>
          </div>
          <Link
            href={productsHref}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-black/5 px-4 text-sm font-black transition hover:-translate-y-0.5 active:translate-y-0 ${theme.card}`}
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

          <section
            className="premium-product-reveal mx-auto mt-10 max-w-4xl border-t border-black/5 pt-8 sm:mt-14 sm:pt-10"
          >
            <p className={`text-sm font-black ${theme.accent}`}>تفاصيل المنتج</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              كل ما تحتاج معرفته
            </h2>

            {product.description ? (
              <div className="mt-7">
                <h3 className="text-sm font-black">الوصف</h3>
                <p className={`mt-2 max-w-[68ch] break-words text-sm font-bold leading-8 ${theme.muted}`}>
                  {product.description}
                </p>
              </div>
            ) : null}

            {product.ingredients.length ? (
              <div className="mt-8">
                <h3 className="text-sm font-black">
                  {isEvents ? "محتويات الباقة" : "المكونات"}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.ingredients.map((ingredient) => (
                    <span
                      key={ingredient}
                      className={`max-w-full break-words rounded-full px-3 py-2 text-sm font-black ${theme.badge}`}
                    >
                      {ingredient}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <dl className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                ["التصنيف", categoryLabel],
                ["التوفر", availabilityLabel],
                product.preparationTimeMinutes
                  ? ["وقت التجهيز", `${product.preparationTimeMinutes} دقيقة`]
                  : null,
                product.calories
                  ? ["السعرات", `${product.calories.toLocaleString("ar-SA")} سعرة`]
                  : null,
              ]
                .filter((entry): entry is string[] => Boolean(entry))
                .map(([label, value]) => (
                  <div key={label} className="border-b border-black/5 pb-3">
                    <dt className={`text-xs font-black ${theme.muted}`}>{label}</dt>
                    <dd className="mt-1 break-words text-sm font-black">{value}</dd>
                  </div>
                ))}
            </dl>

            {eventSettings ? (
              <div className="mt-10">
                <h3 className="mb-5 text-lg font-black">تفاصيل الفعالية والتذكرة</h3>
                <EventDetails settings={eventSettings} mutedClass={theme.muted} />
              </div>
            ) : null}
          </section>

          {product.promo ? (
            <section
              className={`premium-product-reveal mx-auto mt-8 max-w-4xl rounded-[24px] border border-black/5 p-5 sm:p-7 ${theme.card}`}
            >
              <p className={`text-xs font-black ${theme.muted}`}>العرض الحالي</p>
              <h2 className={`mt-2 break-words text-2xl font-black ${theme.accent}`}>
                {promoBadgeText(product.promo)}
              </h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className={`text-xs font-black ${theme.muted}`}>فترة العرض</dt>
                  <dd className="mt-1 break-words text-sm font-black">
                    {formatDate(product.promo.startDate)} — {formatDate(product.promo.endDate)}
                  </dd>
                </div>
                <div>
                  <dt className={`text-xs font-black ${theme.muted}`}>السعر</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-black">
                    <span>{formatSar(finalPrice)}</span>
                    {hasDiscount ? (
                      <span className={`line-through ${theme.muted}`}>{formatSar(product.price)}</span>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section className="premium-product-reveal mx-auto mt-10 max-w-4xl text-center">
            <MapPin className={`mx-auto h-6 w-6 ${theme.accent}`} />
            <h2 className="mt-3 text-2xl font-black">اكتشف المزيد من العلامة</h2>
            <p className={`mx-auto mt-2 max-w-lg text-sm font-bold leading-7 ${theme.muted}`}>
              تصفح بقية المنتجات والعروض المتاحة واختر ما يناسبك.
            </p>
            <Link
              href={productsHref}
              className={`mt-5 inline-flex min-h-12 items-center justify-center gap-2 px-6 font-black transition hover:-translate-y-0.5 active:translate-y-0 ${theme.button}`}
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
