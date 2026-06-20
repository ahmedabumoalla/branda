"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  BadgePercent,
  Bell,
  CalendarDays,
  CheckCircle2,
  Coffee,
  Download,
  Gift,
  Home,
  Loader2,
  MapPin,
  Menu as MenuIcon,
  RefreshCw,
  ShoppingBag,
  UserRound,
  WalletCards,
} from "lucide-react";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { AppLoyaltyCard, BrandaMadeByMark } from "@/components/cafe/themes/customer-mobile-experience";
import { formatSar } from "@/lib/format";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { isPromoActive, productFinalPrice, promoBadgeText, type MenuProduct } from "@/lib/mock/menu";
import { buildGoogleMapsUrl, type CafeBranch } from "@/lib/mock/branches";
import type { CafeOffer } from "@/lib/mock/offers";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import type { CustomerLoyaltyCardView, LoyaltyCardProgram } from "@/lib/data/loyalty-cards";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import type { ReservationService } from "@/lib/data/platform-upgrade";

type FastTab = "home" | "menu" | "offers" | "reservations" | "loyalty" | "branches";

type CustomerFastPayload = {
  slug: string;
  generatedAt: string;
  settings: CafeSettings;
  customIdentity: CustomIdentityTheme | null;
  features: string[];
  products: MenuProduct[];
  categories: MenuCategoryRecord[];
  offers: CafeOffer[];
  branches: CafeBranch[];
  reservationServices: ReservationService[];
  loyaltyProgram: LoyaltyCardProgram | null;
  customer: BarndaksaCustomerSession | null;
  loyaltyCard: CustomerLoyaltyCardView | null;
};

const FAST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PALETTE = {
  primary: "#6B3A25",
  secondary: "#4A281D",
  button: "#6B3A25",
  background: "#FCF8F3",
  text: "#311912",
  accent: "#D9A33F",
};

function cacheKey(slug: string) {
  return `barndaksa_customer_fast_app_${slug}`;
}

function readCachedPayload(slug: string): CustomerFastPayload | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; payload: CustomerFastPayload };
    if (Date.now() - parsed.at > FAST_CACHE_TTL_MS) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeCachedPayload(slug: string, payload: CustomerFastPayload) {
  try {
    window.localStorage.setItem(cacheKey(slug), JSON.stringify({ at: Date.now(), payload }));
  } catch {}
}

async function loadPublicCafeFallbackPayload(slug: string): Promise<CustomerFastPayload> {
  const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(res.status === 404 ? "العلامة غير موجودة" : "تعذر تحميل بيانات العلامة");
  }

  const data = (await res.json()) as {
    settings?: CafeSettings;
    customIdentity?: CustomIdentityTheme | null;
    features?: unknown[];
  };

  if (!data.settings) throw new Error("تعذر قراءة بيانات العلامة");

  return {
    slug,
    generatedAt: new Date().toISOString(),
    settings: data.settings,
    customIdentity: data.customIdentity ?? null,
    features: Array.isArray(data.features) ? data.features.map(String) : [],
    products: [],
    categories: [],
    offers: [],
    branches: [],
    reservationServices: [],
    loyaltyProgram: null,
    customer: null,
    loyaltyCard: null,
  };
}

function firstImage(product: MenuProduct) {
  return product.imageDataUrl || product.imageGallery?.find((image) => image.imageDataUrl)?.imageDataUrl || null;
}

function isOfferVisible(offer: CafeOffer) {
  return !["غير نشط", "inactive", "منتهي", "expired", "مسودة", "draft"].includes(String(offer.status ?? ""));
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("ar-SA").format(value);
}

function reservationDurationLabel(service: ReservationService) {
  if (!service.durationValue || !service.durationUnit) return null;
  const unitLabels: Record<string, string> = {
    minute: "دقيقة",
    hour: "ساعة",
    day: "يوم",
  };
  return `${service.durationValue} ${unitLabels[service.durationUnit] ?? service.durationUnit}`;
}

function TabButton({
  tab,
  active,
  icon,
  label,
  onClick,
}: {
  tab: FastTab;
  active: FastTab;
  icon: ReactNode;
  label: string;
  onClick: (tab: FastTab) => void;
}) {
  const selected = tab === active;
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-1.5 text-[11px] font-black transition active:scale-95 ${
        selected ? "bg-[var(--fast-button)]/10 text-[var(--fast-button)]" : "text-[#4E4B56]"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function InstallMiniButton({ slug }: { slug: string }) {
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = `/api/pwa/${encodeURIComponent(slug)}/manifest`;
    document.head.appendChild(manifest);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`/api/pwa/${encodeURIComponent(slug)}/sw`, {
        scope: `/app/${encodeURIComponent(slug)}/`,
      });
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      manifest.remove();
    };
  }, [slug]);

  async function install() {
    const promptEvent = installPrompt as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: string }>;
    };

    if (promptEvent?.prompt) {
      await promptEvent.prompt();
      setMessage("إذا لم يظهر التثبيت استخدم إضافة إلى الشاشة الرئيسية من المتصفح");
      return;
    }

    setMessage("في iPhone افتح المشاركة ثم اختر إضافة إلى الشاشة الرئيسية");
  }

  return (
    <div>
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-xs font-black text-white backdrop-blur"
      >
        <Download className="h-4 w-4" />
        تثبيت التطبيق
      </button>
      {message ? <p className="mt-2 text-xs font-bold leading-6 text-white/80">{message}</p> : null}
    </div>
  );
}

function ProductCard({ slug, product }: { slug: string; product: MenuProduct }) {
  const image = firstImage(product);
  const promoOn = product.promo ? isPromoActive(product.promo) : false;
  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscount = promoOn && finalPrice < product.price;

  return (
    <Link
      href={`/c/${encodeURIComponent(slug)}/product/${encodeURIComponent(product.id)}`}
      className="barndaksa-premium-card grid grid-cols-[92px_1fr] gap-3 rounded-[28px] border border-[var(--fast-border)] bg-white/90 p-3 shadow-[0_18px_45px_rgba(49,25,18,0.08)] backdrop-blur transition active:scale-[0.985]"
    >
      <div className="relative h-28 overflow-hidden rounded-[24px] bg-[var(--fast-soft)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={product.name} className="h-full w-full object-cover transition duration-500 hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#4A281D] to-[#9B6A34] text-white">
            <Coffee className="h-8 w-8" />
          </div>
        )}
        {product.promo ? (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--fast-accent)] px-2 py-1 text-[10px] font-black text-[#311912] shadow">
            {promoBadgeText(product.promo)}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 py-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate rounded-full bg-[var(--fast-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--fast-button)]">
            {product.category || "منتج"}
          </span>
          {product.preparationTimeMinutes ? (
            <span className="shrink-0 text-[10px] font-black text-[var(--fast-muted)]">
              {product.preparationTimeMinutes} د
            </span>
          ) : null}
        </div>
        <h3 className="mt-2 line-clamp-1 text-lg font-black text-[var(--fast-text)]">{product.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-[var(--fast-muted)]">
          {product.description || "منتج متاح داخل العلامة"}
        </p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-lg font-black text-[var(--fast-text)]">{formatSar(finalPrice)}</span>
          {hasDiscount ? <span className="pb-0.5 text-xs font-black text-[#9B8B7B] line-through">{formatSar(product.price)}</span> : null}
        </div>
      </div>
    </Link>
  );
}

function LoyaltyPanel({ slug, payload }: { slug: string; payload: CustomerFastPayload }) {
  const card = payload.loyaltyCard?.card;
  const program = payload.loyaltyCard?.program ?? payload.loyaltyProgram;
  const required = Math.max(1, Number(program?.purchasesRequired ?? 7));
  const stamps = Math.min(required, Number(card?.stampsInCycle ?? 0));

  if (!payload.customer) {
    return (
      <section className="rounded-[30px] border border-[var(--fast-border)] bg-white/90 p-5 text-center shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
        <WalletCards className="mx-auto h-10 w-10 text-[var(--fast-button)]" />
        <h2 className="mt-3 text-2xl font-black text-[var(--fast-text)]">بطاقة الولاء جاهزة بعد تسجيل الدخول</h2>
        <p className="mt-2 text-sm font-bold leading-7 text-[var(--fast-muted)]">
          سجل دخولك مرة واحدة وستظهر البطاقة والـ QR بسرعة من التطبيق المثبت.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link href={`/c/${encodeURIComponent(slug)}/login`} className="rounded-2xl bg-[var(--fast-button)] px-5 py-3 font-black text-white">
            تسجيل الدخول
          </Link>
          <Link href={`/c/${encodeURIComponent(slug)}/register`} className="rounded-2xl border border-[var(--fast-button)] px-5 py-3 font-black text-[var(--fast-button)]">
            إنشاء حساب
          </Link>
        </div>
      </section>
    );
  }

  if (!card?.cardCode) {
    return (
      <section className="rounded-[30px] border border-[var(--fast-border)] bg-white/90 p-5 text-center shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
        <Loader2 className="mx-auto h-9 w-9 animate-spin text-[var(--fast-button)]" />
        <h2 className="mt-3 text-xl font-black text-[var(--fast-text)]">جاري تجهيز بطاقة الولاء</h2>
        <p className="mt-2 text-sm font-bold leading-7 text-[var(--fast-muted)]">حدث التطبيق بعد لحظات أو افتح حسابك الكامل.</p>
        <Link href={`/c/${encodeURIComponent(slug)}/account`} className="mt-5 inline-flex rounded-2xl bg-[var(--fast-button)] px-5 py-3 font-black text-white">
          فتح الحساب الكامل
        </Link>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[34px] bg-[var(--fast-button)] p-5 text-white shadow-[0_22px_55px_rgba(49,25,18,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[var(--fast-accent)]">بطاقة الولاء</p>
          <h2 className="mt-1 text-2xl font-black">{program?.cardTitle || "بطاقة الولاء"}</h2>
          <p className="mt-2 text-xs font-bold leading-6 text-white/75">{program?.cardSubtitle || "اجمع الأختام واستبدل مكافآتك"}</p>
        </div>
        <span className="rounded-2xl bg-white/12 p-3">
          <WalletCards className="h-6 w-6" />
        </span>
      </div>

      <div className="mt-5 rounded-[28px] bg-white p-4 text-[#311912]">
        <SecureQrCode kind="loyalty-card" value={card.cardCode} title={`QR بطاقة الولاء ${card.cardCode}`} size={190} />
        <p className="mt-3 select-all rounded-2xl bg-[#FCF8F3] px-3 py-2 text-center font-mono text-sm font-black tracking-[0.18em]">
          {card.cardCode}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-white/12 p-3">
          <p className="text-2xl font-black">{stamps}</p>
          <p className="text-[11px] font-bold text-white/70">الأختام</p>
        </div>
        <div className="rounded-2xl bg-white/12 p-3">
          <p className="text-2xl font-black">{required}</p>
          <p className="text-[11px] font-bold text-white/70">المطلوب</p>
        </div>
        <div className="rounded-2xl bg-white/12 p-3">
          <p className="text-2xl font-black">{card.availableRewards ?? 0}</p>
          <p className="text-[11px] font-bold text-white/70">مكافآت</p>
        </div>
      </div>

      {(card.availableRewards ?? 0) > 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[var(--fast-accent)] p-4 font-black text-[#311912]">
          <Gift className="h-5 w-5" />
          لديك مكافأة جاهزة للصرف
        </div>
      ) : null}
    </section>
  );
}

export function CustomerFastAppClient({ slug }: { slug: string }) {
  const [payload, setPayload] = useState<CustomerFastPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [activeTab, setActiveTab] = useState<FastTab>("home");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  async function loadPayload(mode: "initial" | "refresh" = "initial") {
    if (mode === "refresh") setRefreshing(true);
    try {
      const res = await fetch(`/api/customer-fast/${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 404 ? "العلامة غير موجودة" : "تعذر تحميل التطبيق السريع");
      const data = (await res.json()) as CustomerFastPayload;
      writeCachedPayload(slug, data);
      setPayload(data);
      setError(null);
      setOfflineMode(false);
    } catch (err) {
      const cached = readCachedPayload(slug);
      if (cached) {
        setPayload(cached);
        setOfflineMode(true);
        setError(null);
      } else {
        try {
          const fallback = await loadPublicCafeFallbackPayload(slug);
          if (process.env.NODE_ENV === "development") {
            console.warn("[customer-fast-app] using public cafe fallback", { slug });
          }
          writeCachedPayload(slug, fallback);
          setPayload(fallback);
          setOfflineMode(false);
          setError(null);
        } catch {
          setError(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const cached = readCachedPayload(slug);
    if (cached) {
      setPayload(cached);
      setLoading(false);
    }
    void loadPayload("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const palette = payload?.customIdentity?.palette ?? DEFAULT_PALETTE;
  const style = {
    "--fast-bg": palette.background,
    "--fast-text": palette.text,
    "--fast-button": palette.button || palette.primary,
    "--fast-primary": palette.primary,
    "--fast-secondary": palette.secondary,
    "--fast-accent": palette.accent,
    "--fast-soft": "rgba(242,231,217,0.72)",
    "--fast-border": "rgba(106,58,37,0.14)",
    "--fast-muted": "#806A5E",
  } as CSSProperties;

  const cafeName = payload?.settings?.cafeName || slug;
  const cafeLogoUrl = payload?.settings?.logoDataUrl ?? payload?.settings?.logoAssetId;
  const features = payload?.features ?? [];
  const allow = (feature: string) => featureCodesAllow(features, feature);
  const products = useMemo(() => allow("menu") ? payload?.products?.filter((product) => product.available !== false) ?? [] : [], [features, payload?.products]);
  const offers = useMemo(() => allow("offers") ? payload?.offers?.filter(isOfferVisible) ?? [] : [], [features, payload?.offers]);
  const reservationServices = useMemo(() => allow("reservations") ? payload?.reservationServices?.filter((service) => service.active !== false) ?? [] : [], [features, payload?.reservationServices]);
  const branches = allow("branches") ? payload?.branches ?? [] : [];
  const categories = allow("menu") ? payload?.categories?.filter((category) => category.visible !== false) ?? [] : [];
  const filteredProducts = selectedCategory === "all" ? products : products.filter((product) => product.categoryId === selectedCategory || product.category === selectedCategory);
  const topProducts = products.slice(0, 5);

  if (loading && !payload) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3] px-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#6B3A25]" />
          <p className="mt-4 font-black text-[#311912]">جاري فتح تطبيق العلامة...</p>
        </div>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3] px-4">
        <div className="max-w-md rounded-[30px] bg-white p-6 text-center shadow-xl">
          <p className="text-lg font-black text-[#311912]">{error}</p>
          <button type="button" onClick={() => void loadPayload("refresh")} className="mt-5 rounded-2xl bg-[#6B3A25] px-5 py-3 font-black text-white">
            إعادة المحاولة
          </button>
        </div>
      </main>
    );
  }

  if (!payload) return null;

  return (
    <main dir="rtl" className="min-h-screen bg-[var(--fast-bg)] pb-28 text-[var(--fast-text)]" style={style}>
      <header className="sticky top-0 z-40 border-b border-[var(--fast-border)] bg-[var(--fast-bg)]/88 px-4 py-3 shadow-[0_12px_35px_rgba(49,25,18,0.06)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-[var(--fast-accent)]">تطبيق العميل السريع</p>
            <h1 className="truncate text-lg font-black">{cafeName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadPayload("refresh")}
              disabled={refreshing}
              className="rounded-2xl border border-[var(--fast-border)] bg-white/75 p-3 text-[var(--fast-button)] shadow-sm transition active:scale-95 disabled:opacity-60"
              title="تحديث"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <Link href={payload.customer ? `/c/${encodeURIComponent(slug)}/account` : `/c/${encodeURIComponent(slug)}/login`} className="rounded-2xl bg-[var(--fast-button)] p-3 text-white shadow-sm transition active:scale-95" title="حسابي">
              <UserRound className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {offlineMode ? (
        <div className="mx-auto max-w-2xl px-4 pt-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black text-amber-800">
            يتم عرض نسخة محفوظة مؤقتًا حتى يعود الاتصال.
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <section className="flex flex-col items-center text-center">
          <CafeLogo name={cafeName} logoUrl={cafeLogoUrl} size="lg" />
          <h1 className="mt-3 max-w-full truncate text-3xl font-black text-[var(--fast-text)]">
            {cafeName}
          </h1>
          <BrandaMadeByMark className="mt-3" />
        </section>

        {allow("loyalty") ? (
          <AppLoyaltyCard
            customerName={payload.customer?.fullName}
            code={payload.loyaltyCard?.card?.cardCode}
            points={payload.loyaltyCard?.card?.availableRewards ?? 0}
            current={payload.loyaltyCard?.card?.stampsInCycle ?? 0}
            required={payload.loyaltyCard?.program?.purchasesRequired ?? payload.loyaltyProgram?.purchasesRequired ?? 7}
            isAuthenticated={Boolean(payload.customer)}
            loginHref={`/c/${encodeURIComponent(slug)}/login`}
            onClickHref={payload.customer ? `/c/${encodeURIComponent(slug)}/account` : undefined}
          />
        ) : null}

        <section className="barndaksa-premium-hero overflow-hidden rounded-[38px] bg-gradient-to-br from-[var(--fast-button)] to-[var(--fast-secondary)] p-5 text-white shadow-[0_26px_80px_rgba(49,25,18,0.22)]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-black text-[var(--fast-accent)]">أهلًا بك في</p>
              <h2 className="mt-1 truncate text-3xl font-black">{cafeName}</h2>
              <p className="mt-3 line-clamp-3 text-sm font-bold leading-7 text-white/78">
                {payload.settings.description || "منيو وعروض وبطاقة ولاء في تجربة خفيفة وسريعة على الجوال"}
              </p>
            </div>
            <div className="shrink-0 rounded-[24px] bg-white/12 p-4 shadow-inner">
              <Coffee className="h-8 w-8 text-[var(--fast-accent)]" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {allow("menu") ? (
              <button
                type="button"
                onClick={() => setActiveTab("menu")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[var(--fast-button)] shadow-sm transition active:scale-95"
              >
                <ShoppingBag className="h-4 w-4" />
                المنتجات
              </button>
            ) : null}
            {allow("offers") ? (
              <button
                type="button"
                onClick={() => setActiveTab("offers")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/12 px-4 py-3 text-sm font-black text-white backdrop-blur transition active:scale-95"
              >
                <BadgePercent className="h-4 w-4" />
                العروض والخصومات
              </button>
            ) : null}
            {allow("reservations") ? (
              <button
                type="button"
                onClick={() => setActiveTab("reservations")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/12 px-4 py-3 text-sm font-black text-white backdrop-blur transition active:scale-95"
              >
                <CalendarDays className="h-4 w-4" />
                الحجوزات
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {allow("menu") ? (
              <button type="button" onClick={() => setActiveTab("menu")} className="rounded-2xl bg-white/12 p-3 transition active:scale-95">
                <p className="text-lg font-black">{compactNumber(products.length)}</p>
                <p className="text-[10px] font-bold text-white/70">منتج</p>
              </button>
            ) : null}
            {allow("offers") ? (
              <button type="button" onClick={() => setActiveTab("offers")} className="rounded-2xl bg-white/12 p-3 transition active:scale-95">
                <p className="text-lg font-black">{compactNumber(offers.length)}</p>
                <p className="text-[10px] font-bold text-white/70">عرض</p>
              </button>
            ) : null}
            {allow("reservations") ? (
              <button type="button" onClick={() => setActiveTab("reservations")} className="rounded-2xl bg-white/12 p-3 transition active:scale-95">
                <p className="text-lg font-black">{compactNumber(reservationServices.length)}</p>
                <p className="text-[10px] font-bold text-white/70">حجز</p>
              </button>
            ) : null}
            {allow("branches") ? (
              <button type="button" onClick={() => setActiveTab("branches")} className="rounded-2xl bg-white/12 p-3 transition active:scale-95">
                <p className="text-lg font-black">{compactNumber(branches.length)}</p>
                <p className="text-[10px] font-bold text-white/70">فرع</p>
              </button>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <InstallMiniButton slug={slug} />
            {payload.customer ? (
              <span className="inline-flex items-center gap-2 rounded-2xl bg-white/12 px-4 py-3 text-xs font-black text-white">
                <CheckCircle2 className="h-4 w-4 text-[var(--fast-accent)]" />
                {payload.customer.fullName}
              </span>
            ) : null}
          </div>
        </section>

        {activeTab === "home" ? (
          <>
            <section className="grid grid-cols-2 gap-3">
              {allow("loyalty") ? (
                <button onClick={() => setActiveTab("loyalty")} type="button" className="barndaksa-premium-card rounded-[28px] border border-[var(--fast-border)] bg-white/90 p-4 text-right shadow-[0_14px_35px_rgba(49,25,18,0.07)] transition active:scale-[0.985]">
                  <WalletCards className="h-7 w-7 text-[var(--fast-button)]" />
                  <h3 className="mt-3 font-black">بطاقتي</h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-[var(--fast-muted)]">QR الولاء والمكافآت</p>
                </button>
              ) : null}
              {allow("reservations") ? (
                <button onClick={() => setActiveTab("reservations")} type="button" className="barndaksa-premium-card rounded-[28px] border border-[var(--fast-border)] bg-white/90 p-4 text-right shadow-[0_14px_35px_rgba(49,25,18,0.07)] transition active:scale-[0.985]">
                  <CalendarDays className="h-7 w-7 text-[var(--fast-button)]" />
                  <h3 className="mt-3 font-black">الحجوزات</h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-[var(--fast-muted)]">الخدمات المتاحة للحجز</p>
                </button>
              ) : null}
              {allow("menu") ? (
                <button onClick={() => setActiveTab("menu")} type="button" className="barndaksa-premium-card rounded-[28px] border border-[var(--fast-border)] bg-white/90 p-4 text-right shadow-[0_14px_35px_rgba(49,25,18,0.07)] transition active:scale-[0.985]">
                  <ShoppingBag className="h-7 w-7 text-[var(--fast-button)]" />
                  <h3 className="mt-3 font-black">المنيو</h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-[var(--fast-muted)]">تصفح سريع وخفيف</p>
                </button>
              ) : null}
              <Link href={`/c/${encodeURIComponent(slug)}/notifications`} className="barndaksa-premium-card rounded-[28px] border border-[var(--fast-border)] bg-white/90 p-4 shadow-[0_14px_35px_rgba(49,25,18,0.07)] transition active:scale-[0.985]">
                <Bell className="h-7 w-7 text-[var(--fast-button)]" />
                <h3 className="mt-3 font-black">التنبيهات</h3>
                <p className="mt-1 text-xs font-bold leading-5 text-[var(--fast-muted)]">آخر التحديثات</p>
              </Link>
            </section>

            {allow("offers") && offers.length ? (
              <section className="barndaksa-premium-card rounded-[32px] border border-[var(--fast-border)] bg-white/90 p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-[var(--fast-accent)]">عروض نشطة</p>
                    <h2 className="text-xl font-black">لا تفوتها</h2>
                  </div>
                  <button type="button" onClick={() => setActiveTab("offers")} className="text-xs font-black text-[var(--fast-button)]">كل العروض</button>
                </div>
                <div className="space-y-3">
                  {offers.slice(0, 2).map((offer) => (
                    <div key={offer.id} className="rounded-[26px] bg-[var(--fast-soft)] p-4 shadow-inner">
                      <p className="text-base font-black">{offer.promoProductName || offer.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-[var(--fast-muted)]">{offer.description || "عرض خاص من العلامة"}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {allow("menu") ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black">مختارات سريعة</h2>
                  <button type="button" onClick={() => setActiveTab("menu")} className="text-xs font-black text-[var(--fast-button)]">كل المنيو</button>
                </div>
                {topProducts.length ? topProducts.map((product) => <ProductCard key={product.id} slug={slug} product={product} />) : (
                  <div className="rounded-[26px] border border-dashed border-[var(--fast-border)] bg-white/70 p-6 text-center text-sm font-black text-[var(--fast-muted)]">
                    لا توجد منتجات متاحة حاليًا
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {activeTab === "menu" && allow("menu") ? (
          <section className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setSelectedCategory("all")} className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black ${selectedCategory === "all" ? "bg-[var(--fast-button)] text-white" : "bg-white text-[var(--fast-button)]"}`}>
                الكل
              </button>
              {categories.map((category) => (
                <button key={category.id} type="button" onClick={() => setSelectedCategory(category.id)} className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black ${selectedCategory === category.id ? "bg-[var(--fast-button)] text-white" : "bg-white text-[var(--fast-button)]"}`}>
                  {category.name}
                </button>
              ))}
            </div>
            {filteredProducts.length ? filteredProducts.map((product) => <ProductCard key={product.id} slug={slug} product={product} />) : (
              <div className="rounded-[26px] border border-dashed border-[var(--fast-border)] bg-white/70 p-6 text-center text-sm font-black text-[var(--fast-muted)]">
                لا توجد منتجات في هذا القسم
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "offers" && allow("offers") ? (
          <section className="space-y-3">
            {offers.length ? offers.map((offer) => (
              <div key={offer.id} className="barndaksa-premium-card rounded-[30px] border border-[var(--fast-border)] bg-white/90 p-5 shadow-[0_16px_45px_rgba(49,25,18,0.08)]">
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-[var(--fast-soft)] p-3 text-[var(--fast-button)]">
                    <BadgePercent className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-[var(--fast-text)]">{offer.promoProductName || offer.title}</h3>
                    <p className="mt-1 text-sm font-bold leading-7 text-[var(--fast-muted)]">{offer.description || "عرض خاص"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {offer.discountPercent ? <span className="rounded-full bg-[var(--fast-accent)] px-3 py-1 text-xs font-black text-[#311912]">خصم {offer.discountPercent}%</span> : null}
                      {offer.endDate ? <span className="rounded-full bg-[var(--fast-soft)] px-3 py-1 text-xs font-black text-[var(--fast-muted)]">ينتهي {offer.endDate}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-[26px] border border-dashed border-[var(--fast-border)] bg-white/70 p-6 text-center text-sm font-black text-[var(--fast-muted)]">
                لا توجد عروض نشطة الآن
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "reservations" && allow("reservations") ? (
          <section className="space-y-3">
            <div className="barndaksa-premium-card rounded-[32px] border border-[var(--fast-border)] bg-white/90 p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-[var(--fast-accent)]">الحجوزات</p>
                  <h2 className="text-xl font-black text-[var(--fast-text)]">اختر خدمة الحجز المناسبة</h2>
                  <p className="mt-1 text-sm font-bold leading-7 text-[var(--fast-muted)]">تصفح الخدمات بسرعة، ثم أكمل تفاصيل الحجز من صفحة الحجز الكاملة.</p>
                </div>
                <Link href={`/c/${encodeURIComponent(slug)}/reserve`} className="shrink-0 rounded-2xl bg-[var(--fast-button)] px-4 py-3 text-xs font-black text-white shadow-sm transition active:scale-95">
                  حجز جديد
                </Link>
              </div>
            </div>

            {reservationServices.length ? reservationServices.map((service) => (
              <Link key={service.id} href={`/c/${encodeURIComponent(slug)}/reserve`} className="barndaksa-premium-card block rounded-[30px] border border-[var(--fast-border)] bg-white/90 p-5 shadow-[0_16px_45px_rgba(49,25,18,0.08)] transition active:scale-[0.985]">
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-[var(--fast-soft)] p-3 text-[var(--fast-button)]">
                    <CalendarDays className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-black text-[var(--fast-text)]">{service.name}</h3>
                      <span className="shrink-0 rounded-full bg-[var(--fast-accent)] px-3 py-1 text-xs font-black text-[#311912]">
                        {service.isFree ? "مجاني" : service.price === null ? "حسب الخدمة" : formatSar(service.price)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold leading-7 text-[var(--fast-muted)]">{service.description || "خدمة حجز متاحة لدى العلامة"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {service.maxGuests ? <span className="rounded-full bg-[var(--fast-soft)] px-3 py-1 text-xs font-black text-[var(--fast-button)]">حتى {service.maxGuests} أشخاص</span> : null}
                      {reservationDurationLabel(service) ? <span className="rounded-full bg-[var(--fast-soft)] px-3 py-1 text-xs font-black text-[var(--fast-button)]">{reservationDurationLabel(service)}</span> : null}
                      {service.amenities.slice(0, 2).map((amenity) => (
                        <span key={amenity} className="rounded-full bg-[var(--fast-soft)] px-3 py-1 text-xs font-black text-[var(--fast-muted)]">{amenity}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            )) : (
              <div className="rounded-[26px] border border-dashed border-[var(--fast-border)] bg-white/70 p-6 text-center text-sm font-black text-[var(--fast-muted)]">
                لا توجد خدمات حجز ظاهرة حاليًا
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "loyalty" && allow("loyalty") ? <LoyaltyPanel slug={slug} payload={payload} /> : null}

        {activeTab === "branches" && allow("branches") ? (
          <section className="space-y-3">
            {branches.length ? branches.map((branch) => (
              <div key={branch.id} className="barndaksa-premium-card rounded-[30px] border border-[var(--fast-border)] bg-white/90 p-5 shadow-[0_16px_45px_rgba(49,25,18,0.08)]">
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-[var(--fast-soft)] p-3 text-[var(--fast-button)]"><MapPin className="h-6 w-6" /></span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-[var(--fast-text)]">{branch.name}</h3>
                    <p className="mt-1 text-sm font-bold leading-7 text-[var(--fast-muted)]">{branch.address || branch.city || "فرع متاح"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {branch.phone ? <a href={`tel:${branch.phone}`} className="rounded-full bg-[var(--fast-button)] px-3 py-1 text-xs font-black text-white">اتصال</a> : null}
                      {branch.mapUrl ? <a href={buildGoogleMapsUrl(branch.lat, branch.lng, branch.mapUrl)} target="_blank" rel="noreferrer" className="rounded-full bg-[var(--fast-soft)] px-3 py-1 text-xs font-black text-[var(--fast-button)]">الخريطة</a> : null}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-[26px] border border-dashed border-[var(--fast-border)] bg-white/70 p-6 text-center text-sm font-black text-[var(--fast-muted)]">
                لا توجد فروع ظاهرة حاليًا
              </div>
            )}
          </section>
        ) : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-t-[26px] border-t border-[var(--fast-border)] bg-white/94 px-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_rgba(23,20,18,0.12)] backdrop-blur-xl">
          <TabButton tab="home" active={activeTab} icon={<Home className="h-6 w-6" />} label="الرئيسية" onClick={setActiveTab} />
          {allow("menu") ? <TabButton tab="menu" active={activeTab} icon={<MenuIcon className="h-6 w-6" />} label="المنتجات" onClick={setActiveTab} /> : null}
          {allow("reservations") ? <TabButton tab="reservations" active={activeTab} icon={<CalendarDays className="h-6 w-6" />} label="الحجوزات" onClick={setActiveTab} /> : null}
          {allow("loyalty") ? <TabButton tab="loyalty" active={activeTab} icon={<WalletCards className="h-6 w-6" />} label="المكافآت" onClick={setActiveTab} /> : null}
          <Link
            href={payload.customer ? `/c/${encodeURIComponent(slug)}/account` : `/c/${encodeURIComponent(slug)}/login`}
            className="flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-1.5 text-[11px] font-black text-[#4E4B56] transition active:scale-95"
          >
            <UserRound className="h-6 w-6" />
            <span className="truncate">الحساب</span>
          </Link>
        </div>
      </nav>
    </main>
  );
}
