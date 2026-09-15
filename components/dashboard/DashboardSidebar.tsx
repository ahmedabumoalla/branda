"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ElementType } from "react";
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  DoorOpen,
  Gift,
  Home,
  LockKeyhole,
  LogOut,
  MapPin,
  Package,
  Palette,
  Settings,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Swords,
  Users,
} from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { getBusinessCopy } from "@/lib/platform/business-copy";
import { getCafeDisplayDomain, getCafePublicUrl } from "@/lib/platform/cafe-domain";
import { logoutBarndaksaAuth } from "@/lib/platform/auth";
import {
  getSidebarFeaturesForBrand,
  type BrandFeatureOverride,
} from "@/lib/platform/feature-access";
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
  customers: Users,
  loyalty: Star,
  branches: MapPin,
  reports: BarChart3,
  cashier: DoorOpen,
  orders: ShoppingBag,
  settings: Settings,
  theme: Palette,
  domains: Settings,
  subscription: CreditCard,
  growth_os: Sparkles,
  customer_segments: Users,
  in_store_table_wars: Swords,
  ai_menu_engineer: Sparkles,
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

export function DashboardSidebar({
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();

  const [activePlanId, setActivePlanId] = useState("starter");
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [featureOverrides, setFeatureOverrides] = useState<BrandFeatureOverride[]>([]);
  const [planName, setPlanName] = useState("Starter");
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(initialCafeSettings);
  const [shareMessage, setShareMessage] = useState("");
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
        setFeatureOverrides(snapshot.featureOverrides ?? []);
        setCafeSettings(snapshot.settings);
        setInitialNotifications(snapshot.notifications);

        const plan = snapshot.plans.find((item) => item.id === snapshot.planId);
        setPlanName(plan?.name ?? snapshot.planId);
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
    if (href === "/dashboard/orders") return pendingOrders;
    if (href === "/dashboard/experience-reviews") return pendingExperienceReviews;
    return 0;
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const visibleLinks = getSidebarFeaturesForBrand({ planId: activePlanId, plans, overrides: featureOverrides }).map(({ feature, access }) => ({
    title: feature.sidebarLabel ?? feature.titleAr,
    href: feature.dashboardPath ?? (feature.sidebarVisible ? feature.route : ""),
    icon: featureIcons[feature.id] ?? Star,
    feature: feature.id,
    group: feature.sidebarGroup,
    access,
  }));

  const linkTitle = (item: (typeof visibleLinks)[number]) => {
    if (item.href === "/dashboard/menu" && copy.kind === "events") return "التذاكر والباقات";
    if (item.href === "/dashboard/orders" && copy.kind === "events") return "طلبات التذاكر";
    if (item.href === "/dashboard/loyalty" && copy.kind === "events") return "ولاء الحضور";
    if (item.href === "/dashboard/experience-reviews" && copy.kind === "events") return "مكافآت التوثيق";
    if (item.href === "/dashboard/cashier" && copy.kind === "events") return "بوابة الدخول";
    if (item.href === "/dashboard/cashier") return "الكاشير";
    if (item.href === "/dashboard/reports" && copy.kind === "events") return "تقارير الفعالية";
    if (item.href === "/dashboard/orders") return `طلبات ${copy.casualNoun}`;
    if (item.href === "/dashboard/settings") return `إعدادات ${copy.casualNoun}`;
    if (item.href === "/dashboard/theme") return `ثيم ${copy.casualNoun}`;
    return item.title;
  };

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll flex h-full w-full flex-col overflow-y-auto border-l border-[#E5B85C]/15 text-[#F8EFE7] shadow-[-18px_0_60px_rgba(0,0,0,0.56)] transition-colors"
      style={{
        background:
          "radial-gradient(circle at 100% 0%, rgba(229, 184, 92, 0.12), transparent 26%), linear-gradient(180deg, #11100E 0%, #090908 54%, #0D0C0A 100%)",
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
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#E5B85C]/25 bg-[#E5B85C]/10 text-[#FFD77E] shadow-[0_0_22px_rgba(229,184,92,0.10)] transition hover:border-[#FFD77E]/55 hover:bg-[#E5B85C]/20 hover:text-white"
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <ToggleIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {!collapsed ? (
          <p className="mt-1 text-right text-[11px] font-normal text-[#A99A90]">لوحة تحكم برندة</p>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="mx-3 mt-3 border border-white/[0.08] border-r-[#E5B85C]/35 bg-white/[0.025] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_42px_rgba(0,0,0,0.22)]">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden bg-[#FCF8F3] shadow-md ring-1 ring-[#E5B85C]/25">
              <CafeLogo
                name={cafeName}
                logoUrl={cafeLogoUrl}
                size="sm"
                className="!shadow-none"
              />
            </div>

            <div className="min-w-0 flex-1 text-right">
              <p className="truncate text-[10px] font-normal text-[#A99A90]">بطاقة العلامة التجارية</p>
              <h2 className="mt-0.5 truncate text-[14px] font-semibold text-white">{cafeName}</h2>

              {cafeSettings.ownerName ? (
                <p className="mt-0.5 truncate text-[10px] font-normal text-[#8F8176]">
                  {cafeSettings.ownerName}
                </p>
              ) : null}

              <Link
                href="/dashboard/subscription"
                onClick={onNavigate}
                className="mt-1 inline-flex max-w-full items-center truncate rounded-md bg-[#D9A33F]/16 px-2 py-0.5 text-[10px] font-semibold text-[#F0C568] transition hover:bg-[#D9A33F]/25"
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
                className="flex h-8 min-w-0 items-center justify-center truncate rounded-lg border border-[#E8B855]/35 bg-[#E8B855]/18 px-2 text-[10px] font-semibold text-[#F6D37C] shadow-[0_0_18px_rgba(232,184,85,0.10)] transition hover:bg-[#E8B855]/26"
              >
                زيارة الفرع الإلكتروني
              </Link>
            ) : (
              <span className="flex h-8 min-w-0 items-center justify-center truncate rounded-lg border border-white/10 bg-white/[0.045] px-2 text-[10px] font-medium text-[#B8A99C]">
                جاري التحميل
              </span>
            )}
          </div>

          {shareMessage ? (
            <p className="mt-2 text-center text-[11px] font-medium text-[#F0C568]">{shareMessage}</p>
          ) : null}

          {cafeSlug ? (
            <p className="mt-2 truncate text-center text-[10px] font-normal text-[#8E8077]">
              {getCafeDisplayDomain(cafeSlug, cafeSettings)}
            </p>
          ) : null}
        </div>
      ) : null}

      <nav className={`flex-1 space-y-1 ${collapsed ? "px-2 py-3" : "px-2.5 py-3"}`}>
        {visibleLinks.map((item, index) => {
          const Icon = item.icon;
          const hasFeatureAccess = item.access?.effectiveEnabled ?? cafeHasFeature(item.feature, { planId: activePlanId, plans, overrides: featureOverrides });
          const hasRoute = Boolean(item.href);
          const active = hasRoute && isActive(item.href);
          const locked = hasRoute && !hasFeatureAccess;
          const href = locked ? "/dashboard/subscription" : item.href;
          const showOperationsLabel = item.feature === "cashier";
          const showFeatureGroupLabel = Boolean(item.group) && !collapsed && visibleLinks[index - 1]?.group !== item.group;
          const title = linkTitle(item);
          const counter = getLinkCounter(item.href);
          const itemClassName = `group relative flex min-h-10 w-full items-center overflow-hidden rounded-lg text-[13px] leading-5 transition ${
            collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"
          } ${
            !hasRoute
              ? "cursor-not-allowed border border-[#F0C568]/15 bg-[#F0C568]/[0.06] font-medium text-[#CFC2B7] opacity-90 hover:bg-[#F0C568]/[0.06]"
              : active && !locked
              ? "border border-[#E5B85C]/28 bg-[#E5B85C]/10 font-semibold text-white shadow-[0_0_30px_rgba(229,184,92,0.10)] before:absolute before:right-0 before:top-1.5 before:h-7 before:w-0.5 before:bg-[#FFD77E] before:shadow-[0_0_12px_rgba(255,215,126,0.8)]"
              : locked
                ? "border border-white/[0.08] bg-white/[0.035] font-normal text-[#8F8176] hover:bg-white/[0.065]"
                : "font-medium text-[#D8CEC5] hover:bg-white/[0.065] hover:text-white"
          }`;
          const itemContent = (
            <>
              <span className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "gap-2"}`}>
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active && !locked
                      ? "text-[#FFD77E]"
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
                ) : !hasRoute ? (
                  <span className="absolute left-1 top-1 h-2 w-2 rounded-full bg-[#F0C568]" />
                ) : counter > 0 ? (
                  <span className="absolute left-1 top-1 rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-3 text-white">
                    {counter > 99 ? "99+" : counter}
                  </span>
                ) : null
              ) : (
                <span className="flex shrink-0 items-center gap-1">
                  {locked ? (
                    <LockKeyhole className="h-3.5 w-3.5 text-[#F0C568]" />
                  ) : !hasRoute ? (
                    <span className="rounded-full bg-[#F0C568]/15 px-2 py-0.5 text-[10px] font-medium text-[#F0C568]">
                      قريبًا
                    </span>
                  ) : counter > 0 ? (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {counter > 99 ? "99+" : counter}
                    </span>
                  ) : null}
                </span>
              )}
            </>
          );

          return (
            <div key={`${item.feature}-${item.href || "disabled"}`}>
              {showOperationsLabel && !collapsed ? (
                <p className="px-3 pb-1.5 pt-3 text-[10px] font-medium text-[#8F8176]">
                  أدوات التشغيل
                </p>
              ) : null}
              {showFeatureGroupLabel ? (
                <p className="px-3 pb-1.5 pt-3 text-[10px] font-medium text-[#8F8176]">
                  {item.group}
                </p>
              ) : null}
              {hasRoute ? (
                <Link
                  href={href}
                  onClick={() => onNavigate?.()}
                  title={collapsed ? title : undefined}
                  aria-label={collapsed ? title : undefined}
                  className={itemClassName}
                >
                  {itemContent}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  title={collapsed ? `${title} - قريبًا` : undefined}
                  aria-label={collapsed ? `${title} - قريبًا` : undefined}
                  className={itemClassName}
                >
                  {itemContent}
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <div className={`border-t border-white/10 ${collapsed ? "px-2 py-3" : "px-2.5 py-3"}`}>
        <button
          type="button"
          onClick={handleLogout}
          className={`flex min-h-10 w-full items-center rounded-lg border border-white/10 bg-white/[0.045] text-[13px] font-semibold text-[#F7EFE6] transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200 ${
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
