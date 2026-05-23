import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="min-h-screen bg-[#0f0c0a] text-[#F8F4EF]">
      <AdminSidebar />
      <section className="branda-admin-fields mr-[280px] min-h-screen">{children}</section>
    </main>
  );
}
