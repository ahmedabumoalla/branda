"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { ResponsiveAppShell } from "@/components/ui/responsive-app-shell";
import { fetchOwnerDashboardShellAction } from "@/app/actions/dashboard-shell";
import { dashboardPlatformFeatures, type PlatformPlan } from "@/lib/platform/admin-data";
import { cafeHasFeature } from "@/lib/platform/permissions";

type GuardState = {
  loading: boolean;
  activePlanId: string;
  plans: PlatformPlan[];
};

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

export function DashboardAppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [guard, setGuard] = useState<GuardState>({ loading: true, activePlanId: "", plans: [] });

  useEffect(() => {
    let cancelled = false;
    void fetchOwnerDashboardShellAction()
      .then((snapshot) => {
        if (cancelled) return;
        setGuard({ loading: false, activePlanId: snapshot.planId, plans: snapshot.plans });
      })
      .catch((error) => {
        console.error("[DashboardAppLayout:feature-guard]", error);
        if (!cancelled) setGuard((current) => ({ ...current, loading: false }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentFeature = useMemo(() => {
    const sorted = [...dashboardPlatformFeatures].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((feature) => {
      if (feature.href === "/dashboard") return pathname === "/dashboard";
      return pathname === feature.href || pathname.startsWith(`${feature.href}/`);
    });
  }, [pathname]);

  const allowed = !currentFeature || guard.loading || cafeHasFeature(currentFeature.id, { planId: guard.activePlanId, plans: guard.plans });

  return (
    <ResponsiveAppShell
      variant="dashboard"
      mobileTitle="لوحة التحكم"
      sidebar={(close) => <DashboardSidebar onNavigate={close} />}
    >
      {allowed ? children : <UpgradeRequired featureTitle={currentFeature.title} />}
    </ResponsiveAppShell>
  );
}
