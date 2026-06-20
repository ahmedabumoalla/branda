"use client";

import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  ArrowLeft,
  BadgePercent,
  CalendarDays,
  Home,
  Megaphone,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  UserRound,
  WalletCards,
} from "lucide-react";

export type QuickDockItem = {
  href: string;
  label: string;
  icon: ElementType;
  active?: boolean;
  enabled?: boolean;
};

export function CustomerQuickDock({
  items,
  className = "",
}: {
  items: QuickDockItem[];
  className?: string;
}) {
  const visibleItems = items.filter((item) => item.enabled !== false);

  if (!visibleItems.length) return null;

  return (
    <nav
      aria-label="تنقل سريع"
      className={`fixed inset-x-0 bottom-0 z-50 md:hidden ${className}`}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-t-[26px] border-t border-[var(--ci-border,#E7D7C6)] bg-white/94 px-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_rgba(23,20,18,0.12)] backdrop-blur-xl">
        {visibleItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-1.5 text-[11px] font-black transition active:scale-95 ${
                item.active
                  ? "bg-[var(--ci-button-bg,#2F7A52)]/10 text-[var(--ci-button-bg,#2F7A52)]"
                  : "text-[#4E4B56]"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function buildCustomerQuickDockItems({
  slug,
  accountHref,
  loginHref,
  homeHref,
  productsHref,
  reserveHref,
  loyaltyHref,
  isCustomer,
  hasProducts = true,
  hasReservations = true,
  hasLoyalty = true,
  active,
}: {
  slug: string;
  accountHref?: string;
  loginHref?: string;
  homeHref?: string;
  productsHref?: string;
  reserveHref?: string;
  loyaltyHref?: string;
  isCustomer?: boolean;
  hasProducts?: boolean;
  hasReservations?: boolean;
  hasLoyalty?: boolean;
  active?: "home" | "products" | "reserve" | "loyalty" | "account";
}): QuickDockItem[] {
  const encodedSlug = encodeURIComponent(slug);
  const resolvedAccountHref =
    accountHref ?? `/c/${encodedSlug}/${isCustomer ? "account" : "login"}`;

  return [
    {
      href: homeHref ?? `/c/${encodedSlug}`,
      label: "الرئيسية",
      icon: Home,
      active: active === "home",
    },
    {
      href: productsHref ?? `/c/${encodedSlug}/products/popular`,
      label: "المنتجات",
      icon: ShoppingBag,
      active: active === "products",
      enabled: hasProducts,
    },
    {
      href: reserveHref ?? `/c/${encodedSlug}/reserve`,
      label: "الحجوزات",
      icon: CalendarDays,
      active: active === "reserve",
      enabled: hasReservations,
    },
    {
      href: loyaltyHref ?? resolvedAccountHref,
      label: "المكافآت",
      icon: WalletCards,
      active: active === "loyalty",
      enabled: hasLoyalty,
    },
    {
      href: isCustomer ? resolvedAccountHref : loginHref ?? `/c/${encodedSlug}/login`,
      label: "الحساب",
      icon: UserRound,
      active: active === "account",
    },
  ];
}

export function PremiumSectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="inline-flex items-center gap-2 text-sm font-black text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]">
          <Sparkles className="h-4 w-4" />
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-black leading-tight text-[var(--ci-page-fg,var(--barndaksa-espresso-dark))] sm:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-[var(--ci-muted-fg,var(--barndaksa-muted-text))]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function InternalAdPanel({
  title,
  eyebrow = "اكتشف جديدنا",
  description,
  href,
  cta = "تفاصيل أكثر",
  icon: Icon = Megaphone,
  metric,
  compact = false,
}: {
  title: string;
  eyebrow?: string;
  description: string;
  href: string;
  cta?: string;
  icon?: ElementType;
  metric?: string | number;
  compact?: boolean;
}) {
  return (
    <section
      className={`barndaksa-premium-card overflow-hidden rounded-[32px] border border-[var(--ci-border,var(--barndaksa-border-sand))] bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] text-[var(--ci-button-fg,#fff)] shadow-[0_24px_80px_rgba(49,25,18,0.16)] ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-black text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]">
            <Icon className="h-4 w-4" />
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black leading-tight">{title}</h2>
          <p className="mt-2 text-sm font-bold leading-7 text-white/74">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          {metric !== undefined ? (
            <span className="rounded-[22px] bg-white/12 px-4 py-3 text-center text-xl font-black shadow-inner">
              {metric}
            </span>
          ) : null}
          <Link
            href={href}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] px-5 py-3 text-sm font-black text-[var(--ci-accent-fg,var(--barndaksa-espresso-dark))] shadow-sm transition active:scale-95"
          >
            {cta}
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function SocialProofPanel({
  cafeName,
  productCount,
  offerCount,
  branchCount,
}: {
  cafeName: string;
  productCount: number;
  offerCount: number;
  branchCount: number;
}) {
  const proofItems = [
    {
      icon: ShoppingBag,
      title: `${productCount} منتج`,
      desc: "قائمة واضحة للتصفح والاختيار حسب التصنيف.",
    },
    {
      icon: BadgePercent,
      title: `${offerCount} عرض`,
      desc: "عروض بارزة تساعد العميل على اكتشاف الجديد بسرعة.",
    },
    {
      icon: ShieldCheck,
      title: branchCount ? `${branchCount} فرع` : "تجربة موثقة",
      desc: branchCount
        ? "الفروع وروابط الخريطة والحجوزات ضمن مسار واحد."
        : "مساحة جاهزة لعرض آراء العملاء وتوثيق التجارب.",
    },
  ];

  return (
    <section className="barndaksa-premium-card rounded-[34px] border border-[var(--ci-border,var(--barndaksa-border-sand))] bg-[var(--ci-surface-bg,#fff)] p-5 shadow-[0_22px_70px_rgba(49,25,18,0.10)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-black text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]">
            <Star className="h-4 w-4" />
            آراء العملاء
          </p>
          <h2 className="mt-2 text-2xl font-black text-[var(--ci-page-fg,var(--barndaksa-espresso-dark))]">
            تجربة موثقة حول {cafeName}
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-[var(--ci-muted-fg,var(--barndaksa-muted-text))]">
            عندما لا تتوفر آراء عامة بعد، تعرض الواجهة مؤشرات حقيقية من
            البيانات الحالية بدل إنشاء بيانات وهمية.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {proofItems.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.title}
              className="rounded-[26px] border border-[var(--ci-border,var(--barndaksa-border-sand))] bg-[var(--ci-page-bg,var(--barndaksa-cream-base))]/70 p-4"
            >
              <Icon className="h-6 w-6 text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))]" />
              <h3 className="mt-3 text-lg font-black text-[var(--ci-page-fg,var(--barndaksa-espresso-dark))]">
                {item.title}
              </h3>
              <p className="mt-1 text-xs font-bold leading-6 text-[var(--ci-muted-fg,var(--barndaksa-muted-text))]">
                {item.desc}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
