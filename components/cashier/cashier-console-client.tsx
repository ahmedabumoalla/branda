"use client";

import dynamic from "next/dynamic";
import {
  BadgeCheck,
  CheckCircle2,
  Gift,
  Loader2,
  LogOut,
  ScanLine,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  cashierRedeemExperienceRewardAction,
  cashierScanLoyaltyAction,
  logoutCashierAction,
  updateCashierOrderStatusAction,
} from "@/app/actions/cashier";
import type { CashierConsole } from "@/lib/data/cashier";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";

const BarcodeCameraScanner = dynamic(
  () =>
    import("@/components/loyalty/barcode-camera-scanner").then(
      (module) => module.BarcodeCameraScanner,
    ),
  { loading: () => <p className="text-sm font-bold text-[#806A5E]">جارٍ تجهيز الكاميرا...</p> },
);

type Row = Record<string, unknown>;
type Tab = "orders" | "loyalty" | "rewards";

function text(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}

function number(row: Row, ...keys: string[]) {
  const value = Number(text(row, ...keys));
  return Number.isFinite(value) ? value : 0;
}

function formatTime(value: string) {
  if (!value) return "الآن";
  return new Intl.DateTimeFormat("ar-SA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "جديد",
    pending_cafe: "جديد",
    accepted: "مقبول",
    approved: "مقبول",
    rejected: "مرفوض",
    completed: "مكتمل",
    not_completed: "غير مكتمل",
  };
  return labels[status] ?? status;
}

export function CashierConsoleClient({ initialData }: { initialData: CashierConsole }) {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<Row[]>(initialData.operationOrders ?? initialData.orders);
  const [cardCode, setCardCode] = useState("");
  const [rewardCode, setRewardCode] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const [message, setMessage] = useState("");

  const sortedOrders = useMemo(
    () =>
      [...orders].sort((left, right) => {
        const leftNew = ["pending", "pending_cafe"].includes(text(left, "status"));
        const rightNew = ["pending", "pending_cafe"].includes(text(right, "status"));
        if (leftNew !== rightNew) return leftNew ? -1 : 1;
        return text(right, "created_at", "createdAt").localeCompare(
          text(left, "created_at", "createdAt"),
        );
      }),
    [orders],
  );

  async function updateOrder(id: string, status: "accepted" | "rejected") {
    const operationKey = `${id}:${status}`;
    if (pendingKey) return;
    setPendingKey(operationKey);
    setMessage("");
    try {
      await updateCashierOrderStatusAction(
        id,
        status,
        status === "rejected" ? "تم رفض الطلب من نقطة التشغيل" : undefined,
      );
      setOrders((current) =>
        current.map((order) => (text(order, "id") === id ? { ...order, status } : order)),
      );
      setMessage(status === "accepted" ? "تم قبول الطلب" : "تم رفض الطلب");
    } catch {
      setMessage("تعذر تحديث الطلب؛ ربما عولج من جهاز آخر");
    } finally {
      setPendingKey("");
    }
  }

  async function addLoyaltyStamp(detectedCode?: string) {
    const rawCode = detectedCode ?? cardCode;
    const normalized =
      parseBarndaksaQrPayload(rawCode, "loyalty-card") ?? rawCode.trim().toUpperCase();
    if (!normalized || pendingKey) return;
    setPendingKey("loyalty");
    setMessage("");
    try {
      await cashierScanLoyaltyAction({
        cafeId: initialData.cafe.id,
        cardCode: normalized,
        operation: "stamp",
      });
      setCardCode("");
      setMessage("تمت إضافة الزيارة إلى بطاقة العميل");
    } catch {
      setMessage("تعذر إضافة الزيارة. تحقق من البطاقة وصلاحيتها لهذه العلامة");
    } finally {
      setPendingKey("");
    }
  }

  async function redeemReward(detectedCode?: string) {
    const rawCode = detectedCode ?? rewardCode;
    const normalized =
      parseBarndaksaQrPayload(rawCode, "experience-reward") ?? rawCode.trim().toUpperCase();
    if (!normalized || pendingKey) return;
    setPendingKey("reward");
    setMessage("");
    try {
      const result = await cashierRedeemExperienceRewardAction(normalized);
      setRewardCode("");
      const redeemedName =
        "rewardName" in result ? String(result.rewardName) : "المكافأة";
      setMessage(`تم صرف ${redeemedName} للعميل ${String(result.customerName ?? "")}`);
    } catch {
      setMessage("تعذر صرف المكافأة. تحقق من الكود وحالته والعلامة التابعة له");
    } finally {
      setPendingKey("");
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof ShoppingBag }> = [
    { id: "orders", label: "الطلبات", icon: ShoppingBag },
    { id: "loyalty", label: "الولاء", icon: BadgeCheck },
    { id: "rewards", label: "المكافآت", icon: Gift },
  ];

  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#F8F4EF] p-3 text-[#311912] sm:p-5">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 rounded-[1.75rem] bg-[#311912] p-5 text-white sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-white/65">{initialData.cafe.name}</p>
            <h1 className="mt-1 text-2xl font-black">نقطة التشغيل</h1>
            <p className="mt-1 text-sm font-bold text-white/80">{initialData.cashier.fullName}</p>
          </div>
          <button type="button" onClick={() => void logoutCashierAction()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white/10 px-4 font-black sm:mt-0" aria-label="تسجيل الخروج">
            <LogOut className="h-5 w-5" /> خروج
          </button>
        </header>

        <nav className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 shadow-sm" aria-label="أقسام نقطة التشغيل">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { setActiveTab(id); setMessage(""); }} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-black transition ${activeTab === id ? "bg-[#6B3A25] text-white" : "text-[#806A5E] hover:bg-[#F8F4EF]"}`}>
              <Icon className="h-4 w-4" /><span>{label}</span>
            </button>
          ))}
        </nav>

        {message ? <p aria-live="polite" className="mb-4 rounded-2xl bg-white p-4 text-sm font-black shadow-sm">{message}</p> : null}

        {activeTab === "orders" ? (
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><h2 className="text-xl font-black">الطلبات</h2><p className="mt-1 text-xs font-bold text-[#806A5E]">الطلبات الجديدة تظهر أولًا</p></div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black">{sortedOrders.length} طلب</span>
            </div>
            <div className="space-y-3">
              {sortedOrders.map((order) => {
                const id = text(order, "id", "order_id", "orderId");
                const status = text(order, "status") || "pending";
                const isNew = ["pending", "pending_cafe"].includes(status);
                const isBusy = pendingKey.startsWith(`${id}:`);
                return (
                  <article key={id} className={`rounded-3xl bg-white p-5 shadow-sm ${isNew ? "ring-2 ring-amber-300" : ""}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black">{text(order, "customer_name", "customerName") || "عميل"}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${isNew ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}>{statusLabel(status)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[#806A5E]">
                          <span>#{id.slice(0, 8).toUpperCase()}</span>
                          <span>{formatTime(text(order, "created_at", "createdAt"))}</span>
                          <span>{number(order, "total", "total_amount", "totalAmount").toLocaleString("ar-SA")} ر.س</span>
                        </div>
                      </div>
                      {isNew ? (
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                          <button type="button" disabled={Boolean(pendingKey)} onClick={() => void updateOrder(id, "accepted")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-50">
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} قبول
                          </button>
                          <button type="button" disabled={Boolean(pendingKey)} onClick={() => void updateOrder(id, "rejected")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white disabled:opacity-50">
                            <XCircle className="h-4 w-4" /> رفض
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {!sortedOrders.length ? <p className="rounded-3xl bg-white p-8 text-center font-bold text-[#806A5E]">لا توجد طلبات حاليًا.</p> : null}
            </div>
          </section>
        ) : null}

        {activeTab === "loyalty" ? (
          <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="flex items-center gap-2 text-xl font-black"><BadgeCheck className="h-5 w-5" /> إضافة زيارة ولاء</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">امسح بطاقة العميل أو أدخل الكود لإضافة ختم واحد.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input value={cardCode} onChange={(event) => setCardCode(event.target.value.toUpperCase())} placeholder="كود بطاقة الولاء" className="min-h-12 min-w-0 rounded-2xl border border-[#E8DED5] px-4 font-bold outline-none focus:border-[#6B3A25]" />
              <button type="button" disabled={!cardCode.trim() || Boolean(pendingKey)} onClick={() => void addLoyaltyStamp()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 font-black text-white disabled:opacity-50"><BadgeCheck className="h-5 w-5" /> إضافة الزيارة</button>
            </div>
            <div className="mt-5 border-t border-[#EFE6DD] pt-5">
              <BarcodeCameraScanner label="فتح ماسح بطاقة الولاء" expectedKind="loyalty-card" onDetected={(value) => { setCardCode(value); void addLoyaltyStamp(value); }} />
            </div>
          </section>
        ) : null}

        {activeTab === "rewards" ? (
          <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="flex items-center gap-2 text-xl font-black"><Gift className="h-5 w-5" /> صرف مكافأة</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">امسح رمز المكافأة أو أدخل الكود، ثم نفّذ الصرف مرة واحدة.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input value={rewardCode} onChange={(event) => setRewardCode(event.target.value.toUpperCase())} placeholder="كود المكافأة" className="min-h-12 min-w-0 rounded-2xl border border-[#E8DED5] px-4 font-bold outline-none focus:border-[#6B3A25]" />
              <button type="button" disabled={!rewardCode.trim() || Boolean(pendingKey)} onClick={() => void redeemReward()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 font-black text-white disabled:opacity-50"><Gift className="h-5 w-5" /> صرف المكافأة</button>
            </div>
            <div className="mt-5 border-t border-[#EFE6DD] pt-5">
              <BarcodeCameraScanner label="فتح ماسح المكافأة" expectedKind="experience-reward" onDetected={(value) => { setRewardCode(value); void redeemReward(value); }} />
              <p className="mt-3 flex items-center gap-2 text-xs font-bold text-[#806A5E]"><ScanLine className="h-4 w-4" /> لن تُحمّل الكاميرا إلا داخل هذا القسم.</p>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
