"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Coffee, Filter, MapPin, Search, SlidersHorizontal } from "lucide-react";
import { formatSar } from "@/lib/format";
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
    desc: "أحدث المنتجات المضافة أولًا، ثم المنتجات الأكثر طلبًا، ثم باقي المنيو.",
  },
  popular: {
    title: "أكثر المنتجات طلبًا",
    desc: "المنتجات الأعلى طلبًا أولًا، ثم أحدث المنتجات، ثم بقية المنتجات.",
  },
  branches: {
    title: "أقرب الفروع إليك",
    desc: "استعرض فروع الكوفي القريبة وطريقة الوصول إليها.",
  },
};

function getScore(product: MenuProduct, index: number) {
  const base = Number(product.loyaltyPoints || 0) + Number(product.price || 0);
  return base + (100 - index);
}

export function ProductCollectionPage({ slug, view }: Props) {
  const [products, setProducts] = useState<MenuProduct[]>(mockMenuProducts);
  const [offers, setOffers] = useState<CafeOffer[]>(mockOffers);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("الكل");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [onlyOffers, setOnlyOffers] = useState(false);
  const [sort, setSort] = useState<"latest" | "popular" | "price-low" | "price-high">(
    view === "popular" ? "popular" : "latest"
  );

  useEffect(() => {
    const savedMenu = localStorage.getItem(MENU_KEY);
    const savedOffers = localStorage.getItem(OFFERS_KEY);

    if (savedMenu) setProducts(JSON.parse(savedMenu));
    if (savedOffers) setOffers(JSON.parse(savedOffers));
  }, []);

  const availableProducts = products.filter((product) => product.available);

  const categories = useMemo(() => {
    return ["الكل", ...Array.from(new Set(availableProducts.map((p) => p.category)))];
  }, [availableProducts]);

  const offerProductIds = useMemo(() => {
    return new Set(
      offers
        .filter((offer) => offer.status === "نشط" && offer.visibleInCafe)
        .map((offer) => offer.linkedProductId)
        .filter(Boolean)
    );
  }, [offers]);

  const orderedProducts = useMemo(() => {
    let list = [...availableProducts];

    if (view === "latest") {
      list = [...list].reverse();
    }

    if (view === "popular") {
      list = [...list].sort((a, b) => getScore(b, 0) - getScore(a, 0));
    }

    if (view === "offers") {
      list = list.filter((item) => offerProductIds.has(item.id));
    }

    list = list.filter((product) => {
      const matchesQuery =
        product.name.includes(query) ||
        product.description.includes(query) ||
        product.category.includes(query);

      const matchesCategory = category === "الكل" || product.category === category;

      const matchesMin = minPrice ? product.price >= Number(minPrice) : true;
      const matchesMax = maxPrice ? product.price <= Number(maxPrice) : true;

      const matchesOffer = onlyOffers ? offerProductIds.has(product.id) : true;

      return matchesQuery && matchesCategory && matchesMin && matchesMax && matchesOffer;
    });

    if (sort === "popular") {
      list = list.sort((a, b) => getScore(b, 0) - getScore(a, 0));
    }

    if (sort === "price-low") {
      list = list.sort((a, b) => a.price - b.price);
    }

    if (sort === "price-high") {
      list = list.sort((a, b) => b.price - a.price);
    }

    if (sort === "latest") {
      list = list.reverse();
    }

    return list;
  }, [
    availableProducts,
    view,
    query,
    category,
    minPrice,
    maxPrice,
    onlyOffers,
    sort,
    offerProductIds,
  ]);

  const activeOffers = offers.filter(
    (offer) => offer.status === "نشط" && offer.visibleInCafe
  );

  if (view === "branches") {
    return (
      <main dir="rtl" className="min-h-screen bg-[#F8F4EF] text-[#2B1710]">
        <section className="mx-auto max-w-7xl px-6 py-10">
          <Link href={`/c/${slug}`} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117]">
            <ArrowRight className="h-5 w-5" />
            رجوع للكوفي
          </Link>

          <div className="mt-10">
            <p className="font-black text-[#8B5E3C]">الفروع</p>
            <h1 className="mt-2 text-5xl font-black text-[#3A2117]">أقرب الفروع إليك</h1>
            <p className="mt-3 text-[#7A6255]">اختر الفرع الأقرب لك واحجز أو اطلب مباشرة.</p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {["فرع التحلية", "فرع الواجهة", "فرع الجامعة"].map((branch, index) => (
              <article key={branch} className="rounded-[32px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
                  <MapPin className="h-7 w-7" />
                </div>
                <h2 className="text-2xl font-black text-[#3A2117]">{branch}</h2>
                <p className="mt-2 text-[#7A6255]">يبعد تقريبًا {index + 2} كم عنك</p>
                <button className="mt-5 rounded-2xl bg-[#3A2117] px-6 py-3 font-black text-[#F8E8D2]">
                  عرض الاتجاهات
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] text-[#2B1710]">
      <section className="mx-auto max-w-7xl px-6 py-10">
        <Link href={`/c/${slug}`} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117]">
          <ArrowRight className="h-5 w-5" />
          رجوع للكوفي
        </Link>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="font-black text-[#8B5E3C]">
              {viewInfo[view]?.title || "المنتجات"}
            </p>
            <h1 className="mt-2 text-5xl font-black text-[#3A2117]">
              {viewInfo[view]?.title || "منتجات الكوفي"}
            </h1>
            <p className="mt-3 max-w-2xl text-[#7A6255]">
              {viewInfo[view]?.desc || "استعرض منتجات الكوفي بطريقة احترافية."}
            </p>
          </div>

          <div className="rounded-[32px] border border-[#E5D8CD] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-[#8B5E3C]" />
              <h2 className="font-black text-[#3A2117]">فلترة متقدمة</h2>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8A7062]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث عن منتج..."
                  className="h-12 w-full rounded-2xl border border-[#E5D8CD] pr-12 pl-4 text-right outline-none"
                />
              </div>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 outline-none"
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <input
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="السعر من"
                  className="h-12 rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none"
                />
                <input
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="السعر إلى"
                  className="h-12 rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none"
                />
              </div>

              <select
                value={sort}
                onChange={(e) =>
                  setSort(e.target.value as "latest" | "popular" | "price-low" | "price-high")
                }
                className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 outline-none"
              >
                <option value="latest">الأحدث</option>
                <option value="popular">الأكثر طلبًا</option>
                <option value="price-low">السعر الأقل</option>
                <option value="price-high">السعر الأعلى</option>
              </select>

              <button
                onClick={() => setOnlyOffers((prev) => !prev)}
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black ${
                  onlyOffers
                    ? "bg-[#3A2117] text-[#F8E8D2]"
                    : "bg-[#F8F4EF] text-[#3A2117]"
                }`}
              >
                <Filter className="h-4 w-4" />
                المنتجات التي عليها عروض
              </button>
            </div>
          </div>
        </div>

        {view === "offers" && activeOffers.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-5 text-3xl font-black text-[#3A2117]">العروض النشطة</h2>
            <div className="grid gap-5 md:grid-cols-2">
              {activeOffers.map((offer) => (
                <article key={offer.id} className="rounded-[28px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
                  <p className="font-black text-[#8B5E3C]">{offer.type}</p>
                  <h3 className="mt-2 text-3xl font-black text-[#3A2117]">{offer.title}</h3>
                  <p className="mt-3 leading-7 text-[#7A6255]">{offer.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {offer.discountPercent ? (
                      <span className="rounded-2xl bg-[#F8F4EF] px-4 py-2 font-black text-[#6B3A25]">
                        خصم {offer.discountPercent}%
                      </span>
                    ) : null}
                    {offer.code ? (
                      <span className="rounded-2xl bg-[#F8F4EF] px-4 py-2 font-black text-[#6B3A25]">
                        {offer.code}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-3xl font-black text-[#3A2117]">المنتجات</h2>
            <span className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#6B3A25]">
              {orderedProducts.length} منتج
            </span>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {orderedProducts.map((item) => (
              <Link
                key={item.id}
                href={`/c/${slug}/product/${item.id}`}
                className="group overflow-hidden rounded-[30px] border border-[#E5D8CD] bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative h-64 rounded-[24px] bg-[#F8F4EF]">
                  <div className="absolute inset-10 rounded-full bg-[#CBB29C]/30 blur-3xl" />
                  {item.imageDataUrl ? (
                    <img src={item.imageDataUrl} alt="" className="relative h-full w-full object-contain p-4" />
                  ) : (
                    <div className="relative flex h-full items-center justify-center">
                      <Coffee className="h-14 w-14 text-[#3A2117]" />
                    </div>
                  )}
                </div>

                <div className="p-2 pt-5">
                  <p className="text-sm font-black text-[#8B5E3C]">{item.category}</p>
                  <h3 className="mt-2 text-2xl font-black text-[#3A2117]">{item.name}</h3>
                  <p className="mt-2 line-clamp-2 leading-7 text-[#7A6255]">{item.description}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.ingredients.slice(0, 3).map((ing) => (
                      <span key={ing} className="rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#6B3A25]">
                        {ing}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-xl font-black text-[#6B3A25]">{formatSar(item.price)}</span>
                    <span className="rounded-2xl bg-[#3A2117] px-5 py-3 text-sm font-black text-[#F8E8D2]">
                      عرض التفاصيل
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {!orderedProducts.length ? (
            <div className="mt-8 rounded-[28px] border border-dashed border-[#E5D8CD] bg-white p-10 text-center">
              <h3 className="text-2xl font-black text-[#3A2117]">لا توجد نتائج</h3>
              <p className="mt-2 text-[#7A6255]">جرّب تغيير الفلاتر أو البحث.</p>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}