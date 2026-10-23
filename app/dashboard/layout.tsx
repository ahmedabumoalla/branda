import { DashboardAppLayout } from "@/components/dashboard/dashboard-app-layout";
import { recordCurrentBrandDashboardEntry } from "@/lib/data/operation-events";
import { getCurrentMaintenanceSession } from "@/lib/platform/maintenance";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { redirect } from "next/navigation";

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
  // Finance staff membership never grants access to the brand dashboard.
  if (!await getOwnerCafeContext()) redirect("/login");
  const [maintenanceSession, entryClient] = await Promise.all([
    getCurrentMaintenanceSession(),
    createClient().catch(() => null),
  ]);
  // Capture request cookies before after(); analytics must not delay page navigation.
  if (entryClient) after(() => recordCurrentBrandDashboardEntry("/dashboard", entryClient));

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
