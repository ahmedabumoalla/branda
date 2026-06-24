"use client";

import Link from "next/link";
import { useEffect, useState, type ElementType, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  Coffee,
  Gift,
  Home,
  Menu as MenuIcon,
  QrCode,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Utensils,
  UserRound,
  WalletCards,
} from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { formatSar } from "@/lib/format";
import {
  isPromoActive,
  productFinalPrice,
  promoBadgeText,
  type MenuProduct,
} from "@/lib/mock/menu";
import { getBusinessCopy } from "@/lib/platform/business-copy";

export type CustomerDockKey = "home" | "orders" | "menu" | "rewards" | "account";

export function BrandaMadeByMark({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center gap-2 rounded-full bg-white/78 px-3 py-1.5 text-[10px] font-black text-[var(--ci-muted-fg,#806A5E)] shadow-sm ring-1 ring-[var(--ci-border,#E7D7C6)] ${className}`}>
      <span>مصمم بواسطة</span>
      <BrandaLogo width={46} height={18} className="max-h-[16px]" />
    </div>
  );
}

export function MobileBrandMasthead({
  cafeName,
  logoUrl,
  subtitle,
}: {
  cafeName: string;
  logoUrl?: string;
  subtitle?: string;
}) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-4 pt-5 text-center md:max-w-2xl lg:max-w-4xl">
      <CafeLogo name={cafeName} logoUrl={logoUrl} size="lg" />
      <h1 className="mt-3 max-w-full truncate text-3xl font-black leading-tight text-[var(--ci-page-fg,#171412)] sm:text-4xl">
        {cafeName}
      </h1>
      {subtitle ? (
        <p className="mt-2 max-w-xl text-sm font-bold leading-7 text-[var(--ci-muted-fg,#77716b)]">
          {subtitle}
        </p>
      ) : null}
      <BrandaMadeByMark className="mt-3" />
    </section>
  );
}

export function AppLoyaltyCard({
  customerName,
  code,
  points = 0,
  current = 0,
  required = 7,
  onClickHref,
  isAuthenticated = true,
  loginHref,
  businessCategory,
}: {
  customerName?: string;
  code?: string;
  points?: number;
  current?: number;
  required?: number;
  onClickHref?: string;
  isAuthenticated?: boolean;
  loginHref?: string;
  businessCategory?: string;
}) {
  const copy = getBusinessCopy(businessCategory);
  const StampIcon = copy.kind === "events" ? CalendarDays : copy.kind === "restaurant" ? Utensils : Coffee;
  const safeRequired = Math.max(1, Math.min(60, Number(required || 7)));
  const earnedCups = Math.max(0, Math.min(safeRequired, Number(current || 0)));
  const remaining = Math.max(safeRequired - earnedCups, 0);
  const progress = Math.max(0, Math.min(100, safeRequired ? (earnedCups / safeRequired) * 100 : 0));
  const cupSizeClass = safeRequired <= 8 ? "h-8 w-8" : safeRequired <= 14 ? "h-7 w-7" : safeRequired <= 24 ? "h-6 w-6" : "h-5 w-5";
  const cupIconClass = safeRequired <= 8 ? "h-4 w-4" : safeRequired <= 14 ? "h-3.5 w-3.5" : "h-3 w-3";
  const cupGapClass = safeRequired <= 14 ? "gap-1.5" : "gap-1";

  const loggedOutContent = (
    <article className="barndaksa-premium-card relative isolate h-[190px] overflow-hidden rounded-[22px] bg-[var(--ci-primary-bg,#174D3B)] p-5 text-white shadow-[0_18px_50px_rgba(14,60,46,0.22)]">
      <div aria-hidden className="absolute -left-8 bottom-5 h-28 w-28 rounded-full border-[18px] border-white/8" />
      <div aria-hidden className="absolute -right-10 top-8 h-28 w-28 rounded-full bg-[var(--ci-accent-bg,#58C98A)]/65" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/14 text-white shadow-inner">
          <UserRound className="h-6 w-6" />
        </span>
        <h2 className="mt-3 text-xl font-black leading-snug">سجّل دخولك لتحميل بطاقة الولاء الخاصة بك</h2>
        <p className="mt-2 max-w-xs text-xs font-bold leading-5 text-white/72">بعد الدخول تظهر {copy.loyaltyUnitPlural}، التقدم، والرمز الخاص بك مباشرة.</p>
        {loginHref ? (
          <Link
            href={loginHref}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-black text-[var(--ci-primary-bg,#174D3B)] shadow-sm transition active:scale-95"
          >
            تسجيل الدخول
          </Link>
        ) : null}
      </div>
    </article>
  );

  if (!isAuthenticated) return loggedOutContent;

  const content = (
    <article className="barndaksa-premium-card relative isolate h-[190px] overflow-hidden rounded-[22px] bg-[var(--ci-primary-bg,#174D3B)] p-4 text-white shadow-[0_18px_50px_rgba(14,60,46,0.22)]">
      <div aria-hidden className="absolute -left-10 bottom-2 h-28 w-28 rounded-full border-[18px] border-white/8" />
      <div aria-hidden className="absolute -right-9 top-8 h-28 w-28 rounded-full bg-[var(--ci-accent-bg,#58C98A)]/70" />
      <div aria-hidden className="absolute bottom-3 right-4 grid grid-cols-2 gap-1 opacity-25">
        {[0, 1, 2, 3].map((item) => (
          <span key={item} className="h-7 w-7 rounded-full bg-white/20" />
        ))}
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black tracking-wide">{customerName || "عميل العلامة"}</h2>
            <p className="mt-1 font-mono text-xs font-black tracking-[0.14em] text-white/78">
              {code || "BARNDAKSA"}
            </p>
          </div>
          <div className="shrink-0 text-left">
            <p className="text-2xl font-black">{points}</p>
            <p className="text-[10px] font-bold text-white/65">نقاط متاحة</p>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3">
            <p className="shrink-0 text-sm font-black">{earnedCups} / {safeRequired}</p>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/18">
              <span className="block h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className={`mt-3 flex max-h-[44px] flex-wrap overflow-hidden ${cupGapClass}`}>
            {Array.from({ length: safeRequired }).map((_, index) => {
              const earned = index < earnedCups;
              return (
                <span
                  key={index}
                  className={`flex ${cupSizeClass} items-center justify-center rounded-full border transition ${
                    earned
                      ? "border-white/70 bg-white text-[var(--ci-primary-bg,#174D3B)] shadow-sm"
                      : "border-white/18 bg-white/10 text-white/42"
                  }`}
                  aria-label={earned ? `${copy.loyaltyUnitSingular} مضاء` : `${copy.loyaltyUnitSingular} غير مضاء`}
                >
                  <StampIcon className={cupIconClass} />
                </span>
              );
            })}
          </div>

          <p className="mt-3 text-sm font-black leading-5 text-white/90">
            {remaining === 0 ? "مكافأتك جاهزة للاستخدام" : `باقي ${remaining} ${remaining === 1 ? copy.loyaltyUnitSingular : copy.loyaltyUnitPlural} مضاءة للمكافأة`}
          </p>
        </div>
      </div>
    </article>
  );

  if (!onClickHref) return content;
  return <Link href={onClickHref}>{content}</Link>;
}

export function BrandAdSlider({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (count <= 1) return;
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % count);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [count]);

  return (
    <section className="space-y-3">
      <div className="overflow-hidden rounded-[22px]">{children}</div>
      {count > 1 ? (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: count }).map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`عرض ${index + 1}`}
              onClick={() => setActive(index)}
              className={`h-2 rounded-full transition-all ${index === active ? "w-8 bg-[var(--ci-button-bg,#2F7A52)]" : "w-2 bg-[var(--ci-muted-fg,#8C8A84)]/28"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ProductPosterCard({
  product,
  href,
  compact = false,
}: {
  product: MenuProduct;
  href: string;
  compact?: boolean;
}) {
  const promoOn = product.promo ? isPromoActive(product.promo) : false;
  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscount = promoOn && finalPrice < product.price;

  return (
    <Link
      href={href}
      className={`group block overflow-hidden rounded-[8px] bg-white text-[var(--ci-page-fg,#171412)] shadow-[0_10px_28px_rgba(23,20,18,0.08)] ring-1 ring-[var(--ci-border,#E7D7C6)]/70 transition active:scale-[0.985] ${compact ? "min-w-[154px]" : ""}`}
    >
      <div className={compact ? "relative aspect-square overflow-hidden bg-[var(--ci-page-bg,#F5F2ED)]" : "relative aspect-[1/1.08] overflow-hidden bg-[var(--ci-page-bg,#F5F2ED)]"}>
        <ProductMediaDisplay
          product={product}
          alt={product.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-[var(--ci-page-bg,#F5F2ED)]">
              <Coffee className="h-10 w-10 text-[var(--ci-primary-bg,#2F7A52)]" />
            </div>
          }
        />
        {product.promo ? (
          <span className="absolute right-2 top-2 rounded-full bg-[var(--ci-button-bg,#2F7A52)] px-2.5 py-1 text-[10px] font-black text-white shadow">
            {promoOn ? promoBadgeText(product.promo) : "عرض"}
          </span>
        ) : null}
      </div>
      <div className={compact ? "p-3" : "px-3 pb-3 pt-2.5"}>
        <h3 className={`${compact ? "text-sm" : "text-[0.92rem]"} line-clamp-2 font-extrabold leading-snug tracking-normal`}>
          {product.name}
        </h3>
        <div className="mt-1 flex items-end gap-2 text-[var(--ci-muted-fg,#8C8A84)]">
          <span className={`${compact ? "text-sm" : "text-sm"} font-extrabold`}>{formatSar(finalPrice)}</span>
          {hasDiscount ? <span className="text-xs font-black line-through opacity-60">{formatSar(product.price)}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function CustomerBottomDock({
  items,
  active,
}: {
  items: Array<{
    key: CustomerDockKey;
    href: string;
    label: string;
    icon: ElementType;
    enabled?: boolean;
    badge?: number;
  }>;
  active: CustomerDockKey;
}) {
  const visible = items.filter((item) => item.enabled !== false).slice(0, 5);
  if (!visible.length) return null;

  return (
    <nav aria-label="تنقل العميل" className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-t-[26px] border-t border-[var(--ci-border,#E7D7C6)] bg-white/94 px-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_rgba(23,20,18,0.12)] backdrop-blur-xl">
        {visible.map((item) => {
          const Icon = item.icon;
          const selected = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className={`relative flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-1.5 text-[11px] font-black transition active:scale-95 ${
                selected
                  ? "bg-[var(--ci-button-bg,#2F7A52)]/10 text-[var(--ci-button-bg,#2F7A52)]"
                  : "text-[#4E4B56]"
              }`}
            >
              <Icon className="h-6 w-6" />
              {item.badge ? (
                <span className="absolute left-4 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black text-white">
                  {item.badge}
                </span>
              ) : null}
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function defaultCustomerDockItems({
  slug,
  active,
  previewThemeId,
  hasProducts = true,
  hasOrders = true,
  hasRewards = true,
  isCustomer = false,
  accountBadge = 0,
  businessCategory,
}: {
  slug: string;
  active: CustomerDockKey;
  previewThemeId?: string | null;
  hasProducts?: boolean;
  hasOrders?: boolean;
  hasRewards?: boolean;
  isCustomer?: boolean;
  accountBadge?: number;
  businessCategory?: string | null;
}) {
  const preview = previewThemeId ? `?previewTheme=${encodeURIComponent(previewThemeId)}` : "";
  const base = `/c/${encodeURIComponent(slug)}`;
  const copy = getBusinessCopy(businessCategory);
  const isEvents = copy.kind === "events";
  return {
    active,
    items: [
      { key: "home" as const, href: `${base}${preview}`, label: "الرئيسية", icon: Home },
      { key: "menu" as const, href: `${base}/products/popular${preview}`, label: isEvents ? "التذاكر" : "المنتجات", icon: MenuIcon, enabled: hasProducts },
      { key: "orders" as const, href: isEvents ? `${base}/${isCustomer ? "account" : "login"}${preview}` : `${base}/reserve${preview}`, label: isEvents ? "تذاكري" : "الحجوزات", icon: CalendarDays, enabled: hasOrders },
      { key: "rewards" as const, href: `${base}/rewards${preview}`, label: "المكافآت", icon: Sparkles, enabled: hasRewards },
      { key: "account" as const, href: `${base}/${isCustomer ? "account" : "login"}${preview}`, label: "الحساب", icon: UserRound },
    ],
  };
}

export function AccountGroupCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-[0_16px_45px_rgba(23,20,18,0.06)] ring-1 ring-black/5">
      <h2 className="mb-2 text-sm font-black text-[#949188]">{title}</h2>
      <div className="divide-y divide-[#E2DED8]">{children}</div>
    </section>
  );
}

export function AccountMenuRow({
  icon: Icon,
  label,
  value,
  danger,
  onClick,
  href,
}: {
  icon: ElementType;
  label: string;
  value?: string;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <span className="flex min-h-[76px] items-center justify-between gap-3 py-3 text-right">
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-50 text-red-600" : "bg-[var(--ci-button-bg,#2F7A52)]/10 text-[var(--ci-button-bg,#2F7A52)]"}`}>
          <Icon className="h-6 w-6" />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-2xl font-normal ${danger ? "text-red-600" : "text-[#262322]"}`}>
            {label}
          </span>
          {value ? <span className="mt-1 block truncate text-sm font-bold text-[#969187]">{value}</span> : null}
        </span>
      </span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F7F7F7] text-[#262322]">
        <ChevronLeft className="h-5 w-5" />
      </span>
    </span>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return (
    <button type="button" onClick={onClick} className="block w-full text-right">
      {content}
    </button>
  );
}

export const customerDockIcons = {
  Home,
  Sparkles,
  MenuIcon,
  ReceiptText,
  UserRound,
  CalendarDays,
  WalletCards,
  Gift,
  QrCode,
  Search,
  ShieldCheck,
  ArrowLeft,
};
