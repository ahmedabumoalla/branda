import Link from "next/link";
import { AlertTriangle, Boxes, Clock3, ShoppingBag, Users } from "lucide-react";
import {
  getDashboardOrderTrend,
  getDashboardRecentOrders,
  getDashboardSummary,
} from "@/lib/data/dashboard-home";

const statusLabels: Record<string, string> = {
  pending_cafe: "طلب جديد",
  accepted: "مقبول",
  preparing: "قيد التجهيز",
  ready: "جاهز",
  completed: "مكتمل",
  rejected: "مرفوض",
  cancelled: "ملغي",
  not_completed: "غير مكتمل",
};

export function DashboardSectionSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <div className="animate-pulse rounded-[28px] border border-[#E7D7C6] bg-white p-5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="mb-3 h-16 rounded-2xl bg-[#F3ECE5] last:mb-0" />
      ))}
    </div>
  );
}

export async function DashboardSummarySection() {
  try {
    const summary = await getDashboardSummary();
    const cards = [
      { label: "طلبات اليوم", value: summary.todayOrders, icon: ShoppingBag },
      { label: "تحتاج إجراء", value: summary.actionOrders, icon: Clock3 },
      { label: "إجمالي العملاء", value: summary.customers, icon: Users },
      { label: "المنتجات النشطة", value: summary.activeProducts, icon: Boxes },
    ];

    return (
      <section aria-label="مؤشرات الأداء" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <article
            key={label}
            className="group rounded-[26px] border border-[#E7D7C6] bg-white p-5 shadow-[0_14px_45px_rgba(49,25,18,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(49,25,18,0.10)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-[#806A5E]">{label}</p>
                <p className="mt-3 text-4xl font-black tracking-tight text-[#311912]">{value}</p>
              </div>
              <span className="rounded-2xl bg-[#F8EFD8] p-3 text-[#6B3A25]">
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        ))}
        {summary.unavailableProducts > 0 ? (
          <div className="sm:col-span-2 xl:col-span-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            يوجد {summary.unavailableProducts} منتج غير متاح ويحتاج إلى مراجعة.
          </div>
        ) : null}
      </section>
    );
  } catch {
    return <p className="rounded-2xl bg-red-50 p-4 font-bold text-red-700">تعذر تحميل المؤشرات الآن.</p>;
  }
}

export async function DashboardRecentOrdersSection() {
  try {
    const orders = await getDashboardRecentOrders(5);
    return (
      <section className="rounded-[28px] border border-[#E7D7C6] bg-white p-5 shadow-[0_14px_45px_rgba(49,25,18,0.06)] sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black text-[#A66A42]">التشغيل الآن</p>
            <h2 className="mt-1 text-xl font-black text-[#311912]">آخر الطلبات</h2>
          </div>
          <Link href="/dashboard/orders" className="rounded-xl bg-[#311912] px-4 py-2 text-sm font-black text-white">
            كل الطلبات
          </Link>
        </div>
        {orders.length ? (
          <div className="mt-5 divide-y divide-[#EFE4DA]">
            {orders.map((order) => (
              <div key={order.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
                <div>
                  <p className="font-black text-[#311912]">#{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs font-bold text-[#806A5E]">{order.customerName}</p>
                </div>
                <p className="text-sm font-bold text-[#6B3A25]">{statusLabels[order.status] ?? order.status}</p>
                <p className="text-sm font-black">{order.total.toFixed(2)} ر.س</p>
                <time className="text-xs font-bold text-[#806A5E]">
                  {new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(order.createdAt))}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-[#FCF8F3] p-8 text-center font-bold text-[#806A5E]">لا توجد طلبات بعد.</p>
        )}
      </section>
    );
  } catch {
    return <p className="rounded-2xl bg-red-50 p-4 font-bold text-red-700">تعذر تحميل آخر الطلبات.</p>;
  }
}

export async function DashboardTrendSection() {
  try {
    const values = await getDashboardOrderTrend();
    const max = Math.max(...values, 1);
    return (
      <section className="rounded-[28px] border border-[#E7D7C6] bg-white p-5 shadow-[0_14px_45px_rgba(49,25,18,0.06)] sm:p-6">
        <p className="text-xs font-black text-[#A66A42]">آخر 7 أيام</p>
        <h2 className="mt-1 text-xl font-black">اتجاه الطلبات</h2>
        <div className="mt-6 flex h-36 items-end gap-2" aria-label={`الطلبات اليومية: ${values.join(", ")}`}>
          {values.map((value, index) => (
            <div key={index} className="flex flex-1 flex-col items-center justify-end gap-2">
              <span className="text-xs font-black">{value}</span>
              <span
                className="w-full rounded-t-xl bg-gradient-to-t from-[#6B3A25] to-[#D5A557]"
                style={{ height: `${Math.max((value / max) * 100, 6)}%` }}
              />
            </div>
          ))}
        </div>
      </section>
    );
  } catch {
    return <p className="rounded-2xl bg-red-50 p-4 font-bold text-red-700">تعذر تحميل الاتجاه.</p>;
  }
}
