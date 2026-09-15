"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ResponsiveAppShell } from "@/components/ui/responsive-app-shell";

const ADMIN_SIDEBAR_COLLAPSED_KEY = "barndaksa-admin-sidebar-collapsed";

export function AdminAppLayout({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === "true");
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  function handleSidebarCollapsedChange(nextCollapsed: boolean) {
    setSidebarCollapsed(nextCollapsed);
    try {
      localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(nextCollapsed));
    } catch {
      // Keep the in-memory state usable even when storage is unavailable.
    }
  }

  return (
    <ResponsiveAppShell
      variant="admin"
      mobileTitle="لوحة المنصة"
      desktopSidebarWidth={sidebarCollapsed ? "64px" : "232px"}
      sidebar={(close) => (
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarCollapsedChange}
          onNavigate={close}
        />
      )}
    >
      <div className="barndaksa-admin-fields min-w-0">{children}</div>
    </ResponsiveAppShell>
  );
}
