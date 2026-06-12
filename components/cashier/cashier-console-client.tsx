
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, BellRing, CalendarDays, Gift, LogOut, QrCode, RefreshCw, ScanLine, ShoppingBag } from "lucide-react";
import {
  acceptCashierOrderAction,
  acceptCashierReservationAction,
  cashierRedeemExperienceRewardAction,
  cashierScanLoyaltyAction,
  confirmReservationCodeAction,
  logoutCashierAction,
} from "@/app/actions/cashier";
import { BarcodeCameraScanner } from "@/components/loyalty/barcode-camera-scanner";
import type { CashierConsole } from "@/lib/data/cashier";
import { parseBrandaQrPayload } from "@/lib/loyalty/secure-qr-payload";

type Props = { initialData: CashierConsole };

function playAlert() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.18;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); void ctx.close(); }, 420);
  } catch {}
}

export function CashierConsoleClient({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [cardCode, setCardCode] = useState("");
  const [invoiceBarcode, setInvoiceBarcode] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [reservationCode, setReservationCode] = useState("");
  const [experienceRewardCode, setExperienceRewardCode] = useState("");
  const [operation, setOperation] = useState<"stamp" | "redeem">("stamp");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef(true);

  const pendingCount = useMemo(() => data.orders.length + data.reservations.length, [data.orders.length, data.reservations.length]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (pendingCount > 0) playAlert();
  }, [pendingCount]);

  async function acceptOrder(orderId: string) {
    setBusy(true);
    try {
      await acceptCashierOrderAction(orderId);
      setMessage("تم استقبال الطلب وتسجيل حركة الكاشير");
      setData((current) => ({ ...current, orders: current.orders.filter((order) => String(order.id) !== orderId) }));
    } catch { setMessage("تعذر استقبال الطلب"); }
    finally { setBusy(false); }
  }

  async function acceptReservation(reservationId: string) {
    setBusy(true);
    try {
      await acceptCashierReservationAction(reservationId);
      setMessage("تم استقبال الحجز وتسجيل حركة الكاشير");
      setData((current) => ({ ...current, reservations: current.reservations.filter((reservation) => String(reservation.id) !== reservationId) }));
    } catch { setMessage("تعذر استقبال الحجز"); }
    finally { setBusy(false); }
  }

  async function confirmReservation() {
    if (!reservationCode.trim()) { setMessage("أدخل كود الحجز أو اقرأ QR"); return; }
    setBusy(true);
    try {
      const result = await confirmReservationCodeAction(reservationCode.trim());
      setMessage(`تم تأكيد حضور ${String(result.customerName ?? "العميل")} للحجز`);
      setReservationCode("");
    } catch { setMessage("كود الحجز غير صالح أو مستخدم مسبقًا"); }
    finally { setBusy(false); }
  }


  async function redeemExperienceReward() {
    if (!experienceRewardCode.trim()) {
      setMessage("أدخل QR مكافأة توثيق التجربة");
      return;
    }

    setBusy(true);
    try {
      const rewardCode = parseBrandaQrPayload(experienceRewardCode, "experience-reward") ?? experienceRewardCode.trim().toUpperCase();
      const result = await cashierRedeemExperienceRewardAction(rewardCode);
      const items = Array.isArray(result.items)
        ? result.items
            .map((item) => `${String(item.productName ?? "")} × ${String(item.quantity ?? 1)}`)
            .join("، ")
        : "مكافأة";
      setMessage(`تم صرف مكافأة توثيق التجربة للعميل ${String(result.customerName ?? "عميل")} — ${items}`);
      setExperienceRewardCode("");
    } catch {
      setMessage("QR مكافأة التوثيق غير صالح أو مستخدم مسبقًا أو منتهي الصلاحية");
    } finally {
      setBusy(false);
    }
  }

  async function scanLoyalty() {
    if (!cardCode.trim() || !invoiceBarcode.trim()) { setMessage("أدخل QR البطاقة وQR الفاتورة"); return; }
    setBusy(true);
    try {
      const parsedCardCode = parseBrandaQrPayload(cardCode, "loyalty-card") ?? cardCode.trim().toUpperCase();
      const parsedInvoiceBarcode = parseBrandaQrPayload(invoiceBarcode, "invoice") ?? invoiceBarcode.trim();
      const result = await cashierScanLoyaltyAction({ cafeId: data.cafe.id, cardCode: parsedCardCode, invoiceBarcode: parsedInvoiceBarcode, invoiceAmount: Number(invoiceAmount || 0), operation });
      setMessage(operation === "stamp" ? `تم تأكيد العملية للعميل ${String(result.customerName)}` : `تم صرف المكافأة للعميل ${String(result.customerName)}`);
      setCardCode(""); setInvoiceBarcode(""); setInvoiceAmount("");
    } catch { setMessage(operation === "stamp" ? "تعذر تأكيد العملية" : "تعذر صرف المكافأة"); }
    finally { setBusy(false); }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] px-4 py-8 text-[#311912]">
      <section className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-white p-5 shadow-sm">
          <div>
            <p className="font-black text-[#6B3A25]">لوحة الكاشير</p>
            <h1 className="mt-1 text-3xl font-black">{data.cafe.name}</h1>
            <p className="mt-1 text-sm font-bold text-[#806A5E]">{data.cashier.fullName} {data.cashier.employeeNumber ? `رقم ${data.cashier.employeeNumber}` : ""}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={playAlert} className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 font-black text-white shadow-lg">
              <BellRing className="h-5 w-5" /> تنبيه عالي
            </button>
            <form action={logoutCashierAction}><button className="inline-flex items-center gap-2 rounded-2xl bg-[#311912] px-5 py-3 font-black text-white"><LogOut className="h-5 w-5" /> خروج</button></form>
          </div>
        </header>

        {pendingCount > 0 ? <div className="mb-6 animate-pulse rounded-3xl bg-red-600 p-5 text-center text-2xl font-black text-white shadow-2xl">يوجد {pendingCount} طلب أو حجز يحتاج استقبال</div> : null}
        {message ? <div className="mb-6 rounded-2xl bg-[#FFF8EA] p-4 font-black text-[#6B3A25]">{message}</div> : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black"><ScanLine className="h-6 w-6 text-[#6B3A25]" /> قراءة QR بطاقة الولاء والفاتورة</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <input className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" placeholder="QR بطاقة العميل أو الكود" value={cardCode} onChange={(e) => setCardCode(e.target.value.toUpperCase())} />
              <input className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" placeholder="QR الفاتورة أو رقمها" value={invoiceBarcode} onChange={(e) => setInvoiceBarcode(e.target.value)} />
              <input className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" placeholder="قيمة الفاتورة اختياري" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} />
              <select className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" value={operation} onChange={(e) => setOperation(e.target.value as "stamp" | "redeem")}><option value="stamp">تأكيد عملية شراء</option><option value="redeem">صرف مكافأة</option></select>
            </div>
            <div className="mt-5 flex flex-wrap gap-3"><BarcodeCameraScanner label="قراءة QR بطاقة العميل" expectedKind="loyalty-card" onDetected={(value) => setCardCode(value.toUpperCase())} /><BarcodeCameraScanner label="قراءة QR الفاتورة" onDetected={setInvoiceBarcode} /><button onClick={scanLoyalty} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#D9A33F] px-4 py-3 text-sm font-black text-[#311912] disabled:opacity-60"><BadgeCheck className="h-4 w-4" /> تنفيذ العملية</button></div>
          </section>


          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black"><Gift className="h-6 w-6 text-[#6B3A25]" /> صرف مكافأة توثيق التجربة</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
              اقرأ QR المكافأة الظاهر في تنبيهات العميل، وبعد الصرف يتوقف الكود مباشرة ولا يمكن استخدامه مرة ثانية
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
              <input className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" placeholder="QR مكافأة التوثيق أو الكود" value={experienceRewardCode} onChange={(e) => setExperienceRewardCode(e.target.value.toUpperCase())} />
              <button onClick={redeemExperienceReward} disabled={busy} className="rounded-2xl bg-[#D9A33F] px-5 py-3 font-black text-[#311912] disabled:opacity-60">صرف المكافأة</button>
            </div>
            <div className="mt-5"><BarcodeCameraScanner label="قراءة QR المكافأة" expectedKind="experience-reward" onDetected={(value) => setExperienceRewardCode(value.toUpperCase())} /></div>
          </section>

          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black"><QrCode className="h-6 w-6 text-[#6B3A25]" /> تأكيد حضور الحجز بكود يستخدم مرة واحدة</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
              <input className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold" placeholder="كود الحجز أو QR الحجز" value={reservationCode} onChange={(e) => setReservationCode(e.target.value.toUpperCase())} />
              <button onClick={confirmReservation} disabled={busy} className="rounded-2xl bg-[#311912] px-5 py-3 font-black text-white disabled:opacity-60">تأكيد الحضور</button>
            </div>
            <div className="mt-5"><BarcodeCameraScanner label="قراءة QR الحجز" onDetected={(value) => setReservationCode(value.toUpperCase())} /></div>
          </section>

          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black"><ShoppingBag className="h-6 w-6 text-[#6B3A25]" /> الطلبات</h2>
            <div className="mt-5 space-y-3">{data.orders.length ? data.orders.map((order) => <article key={String(order.id)} className="rounded-2xl bg-[#F8F4EF] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{String(order.customerName || "عميل")}</p><p className="text-xs font-bold text-[#806A5E]">الحالة {String(order.status)}</p></div><button onClick={() => acceptOrder(String(order.id))} className="rounded-xl bg-[#6B3A25] px-4 py-2 text-sm font-black text-white">استقبال الطلب</button></div><p className="mt-2 text-sm font-bold text-[#806A5E]">الجوال {String(order.customerPhone || "-")}</p><p className="mt-1 text-sm font-bold text-[#806A5E]">الملاحظات {String(order.notes || "-")}</p></article>) : <p className="font-bold text-[#806A5E]">لا توجد طلبات حالية</p>}</div>
          </section>

          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black"><CalendarDays className="h-6 w-6 text-[#6B3A25]" /> الحجوزات</h2>
            <div className="mt-5 space-y-3">{data.reservations.length ? data.reservations.map((reservation) => <article key={String(reservation.id)} className="rounded-2xl bg-[#F8F4EF] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{String(reservation.customerName || "عميل")}</p><p className="text-xs font-bold text-[#806A5E]">{String(reservation.reservationDate || "")} {String(reservation.reservationTime || "")}</p></div><button onClick={() => acceptReservation(String(reservation.id))} className="rounded-xl bg-[#6B3A25] px-4 py-2 text-sm font-black text-white">استقبال الحجز</button></div><p className="mt-2 text-sm font-bold text-[#806A5E]">النوع {String(reservation.eventType || "-")}</p><p className="mt-1 text-sm font-bold text-[#806A5E]">عدد الضيوف {String(reservation.guests || "-")}</p><p className="mt-1 text-sm font-bold text-[#806A5E]">الملاحظات {String(reservation.notes || "-")}</p></article>) : <p className="font-bold text-[#806A5E]">لا توجد حجوزات حالية</p>}</div>
          </section>

          <section className="rounded-[28px] bg-white p-5 shadow-sm xl:col-span-2">
            <h2 className="flex items-center gap-2 text-xl font-black"><RefreshCw className="h-6 w-6 text-[#6B3A25]" /> حركة الكاشير</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">{data.logs.length ? data.logs.map((log) => <article key={String(log.id)} className="rounded-2xl bg-[#F8F4EF] p-4"><p className="font-black">{String(log.actionType)}</p><p className="mt-1 text-xs font-bold text-[#806A5E]">{String(log.createdAt)}</p><p className="mt-1 text-sm font-bold text-[#806A5E]">الفاتورة {String(log.invoiceBarcode || "-")}</p></article>) : <p className="font-bold text-[#806A5E]">لا توجد حركات مسجلة</p>}</div>
          </section>
        </div>
      </section>
    </main>
  );
}
