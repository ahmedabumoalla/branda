"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { getCafePath } from "@/lib/cafe/theme-links";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";

type Props = {
  slug: string;
  cafeName: string;
  logoUrl?: string | null;
  themeId?: string;
  experience?: unknown;
  customer?: BarndaksaCustomerSession | null;
  previewThemeId?: string | null;
  features?: string[];
};

export function ThemedCafeHeader({
  slug,
  cafeName,
  logoUrl,
  customer,
  previewThemeId,
  features = [],
}: Props) {
  const home = getCafePath(slug, "", previewThemeId);
  const account = getCafePath(slug, "account", previewThemeId);
  const login = getCafePath(slug, "login", previewThemeId);
  const has = (feature: string) => featureCodesAllow(features, feature);

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 border-b border-[#E7D7C6] bg-[#FCF8F3]/95 shadow-sm backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={home} className="flex min-w-0 items-center gap-3">
          <CafeLogo
            name={cafeName}
            logoUrl={logoUrl ?? undefined}
            size="sm"
            className="rounded-2xl bg-white object-contain p-1 shadow-sm"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-black text-[#311912]">{cafeName}</p>
            <p className="text-xs font-bold text-[#806A5E]">الفرع الإلكتروني</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {has("menu") ? (
            <Link href={getCafePath(slug, "products/latest", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[#6B3A25] hover:bg-white">
              أحدث المنتجات
            </Link>
          ) : null}
          {has("offers") ? (
            <Link href={getCafePath(slug, "products/offers", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[#6B3A25] hover:bg-white">
              العروض
            </Link>
          ) : null}
          {has("menu") ? (
            <Link href={getCafePath(slug, "products/popular", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[#6B3A25] hover:bg-white">
              المنيو
            </Link>
          ) : null}
          {has("reservations") ? (
            <Link href={getCafePath(slug, "reserve", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[#6B3A25] hover:bg-white">
              الحجز
            </Link>
          ) : null}
        </nav>

        <Link
          href={customer ? account : login}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#6B3A25] px-4 py-2 text-sm font-black text-white"
        >
          <UserRound className="h-4 w-4" />
          {customer ? "حسابي" : "دخول"}
        </Link>
      </div>
    </header>
  );
}
