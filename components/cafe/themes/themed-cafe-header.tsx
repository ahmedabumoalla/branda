"use client";

import Link from "next/link";
import { UserRound, WalletCards } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { getCafePath, getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";

type Props = {
  slug: string;
  cafeName: string;
  logoUrl?: string | null;
  themeId?: string;
  experience?: unknown;
  customer?: BarndaksaCustomerSession | null;
  checkingCustomer?: boolean;
  previewThemeId?: string | null;
  features?: string[];
};

export function ThemedCafeHeader({
  slug,
  cafeName,
  logoUrl,
  customer,
  checkingCustomer = false,
  previewThemeId,
  features = [],
}: Props) {
  const home = getCafePath(slug, "", previewThemeId);
  const account = getCafePath(slug, "account", previewThemeId);
  const login = getCustomerLoginHref(slug, `/c/${slug}/account`, previewThemeId);
  const has = (feature: string) => featureCodesAllow(features, feature);
  const accountReady = Boolean(customer) || checkingCustomer;

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 border-b border-[var(--ci-border,var(--barndaksa-border-sand))] bg-[var(--ci-page-bg,#FCF8F3)]/86 shadow-[0_10px_35px_rgba(49,25,18,0.06)] backdrop-blur-xl"
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
            <p className="truncate text-lg font-black text-[var(--ci-page-fg,var(--barndaksa-espresso-dark))]">{cafeName}</p>
            <p className="text-xs font-bold text-[var(--ci-muted-fg,var(--barndaksa-muted-text))]">الفرع الإلكتروني</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {has("menu") ? (
            <Link href={getCafePath(slug, "products/latest", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] transition hover:bg-[var(--ci-surface-bg,#fff)]">
              أحدث المنتجات
            </Link>
          ) : null}
          {has("offers") ? (
            <Link href={getCafePath(slug, "products/offers", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] transition hover:bg-[var(--ci-surface-bg,#fff)]">
              العروض
            </Link>
          ) : null}
          {has("menu") ? (
            <Link href={getCafePath(slug, "products/popular", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] transition hover:bg-[var(--ci-surface-bg,#fff)]">
              المنيو
            </Link>
          ) : null}
          {has("reservations") ? (
            <Link href={getCafePath(slug, "reserve", previewThemeId)} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] transition hover:bg-[var(--ci-surface-bg,#fff)]">
              الحجز
            </Link>
          ) : null}
          {has("loyalty") ? (
            <Link href={account} className="rounded-2xl px-4 py-2 text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] transition hover:bg-[var(--ci-surface-bg,#fff)]">
              الولاء
            </Link>
          ) : null}
        </nav>

        <Link
          href={accountReady ? account : login}
          className="inline-flex items-center gap-2 rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-4 py-2 text-sm font-black text-[var(--ci-button-fg,#fff)] shadow-sm transition active:scale-95"
        >
          {accountReady ? <WalletCards className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
          {accountReady ? "حسابي" : "دخول"}
        </Link>
      </div>
    </header>
  );
}
