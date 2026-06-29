"use client";

import { useState } from "react";
import { ReceiptText, Utensils } from "lucide-react";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatusBadge } from "@/components/branda-finance/finance-status-badge";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import { getBrandaFinanceDemoData } from "@/lib/branda-finance/demo-data";

const data = getBrandaFinanceDemoData();

type HallOrder = {
  id: string;
  table: string;
  customer: string;
  status: "جديد" | "تحت التجهيز" | "جاهز" | "تم التحويل لفاتورة";
  time: string;
  notes: string;
  items: Array<{ productId: string; quantity: number }>;
};

const initialOrders: HallOrder[] = [
  { id: "hall-1", table: "12", customer: "ضيف الصالة", status: "جديد", time: "12:40", notes: "بدون سكر", items: [{ productId: data.products[0]?.id ?? "", quantity: 2 }, { productId: data.products[1]?.id ?? "", quantity: 1 }] },
  { id: "hall-2", table: "4", customer: "نورة", status: "تحت التجهيز", time: "12:45", notes: "استعجال", items: [{ productId: data.products[2]?.id ?? "", quantity: 3 }] },
];

export function HallOrdersWorkspace() {
  const [orders, setOrders] = useState(initialOrders);
  const [table, setTable] = useState("8");
  const [quantity, setQuantity] = useState(1);

  function createPreviewOrder() {
    const product = data.products[0];
    if (!product) return;
    setOrders((current) => [
      {
        id: `hall-${Date.now()}`,
        table,
        customer: "عميل الفرع العام",
        status: "جديد",
        time: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
        notes: "تم إنشاؤه من معاينة ديمو بدون إشعار أجهزة",
        items: [{ productId: product.id, quantity }],
      },
      ...current,
    ]);
  }

  function updateStatus(id: string, status: HallOrder["status"]) {
    setOrders((current) => current.map((order) => (order.id === id ? { ...order, status } : order)));
  }

  return (
    <FinancePageShell title="طلبات الصالة / الويتر" description="استقبال طلبات طاولة محلياً وتحويلها إلى معاينة فاتورة بدون أجهزة أو إشعارات حقيقية." status="ديمو محلي" actions={[{ label: "الكاشير", href: "/dashboard/branda-finance/sales", primary: true }]}>
      <section className="grid min-w-0 gap-3 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 sm:grid-cols-[160px_120px_minmax(0,1fr)]">
        <label><span className="mb-1 block text-[11px] font-black">رقم الطاولة</span><input value={table} onChange={(event) => setTable(event.target.value)} className="h-9 w-full rounded-[8px] border border-[#E1D1BD] px-2 text-[12px] font-bold" /></label>
        <label><span className="mb-1 block text-[11px] font-black">الكمية</span><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="h-9 w-full rounded-[8px] border border-[#E1D1BD] px-2 text-[12px] font-bold" /></label>
        <div className="flex items-end">
          <button type="button" onClick={createPreviewOrder} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2F5D50] px-3 text-[12px] font-black text-white">
            <Utensils className="h-4 w-4" />
            إرسال الطلب للمسؤول
          </button>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 xl:grid-cols-2">
        {orders.map((order) => {
          const total = order.items.reduce((sum, item) => {
            const product = data.products.find((candidate) => candidate.id === item.productId);
            return sum + (product?.price ?? 0) * item.quantity * (1 + (product?.vatRate ?? 15) / 100);
          }, 0);
          return (
            <article key={order.id} className="min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_10px_22px_rgba(69,43,28,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-[#9C6B2E]">طاولة {order.table} · {order.time}</p>
                  <h2 className="mt-1 truncate text-[15px] font-black text-[#2F241D]">{order.customer}</h2>
                </div>
                <FinanceStatusBadge tone={order.status === "تم التحويل لفاتورة" ? "green" : "gold"}>{order.status}</FinanceStatusBadge>
              </div>
              <div className="mt-3 space-y-2">
                {order.items.map((item) => {
                  const product = data.products.find((candidate) => candidate.id === item.productId);
                  return (
                    <div key={item.productId} className="flex justify-between gap-3 rounded-[8px] bg-[#FAF3E8] px-3 py-2 text-[12px] font-bold">
                      <span className="truncate">{product?.name ?? "منتج"}</span>
                      <span className="shrink-0">x {item.quantity}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] font-bold leading-5 text-[#806A58]">{order.notes}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-black" dir="ltr">{formatFinanceAmount(total)}</span>
                <div className="flex flex-wrap gap-1.5">
                  {(["تحت التجهيز", "جاهز", "تم التحويل لفاتورة"] as HallOrder["status"][]).map((status) => (
                    <button key={status} type="button" onClick={() => updateStatus(order.id, status)} className="h-8 rounded-[8px] border border-[#D8C7B2] bg-white px-2.5 text-[11px] font-black text-[#5B3926]">
                      {status === "تم التحويل لفاتورة" ? <ReceiptText className="inline h-3.5 w-3.5" /> : null} {status}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </FinancePageShell>
  );
}
