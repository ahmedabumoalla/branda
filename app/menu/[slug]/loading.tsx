"use client";

import { useParams } from "next/navigation";
import { LocoMenuLoading } from "@/components/menu/loco-menu-loading";
import { TogetherStoreLoading } from "@/components/store/together-store-loading";
import { isLocoMenu } from "@/lib/menu/loco-brand";
import { signatureBrand } from "@/lib/menu/signature-brands";
import { SignatureMenuLoading } from "@/components/menu/signature-menu-loading";
import { BrandedMenuLoading } from "@/components/menu/branded-menu-loading";
import { menuLoadingBrand } from "@/lib/menu/loading-brands";

export default function MenuLoading() {
  const { slug } = useParams<{ slug: string }>();
  const signature = signatureBrand(slug);
  if (signature) return <SignatureMenuLoading brand={signature} />;
  if (slug === "brand-871ec6e243c0") return <TogetherStoreLoading />;
  if (isLocoMenu(slug)) return <LocoMenuLoading />;
  const brand = menuLoadingBrand(slug);
  if (brand) return <BrandedMenuLoading brand={brand} />;

  return <main dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f7f5ef] text-[#315e50]" aria-busy="true">
    <span className="text-5xl" aria-hidden="true">✦</span>
    <p role="status">نحضّر لك المنيو</p>
  </main>;
}
