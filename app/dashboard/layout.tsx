import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] text-[#2B1710]">
      <DashboardSidebar />
      <section className="mr-[280px] min-h-screen">{children}</section>
    </main>
  );
}
