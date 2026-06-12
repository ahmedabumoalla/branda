"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { getThemeClasses, type CafeThemeId } from "@/lib/mock/cafe-theme";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";

type Props = {
  slug: string;
  cafeName: string;
  logoUrl?: string;
  themeId: CafeThemeId;
  customer: BarndaksaCustomerSession | null;
};

export function CafeHeader({ slug, cafeName, logoUrl, themeId, customer }: Props) {
  const theme = getThemeClasses(themeId);

  return (
    <header className={`sticky top-0 z-50 border-b backdrop-blur-xl ${theme.nav}`}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href={`/c/${slug}`} className="flex min-w-0 items-center gap-3">
          <CafeLogo name={cafeName} logoUrl={logoUrl} size="sm" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black">{cafeName}</h1>
            <p className={`truncate text-xs font-bold ${theme.muted}`}>منيو رقمي</p>
          </div>
        </Link>

        {customer ? (
          <Link
            href={`/c/${slug}/account`}
            className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black shadow-sm ${theme.button}`}
          >
            <UserRound className="h-4 w-4" />
            حسابي
          </Link>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/c/${slug}/login`}
              className={`rounded-2xl border px-3 py-2.5 text-sm font-black sm:px-4 ${theme.card}`}
            >
              دخول
            </Link>
            <Link
              href={`/c/${slug}/register`}
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
