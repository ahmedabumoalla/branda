import { DashboardAppLayout } from "@/components/dashboard/dashboard-app-layout";
import { getCurrentMaintenanceSession } from "@/lib/platform/maintenance";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const maintenanceSession = await getCurrentMaintenanceSession();

  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#FCF8F3] text-[#311912]">
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
