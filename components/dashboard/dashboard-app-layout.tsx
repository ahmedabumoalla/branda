"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { exitMaintenanceModeAction } from "@/app/actions/maintenance";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { SubscriptionExpiredState } from "@/components/dashboard/subscription-expired-state";
import { ResponsiveAppShell } from "@/components/ui/responsive-app-shell";
import {
  clearDashboardShellSnapshot,
  getCachedDashboardShellSnapshot,
} from "@/lib/performance/dashboard-shell-client";
import { dashboardPlatformFeatures, type PlatformPlan } from "@/lib/platform/admin-data";
import type { BrandFeatureOverride } from "@/lib/platform/feature-access";
import { cafeHasFeature } from "@/lib/platform/permissions";

type GuardState = {
  loading: boolean;
  error?: boolean;
  expiresAt?: string | null;
  cafeSlug: string;
  activePlanId: string;
  plans: PlatformPlan[];
  featureOverrides: BrandFeatureOverride[];
};

type MaintenanceBannerSession = {
  cafeName: string;
  maintenanceAccountNumber: string;
  expiresAt: number;
};

const DASHBOARD_SIDEBAR_COLLAPSED_KEY = "barndaksa-dashboard-sidebar-collapsed";

export function DashboardAppLayout({
  children,
  maintenanceSession,
}: {
  children: ReactNode;
  maintenanceSession?: MaintenanceBannerSession | null;
}) {
  const pathname = usePathname();
  const [guard, setGuard] = useState<GuardState>({ loading: true, cafeSlug: "", activePlanId: "", plans: [], featureOverrides: [] });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isEndingMaintenance, startEndingMaintenance] = useTransition();
  const [maintenanceError, setMaintenanceError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    function load() {
    const current = ++generation;
    void getCachedDashboardShellSnapshot()
      .then((snapshot) => {
        if (cancelled || current !== generation) return;
        if ((snapshot as { unauthenticated?: boolean }).unauthenticated) {
          setGuard({ loading: false, cafeSlug: "", activePlanId: "", plans: [], featureOverrides: [] });
          return;
        }
        setGuard({
          loading: false,
          expiresAt: snapshot.subscription?.expiresAt,
          cafeSlug: snapshot.settings.cafeSlug,
          activePlanId: snapshot.subscription?.expiresAt && Date.parse(snapshot.subscription.expiresAt) <= Date.now() ? "" : snapshot.planId,
          plans: snapshot.plans,
          featureOverrides: snapshot.featureOverrides ?? [],
        });
      })
      .catch((error) => {
        if (!(error instanceof Error && error.message.toLowerCase().includes("unauthorized"))) {
          console.error("[DashboardAppLayout:feature-guard]", error);
        }
        if (!cancelled && current === generation) setGuard((state) => ({ ...state, loading: false, error: true }));
      });
    }
    load();
    const refresh = () => { clearDashboardShellSnapshot(); load(); };
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [pathname, retry]);

  useEffect(() => {
    if (!guard.activePlanId || !guard.expiresAt) return;
    const remaining = Date.parse(guard.expiresAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = window.setTimeout(() => {
      if (remaining > 2147483647) { setRetry(value => value + 1); return; }
      clearDashboardShellSnapshot();
      setGuard(state => ({ ...state, activePlanId: "" }));
    }, Math.max(0, Math.min(remaining, 2147483647)));
    return () => window.clearTimeout(timer);
  }, [guard.activePlanId, guard.expiresAt, retry]);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(DASHBOARD_SIDEBAR_COLLAPSED_KEY) === "true");
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  const currentFeature = useMemo(() => {
    const sorted = [...dashboardPlatformFeatures].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((feature) => {
      if (feature.href === "/dashboard") return pathname === "/dashboard";
      return pathname === feature.href || pathname.startsWith(`${feature.href}/`);
    });
  }, [pathname]);

  const allowed =
    pathname === "/dashboard" ||
    !currentFeature ||
    guard.loading ||
    cafeHasFeature(currentFeature.id, {
      planId: guard.activePlanId,
      plans: guard.plans,
      overrides: guard.featureOverrides,
    });

  function endMaintenanceMode() {
    if (isEndingMaintenance) return;
    setMaintenanceError("");
    startEndingMaintenance(async () => {
      try {
        await exitMaintenanceModeAction();
        clearDashboardShellSnapshot();
        window.location.assign("/admin/maintenance");
      } catch {
        setMaintenanceError("تعذر إنهاء وضع الصيانة حاول مرة أخرى");
      }
    });
  }

  function handleSidebarCollapsedChange(nextCollapsed: boolean) {
    setSidebarCollapsed(nextCollapsed);
    try {
      localStorage.setItem(DASHBOARD_SIDEBAR_COLLAPSED_KEY, String(nextCollapsed));
    } catch {
      // Ignore storage failures; the in-memory state still keeps the UI usable.
    }
  }

  return (
    <ResponsiveAppShell
      variant="dashboard"
      mobileTitle={maintenanceSession ? "لوحة التحكم — وضع الصيانة" : "لوحة التحكم"}
      desktopSidebarWidth={sidebarCollapsed ? "72px" : "252px"}
      sidebar={(close) => (
        <DashboardSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarCollapsedChange}
          onNavigate={close}
          onEndMaintenance={maintenanceSession ? endMaintenanceMode : undefined}
          isEndingMaintenance={isEndingMaintenance}
        />
      )}
    >
      {maintenanceSession ? (
        <section aria-label="وضع الصيانة" className="m-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-[#3A2117] shadow-sm sm:m-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-amber-800">أنت في وضع الصيانة</p>
              <h2 className="mt-1 text-xl font-black">
                أنت تدير لوحة {maintenanceSession.cafeName} مؤقتًا كمدير منصة
              </h2>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">
                رقم الصيانة: {maintenanceSession.maintenanceAccountNumber} — تنتهي الجلسة عند {new Date(maintenanceSession.expiresAt).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })} بتوقيت السعودية
              </p>
            </div>
            <button
              type="button"
              onClick={endMaintenanceMode}
              disabled={isEndingMaintenance}
              className="rounded-2xl bg-[#3A2117] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {isEndingMaintenance ? "جاري إنهاء الصيانة" : "إنهاء وضع الصيانة والعودة للأدمن"}
            </button>
          </div>
          {maintenanceError && <p role="alert" className="mt-3 text-sm font-bold text-red-800">{maintenanceError}</p>}
        </section>
      ) : null}
      {pathname === "/dashboard/subscription" || pathname.startsWith("/dashboard/subscription/") ? children
        : guard.loading ? <p role="status" className="p-10 text-center">جارٍ التحقق من الاشتراك</p>
        : guard.error ? <div role="alert" className="p-10 text-center"><p>تعذر التحقق من الاشتراك حاول مجددًا</p><button type="button" className="mt-4 rounded-xl bg-[#38251b] px-5 py-3 text-white" onClick={() => { clearDashboardShellSnapshot(); setGuard(state => ({ ...state, loading: true, error: false })); setRetry(value => value + 1); }}>إعادة المحاولة</button></div>
        : !guard.activePlanId ? <SubscriptionExpiredState />
        : allowed ? children : <DashboardFeatureBlockedState title={currentFeature?.title ?? ""} />}
    </ResponsiveAppShell>
  );
}
