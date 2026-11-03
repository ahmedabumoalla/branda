"use client";

import { useParams } from "next/navigation";
import { BrandedMenuLoading } from "@/components/menu/branded-menu-loading";
import { menuLoadingBrand } from "@/lib/menu/loading-brands";

export default function SalonLoading() {
  const { slug } = useParams<{ slug: string }>();
  const brand = menuLoadingBrand(slug);
  if (brand?.salon) return <BrandedMenuLoading brand={brand} />;
  return <main dir="rtl" className="grid min-h-svh place-items-center bg-[#10120f] text-[#faf3e7]" aria-busy="true"><p role="status">نجهّز لك الخدمات والحجز</p></main>;
}
