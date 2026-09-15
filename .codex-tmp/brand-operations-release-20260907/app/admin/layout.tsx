import { AdminAppLayout } from "@/components/admin/admin-app-layout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#0f0c0a] text-[#F8F4EF]">
      <AdminAppLayout>{children}</AdminAppLayout>
    </main>
  );
}
