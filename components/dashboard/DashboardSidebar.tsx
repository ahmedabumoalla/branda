"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ElementType } from "react";
import {
  BadgeCheck,
  BarChart3,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  DoorOpen,
  FileText,
  Gift,
  Home,
  Landmark,
  LockKeyhole,
  LogOut,
  MapPin,
  Megaphone,
  MessageSquareText,
  Package,
  Palette,
  Settings,
  Share2,
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { getBusinessCopy } from "@/lib/platform/business-copy";
import { getCafeDisplayDomain, getCafePublicUrl } from "@/lib/platform/cafe-domain";
import { logoutBarndaksaAuth } from "@/lib/platform/auth";
import { getSidebarFeaturesForBrand } from "@/lib/platform/feature-access";
import { cafeHasFeature } from "@/lib/platform/permissions";
import { getCachedDashboardShellSnapshot } from "@/lib/performance/dashboard-shell-client";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { AppNotification } from "@/lib/mock/notifications";
import type { PlatformFeature, PlatformPlan } from "@/lib/platform/admin-data";

const featureIcons: Partial<Record<PlatformFeature, ElementType>> = {
  all: Star,
  home: Home,
  menu: Package,
  offers: Gift,
  pages: FileText,
  reservations: CalendarDays,
  customers: Users,
  loyalty: Star,
  branches: MapPin,
  reports: BarChart3,
  reviews: MessageSquareText,
  marketing: Megaphone,
  experience_reviews: BadgeCheck,
  cashier: DoorOpen,
  branda_finance: Landmark,
  orders: ShoppingBag,
  settings: Settings,
  theme: Palette,
  domains: Settings,
  subscription: CreditCard,
};

type SidebarProps = {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
};

const initialCafeSettings: CafeSettings = {
  cafeSlug: "",
  cafeName: "العلامة",
  businessCategory: "cafes_coffee",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  description: "",
  domainStatus: "غير مربوط",
};

const sidebarTitleOverrides: Partial<Record<PlatformFeature, string>> = {
  home: "لوحة التحكم",
  pages: "الفرع الإلكتروني",
  menu: "المنيو / المنتجات",
  orders: "طلبات كوفي",
  reservations: "الحجوزات",
  offers: "العروض",
  loyalty: "الولاء والمكافآت",
  cashier: "الكاشير",
  branches: "الفروع",
  customers: "العملاء",
  reports: "التقارير",
  reviews: "الأسئلة والتقييمات",
  marketing: "الأدوات التسويقية",
};

export function DashboardSidebar({
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();

  const [activePlanId, setActivePlanId] = useState("starter");
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [planName, setPlanName] = useState("Starter");
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(initialCafeSettings);
  const [shareMessage, setShareMessage] = useState("");
  const [pendingReservations, setPendingReservations] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingExperienceReviews, setPendingExperienceReviews] = useState(0);
  const [initialNotifications, setInitialNotifications] = useState<AppNotification[]>([]);

  const cafeLogoUrl = useResolvedCafeLogoUrl(cafeSettings);
  const copy = getBusinessCopy(cafeSettings.businessCategory);
  const cafeName = cafeSettings.cafeName || copy.casualNoun;
  const cafeSlug = cafeSettings.cafeSlug;
  const ToggleIcon = collapsed ? ChevronsLeft : ChevronsRight;
  const toggleLabel = collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await getCachedDashboardShellSnapshot();
        if (cancelled) return;

        if ((snapshot as { unauthenticated?: boolean }).unauthenticated) return;

        setActivePlanId(snapshot.planId);
        setPlans(snapshot.plans);
        setCafeSettings(snapshot.settings);
        setInitialNotifications(snapshot.notifications);

        const plan = snapshot.plans.find((item) => item.id === snapshot.planId);
        setPlanName(plan?.name ?? snapshot.planId);
        setPendingReservations(snapshot.pendingReservations);
        setPendingOrders(snapshot.pendingOrders);
        setPendingExperienceReviews(snapshot.pendingExperienceReviews);
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes("unauthorized")) return;
        console.error("[DashboardSidebar]", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleShare() {
    if (!cafeSlug) return;
    const url = getCafePublicUrl(cafeSlug);
    try {
      if (navigator.share) {
        await navigator.share({ title: cafeName, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("تم نسخ رابط الفرع الإلكتروني");
        window.setTimeout(() => setShareMessage(""), 2200);
      }
    } catch {
      setShareMessage("تعذر مشاركة الرابط");
      window.setTimeout(() => setShareMessage(""), 2200);
    }
  }

  function handleLogout() {
    logoutBarndaksaAuth();
    router.push("/login");
  }

  function handleToggleCollapsed() {
    onCollapsedChange?.(!collapsed);
  }

  function getLinkCounter(href: string) {
    if (href === "/dashboard/reservations") return pendingReservations;
    if (href === "/dashboard/orders") return pendingOrders;
    if (href === "/dashboard/experience-reviews") return pendingExperienceReviews;
    return 0;
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const visibleLinks = getSidebarFeaturesForBrand({ planId: activePlanId, plans }).map(({ feature, access }) => ({
    title: feature.titleAr,
    href: feature.route,
    icon: featureIcons[feature.id] ?? Star,
    feature: feature.id,
    access,
  }));

  const linkTitle = (item: (typeof visibleLinks)[number]) => {
    if (sidebarTitleOverrides[item.feature]) return sidebarTitleOverrides[item.feature];
    if (item.href === "/dashboard/menu" && copy.kind === "events") return "التذاكر والباقات";
    if (item.href === "/dashboard/orders" && copy.kind === "events") return "طلبات التذاكر";
    if (item.href === "/dashboard/reservations" && copy.kind === "events") return "حجوزات الحضور";
    if (item.href === "/dashboard/loyalty" && copy.kind === "events") return "ولاء الحضور";
    if (item.href === "/dashboard/experience-reviews" && copy.kind === "events") return "مكافآت التوثيق";
    if (item.href === "/dashboard/cashier" && copy.kind === "events") return "بوابة الدخول";
    if (item.href === "/dashboard/cashier") return "الكاشير";
    if (item.href === "/dashboard/branda-finance") return "برندة المالية";
    if (item.href === "/dashboard/reports" && copy.kind === "events") return "تقارير الفعالية";
    if (item.href === "/dashboard/orders") return `طلبات ${copy.casualNoun}`;
    if (item.href === "/dashboard/settings") return `إعدادات ${copy.casualNoun}`;
    if (item.href === "/dashboard/theme") return `ثيم ${copy.casualNoun}`;
    return item.title;
  };

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll flex h-full w-full flex-col overflow-y-auto border-l border-[#2A1A18]/80 text-[#F8EFE7] shadow-[-14px_0_42px_rgba(0,0,0,0.48)] transition-colors"
      style={{
        background:
          "radial-gradient(circle at 100% 0%, rgba(92, 55, 37, 0.58), transparent 34%), linear-gradient(180deg, #140C0A 0%, #0A0808 52%, #120B13 100%)",
      }}
    >
      <div className={`border-b border-white/10 ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}>
        <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "justify-between gap-3"}`}>
          <div className={collapsed ? "flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white/[0.08] ring-1 ring-white/10" : "min-w-0"}>
            <BarndaksaLogo
              variant="dark"
              width={collapsed ? 36 : 116}
              height={collapsed ? 20 : 46}
              priority
              className={collapsed ? "scale-90" : ""}
            />
          </div>

          <button
            type="button"
            onClick={handleToggleCollapsed}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#8F80FF]/35 bg-[#5E55E7]/18 text-[#CBC4FF] shadow-[0_0_18px_rgba(102,92,255,0.18)] transition hover:border-[#A89EFF]/65 hover:bg-[#665CFF]/30 hover:text-white"
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <ToggleIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {!collapsed ? (
          <p className="mt-1 text-right text-[10px] font-bold text-[#A99A90]">لوحة تحكم برندة</p>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="mx-2.5 mt-3 rounded-[18px] border border-white/10 bg-[#211613]/72 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_16px_36px_rgba(0,0,0,0.24)]">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FCF8F3] shadow-md ring-1 ring-white/20">
              <CafeLogo
                name={cafeName}
                logoUrl={cafeLogoUrl}
                size="sm"
                className="!shadow-none"
              />
            </div>

            <div className="min-w-0 flex-1 text-right">
              <p className="truncate text-[10px] font-bold text-[#A99A90]">بطاقة العلامة التجارية</p>
              <h2 className="mt-0.5 truncate text-[13px] font-black text-white">{cafeName}</h2>

              {cafeSettings.ownerName ? (
                <p className="mt-0.5 truncate text-[10px] font-bold text-[#8F8176]">
                  {cafeSettings.ownerName}
                </p>
              ) : null}

              <Link
                href="/dashboard/subscription"
                onClick={onNavigate}
                className="mt-1 inline-flex max-w-full items-center truncate rounded-md bg-[#D9A33F]/16 px-2 py-0.5 text-[10px] font-black text-[#F0C568] transition hover:bg-[#D9A33F]/25"
              >
                {planName}
              </Link>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-[auto_auto_1fr] gap-1.5">
            <NotificationsPanel
              initialNotifications={initialNotifications}
              className="[&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg [&>button]:border-white/10 [&>button]:bg-white/[0.06]"
            />

            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={!cafeSlug}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-[#F0C568] transition hover:bg-white/10 disabled:opacity-50"
              aria-label="مشاركة رابط الفرع الإلكتروني"
            >
              <Share2 className="h-4 w-4" />
            </button>

            {cafeSlug ? (
              <Link
                href={getCafePublicUrl(cafeSlug)}
                target="_blank"
                className="flex h-8 min-w-0 items-center justify-center truncate rounded-lg border border-[#E8B855]/35 bg-[#E8B855]/18 px-2 text-[10px] font-black text-[#F6D37C] shadow-[0_0_18px_rgba(232,184,85,0.10)] transition hover:bg-[#E8B855]/26"
              >
                زيارة الفرع الإلكتروني
              </Link>
            ) : (
              <span className="flex h-8 min-w-0 items-center justify-center truncate rounded-lg border border-white/10 bg-white/[0.045] px-2 text-[10px] font-black text-[#B8A99C]">
                جاري التحميل
              </span>
            )}
          </div>

          {shareMessage ? (
            <p className="mt-2 text-center text-[11px] font-black text-[#F0C568]">{shareMessage}</p>
          ) : null}

          {cafeSlug ? (
            <p className="mt-2 truncate text-center text-[10px] font-bold text-[#8E8077]">
              {getCafeDisplayDomain(cafeSlug, cafeSettings)}
            </p>
          ) : null}
        </div>
      ) : null}

      <nav className={`flex-1 space-y-1 ${collapsed ? "px-2 py-3" : "px-2.5 py-3"}`}>
        {visibleLinks.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const locked = !cafeHasFeature(item.feature, { planId: activePlanId, plans });
          const href = locked ? "/dashboard/subscription" : item.href;
          const showOperationsLabel = item.feature === "cashier";
          const title = linkTitle(item);
          const counter = getLinkCounter(item.href);

          return (
            <div key={item.href}>
              {showOperationsLabel && !collapsed ? (
                <p className="px-3 pb-1.5 pt-3 text-[10px] font-black uppercase text-[#8F8176]">
                  أدوات التشغيل
                </p>
              ) : null}
              <Link
                href={href}
                onClick={onNavigate}
                title={collapsed ? title : undefined}
                aria-label={collapsed ? title : undefined}
                className={`group relative flex h-8 items-center overflow-hidden rounded-lg text-[12px] font-extrabold transition ${
                  collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"
                } ${
                  active && !locked
                    ? "bg-gradient-to-l from-[#4D409A]/65 via-[#2A2448]/90 to-[#1A1117]/80 text-white ring-1 ring-[#897DFF]/50 shadow-[0_0_24px_rgba(111,99,255,0.18)] before:absolute before:right-0 before:top-1.5 before:h-5 before:w-1 before:rounded-l-full before:bg-[#B4A9FF]"
                    : locked
                      ? "border border-white/[0.08] bg-white/[0.035] text-[#8F8176] hover:bg-white/[0.065]"
                      : "text-[#CFC2B7] hover:bg-white/[0.065] hover:text-white"
                }`}
              >
                <span className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "gap-2"}`}>
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active && !locked
                        ? "text-[#C4BEFF]"
                        : "text-[#B8A99C] group-hover:text-white"
                    }`}
                  />
                  {!collapsed ? (
                    <span className="min-w-0 truncate">
                      {title}
                      {locked ? (
                        <span className="me-1.5 text-[10px] text-[#F0C568]">ترقية</span>
                      ) : null}
                    </span>
                  ) : null}
                </span>

                {collapsed ? (
                  locked ? (
                    <span className="absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#21170F] text-[#F0C568] ring-1 ring-[#F0C568]/45">
                      <LockKeyhole className="h-2.5 w-2.5" />
                    </span>
                  ) : counter > 0 ? (
                    <span className="absolute left-1 top-1 rounded-full bg-red-500 px-1 text-[9px] font-black leading-3 text-white">
                      {counter > 99 ? "99+" : counter}
                    </span>
                  ) : null
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    {locked ? (
                      <LockKeyhole className="h-3.5 w-3.5 text-[#F0C568]" />
                    ) : counter > 0 ? (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                        {counter > 99 ? "99+" : counter}
                      </span>
                    ) : null}
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className={`border-t border-white/10 ${collapsed ? "px-2 py-3" : "px-2.5 py-3"}`}>
        <button
          type="button"
          onClick={handleLogout}
          className={`flex h-8 w-full items-center rounded-lg border border-white/10 bg-white/[0.045] text-[12px] font-black text-[#F7EFE6] transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200 ${
            collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"
          }`}
          aria-label={collapsed ? "تسجيل الخروج" : undefined}
          title={collapsed ? "تسجيل الخروج" : undefined}
        >
          {!collapsed ? <span>تسجيل الخروج</span> : null}
          <LogOut className="h-4 w-4 shrink-0" />
        </button>
      </div>
    </aside>
  );
}
