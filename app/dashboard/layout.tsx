import { DashboardAppLayout } from "@/components/dashboard/dashboard-app-layout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#FCF8F3] text-[#311912]">
      <DashboardAppLayout>{children}</DashboardAppLayout>
    </main>
  );
}
