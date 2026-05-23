"use client";

import { Receipt, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
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

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const newOrders = orders.filter((o) => o.status === "جديد").length;

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="طلبات الكوفي"
        subtitle="كل تفاصيل الطلب والعميل والدفع واضحة في مكان واحد."
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي الطلبات" value={orders.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="طلبات جديدة" value={newOrders} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill label="إجمالي الإيرادات" value={formatSar(totalRevenue)} />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="2">
            <div className="grid gap-5">
              {orders.map((order) => (
                <SoftCard key={order.id}>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                        <Receipt className="h-7 w-7" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black">{order.id}</h2>
                        <p className="mt-1 font-bold text-[#7A6255]">
                          {order.customerName} • {order.customerPhone}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[#7A6255]">
                          {order.type} • {order.createdAt}
                        </p>
                      </div>
                    </div>

                    <div className="text-left">
                      <p className="text-2xl font-black text-[#6B3A25]">
                        {formatSar(order.total)}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#7A6255]">
                        {order.paymentStatus}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {statuses.map((status) => (
                      <button
                        key={status}
                        onClick={() => updateStatus(order.id, status)}
                        className={`rounded-2xl px-4 py-2 text-sm font-black ${
                          order.status === status
                            ? "bg-[#3A2117] text-[#F8F4EF]"
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
                </SoftCard>
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="row2">
            {selected ? (
              <>
                <h2 className="text-2xl font-black text-[#3A2117]">تفاصيل الطلب</h2>

                <SoftCard className="mt-5 p-4">
                  <p className="flex items-center gap-2 font-black">
                    <UserRound className="h-5 w-5" />
                    بيانات العميل
                  </p>
                  <p className="mt-2 text-[#7A6255]">{selected.customerName}</p>
                  <p className="text-[#7A6255]">{selected.customerPhone}</p>
                  <p className="text-[#7A6255]">
                    {selected.customerEmail || "بدون بريد"}
                  </p>
                </SoftCard>

                <div className="mt-5 space-y-3">
                  {selected.items.map((item) => (
                    <SoftCard key={item.id} className="p-4">
                      <div className="flex justify-between gap-3">
                        <h3 className="font-black">{item.name}</h3>
                        <span className="font-black">{item.quantity}x</span>
                      </div>
                      <p className="mt-1 text-sm text-[#7A6255]">
                        {formatSar(item.unitPrice)}
                      </p>
                    </SoftCard>
                  ))}
                </div>

                <SoftCard className="mt-5 p-4">
                  <p>المجموع: {formatSar(selected.subtotal)}</p>
                  <p>الخصم: {formatSar(selected.discountAmount)}</p>
                  <p>الضريبة: {formatSar(selected.taxAmount)}</p>
                  <p className="mt-2 text-xl font-black text-[#6B3A25]">
                    الإجمالي: {formatSar(selected.total)}
                  </p>
                </SoftCard>

                {selected.notes ? (
                  <div className="mt-5 rounded-2xl bg-[#FFF8EF] p-4 font-bold text-[#7A6255]">
                    ملاحظات: {selected.notes}
                  </div>
                ) : null}
              </>
            ) : (
              <SoftCard className="text-center">
                <h2 className="text-xl font-black">اختر طلبًا</h2>
                <p className="mt-2 text-[#7A6255]">
                  اضغط تفاصيل الطلب لعرض كامل البيانات.
                </p>
              </SoftCard>
            )}
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}
