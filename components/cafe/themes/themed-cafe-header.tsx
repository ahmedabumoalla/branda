"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { getCafePath } from "@/lib/cafe/theme-links";
import type { BrandaCustomerSession } from "@/lib/customer/session";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";

type Props = {
  slug: string;
  cafeName: string;
  logoUrl?: string;
  themeId: CafeThemeId;
  experience: ThemeExperience;
  customer: BrandaCustomerSession | null;
  previewThemeId?: string | null;
};

export function ThemedCafeHeader({
  slug,
  cafeName,
  logoUrl,
  themeId,
  experience,
  customer,
  previewThemeId,
}: Props) {
  const { theme } = experience;
  const home = getCafePath(slug, "", previewThemeId);
  const account = getCafePath(slug, "account", previewThemeId);
  const login = getCafePath(slug, "login", previewThemeId);
  const register = getCafePath(slug, "register", previewThemeId);

  const headerClass =
    themeId === "marketplace-amazon"
      ? `${theme.header} border-b`
      : themeId === "mobile-first-cafe"
        ? `${theme.header} shadow-sm`
        : `sticky top-0 z-50 border-b backdrop-blur-xl ${theme.nav}`;

  return (
    <header className={headerClass}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
        <Link href={home} className="flex min-w-0 items-center gap-3">
          <CafeLogo name={cafeName} logoUrl={logoUrl} size="sm" />
          <div className="min-w-0">
            <h1 className={`truncate text-lg font-black ${experience.headingTracking}`}>
              {cafeName}
            </h1>
            <p className={`truncate text-xs font-bold ${theme.muted}`}>منيو رقمي</p>
          </div>
        </Link>

        {customer ? (
          <Link
            href={account}
            className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black ${theme.button}`}
          >
            <UserRound className="h-4 w-4" />
            حسابي
          </Link>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Link
              href={login}
              className={`rounded-2xl border px-3 py-2.5 text-sm font-black sm:px-4 ${theme.card}`}
            >
              دخول
            </Link>
            <Link
              href={register}
              className={`rounded-2xl px-3 py-2.5 text-sm font-black sm:px-4 ${theme.button}`}
            >
              حساب جديد
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
