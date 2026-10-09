"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { exitMaintenanceModeAction } from "@/app/actions/maintenance";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
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

function UpgradeRequired({ featureTitle, cafeSlug }: { featureTitle: string; cafeSlug: string }) {
  const hideBilling = cafeSlug === "rast" || !cafeSlug;
  return (
    <div dir="rtl" className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4 py-12">
      <div className="rounded-[32px] border border-[#E7D7C6] bg-[#FCF8F3] p-8 text-center shadow-[0_20px_60px_rgba(49,25,18,0.12)]">
        <p className="text-sm font-black text-[#806A5E]">{hideBilling ? "الخدمة غير مفعلة لهذه العلامة" : "ميزة غير مفعلة في باقتك الحالية"}</p>
        <h1 className="mt-3 text-3xl font-black text-[#311912]">{featureTitle}</h1>
        <p className="mt-4 font-bold leading-8 text-[#806A5E]">
          {hideBilling ? "يمكنك العودة إلى المنيو لمتابعة إدارة العلامة." : "هذه الخدمة لا تظهر للعلامة التجارية ولا للفرع الإلكتروني إلا بعد الاشتراك في باقة تشملها."}
        </p>
        <Link
          href={hideBilling ? "/dashboard/menu" : "/dashboard/subscription"}
          className="mt-6 inline-flex rounded-2xl bg-[#4A281D] px-6 py-4 font-black text-white"
        >
          {hideBilling ? "العودة إلى المنيو" : "ترقية الباقة"}
        </Link>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    let cancelled = false;
    void getCachedDashboardShellSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        if ((snapshot as { unauthenticated?: boolean }).unauthenticated) {
          setGuard({ loading: false, cafeSlug: "", activePlanId: "", plans: [], featureOverrides: [] });
          return;
        }
        setGuard({
          loading: false,
          cafeSlug: snapshot.settings.cafeSlug,
          activePlanId: snapshot.planId,
          plans: snapshot.plans,
          featureOverrides: snapshot.featureOverrides ?? [],
        });
      })
      .catch((error) => {
        if (!(error instanceof Error && error.message.toLowerCase().includes("unauthorized"))) {
          console.error("[DashboardAppLayout:feature-guard]", error);
        }
        if (!cancelled) setGuard((current) => ({ ...current, loading: false }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
        setMaintenanceError("تعذر إنهاء وضع الصيانة. حاول مرة أخرى.");
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
      {allowed ? children : <UpgradeRequired featureTitle={currentFeature?.title ?? ""} cafeSlug={guard.cafeSlug} />}
    </ResponsiveAppShell>
  );
}
