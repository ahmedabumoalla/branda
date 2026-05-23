"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedFilterBar,
  type FilterBarState,
} from "@/components/cafe/themes/themed-filter-bar";
import {
  ThemedProductCard,
  getCollectionGridClass,
} from "@/components/cafe/themes/themed-product-card";
import { getCafePath } from "@/lib/cafe/theme-links";
import { formatSar } from "@/lib/format";
import { BRANCHES_KEY, mockBranches } from "@/lib/mock/branches";
import { mockMenuProducts, type MenuProduct } from "@/lib/mock/menu";
import { mockOffers, type CafeOffer } from "@/lib/mock/offers";

const MENU_KEY = "branda_qatrah_menu";
const OFFERS_KEY = "branda_qatrah_offers";

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
  return Number(product.loyaltyPoints || 0) + Number(product.price || 0) + (100 - index);
}

export function ProductCollectionPage({ slug, view }: Props) {
  const { theme, settings, experience, path, previewThemeId } = useCafePageContext(slug);
  const [products, setProducts] = useState<MenuProduct[]>(mockMenuProducts);
  const [offers, setOffers] = useState<CafeOffer[]>(mockOffers);
  const [branches, setBranches] = useState(mockBranches);

  const [filters, setFilters] = useState<FilterBarState>({
    query: "",
    category: "الكل",
    minPrice: "",
    maxPrice: "",
    onlyOffers: false,
    sort: view === "popular" ? "popular" : "latest",
  });

  useEffect(() => {
    const savedMenu = localStorage.getItem(MENU_KEY);
    const savedOffers = localStorage.getItem(OFFERS_KEY);
    if (savedMenu) setProducts(JSON.parse(savedMenu));
    if (savedOffers) setOffers(JSON.parse(savedOffers));
    const savedBranches = localStorage.getItem(BRANCHES_KEY);
    if (savedBranches) setBranches(JSON.parse(savedBranches));
  }, []);

  const availableProducts = products.filter((product) => product.available);

  const categories = useMemo(
    () => ["الكل", ...Array.from(new Set(availableProducts.map((p) => p.category)))],
    [availableProducts]
  );

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
    if (view === "offers") list = list.filter((item) => offerProductIds.has(item.id));

    list = list.filter((product) => {
      const matchesQuery =
        product.name.includes(filters.query) ||
        product.description.includes(filters.query) ||
        product.category.includes(filters.query);
      const matchesCategory = filters.category === "الكل" || product.category === filters.category;
      const matchesMin = filters.minPrice ? product.price >= Number(filters.minPrice) : true;
      const matchesMax = filters.maxPrice ? product.price <= Number(filters.maxPrice) : true;
      const matchesOffer = filters.onlyOffers ? offerProductIds.has(product.id) : true;
      return matchesQuery && matchesCategory && matchesMin && matchesMax && matchesOffer;
    });

    if (filters.sort === "popular") list = list.sort((a, b) => getScore(b, 0) - getScore(a, 0));
    if (filters.sort === "price-low") list = list.sort((a, b) => a.price - b.price);
    if (filters.sort === "price-high") list = list.sort((a, b) => b.price - a.price);
    if (filters.sort === "latest") list = [...list].reverse();

    return list;
  }, [availableProducts, view, filters, offerProductIds]);

  const activeOffers = offers.filter((o) => o.status === "نشط" && o.visibleInCafe);
  const activeBranches = branches.filter((b: { active?: boolean }) => b.active !== false);
  const filterLayout =
    experience.collection === "sidebar-grid" ? "sidebar" : "horizontal";
  const gridClass = getCollectionGridClass(experience.collection);

  if (view === "branches") {
    return (
      <CafeLayout slug={slug}>
        <Link
          href={path()}
          className={`mb-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-black ${theme.buttonOutline}`}
        >
          <ArrowRight className="h-4 w-4" />
          رجوع للكوفي
        </Link>
        <h1 className={`text-4xl font-black ${experience.headingTracking}`}>
          فروع {settings.cafeName}
        </h1>
        <p className={`mt-2 font-bold ${theme.muted}`}>اختر الفرع الأقرب واحجز مباشرة.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {activeBranches.map(
            (branch: { id: string; name: string; address: string; mapUrl?: string }) => (
              <article key={branch.id} className={`p-6 ${theme.card}`}>
                <MapPin className={`mb-3 h-7 w-7 ${theme.accent}`} />
                <h2 className="text-2xl font-black">{branch.name}</h2>
                <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{branch.address}</p>
                {branch.mapUrl ? (
                  <a
                    href={branch.mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-4 inline-flex rounded-2xl px-5 py-2.5 text-sm font-black ${theme.button}`}
                  >
                    عرض على الخريطة
                  </a>
                ) : null}
              </article>
            )
          )}
        </div>
      </CafeLayout>
    );
  }

  return (
    <CafeLayout slug={slug}>
      <Link
        href={path()}
        className={`mb-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-black ${theme.buttonOutline}`}
      >
        <ArrowRight className="h-4 w-4" />
        رجوع للكوفي
      </Link>

      <div
        className={
          filterLayout === "sidebar"
            ? "grid gap-8 lg:grid-cols-[360px_1fr]"
            : "space-y-8"
        }
      >
        <div className={filterLayout === "sidebar" ? "order-2 lg:order-1" : ""}>
          <ThemedFilterBar
            experience={experience}
            categories={categories}
            state={filters}
            onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            layout={filterLayout}
          />
        </div>

        <div className={filterLayout === "sidebar" ? "order-1 lg:order-2" : ""}>
          <p className={`font-black ${theme.accent}`}>{viewInfo[view]?.title || "المنتجات"}</p>
          <h1
            className={`mt-2 break-words text-3xl font-black sm:text-4xl lg:text-5xl ${experience.headingTracking}`}
          >
            {viewInfo[view]?.title || "منتجات الكوفي"}
          </h1>
          <p className={`mt-3 max-w-2xl font-bold ${theme.muted}`}>
            {viewInfo[view]?.desc || "استعرض منتجات الكوفي."}
          </p>

          {view === "offers" && activeOffers.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-4 text-2xl font-black">العروض النشطة</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {activeOffers.map((offer) => (
                  <article key={offer.id} className={`p-5 ${theme.card}`}>
                    <p className={`font-black ${theme.accent}`}>{offer.type}</p>
                    <h3 className="mt-2 text-xl font-black">{offer.title}</h3>
                    <p className={`mt-2 text-sm ${theme.muted}`}>{offer.description}</p>
                    {offer.discountPercent ? (
                      <span className={`mt-3 inline-block rounded-xl px-3 py-1 text-sm font-black ${theme.badge}`}>
                        خصم {offer.discountPercent}%
                      </span>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-black">المنتجات</h2>
              <span className={`rounded-xl px-4 py-2 text-sm font-black ${theme.badge}`}>
                {orderedProducts.length} منتج
              </span>
            </div>

            <div className={gridClass}>
              {orderedProducts.map((item) => (
                <ThemedProductCard
                  key={item.id}
                  slug={slug}
                  product={item}
                  experience={experience}
                  href={getCafePath(slug, `product/${item.id}`, previewThemeId)}
                />
              ))}
            </div>

            {!orderedProducts.length ? (
              <div className={`mt-8 p-10 text-center ${theme.card}`}>
                <h3 className="text-2xl font-black">لا توجد نتائج</h3>
                <p className={`mt-2 ${theme.muted}`}>جرّب تغيير الفلاتر.</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </CafeLayout>
  );
}
