import { notFound } from "next/navigation";
import { getDashboardCafeContext } from "@/lib/data/cafes";

export const dynamic = "force-dynamic";

// Landing page for a Loco employee whose owner has not granted any section yet
export default async function StaffHomePage() {
  const cafe = await getDashboardCafeContext();
  if (!cafe?.staff) notFound();
  return (
    <section dir="rtl" className="mx-auto mt-10 max-w-xl rounded-2xl border border-[#E8D9C8] bg-white p-8 text-right shadow-sm">
      <h1 className="text-2xl font-bold text-[#311912]">أهلًا بك في لوحة {cafe.name}</h1>
      <p className="mt-3 leading-8 text-[#6B5446]">لا توجد أقسام مفعلة لحسابك حاليًا اطلب من مالك العلامة تفعيل الصلاحيات المناسبة لك</p>
    </section>
  );
}
