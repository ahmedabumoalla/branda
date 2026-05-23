"use client";

import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { ResponsiveAppShell } from "@/components/ui/responsive-app-shell";

export function DashboardAppLayout({ children }: { children: ReactNode }) {
  return (
    <ResponsiveAppShell
      variant="dashboard"
      mobileTitle="لوحة الكوفي"
      sidebar={(close) => <DashboardSidebar onNavigate={close} />}
    >
      {children}
    </ResponsiveAppShell>
  );
}
