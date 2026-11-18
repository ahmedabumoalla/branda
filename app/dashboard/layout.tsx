import { AldeemCleanDashboard } from "@/components/dashboard/aldeem-clean-dashboard";
import { DashboardAppLayout } from "@/components/dashboard/dashboard-app-layout";
import { recordCurrentBrandDashboardEntry } from "@/lib/data/operation-events";
import { getCurrentMaintenanceSession } from "@/lib/platform/maintenance";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDashboardCafeContext } from "@/lib/data/cafes";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { fetchOwnerDashboardShellAction } from "@/app/actions/dashboard-shell";
import { brandStaffLandingPath, brandStaffPathAllowed } from "@/lib/staff/brand-staff-access";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { ManagedBrandBoundary } from "@/components/brands/managed-brand-boundary";

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
  const cafe = await getDashboardCafeContext();
  if (!cafe) redirect("/login");
  // Loco employees open only the sections their owner granted
  if (cafe.staff) {
    const pathname = (await headers()).get("x-branda-pathname") ?? "";
    if (!brandStaffPathAllowed(cafe.staff, pathname)) redirect(brandStaffLandingPath(cafe.staff));
  }
  if (!cafe.staff && cafe.slug === "khayal-aldeem") {
    const [maintenance, features] = await Promise.all([getCurrentMaintenanceSession(), getCafeFeatureCodes(cafe.id).catch(() => [])]);
    return <div className={dashboardFont.className}><AldeemCleanDashboard maintenance={!!maintenance} loyaltyEnabled={featureCodesAllow(features, "loyalty")}>{children}</AldeemCleanDashboard></div>;
  }
  const [maintenanceSession, entryClient, initialSnapshot] = await Promise.all([
    getCurrentMaintenanceSession(),
    createClient().catch(() => null),
    fetchOwnerDashboardShellAction().catch(() => null),
  ]);
  // Capture request cookies before after(); analytics must not delay page navigation.
  if (entryClient && !cafe.staff) after(() => recordCurrentBrandDashboardEntry("/dashboard", entryClient));

  return (
    <main dir="rtl" className={`${dashboardFont.className} min-h-screen overflow-x-hidden bg-[#FCF8F3] text-[#311912]`}>
      {cafe.managementUserId && <ManagedBrandBoundary userId={cafe.managementUserId} brandId={cafe.id} />}
      {cafe.managementName && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7DBD1] bg-white px-5 py-3 text-sm"><span>{cafe.managementName} <span className="mx-2" aria-hidden="true">/</span><strong>{cafe.name}</strong></span><a href="/brands" className="rounded-lg bg-[#713B26] px-4 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2">تبديل العلامة</a></div>}
      <DashboardAppLayout
        initialSnapshot={initialSnapshot}
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
