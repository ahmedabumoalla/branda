export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminAppLayout } from "@/components/admin/admin-app-layout";
import { getAdminSupportTickets, type AdminSupportTicket } from "@/lib/data/admin-support";

export default async function AdminSupportPage() {
  let tickets: AdminSupportTicket[] = [];
  let error = "";

  try {
    tickets = await getAdminSupportTickets();
  } catch {
    error = "تعذر تحميل طلبات الدعم";
  }

  return (
    <AdminAppLayout>
      <main dir="rtl" className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 text-[#F8F4EF]">
          <p className="text-sm font-black text-[#F6C35B]">الدعم</p>
          <h1 className="mt-2 text-3xl font-black">طلبات دعم العلامات التجارية</h1>
          <p className="mt-2 text-sm font-bold text-[#CBB29C]">
            كل طلب يظهر مع رقم العلامة الفريد لتسريع المعالجة
          </p>
        </section>

        {error ? (
          <div className="rounded-2xl bg-red-950/40 p-4 font-black text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4">
          {tickets.map((ticket) => (
            <article
              key={ticket.id}
              className="rounded-[28px] border border-white/10 bg-[#18110e] p-5 text-[#F8F4EF]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">{ticket.cafeName}</h2>
                  <p className="mt-1 text-sm font-bold text-[#F6C35B]">
                    رقم العلامة {ticket.cafeCode}
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">
                  {ticket.status}
                </span>
              </div>

              <div className="mt-4 grid gap-3 text-sm font-bold text-[#CBB29C] md:grid-cols-3">
                <p>الاسم {ticket.requesterName}</p>
                <p>الجوال {ticket.requesterPhone}</p>
                <p>البريد {ticket.requesterEmail || "غير مضاف"}</p>
              </div>

              <p className="mt-4 rounded-2xl bg-white/5 p-4 font-bold leading-8 text-[#F8F4EF]">
                {ticket.message}
              </p>
            </article>
          ))}
        </section>
      </main>
    </AdminAppLayout>
  );
}
