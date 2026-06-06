"use client";

import { useState } from "react";
import { BadgeCheck, CalendarDays, LogOut, RefreshCw, ScanLine, ShoppingBag } from "lucide-react";
import {
  acceptCashierOrderAction,
  acceptCashierReservationAction,
  cashierScanLoyaltyAction,
  logoutCashierAction,
} from "@/app/actions/cashier";
import { BarcodeCameraScanner } from "@/components/loyalty/barcode-camera-scanner";
import type { CashierConsole } from "@/lib/data/cashier";

type Props = {
  initialData: CashierConsole;
};

export function CashierConsoleClient({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [cardCode, setCardCode] = useState("");
  const [invoiceBarcode, setInvoiceBarcode] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [operation, setOperation] = useState<"stamp" | "redeem">("stamp");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function acceptOrder(orderId: string) {
    setBusy(true);
    try {
      await acceptCashierOrderAction(orderId);
      setMessage("تم استقبال الطلب");
      setData((current) => ({
        ...current,
        orders: current.orders.filter((order) => String(order.id) !== orderId),
      }));
    } catch {
      setMessage("تعذر استقبال الطلب");
    } finally {
      setBusy(false);
    }
  }

  async function acceptReservation(reservationId: string) {
    setBusy(true);
    try {
      await acceptCashierReservationAction(reservationId);
      setMessage("تم استقبال الحجز");
      setData((current) => ({
        ...current,
        reservations: current.reservations.filter((reservation) => String(reservation.id) !== reservationId),
      }));
    } catch {
      setMessage("تعذر استقبال الحجز");
    } finally {
      setBusy(false);
    }
  }

  async function scanLoyalty() {
    if (!cardCode.trim() || !invoiceBarcode.trim()) {
      setMessage("أدخل باركود البطاقة وباركود الفاتورة");
      return;
    }

    setBusy(true);
    try {
      const result = await cashierScanLoyaltyAction({
        cafeId: data.cafe.id,
        cardCode,
        invoiceBarcode,
        invoiceAmount: Number(invoiceAmount || 0),
        operation,
      });
      setMessage(operation === "stamp" ? `تم تأكيد العملية للعميل ${String(result.customerName)}` : `تم صرف المكافأة للعميل ${String(result.customerName)}`);
      setCardCode("");
      setInvoiceBarcode("");
      setInvoiceAmount("");
    } catch {
      setMessage(operation === "stamp" ? "تعذر تأكيد العملية" : "تعذر صرف المكافأة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] px-4 py-8 text-[#311912]">
      <section className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-white p-5 shadow-sm">
          <div>
            <p className="font-black text-[#6B3A25]">لوحة الكاشير</p>
            <h1 className="mt-1 text-3xl font-black">{data.cafe.name}</h1>
            <p className="mt-1 text-sm font-bold text-[#806A5E]">
              {data.cashier.fullName} {data.cashier.employeeNumber ? `رقم ${data.cashier.employeeNumber}` : ""}
            </p>
          </div>
          <form action={logoutCashierAction}>
            <button className="inline-flex items-center gap-2 rounded-2xl bg-[#311912] px-5 py-3 font-black text-white">
              <LogOut className="h-5 w-5" />
              خروج
            </button>
          </form>
        </header>

        {message ? (
          <div className="mb-6 rounded-2xl bg-[#FFF8EA] p-4 font-black text-[#6B3A25]">
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <ScanLine className="h-6 w-6 text-[#6B3A25]" />
              قراءة بطاقة الولاء والفاتورة
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <input className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" placeholder="باركود بطاقة العميل" value={cardCode} onChange={(e) => setCardCode(e.target.value.toUpperCase())} />
              <input className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" placeholder="باركود الفاتورة" value={invoiceBarcode} onChange={(e) => setInvoiceBarcode(e.target.value)} />
              <input className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" placeholder="قيمة الفاتورة اختياري" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} />
              <select className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" value={operation} onChange={(e) => setOperation(e.target.value as "stamp" | "redeem")}>
                <option value="stamp">تأكيد ختم أو عملية شراء</option>
                <option value="redeem">صرف مكافأة</option>
              </select>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <BarcodeCameraScanner label="قراءة بطاقة العميل" onDetected={(value) => setCardCode(value.toUpperCase())} />
              <BarcodeCameraScanner label="قراءة باركود الفاتورة" onDetected={setInvoiceBarcode} />
              <button onClick={scanLoyalty} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#D9A33F] px-4 py-3 text-sm font-black text-[#311912] disabled:opacity-60">
                <BadgeCheck className="h-4 w-4" />
                تنفيذ العملية
              </button>
            </div>
          </section>

          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <ShoppingBag className="h-6 w-6 text-[#6B3A25]" />
              الطلبات
            </h2>
            <div className="mt-5 space-y-3">
              {data.orders.length ? data.orders.map((order) => (
                <article key={String(order.id)} className="rounded-2xl bg-[#F8F4EF] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{String(order.customerName || "عميل")}</p>
                      <p className="text-xs font-bold text-[#806A5E]">الحالة {String(order.status)}</p>
                    </div>
                    <button onClick={() => acceptOrder(String(order.id))} className="rounded-xl bg-[#6B3A25] px-4 py-2 text-sm font-black text-white">
                      استقبال الطلب
                    </button>
                  </div>
                  <p className="mt-2 text-sm font-bold text-[#806A5E]">الجوال {String(order.customerPhone || "-")}</p>
                  <p className="mt-1 text-sm font-bold text-[#806A5E]">الملاحظات {String(order.notes || "-")}</p>
                </article>
              )) : <p className="font-bold text-[#806A5E]">لا توجد طلبات حالية</p>}
            </div>
          </section>

          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <CalendarDays className="h-6 w-6 text-[#6B3A25]" />
              الحجوزات
            </h2>
            <div className="mt-5 space-y-3">
              {data.reservations.length ? data.reservations.map((reservation) => (
                <article key={String(reservation.id)} className="rounded-2xl bg-[#F8F4EF] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{String(reservation.customerName || "عميل")}</p>
                      <p className="text-xs font-bold text-[#806A5E]">
                        {String(reservation.reservationDate || "")} {String(reservation.reservationTime || "")}
                      </p>
                    </div>
                    <button onClick={() => acceptReservation(String(reservation.id))} className="rounded-xl bg-[#6B3A25] px-4 py-2 text-sm font-black text-white">
                      استقبال الحجز
                    </button>
                  </div>
                  <p className="mt-2 text-sm font-bold text-[#806A5E]">النوع {String(reservation.eventType || "-")}</p>
                  <p className="mt-1 text-sm font-bold text-[#806A5E]">عدد الضيوف {String(reservation.guests || "-")}</p>
                  <p className="mt-1 text-sm font-bold text-[#806A5E]">الملاحظات {String(reservation.notes || "-")}</p>
                </article>
              )) : <p className="font-bold text-[#806A5E]">لا توجد حجوزات حالية</p>}
            </div>
          </section>

          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <RefreshCw className="h-6 w-6 text-[#6B3A25]" />
              حركة الكاشير
            </h2>
            <div className="mt-5 space-y-3">
              {data.logs.length ? data.logs.map((log) => (
                <article key={String(log.id)} className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="font-black">{String(log.actionType)}</p>
                  <p className="mt-1 text-xs font-bold text-[#806A5E]">{String(log.createdAt)}</p>
                  <p className="mt-1 text-sm font-bold text-[#806A5E]">الفاتورة {String(log.invoiceBarcode || "-")}</p>
                </article>
              )) : <p className="font-bold text-[#806A5E]">لا توجد حركات مسجلة</p>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
