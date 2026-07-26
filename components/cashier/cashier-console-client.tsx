"use client";

import { useState } from "react";
import { CheckCircle2, LogOut, ShoppingBag, XCircle } from "lucide-react";
import {
  logoutCashierAction,
  updateCashierOrderStatusAction,
} from "@/app/actions/cashier";
import type { CashierConsole } from "@/lib/data/cashier";

type Row = Record<string, unknown>;

function text(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}

export function CashierConsoleClient({ initialData }: { initialData: CashierConsole }) {
  const [orders, setOrders] = useState<Row[]>(initialData.operationOrders ?? initialData.orders);
  const [message, setMessage] = useState("");

  async function update(id: string, status: "accepted" | "rejected") {
    try {
      await updateCashierOrderStatusAction(id, status);
      setOrders((current) => current.map((order) => text(order, "id") === id ? { ...order, status } : order));
      setMessage(status === "accepted" ? "تم قبول الطلب" : "تم رفض الطلب");
    } catch {
      setMessage("تعذر تحديث الطلب");
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] p-4 text-[#311912]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between rounded-3xl bg-[#311912] p-5 text-white">
          <div>
            <p className="text-sm font-bold text-white/70">{initialData.cafe.name}</p>
            <h1 className="text-2xl font-black">لوحة الكاشير</h1>
            <p className="mt-1 text-sm">{initialData.cashier.fullName}</p>
          </div>
          <button type="button" onClick={() => void logoutCashierAction()} className="rounded-2xl bg-white/10 p-3" aria-label="تسجيل الخروج">
            <LogOut className="h-5 w-5" />
          </button>
        </header>
        {message ? <p className="mb-4 rounded-2xl bg-white p-4 font-bold">{message}</p> : null}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-black"><ShoppingBag className="h-5 w-5" /> الطلبات</h2>
          {orders.map((order) => {
            const id = text(order, "id", "order_id", "orderId");
            return (
              <article key={id} className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black">{text(order, "customer_name", "customerName") || "عميل"}</h3>
                    <p className="mt-1 text-sm font-bold text-[#806A5E]">رقم الطلب: {id.slice(0, 8)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void update(id, "accepted")} className="rounded-xl bg-emerald-700 p-3 text-white" aria-label="قبول الطلب"><CheckCircle2 className="h-5 w-5" /></button>
                    <button type="button" onClick={() => void update(id, "rejected")} className="rounded-xl bg-red-700 p-3 text-white" aria-label="رفض الطلب"><XCircle className="h-5 w-5" /></button>
                  </div>
                </div>
              </article>
            );
          })}
          {!orders.length ? <p className="rounded-3xl bg-white p-6 text-center font-bold">لا توجد طلبات حاليًا.</p> : null}
        </section>
      </div>
    </main>
  );
}
