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
import { canShowBrandaFinance } from "@/lib/platform/feature-access";
import { cafeHasFeature } from "@/lib/platform/permissions";

type GuardState = {
  loading: boolean;
  activePlanId: string;
  plans: PlatformPlan[];
};

type MaintenanceBannerSession = {
  cafeName: string;
  maintenanceAccountNumber: string;
  expiresAt: number;
};

const DASHBOARD_SIDEBAR_COLLAPSED_KEY = "barndaksa-dashboard-sidebar-collapsed";

function UpgradeRequired({ featureTitle }: { featureTitle: string }) {
  return (
    <div dir="rtl" className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4 py-12">
      <div className="rounded-[32px] border border-[#E7D7C6] bg-[#FCF8F3] p-8 text-center shadow-[0_20px_60px_rgba(49,25,18,0.12)]">
        <p className="text-sm font-black text-[#806A5E]">ميزة غير مفعلة في باقتك الحالية</p>
        <h1 className="mt-3 text-3xl font-black text-[#311912]">{featureTitle}</h1>
        <p className="mt-4 font-bold leading-8 text-[#806A5E]">
          هذه الخدمة لا تظهر للعلامة التجارية ولا للفرع الإلكتروني إلا بعد الاشتراك في باقة تشملها.
        </p>
        <Link
          href="/dashboard/subscription"
          className="mt-6 inline-flex rounded-2xl bg-[#4A281D] px-6 py-4 font-black text-white"
        >
          ترقية الباقة
        </Link>
      </div>
    </div>
  );
}

function BrandaFinanceHiddenState() {
  return (
    <div dir="rtl" className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4 py-12">
      <div className="rounded-[28px] border border-[#E7D7C6] bg-[#FCF8F3] p-8 text-center shadow-[0_20px_60px_rgba(49,25,18,0.12)]">
        <p className="text-sm font-black text-[#806A5E]">ميزة مخفية من الباقة الحالية</p>
        <h1 className="mt-3 text-3xl font-black text-[#311912]">برندة المالية غير مفعلة في هذه الباقة</h1>
        <p className="mt-4 font-bold leading-8 text-[#806A5E]">
          لن تظهر روابط أو بطاقات برندة المالية داخل لوحة التحكم حتى يتم تفعيلها من إعدادات الباقة.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-2xl bg-[#4A281D] px-6 py-4 font-black text-white"
        >
          العودة للوحة التحكم
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
  const [guard, setGuard] = useState<GuardState>({ loading: true, activePlanId: "", plans: [] });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isEndingMaintenance, startEndingMaintenance] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void getCachedDashboardShellSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        if ((snapshot as { unauthenticated?: boolean }).unauthenticated) {
          setGuard({ loading: false, activePlanId: "", plans: [] });
          return;
        }
        setGuard({ loading: false, activePlanId: snapshot.planId, plans: snapshot.plans });
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
    !currentFeature ||
    guard.loading ||
    (currentFeature.id === "branda_finance"
      ? canShowBrandaFinance({ planId: guard.activePlanId, plans: guard.plans })
      : cafeHasFeature(currentFeature.id, { planId: guard.activePlanId, plans: guard.plans }));

  function endMaintenanceMode() {
    startEndingMaintenance(() => {
      void (async () => {
        await exitMaintenanceModeAction();
        clearDashboardShellSnapshot();
        window.location.href = "/admin/maintenance";
      })();
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
      mobileTitle="لوحة التحكم"
      desktopSidebarWidth={sidebarCollapsed ? "56px" : "212px"}
      sidebar={(close) => (
        <DashboardSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarCollapsedChange}
          onNavigate={close}
        />
      )}
    >
      {maintenanceSession ? (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[#3A2117] shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-amber-800">دخول صيانة</p>
              <h2 className="mt-1 text-xl font-black">
                أنت تدير لوحة {maintenanceSession.cafeName} مؤقتًا كمدير منصة
              </h2>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">
                رقم الصيانة: {maintenanceSession.maintenanceAccountNumber} - تنتهي الجلسة تلقائيًا عند {new Date(maintenanceSession.expiresAt).toLocaleTimeString("ar-SA")}
              </p>
            </div>
            <button
              type="button"
              onClick={endMaintenanceMode}
              disabled={isEndingMaintenance}
              className="rounded-2xl bg-[#3A2117] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {isEndingMaintenance ? "جاري الإنهاء" : "إنهاء دخول الصيانة"}
            </button>
          </div>
        </div>
      ) : null}
      {allowed ? children : currentFeature.id === "branda_finance" ? <BrandaFinanceHiddenState /> : <UpgradeRequired featureTitle={currentFeature.title} />}
    </ResponsiveAppShell>
  );
}
