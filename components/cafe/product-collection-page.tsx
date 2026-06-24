"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ExternalLink, MapPin, Phone, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedFilterBar,
  defaultProductFilters,
  type FilterBarState,
} from "@/components/cafe/themes/themed-filter-bar";
import {
  getCollectionGridClass,
} from "@/components/cafe/themes/themed-product-card";
import {
  CustomerBottomDock,
  ProductPosterCard,
  defaultCustomerDockItems,
} from "@/components/cafe/themes/customer-mobile-experience";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
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
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  slug: string;
  view: string;
};

const viewInfo: Record<string, { title: string; desc: string }> = {
  offers: {
    title: "العروض",
    desc: "كل العروض والخصومات والمنتجات الترويجية المتاحة في الفرع الإلكتروني.",
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
    desc: "استعرض الفروع القريبة.",
  },
};

function getScore(product: MenuProduct, index: number) {
  return Number(product.price || 0) + (100 - index);
}

export function ProductCollectionPage({ slug, view }: Props) {
  const searchParams = useSearchParams();
  const { theme, settings, experience, path, previewThemeId } = useCafePageContext(slug);
  const copy = getBusinessCopy(settings.businessCategory);
  const isEvents = copy.kind === "events";
  const eventViewInfo: Record<string, { title: string; desc: string }> = {
    offers: {
      title: "العروض",
      desc: "كل عروض وخصومات التذاكر والباقات المتاحة في الفرع الإلكتروني.",
    },
    latest: {
      title: "أحدث التذاكر",
      desc: "أحدث التذاكر والباقات المضافة أولًا.",
    },
    popular: {
      title: "أكثر التذاكر طلبًا",
      desc: "التذاكر والباقات الأعلى طلبًا.",
    },
    branches: viewInfo.branches,
  };
  const currentViewInfo = (isEvents ? eventViewInfo : viewInfo)[view];
  const itemLabel = isEvents ? "تذكرة" : "منتج";
  const itemPluralLabel = isEvents ? "التذاكر والباقات" : "المنتجات";
  const filterLabel = isEvents ? "فلترة التذاكر والباقات" : "فلترة المنتجات";
  const queryPlaceholder = isEvents ? "ابحث عن تذكرة أو باقة..." : "ابحث عن منتج...";
  const offersOnlyLabel = isEvents ? "تذاكر العروض فقط" : "العروض فقط";
  const offersSortLabel = isEvents ? "التذاكر ذات العروض" : "المنتجات ذات العروض";
  const noMatchesTitle = isEvents ? "لا توجد تذاكر مطابقة" : "لا توجد منتجات مطابقة";
  const logoUrl = useResolvedCafeLogoUrl(settings);
  const { products, offers, branches, categories: menuCategories, loading, error } =
    usePublicCafeMenu(slug);
  const [filterOpen, setFilterOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

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

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [filterOpen]);

  const availableProducts = products.filter((product) => product.available);

  const categories = useMemo(
    () => getCustomerCategoryFilterOptions(availableProducts, menuCategories),
    [availableProducts, menuCategories]
  );

  useEffect(() => {
    if (!filterOpen || process.env.NODE_ENV !== "development") return;
    console.info("[products-filter] modal open", {
      hasCategories: categories.length > 0,
      hasProducts: availableProducts.length > 0,
    });
  }, [availableProducts.length, categories.length, filterOpen]);

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
  const hasFilterContent = availableProducts.length > 0 || categories.length > 0;

  if (loading) {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">جاري التحميل...</p>
        </div>
      </CafeLayout>
    );
  }

  if (error) {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">{error}</p>
        </div>
      </CafeLayout>
    );
  }

  if (view === "branches") {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <Link
          href={path()}
          className={`mb-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition active:scale-95 ${theme.buttonOutline}`}
        >
          <ArrowRight className="h-4 w-4" />
          رجوع إلى {copy.casualNoun}
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
        <CustomerBottomDock
          {...defaultCustomerDockItems({
            slug,
            previewThemeId,
            active: "orders",
            hasProducts: true,
            hasOrders: true,
            hasRewards: true,
            businessCategory: settings.businessCategory,
          })}
        />
      </CafeLayout>
    );
  }

  return (
    <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
      <div className="barndaksa-cinematic-stage space-y-5">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <CafeLogo
              name={settings.cafeName || slug}
              logoUrl={logoUrl}
              size="sm"
              className="rounded-[18px]"
            />
            <div className="min-w-0">
              <p className={`text-xs font-black ${theme.muted}`}>{settings.cafeName || slug}</p>
              <h1 className={`truncate text-3xl font-black leading-tight sm:text-4xl ${experience.headingTracking}`}>
                {currentViewInfo?.title || itemPluralLabel}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="فتح الفلاتر"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-black/5 shadow-sm transition active:scale-95 ${theme.card}`}
          >
            <SlidersHorizontal className={`h-5 w-5 ${theme.accent}`} />
          </button>
        </header>

        {categories.length > 1 ? (
          <div className="-mx-4 overflow-x-auto px-4 pb-1">
            <div className="flex w-max gap-2">
              {categories.map((name) => {
                const selected = filters.category === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, category: name }))}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition active:scale-95 ${
                      selected ? theme.button : theme.buttonOutline
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <section>
          <div className={`${gridClass} barndaksa-stagger-grid`}>
            {orderedProducts.map((item) => (
              <ProductPosterCard
                key={item.id}
                product={item}
                href={getCafePath(slug, `product/${item.id}`, previewThemeId)}
              />
            ))}
          </div>

          {!orderedProducts.length ? (
            <div className={`rounded-[28px] border border-dashed border-[var(--ci-border,#E7D7C6)] p-8 text-center shadow-sm ${theme.card}`}>
              <h3 className="text-xl font-black">{noMatchesTitle}</h3>
              <p className={`mt-2 text-sm font-bold leading-7 ${theme.muted}`}>
                جرّب تصنيفًا آخر أو امسح الفلاتر الحالية.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className={`mt-5 rounded-2xl px-5 py-3 text-sm font-black ${theme.button}`}
              >
                مسح الفلاتر
              </button>
            </div>
          ) : null}
        </section>

        {filterOpen && portalReady
          ? createPortal(
              <>
                <button
                  type="button"
                  aria-label="إغلاق الفلاتر"
                  className="fixed inset-0 z-[9998] cursor-default bg-black/45 backdrop-blur-sm"
                  onClick={() => setFilterOpen(false)}
                />
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="products-filter-title"
                  className="fixed inset-x-0 bottom-0 z-[9999] max-h-[80vh] overflow-y-auto rounded-t-[28px] border border-[var(--ci-border,#E7D7C6)] bg-white p-4 text-[var(--ci-page-fg,#311912)] shadow-[0_-24px_90px_rgba(23,20,18,0.32)] sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-xs font-black ${theme.muted}`}>{filterLabel}</p>
                      <h2 id="products-filter-title" className="truncate text-lg font-black">
                        {settings.cafeName || slug}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFilterOpen(false)}
                      aria-label="إغلاق الفلاتر"
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${theme.buttonOutline}`}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {hasFilterContent ? (
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
                          بحث
                        </span>
                        <input
                          value={filters.query}
                          onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
                          placeholder={queryPlaceholder}
                          className="h-12 w-full rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-white px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30"
                        />
                      </label>

                      {categories.length ? (
                        <div>
                          <p className="mb-2 text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">التصنيف</p>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {categories.map((name) => {
                              const selected = filters.category === name;
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => setFilters((prev) => ({ ...prev, category: name }))}
                                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition active:scale-95 ${
                                    selected ? theme.button : theme.buttonOutline
                                  }`}
                                >
                                  {name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
                            الترتيب
                          </span>
                          <select
                            value={filters.sort}
                            onChange={(event) =>
                              setFilters((prev) => ({
                                ...prev,
                                sort: event.target.value as FilterBarState["sort"],
                                onlyOffers: event.target.value === "offers" ? true : prev.onlyOffers,
                              }))
                            }
                            className="h-12 w-full rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-white px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30"
                          >
                            <option value="popular">الأكثر طلبًا</option>
                            <option value="latest">الأحدث</option>
                            <option value="price-low">السعر: الأقل أولًا</option>
                            <option value="price-high">السعر: الأعلى أولًا</option>
                            <option value="offers">{offersSortLabel}</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
                            السعر
                          </span>
                          <select
                            value={filters.priceRange}
                            onChange={(event) =>
                              setFilters((prev) => ({
                                ...prev,
                                priceRange: event.target.value as FilterBarState["priceRange"],
                              }))
                            }
                            className="h-12 w-full rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-white px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30"
                          >
                            <option value="all">جميع الأسعار</option>
                            <option value="under-20">أقل من 20 ر.س</option>
                            <option value="20-40">20 إلى 40 ر.س</option>
                            <option value="over-40">أكثر من 40 ر.س</option>
                          </select>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => setFilters((prev) => ({ ...prev, onlyOffers: !prev.onlyOffers }))}
                        className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black transition active:scale-95 ${
                          filters.onlyOffers ? theme.button : theme.buttonOutline
                        }`}
                      >
                        {filters.onlyOffers ? `✓ ${offersOnlyLabel}` : offersOnlyLabel}
                      </button>

                      <div className="grid grid-cols-2 gap-3 border-t border-[var(--ci-border,#E7D7C6)] pt-4">
                        <button
                          type="button"
                          onClick={resetFilters}
                          className={`h-12 rounded-2xl text-sm font-black ${theme.buttonOutline}`}
                        >
                          إعادة ضبط
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterOpen(false)}
                          className={`h-12 rounded-2xl text-sm font-black ${theme.button}`}
                        >
                          تطبيق
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-page-bg,#FCF8F3)] p-8 text-center">
                      <SlidersHorizontal className={`mx-auto h-7 w-7 ${theme.accent}`} />
                  <p className="mt-3 text-sm font-black">لا توجد فلاتر متاحة حاليًا</p>
                    </div>
                  )}
                </section>
              </>,
              document.body
            )
          : null}

        {false && filterOpen ? (
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setFilterOpen(false);
            }}
          >
            <div
              className="max-h-[92dvh] w-full overflow-hidden rounded-t-[28px] bg-white text-[var(--ci-page-fg,#311912)] shadow-[0_24px_90px_rgba(23,20,18,0.32)] ring-1 ring-black/10 sm:max-w-2xl sm:rounded-[28px]"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[var(--ci-border,#E7D7C6)] px-4 py-4">
                <div>
                  <p className={`text-xs font-black ${theme.muted}`}>فلترة المنتجات</p>
                  <h2 className="text-lg font-black">{settings.cafeName || slug}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  aria-label="إغلاق الفلاتر"
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${theme.buttonOutline}`}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[calc(92dvh-132px)] overflow-y-auto p-4">
                {hasFilterContent ? (
                  <ThemedFilterBar
                    experience={experience}
                    categories={categories}
                    state={filters}
                    onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
                    onReset={resetFilters}
                    businessCategory={settings.businessCategory}
                  />
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-page-bg,#FCF8F3)] p-8 text-center">
                    <SlidersHorizontal className={`mx-auto h-7 w-7 ${theme.accent}`} />
                    <p className="mt-3 text-sm font-black">لا توجد فلاتر متاحة حاليًا</p>
                  </div>
                )}
              </div>
              {hasFilterContent ? (
                <div className="border-t border-[var(--ci-border,#E7D7C6)] bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className={`h-12 w-full rounded-2xl text-sm font-black ${theme.button}`}
                  >
                    تطبيق
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <CustomerBottomDock
        {...defaultCustomerDockItems({
          slug,
          previewThemeId,
          active: "menu",
          hasProducts: true,
          hasOrders: true,
          hasRewards: true,
          businessCategory: settings.businessCategory,
        })}
      />
    </CafeLayout>
  );

  return (
    <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
      <Link
        href={path()}
        className={`mb-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition active:scale-95 ${theme.buttonOutline}`}
      >
        <ArrowRight className="h-4 w-4" />
        رجوع إلى {copy.casualNoun}
      </Link>

      <div className="barndaksa-cinematic-stage space-y-8">
        <div className={`barndaksa-premium-hero rounded-[36px] p-6 shadow-[0_24px_80px_rgba(49,25,18,0.12)] sm:p-8 ${theme.hero}`}>
          <p className={`inline-flex items-center gap-2 font-black ${theme.accent}`}>
            <Sparkles className="h-4 w-4" />
            {currentViewInfo?.title || itemPluralLabel}
          </p>
          <h1
            className={`mt-2 break-words text-4xl font-black leading-tight sm:text-5xl ${experience.headingTracking}`}
          >
            {currentViewInfo?.title || `${itemPluralLabel} ${copy.casualNoun}`}
          </h1>
          <p className={`mt-3 max-w-2xl text-sm font-bold leading-7 sm:text-base ${theme.muted}`}>
            {currentViewInfo?.desc || `استعرض ${itemPluralLabel} ${copy.casualNoun}.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className={`rounded-2xl px-4 py-2 text-sm font-black ${theme.badge}`}>
              {orderedProducts.length} {itemLabel}
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
          businessCategory={settings.businessCategory}
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
            title={itemPluralLabel}
            description={isEvents ? "الفلاتر والفرز كما هي، لكن النتائج تظهر كتذاكر وباقات مع مساحة إعلان داخلية." : "الفلاتر والفرز كما هي، لكن النتائج تظهر الآن بتكوين بصري أوسع مع مساحة إعلان داخلية."}
            action={
              <span className={`rounded-xl px-4 py-2 text-sm font-black ${theme.badge}`}>
                {orderedProducts.length} {itemLabel}
              </span>
            }
          />

          <div className={`${gridClass} barndaksa-stagger-grid`}>
            {orderedProducts.map((item, index) => (
              <Fragment key={item.id}>
                <ProductPosterCard
                  product={item}
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
      <CustomerBottomDock
        {...defaultCustomerDockItems({
          slug,
          previewThemeId,
          active: "menu",
          hasProducts: true,
          hasOrders: true,
          hasRewards: true,
          businessCategory: settings.businessCategory,
        })}
      />
    </CafeLayout>
  );
}
