"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Coffee } from "lucide-react";
import { formatSar } from "@/lib/format";
import {
  mockMenuProducts,
  promoBadgeText,
  type MenuProduct,
} from "@/lib/mock/menu";
import { ProductReviews } from "@/components/cafe/product-reviews";

const STORAGE_KEY = "branda_qatrah_menu";

export function ProductDetailClient({
  slug,
  id,
}: {
  slug: string;
  id: string;
}) {
  const [products, setProducts] = useState<MenuProduct[]>(mockMenuProducts);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setProducts(JSON.parse(saved));
  }, []);

  const product = useMemo(() => {
    return products.find((p) => p.id === id);
  }, [products, id]);

  if (!product) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#F8F4EF] flex items-center justify-center p-6"
      >
        <div className="rounded-3xl bg-white border border-[#E5D8CD] p-8 text-center">
          <h1 className="text-3xl font-black text-[#3A2117]">
            المنتج غير موجود
          </h1>

          <Link
            href={`/c/${slug}`}
            className="mt-5 inline-block rounded-2xl bg-[#3A2117] text-[#F8E8D2] px-6 py-3 font-black"
          >
            رجوع للمنيو
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] text-[#2B1710]">
      <section className="max-w-6xl mx-auto px-6 py-10">
        <Link href={`/c/${slug}`} className="font-black text-[#6B3A25]">
          ← رجوع للمنيو
        </Link>

        <div className="mt-8 grid lg:grid-cols-2 gap-8 items-start">
          <div className="rounded-[32px] bg-white border border-[#E5D8CD] p-5 shadow-sm">
            <div className="relative h-[440px] w-full overflow-hidden rounded-[26px] bg-[#F8F4EF]">
              <div className="absolute inset-16 rounded-full bg-[#CBB29C]/35 blur-3xl" />

              {product.imageDataUrl ? (
                <img
                  src={product.imageDataUrl}
                  alt={product.name}
                  className="relative h-full w-full object-contain p-6"
                />
              ) : (
                <div className="relative flex h-full w-full items-center justify-center rounded-[26px] bg-[#E8D4C1]">
                  <Coffee className="h-16 w-16 text-[#3A2117]" />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[32px] bg-white border border-[#E5D8CD] p-8 shadow-sm">
            <p className="text-sm font-black text-[#8B5E3C]">
              {product.category}
            </p>

            <h1 className="mt-3 text-5xl font-black text-[#3A2117]">
              {product.name}
            </h1>

            <p className="mt-5 text-lg leading-9 text-[#7A6255]">
              {product.description}
            </p>

            {product.promo ? (
              <div className="mt-6 rounded-2xl bg-[#F8F4EF] border border-[#E5D8CD] p-4">
                <p className="text-sm font-bold text-[#7A6255]">عرض مرتبط</p>
                <h3 className="mt-1 text-2xl font-black text-[#6B3A25]">
                  {promoBadgeText(product.promo)}
                </h3>
              </div>
            ) : null}

            <div className="mt-8 grid grid-cols-3 gap-4">
              <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                <p className="text-xs font-black text-[#7A6255]">السعر</p>
                <h3 className="mt-2 text-2xl font-black text-[#6B3A25]">
                  {formatSar(product.price)}
                </h3>
              </div>

              <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                <p className="text-xs font-black text-[#7A6255]">السعرات</p>
                <h3 className="mt-2 text-2xl font-black">
                  {product.calories === undefined
                    ? "غير محدد"
                    : product.calories}
                </h3>
              </div>

              <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                <p className="text-xs font-black text-[#7A6255]">نقاط الولاء</p>
                <h3 className="mt-2 text-2xl font-black text-[#8B5E3C]">
                  +{product.loyaltyPoints}
                </h3>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-xl font-black mb-3">المكونات</h2>

              <div className="flex flex-wrap gap-2">
                {product.ingredients.map((ing) => (
                  <span
                    key={ing}
                    className="rounded-full bg-[#EFE8DF] px-4 py-2 text-sm font-black"
                  >
                    {ing}
                  </span>
                ))}
              </div>
            </div>

            <button className="mt-8 w-full h-16 rounded-2xl bg-[#3A2117] text-[#F8E8D2] font-black text-lg">
              أضف إلى الطلب
            </button>
          </div>
        </div>

        <ProductReviews
          slug={slug}
          productId={product.id}
          productName={product.name}
        />
      </section>
    </main>
  );
}