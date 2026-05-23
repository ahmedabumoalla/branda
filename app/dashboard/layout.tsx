import { DashboardAppLayout } from "@/components/dashboard/dashboard-app-layout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#F8F4EF] text-[#2B1710]">
      <DashboardAppLayout>{children}</DashboardAppLayout>
    </main>
  );
}
