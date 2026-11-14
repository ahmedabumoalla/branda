"use client";

import { useParams, useSearchParams } from "next/navigation";
import { LocoMenuLoading } from "@/components/menu/loco-menu-loading";
import { TogetherStoreLoading } from "@/components/store/together-store-loading";
import { isLocoMenu } from "@/lib/menu/loco-brand";
import { signatureBrand } from "@/lib/menu/signature-brands";
import { DefaultSignatureMenuLoading, SignatureMenuLoading } from "@/components/menu/signature-menu-loading";
import { BrandedMenuLoading } from "@/components/menu/branded-menu-loading";
import { menuLoadingBrand } from "@/lib/menu/loading-brands";
import { TeaBakeryMenuLoading } from "@/components/menu/tea-bakery-menu-loading";
import { FawaselLoading } from "@/components/store/fawasel-loading";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";
import { AldeemLoading } from "@/components/store/aldeem-loading";
import { isAldeemStore } from "@/lib/commerce/aldeem-profile";

export default function MenuLoading() {
  const { slug } = useParams<{ slug: string }>();
  const branches = useSearchParams().getAll("branch");
  if (isAldeemStore(slug)) return <AldeemLoading />;
  if (isFawaselStore(slug)) return <FawaselLoading />;
  if (slug === "brand-9010051467ed") return <TeaBakeryMenuLoading />;
  const signature = signatureBrand(slug, branches.length === 1 ? branches[0] : undefined);
  if (signature) return <SignatureMenuLoading brand={signature} />;
  if (slug === "brand-871ec6e243c0") return <TogetherStoreLoading />;
  if (isLocoMenu(slug)) return <LocoMenuLoading />;
  const brand = menuLoadingBrand(slug);
  if (brand) return <BrandedMenuLoading brand={brand} />;

  return <DefaultSignatureMenuLoading />;
}
