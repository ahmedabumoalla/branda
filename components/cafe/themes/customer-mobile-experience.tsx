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
  Swords,
  Utensils,
  UserRound,
  WalletCards,
} from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { SharedLoyaltyCard } from "@/components/loyalty/shared-loyalty-card";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { formatSar } from "@/lib/format";
import type { LoyaltyCardDesign, LoyaltyTextElementId } from "@/lib/loyalty/types";
import {
  isPromoActive,
  productFinalPrice,
  promoBadgeText,
  type MenuProduct,
} from "@/lib/mock/menu";
import { getBusinessCopy } from "@/lib/platform/business-copy";

export type CustomerDockKey = "home" | "orders" | "menu" | "games" | "rewards" | "account";

function textElement(
  id: LoyaltyTextElementId,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  enabled = true,
) {
  return {
    id,
    text,
    x,
    y,
    width,
    height,
    fontSize,
    fontWeight: 900,
    color: "#FCF8F3",
    align: "right" as const,
    enabled,
  };
}

function publicLoyaltyCardDesign(input: {
  customerName?: string;
  code: string;
  current: number;
  required: number;
  businessCategory?: string;
}): LoyaltyCardDesign {
  const copy = getBusinessCopy(input.businessCategory);

  return {
    enabled: true,
    layoutVersion: "reference-horizontal-v1",
    pointsEnabled: true,
    brandName: input.customerName || "عميل العلامة",
    cardTitle: "بطاقة الولاء",
    subtitle: copy.kind === "events" ? "اجمع الأختام واستبدل مكافأتك بسهولة" : "اجمع الأختام واستبدل مكافأتك بسهولة",
    rewardTitle: "مشروب مجاني عند اكتمال البطاقة",
    supportingText: "اعرض البطاقة عند الكاشير",
    stampLabel: copy.loyaltyUnitLit,
    terms: "",
    stampsRequired: input.required,
    completedStamps: input.current,
    cardBackground: "#F6BE18",
    cardForeground: "#17212B",
    cardAccent: "#64BFA9",
    logoRemoveLightBackground: false,
    logoBackgroundTolerance: 20,
    logoPlacement: "top-right",
    logoSize: 18,
    logoOffsetX: 0,
    logoOffsetY: 0,
    logoX: 73,
    logoY: 8,
    logoWidth: 16,
    logoHeight: 16,
    progressIcon: "star",
    barcodeVisible: true,
    barcodeX: 40,
    barcodeY: 46,
    barcodeWidth: 53,
    barcodeHeight: 22,
    qrX: 5,
    qrY: 50,
    qrWidth: 31,
    qrHeight: 42,
    pointsBadgeVisible: true,
    pointsBadgeX: 5,
    pointsBadgeY: 8,
    pointsBadgeWidth: 33,
    pointsBadgeHeight: 27,
    sampleCode: input.code,
    textElements: {
      brand: { ...textElement("brand", input.customerName || "عميل العلامة", 48, 7, 28, 6, 11, false), color: "#17212B" },
      title: { ...textElement("title", "بطاقة الولاء", 49, 13, 44, 14, 34), color: "#17212B" },
      subtitle: { ...textElement("subtitle", "اجمع الأختام واستبدل مكافأتك بسهولة", 45, 28, 48, 9, 15), color: "#17212B", fontWeight: 800 },
      reward: { ...textElement("reward", "مشروب مجاني عند اكتمال البطاقة", 40, 38, 53, 7, 15), color: "#64BFA9" },
      helper: textElement("helper", "", 53, 7, 40, 6, 11, false),
      pointsLabel: { ...textElement("pointsLabel", "نقاط الولاء", 8, 11, 28, 5, 12, true), color: "#806A5E" },
      pointsValue: { ...textElement("pointsValue", "{{points}} نقطة", 8, 18, 28, 6, 17, true), color: "#17100D" },
      pointsValueSar: { ...textElement("pointsValueSar", "{{value}} ر.س", 8, 26, 28, 5, 12, true), color: "#806A5E", fontWeight: 800 },
      barcodeLabel: { ...textElement("barcodeLabel", "{{code}}", 42, 69, 49, 5, 11), color: "#17100D", align: "center" },
    },
  };
}

export function BrandaMadeByMark({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center gap-2 rounded-full bg-white/78 px-3 py-1.5 text-[10px] font-black text-[var(--ci-muted-fg,#806A5E)] shadow-sm ring-1 ring-[var(--ci-border,#E7D7C6)] ${className}`}>
      <span>{"\u0645\u0635\u0645\u0645 \u0628\u0648\u0627\u0633\u0637\u0629"}</span>
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
  pointValueSar = 0,
  current = 0,
  required = 7,
  onClickHref,
  isAuthenticated = true,
  loginHref,
  businessCategory,
  cardDesign,
  pointsEnabled,
}: {
  customerName?: string;
  code?: string;
  points?: number;
  pointValueSar?: number;
  current?: number;
  required?: number;
  onClickHref?: string;
  isAuthenticated?: boolean;
  loginHref?: string;
  businessCategory?: string;
  cardDesign?: LoyaltyCardDesign | null;
  pointsEnabled?: boolean;
}) {
  const safeRequired = Math.max(1, Math.min(60, Number(required || 7)));
  const completedStamps = Math.max(0, Math.min(safeRequired, Number(current || 0)));
  const effectiveCode = code?.trim();
  const previewCard = effectiveCode
    ? cardDesign
      ? {
          ...cardDesign,
          brandName: cardDesign.brandName || customerName || "عميل العلامة",
          completedStamps,
          stampsRequired: safeRequired,
          sampleCode: effectiveCode,
        }
      : publicLoyaltyCardDesign({
          customerName,
          code: effectiveCode,
          current: completedStamps,
          required: safeRequired,
          businessCategory,
        })
    : null;

  const content = (
    <article className="barndaksa-premium-card relative isolate overflow-hidden rounded-[22px]">
      {previewCard ? (
        <SharedLoyaltyCard
          card={isAuthenticated ? previewCard : { ...previewCard, completedStamps: 0 }}
          pointsBalance={points}
          pointValueSar={pointValueSar}
          compact
          pointsEnabled={pointsEnabled ?? previewCard.pointsEnabled ?? true}
        />
      ) : (
        <div className="rounded-[22px] border border-[var(--ci-border,#E7D7C6)] bg-white p-5 text-center shadow-sm">
          <WalletCards className="mx-auto h-8 w-8 text-[var(--ci-button-bg,#6B3A25)]" />
          <h2 className="mt-3 text-sm font-black text-[#17212B]">
            {isAuthenticated ? "لا توجد بطاقة ولاء مرتبطة بحسابك بعد" : "سجل دخولك لعرض بطاقة الولاء الخاصة بك"}
          </h2>
        </div>
      )}
      {!isAuthenticated && loginHref ? (
        <div className="absolute inset-x-3 bottom-3 z-30 rounded-2xl bg-white/92 p-3 text-center shadow-[0_12px_30px_rgba(23,33,43,0.16)] backdrop-blur">
          <h2 className="text-sm font-black text-[#17212B]">{"\u0633\u062c\u0644 \u062f\u062e\u0648\u0644\u0643 \u0644\u0631\u0628\u0637 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0648\u0644\u0627\u0621 \u0627\u0644\u062e\u0627\u0635\u0629 \u0628\u0643"}</h2>
          <Link
            href={loginHref}
            className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#17212B] px-4 text-xs font-black text-white shadow-sm transition active:scale-95"
          >
            <UserRound className="h-4 w-4" />
            {"\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644"}</Link>
        </div>
      ) : null}
    </article>
  );

  if (!onClickHref || !isAuthenticated) return content;
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
              aria-label={`\u0639\u0631\u0636 ${index + 1}`}
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
            {promoOn ? promoBadgeText(product.promo) : "\u0639\u0631\u0636"}
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
    <nav aria-label={"\u062a\u0646\u0642\u0644 \u0627\u0644\u0639\u0645\u064a\u0644"} className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div
        className="grid w-full gap-1 rounded-t-[26px] border-t border-[var(--ci-border,#E7D7C6)] bg-white/94 px-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_rgba(23,20,18,0.12)] backdrop-blur-xl"
        style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
      >
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
  hasGames = false,
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
  hasGames?: boolean;
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
      { key: "menu" as const, href: `${base}/products/popular${preview}`, label: isEvents ? "\u0627\u0644\u062a\u0630\u0627\u0643\u0631" : "\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a", icon: MenuIcon, enabled: hasProducts },
      { key: "home" as const, href: `${base}/offers${preview}`, label: "\u0627\u0644\u0639\u0631\u0648\u0636", icon: Home },
      { key: "games" as const, href: `${base}/games${preview}`, label: "\u0627\u0644\u0623\u0644\u0639\u0627\u0628", icon: Swords, enabled: hasGames },
      { key: "rewards" as const, href: `${base}/rewards${preview}`, label: "\u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062a", icon: Sparkles, enabled: hasRewards },
      { key: "account" as const, href: `${base}/${isCustomer ? "account" : "login"}${preview}`, label: "\u0627\u0644\u062d\u0633\u0627\u0628", icon: UserRound },
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
