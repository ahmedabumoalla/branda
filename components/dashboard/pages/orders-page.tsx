"use client";

import { Receipt, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { formatSar } from "@/lib/format";
import { ORDERS_KEY, mockCafeOrders, type CafeOrder, type OrderStatus } from "@/lib/mock/orders";

const statuses: OrderStatus[] = ["جديد", "قيد التجهيز", "جاهز", "مكتمل", "ملغي"];

export function OrdersPageClient() {
  const [orders, setOrders] = useState<CafeOrder[]>(mockCafeOrders);
  const [selected, setSelected] = useState<CafeOrder | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(ORDERS_KEY);
    if (saved) setOrders(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }, [orders]);

  function updateStatus(id: string, status: OrderStatus) {
    setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, status } : order)));
    setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev));
  }

  return (
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8">
        <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
        <h1 className="mt-2 text-4xl font-black text-[#3A2117]">طلبات الكوفي</h1>
        <p className="mt-2 text-[#7A6255]">كل تفاصيل الطلب والعميل والدفع واضحة في مكان واحد.</p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <div className="grid gap-5">
          {orders.map((order) => (
            <article key={order.id} className="rounded-3xl border border-white bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
                    <Receipt className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{order.id}</h2>
                    <p className="mt-1 font-bold text-[#7A6255]">{order.customerName} • {order.customerPhone}</p>
                    <p className="mt-1 text-sm font-bold text-[#8A7062]">{order.type} • {order.createdAt}</p>
                  </div>
                </div>

                <div className="text-left">
                  <p className="text-2xl font-black text-[#6B3A25]">{formatSar(order.total)}</p>
                  <p className="mt-1 text-sm font-bold text-[#7A6255]">{order.paymentStatus}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {statuses.map((status) => (
                  <button
                    key={status}
                    onClick={() => updateStatus(order.id, status)}
                    className={`rounded-2xl px-4 py-2 text-sm font-black ${
                      order.status === status
                        ? "bg-[#3A2117] text-[#F8E8D2]"
                        : "bg-[#F8F4EF] text-[#3A2117]"
                    }`}
                  >
                    {status}
                  </button>
                ))}

                <button
                  onClick={() => setSelected(order)}
                  className="rounded-2xl bg-[#F8F4EF] px-5 py-2 font-black text-[#3A2117]"
                >
                  تفاصيل الطلب
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          {selected ? (
            <>
              <h2 className="text-2xl font-black text-[#3A2117]">تفاصيل الطلب</h2>

              <div className="mt-5 rounded-2xl bg-[#F8F4EF] p-4">
                <p className="flex items-center gap-2 font-black">
                  <UserRound className="h-5 w-5" />
                  بيانات العميل
                </p>
                <p className="mt-2 text-[#7A6255]">{selected.customerName}</p>
                <p className="text-[#7A6255]">{selected.customerPhone}</p>
                <p className="text-[#7A6255]">{selected.customerEmail || "بدون بريد"}</p>
              </div>

              <div className="mt-5 space-y-3">
                {selected.items.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-[#F8F4EF] p-4">
                    <div className="flex justify-between gap-3">
                      <h3 className="font-black">{item.name}</h3>
                      <span className="font-black">{item.quantity}x</span>
                    </div>
                    <p className="mt-1 text-sm text-[#7A6255]">{formatSar(item.unitPrice)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-[#F8F4EF] p-4">
                <p>المجموع: {formatSar(selected.subtotal)}</p>
                <p>الخصم: {formatSar(selected.discountAmount)}</p>
                <p>الضريبة: {formatSar(selected.taxAmount)}</p>
                <p className="mt-2 text-xl font-black text-[#6B3A25]">الإجمالي: {formatSar(selected.total)}</p>
              </div>

              {selected.notes ? (
                <div className="mt-5 rounded-2xl bg-[#FFF8EF] p-4 font-bold text-[#7A6255]">
                  ملاحظات: {selected.notes}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl bg-[#F8F4EF] p-6 text-center">
              <h2 className="text-xl font-black">اختر طلبًا</h2>
              <p className="mt-2 text-[#7A6255]">اضغط تفاصيل الطلب لعرض كامل البيانات.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}