"use client";

import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ResponsiveAppShell } from "@/components/ui/responsive-app-shell";

export function AdminAppLayout({ children }: { children: ReactNode }) {
  return (
    <ResponsiveAppShell
      variant="admin"
      mobileTitle="لوحة المنصة"
      sidebar={(close) => <AdminSidebar onNavigate={close} />}
    >
      <div className="branda-admin-fields min-w-0">{children}</div>
    </ResponsiveAppShell>
  );
}
