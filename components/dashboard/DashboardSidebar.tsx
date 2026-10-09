"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, LockKeyhole, LogOut, Gift, Package, Settings, Star } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { logoutBarndaksaAuth } from "@/lib/platform/auth";
import { getSidebarFeaturesForBrand, type BrandFeatureOverride } from "@/lib/platform/feature-access";
import { getCachedDashboardShellSnapshot } from "@/lib/performance/dashboard-shell-client";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { AppNotification } from "@/lib/mock/notifications";
import type { PlatformPlan } from "@/lib/platform/admin-data";

type SidebarProps = {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
  onEndMaintenance?: () => void;
  isEndingMaintenance?: boolean;
};
type NavigationState = {
  planId: string;
  plans: PlatformPlan[];
  featureOverrides: BrandFeatureOverride[];
  settings: CafeSettings;
  notifications: AppNotification[];
};
const initialNavigation: NavigationState = {
  planId: "", plans: [], featureOverrides: [], notifications: [],
  settings: {
    cafeSlug: "", cafeName: "العلامة", businessCategory: "cafes_coffee",
    ownerName: "", ownerEmail: "", ownerPhone: "", description: "", domainStatus: "غير مربوط",
  },
};


export function DashboardSidebar({ collapsed = false, onCollapsedChange, onNavigate, onEndMaintenance, isEndingMaintenance = false }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigation, setNavigation] = useState<NavigationState>(initialNavigation);
  const { settings, notifications } = navigation;
  const cafeLogoUrl = useResolvedCafeLogoUrl(settings);
  const cafeName = settings.cafeName || "العلامة";
  const ToggleIcon = collapsed ? ChevronsLeft : ChevronsRight;
  const toggleLabel = collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية";

  useEffect(() => {
    let cancelled = false;
    void getCachedDashboardShellSnapshot().then(snapshot => {
      if (cancelled || (snapshot as { unauthenticated?: boolean }).unauthenticated) return;
      setNavigation({ planId: snapshot.planId, plans: snapshot.plans, featureOverrides: snapshot.featureOverrides ?? [], settings: snapshot.settings, notifications: snapshot.notifications });
    }).catch(error => {
      if (!(error instanceof Error && error.message.toLowerCase().includes("unauthorized"))) console.error("[DashboardSidebar]", error);
    });
    return () => { cancelled = true; };
  }, []);

  // The shared package catalog also defines desktop, collapsed and mobile navigation.
  // Wait for account context; never flash guessed package permissions.
  const links = settings.cafeSlug ? getSidebarFeaturesForBrand({ planId: navigation.planId, plans: navigation.plans, overrides: navigation.featureOverrides }) : [];

  async function handleLogout() {
    if (onEndMaintenance) {
      onNavigate?.();
      onEndMaintenance();
      return;
    }
    await logoutBarndaksaAuth();
    router.push("/login");
  }

  const exitLabel = onEndMaintenance ? (isEndingMaintenance ? "جاري إنهاء الصيانة" : "إنهاء وضع الصيانة") : "تسجيل الخروج";

  return <aside dir="rtl" className="sidebar-scroll flex h-full w-full flex-col overflow-y-auto border-l border-[#E5B85C]/15 text-[#F8EFE7] shadow-[-18px_0_60px_rgba(0,0,0,0.56)] transition-colors"
    style={{ background: "radial-gradient(circle at 100% 0%, rgba(229, 184, 92, 0.12), transparent 26%), linear-gradient(180deg, #11100E 0%, #090908 54%, #0D0C0A 100%)" }}>
    <div className={`border-b border-white/10 ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}>
      <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "justify-between gap-3"}`}>
        <div className={collapsed ? "flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white/[0.08] ring-1 ring-white/10" : "min-w-0"}>
          <BarndaksaLogo variant="dark" width={collapsed ? 36 : 116} height={collapsed ? 20 : 46} priority className={collapsed ? "scale-90" : ""} />
        </div>
        <button type="button" onClick={() => onCollapsedChange?.(!collapsed)} aria-label={toggleLabel} title={toggleLabel}
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#E5B85C]/25 bg-[#E5B85C]/10 text-[#FFD77E] shadow-[0_0_22px_rgba(229,184,92,0.10)] transition hover:border-[#FFD77E]/55 hover:bg-[#E5B85C]/20 hover:text-white">
          <ToggleIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {!collapsed && <p className="mt-1 text-right text-[11px] font-normal text-[#A99A90]">لوحة تحكم برندة</p>}
    </div>

    {!collapsed && <div className="mx-3 mt-3 border border-white/[0.08] border-r-[#E5B85C]/35 bg-white/[0.025] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_42px_rgba(0,0,0,0.22)]">
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden bg-[#FCF8F3] shadow-md ring-1 ring-[#E5B85C]/25">
          <CafeLogo name={cafeName} logoUrl={cafeLogoUrl} size="sm" className="!shadow-none" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-[10px] font-normal text-[#A99A90]">بطاقة العلامة التجارية</p>
          <h2 className="mt-0.5 truncate text-[14px] font-semibold text-white">{cafeName}</h2>
          {settings.ownerName && <p className="mt-0.5 truncate text-[10px] font-normal text-[#8F8176]">{settings.ownerName}</p>}
        </div>
      </div>
      <div className="mt-2.5 flex gap-1.5"><NotificationsPanel initialNotifications={notifications} className="[&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg [&>button]:border-white/10 [&>button]:bg-white/[0.06]" /></div>
    </div>}

    <nav aria-label="قائمة العلامة" className={`flex-1 space-y-1 ${collapsed ? "px-2 py-3" : "px-2.5 py-3"}`}>
      {links.map(({ feature, access }) => {
        const Icon = feature.id === "menu" ? Package : feature.id === "loyalty" ? Star : feature.id === "offers" ? Gift : Settings;
        const title = feature.sidebarLabel ?? feature.titleAr;
        const locked = !access?.effectiveEnabled;
        const href = feature.route;
        const active = !locked && (pathname === href || pathname.startsWith(`${href}/`));
        const label = locked ? `${title} — غير مفعلة في الباقة` : title;
        return <Link key={feature.id} href={href} onClick={() => onNavigate?.()} aria-label={label} title={collapsed || locked ? label : undefined} aria-current={active ? "page" : undefined}
          className={`group relative flex min-h-10 w-full items-center overflow-hidden rounded-lg text-[13px] leading-5 transition ${collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"} ${active
            ? "border border-[#E5B85C]/28 bg-[#E5B85C]/10 font-semibold text-white shadow-[0_0_30px_rgba(229,184,92,0.10)] before:absolute before:right-0 before:top-1.5 before:h-7 before:w-0.5 before:bg-[#FFD77E]"
            : locked ? "border border-white/[0.08] bg-white/[0.035] font-normal text-[#8F8176] hover:bg-white/[0.065]"
              : "font-medium text-[#D8CEC5] hover:bg-white/[0.065] hover:text-white"}`}>
          <span className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "gap-2"}`}>
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#FFD77E]" : "text-[#B8A99C] group-hover:text-white"}`} aria-hidden="true" />
            {!collapsed && <span className="min-w-0 truncate">{title}{locked && <span className="me-1.5 text-[10px] text-[#F0C568]">غير مفعلة</span>}</span>}
          </span>
          {locked && <span className={collapsed ? "absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#21170F] text-[#F0C568] ring-1 ring-[#F0C568]/45" : "shrink-0 text-[#F0C568]"}>
            <LockKeyhole className={collapsed ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} aria-hidden="true" />
          </span>}
        </Link>;
      })}
    </nav>

    <div className={`border-t border-white/10 ${collapsed ? "px-2 py-3" : "px-2.5 py-3"}`}>
      {onEndMaintenance && !collapsed && <p className="mb-2 px-3 text-xs font-semibold text-[#FFD77E]">أنت في وضع الصيانة</p>}
      <button type="button" onClick={handleLogout} disabled={isEndingMaintenance} aria-label={exitLabel} title={collapsed ? exitLabel : undefined}
        className={`flex min-h-10 w-full items-center rounded-lg border border-white/10 bg-white/[0.045] text-[13px] font-semibold text-[#F7EFE6] transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200 ${collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"}`}>
        {!collapsed && <span>{exitLabel}</span>}<LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    </div>
  </aside>;
}
