import { DashboardAppLayout } from "@/components/dashboard/dashboard-app-layout";
import { recordCurrentBrandDashboardEntry } from "@/lib/data/operation-events";
import { getCurrentMaintenanceSession } from "@/lib/platform/maintenance";
import { IBM_Plex_Sans_Arabic } from "next/font/google";

const dashboardFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [maintenanceSession] = await Promise.all([
    getCurrentMaintenanceSession(),
    recordCurrentBrandDashboardEntry(),
  ]);

  return (
    <main dir="rtl" className={`${dashboardFont.className} min-h-screen overflow-x-hidden bg-[#FCF8F3] text-[#311912]`}>
      <DashboardAppLayout
        maintenanceSession={
          maintenanceSession
            ? {
                cafeName: maintenanceSession.cafeName,
                maintenanceAccountNumber: maintenanceSession.maintenanceAccountNumber,
                expiresAt: maintenanceSession.expiresAt,
              }
            : null
        }
      >
        {children}
      </DashboardAppLayout>
    </main>
  );
}
