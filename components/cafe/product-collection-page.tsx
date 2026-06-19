"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ExternalLink, MapPin, Phone, Sparkles } from "lucide-react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedFilterBar,
  defaultProductFilters,
  type FilterBarState,
} from "@/components/cafe/themes/themed-filter-bar";
import {
  ThemedProductCard,
  getCollectionGridClass,
} from "@/components/cafe/themes/themed-product-card";
import { getCafePath } from "@/lib/cafe/theme-links";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { buildGoogleMapsUrl } from "@/lib/mock/branches";
import {
  getCustomerCategoryFilterOptions,
  productMatchesCategory,
  productMatchesPriceRange,
  resolveProductCategoryLabel,
} from "@/lib/cafe/menu-category-utils";
import type { MenuProduct } from "@/lib/mock/menu";
import {
  InternalAdPanel,
  PremiumSectionHeader,
  SocialProofPanel,
} from "@/components/cafe/themes/customer-experience-primitives";

type Props = {
  slug: string;
  view: string;
};

const viewInfo: Record<string, { title: string; desc: string }> = {
  offers: {
    title: "العروض",
    desc: "كل العروض والخصومات والمنتجات الترويجية المتاحة في الكوفي.",
  },
  latest: {
    title: "أحدث المنتجات",
    desc: "أحدث المنتجات المضافة أولًا.",
  },
  popular: {
    title: "أكثر المنتجات طلبًا",
    desc: "المنتجات الأعلى طلبًا.",
  },
  branches: {
    title: "أقرب الفروع إليك",
    desc: "استعرض فروع الكوفي القريبة.",
  },
};

function getScore(product: MenuProduct, index: number) {
  return Number(product.price || 0) + (100 - index);
}

export function ProductCollectionPage({ slug, view }: Props) {
  const searchParams = useSearchParams();
  const { theme, settings, experience, path, previewThemeId } = useCafePageContext(slug);
  const { products, offers, branches, categories: menuCategories, loading, error } =
    usePublicCafeMenu(slug);

  const [filters, setFilters] = useState<FilterBarState>(() =>
    defaultProductFilters({
      category: searchParams.get("category") ?? "الكل",
      sort: view === "popular" ? "popular" : view === "latest" ? "latest" : "popular",
      onlyOffers: view === "offers",
    })
  );

  useEffect(() => {
    const fromUrl = searchParams.get("category");
    if (fromUrl) {
      setFilters((prev) => ({ ...prev, category: fromUrl }));
    }
  }, [searchParams]);

  const availableProducts = products.filter((product) => product.available);

  const categories = useMemo(
    () => getCustomerCategoryFilterOptions(availableProducts, menuCategories),
    [availableProducts, menuCategories]
  );

  function resetFilters() {
    setFilters(
      defaultProductFilters({
        sort: view === "popular" ? "popular" : view === "latest" ? "latest" : "popular",
      })
    );
  }

  const offerProductIds = useMemo(
    () =>
      new Set(
        offers
          .filter((offer) => offer.status === "نشط" && offer.visibleInCafe)
          .map((offer) => offer.linkedProductId)
          .filter(Boolean)
      ),
    [offers]
  );

  const orderedProducts = useMemo(() => {
    let list = [...availableProducts];

    if (view === "latest") list = [...list].reverse();
    if (view === "popular") list = list.sort((a, b) => getScore(b, 0) - getScore(a, 0));
    if (view === "offers") list = list.filter((item) => offerProductIds.has(item.id) || Boolean(item.promo));

    list = list.filter((product) => {
      const categoryLabel = resolveProductCategoryLabel(product);
      const matchesQuery =
        product.name.includes(filters.query) ||
        product.description.includes(filters.query) ||
        categoryLabel.includes(filters.query);
      const matchesCategory = productMatchesCategory(
        product,
        filters.category,
        menuCategories
      );
      const matchesPrice = productMatchesPriceRange(product, filters.priceRange);
      const matchesOffer =
        filters.onlyOffers || filters.sort === "offers"
          ? offerProductIds.has(product.id) || Boolean(product.promo)
          : true;
      return matchesQuery && matchesCategory && matchesPrice && matchesOffer;
    });

    if (filters.sort === "offers") {
      list = list.filter((item) => offerProductIds.has(item.id) || Boolean(item.promo));
    }
    if (filters.sort === "popular") list = list.sort((a, b) => getScore(b, 0) - getScore(a, 0));
    if (filters.sort === "price-low") list = list.sort((a, b) => a.price - b.price);
    if (filters.sort === "price-high") list = list.sort((a, b) => b.price - a.price);
    if (filters.sort === "latest") list = [...list].reverse();

    return list;
  }, [availableProducts, view, filters, offerProductIds, menuCategories]);

  const activeOffers = offers.filter((o) => o.status === "نشط" && o.visibleInCafe);
  const activeBranches = branches.filter((b) => b.active !== false);
  const gridClass = getCollectionGridClass(experience.collection);

  if (loading) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">جاري التحميل...</p>
        </div>
      </CafeLayout>
    );
  }

  if (error) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">{error}</p>
        </div>
      </CafeLayout>
    );
  }

  if (view === "branches") {
    return (
      <CafeLayout slug={slug}>
        <Link
          href={path()}
          className={`mb-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition active:scale-95 ${theme.buttonOutline}`}
        >
          <ArrowRight className="h-4 w-4" />
          رجوع للكوفي
        </Link>
        <section className={`barndaksa-premium-hero overflow-hidden rounded-[36px] p-6 shadow-[0_24px_80px_rgba(49,25,18,0.12)] sm:p-8 ${theme.hero}`}>
          <p className={`inline-flex items-center gap-2 text-sm font-black ${theme.accent}`}>
            <Sparkles className="h-4 w-4" />
            فروع قريبة وتجربة أسهل
          </p>
          <h1 className={`mt-2 text-4xl font-black leading-tight sm:text-5xl ${experience.headingTracking}`}>
            فروع {settings.cafeName}
          </h1>
          <p className={`mt-3 max-w-2xl text-sm font-bold leading-7 sm:text-base ${theme.muted}`}>
            اختر الفرع المناسب، افتح موقعه على خرائط جوجل، أو تواصل معه مباشرة إذا كان رقم الفرع متاحًا.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className={`rounded-2xl px-4 py-2 text-sm font-black ${theme.badge}`}>
              {activeBranches.length} فرع متاح
            </span>
          </div>
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {activeBranches.length ? (
            activeBranches.map((branch) => (
              <article key={branch.id} className={`barndaksa-premium-card overflow-hidden rounded-[32px] border border-black/5 p-5 shadow-[0_18px_55px_rgba(49,25,18,0.10)] ${theme.card}`}>
                <div className="flex items-start gap-4">
                  <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${theme.badge}`}>
                    <MapPin className={`h-7 w-7 ${theme.accent}`} />
                  </span>
                  <div className="min-w-0">
                    <p className={`text-xs font-black ${theme.muted}`}>فرع جاهز للزيارة</p>
                    <h2 className="mt-1 text-2xl font-black leading-snug">{branch.name}</h2>
                    <p className={`mt-2 text-sm font-bold leading-7 ${theme.muted}`}>{branch.address || branch.city}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {branch.mapUrl ? (
                    <a
                      href={buildGoogleMapsUrl(branch.lat, branch.lng, branch.mapUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition active:scale-95 ${theme.button}`}
                    >
                      عرض على الخريطة
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  {branch.phone ? (
                    <a
                      href={`tel:${branch.phone}`}
                      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition active:scale-95 ${theme.buttonOutline}`}
                    >
                      اتصال
                      <Phone className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className={`font-bold ${theme.muted}`}>لا توجد فروع متاحة حاليًا.</p>
          )}
        </div>
      </CafeLayout>
    );
  }

  return (
    <CafeLayout slug={slug}>
      <Link
        href={path()}
        className={`mb-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition active:scale-95 ${theme.buttonOutline}`}
      >
        <ArrowRight className="h-4 w-4" />
        رجوع للكوفي
      </Link>

      <div className="barndaksa-cinematic-stage space-y-8">
        <div className={`barndaksa-premium-hero rounded-[36px] p-6 shadow-[0_24px_80px_rgba(49,25,18,0.12)] sm:p-8 ${theme.hero}`}>
          <p className={`inline-flex items-center gap-2 font-black ${theme.accent}`}>
            <Sparkles className="h-4 w-4" />
            {viewInfo[view]?.title || "المنتجات"}
          </p>
          <h1
            className={`mt-2 break-words text-4xl font-black leading-tight sm:text-5xl ${experience.headingTracking}`}
          >
            {viewInfo[view]?.title || "منتجات الكوفي"}
          </h1>
          <p className={`mt-3 max-w-2xl text-sm font-bold leading-7 sm:text-base ${theme.muted}`}>
            {viewInfo[view]?.desc || "استعرض منتجات الكوفي."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className={`rounded-2xl px-4 py-2 text-sm font-black ${theme.badge}`}>
              {orderedProducts.length} منتج
            </span>
            {activeOffers.length ? (
              <span className={`rounded-2xl px-4 py-2 text-sm font-black ${theme.badge}`}>
                {activeOffers.length} عرض نشط
              </span>
            ) : null}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["المطابقة", orderedProducts.length],
              ["العروض", activeOffers.length],
              ["الفروع", activeBranches.length],
            ].map(([label, value]) => (
              <div key={label as string} className={`rounded-[24px] border border-black/5 p-4 ${theme.card}`}>
                <p className={`text-xs font-black ${theme.muted}`}>{label as string}</p>
                <p className="mt-1 text-2xl font-black">{value as number}</p>
              </div>
            ))}
          </div>
        </div>

        <ThemedFilterBar
          experience={experience}
          categories={categories}
          state={filters}
          onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
          onReset={resetFilters}
        />

        {view === "offers" && activeOffers.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-4 text-2xl font-black">العروض النشطة</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {activeOffers.map((offer) => (
                <article key={offer.id} className={`barndaksa-premium-card barndaksa-offer-motion p-5 ${theme.card}`}>
                  <p className={`font-black ${theme.accent}`}>{offer.type}</p>
                  <h3 className="mt-2 text-xl font-black">{offer.title}</h3>
                  <p className={`mt-2 text-sm ${theme.muted}`}>{offer.description}</p>
                  {offer.discountPercent ? (
                    <span
                      className={`mt-3 inline-block rounded-xl px-3 py-1 text-sm font-black ${theme.badge}`}
                    >
                      خصم {offer.discountPercent}%
                    </span>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <PremiumSectionHeader
            eyebrow="المعرض"
            title="المنتجات"
            description="الفلاتر والفرز كما هي، لكن النتائج تظهر الآن بتكوين بصري أوسع مع مساحة إعلان داخلية."
            action={
              <span className={`rounded-xl px-4 py-2 text-sm font-black ${theme.badge}`}>
                {orderedProducts.length} منتج
              </span>
            }
          />

          <div className={`${gridClass} barndaksa-stagger-grid`}>
            {orderedProducts.map((item, index) => (
              <Fragment key={item.id}>
                <ThemedProductCard
                  slug={slug}
                  product={item}
                  experience={experience}
                  href={getCafePath(slug, `product/${item.id}`, previewThemeId)}
                />
                {index === 2 ? (
                  <div className="md:col-span-2 xl:col-span-3">
                    <InternalAdPanel
                      compact
                      title={activeOffers[0]?.promoProductName || activeOffers[0]?.title || "استكشف عروض العلامة"}
                      eyebrow="إعلان داخل القائمة"
                      description={activeOffers[0]?.description || "مساحة مدمجة بين المنتجات تقود العميل إلى العروض أو المنتج المرتبط بدون تغيير مسار القائمة."}
                      href={activeOffers[0]?.linkedProductId ? getCafePath(slug, `product/${activeOffers[0].linkedProductId}`, previewThemeId) : getCafePath(slug, "products/offers", previewThemeId)}
                      cta={activeOffers[0]?.ctaText || "فتح العرض"}
                      metric={activeOffers.length ? `${activeOffers.length} عروض` : orderedProducts.length}
                    />
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>

          {!orderedProducts.length ? (
            <div className={`mt-8 p-10 text-center ${theme.card}`}>
              <h3 className="text-2xl font-black">لا توجد منتجات مطابقة للفلاتر الحالية</h3>
              <p className={`mt-2 ${theme.muted}`}>جرّب تغيير التصنيف أو مسح الفلاتر.</p>
              <button
                type="button"
                onClick={resetFilters}
                className={`mt-5 rounded-2xl px-6 py-3 text-sm font-black ${theme.button}`}
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          ) : null}
        </section>

        {orderedProducts.length > 0 && orderedProducts.length <= 2 ? (
          <InternalAdPanel
            compact
            title={activeOffers[0]?.promoProductName || activeOffers[0]?.title || "مساحة عروض العلامة"}
            eyebrow="إعلان داخل القائمة"
            description={activeOffers[0]?.description || "مساحة مدمجة تظهر حتى عندما تكون نتائج الفلترة قليلة."}
            href={activeOffers[0]?.linkedProductId ? getCafePath(slug, `product/${activeOffers[0].linkedProductId}`, previewThemeId) : getCafePath(slug, "products/offers", previewThemeId)}
            cta={activeOffers[0]?.ctaText || "فتح العرض"}
          />
        ) : null}

        <SocialProofPanel
          cafeName={settings.cafeName || slug}
          productCount={availableProducts.length}
          offerCount={activeOffers.length}
          branchCount={activeBranches.length}
        />
      </div>
    </CafeLayout>
  );
}
