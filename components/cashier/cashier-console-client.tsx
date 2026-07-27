"use client";

import dynamic from "next/dynamic";
import {
  BadgeCheck,
  CheckCircle2,
  Gift,
  Loader2,
  LogOut,
  RefreshCw,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  cashierRedeemExperienceRewardAction,
  cashierScanLoyaltyAction,
  fetchCashierConsoleAction,
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
type OrderFilter = "new" | "accepted" | "completed" | "all";

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

function rows(row: Row, ...keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(row[key])) return row[key] as Row[];
  }
  return [];
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
    accepted: "قيد التنفيذ",
    approved: "قيد التنفيذ",
    rejected: "مرفوض",
    completed: "مكتمل",
    not_completed: "غير مكتمل",
  };
  return labels[status] ?? status;
}

function matchesFilter(status: string, filter: OrderFilter) {
  if (filter === "new") return ["pending", "pending_cafe"].includes(status);
  if (filter === "accepted") return ["accepted", "approved"].includes(status);
  if (filter === "completed") return ["completed", "not_completed"].includes(status);
  return true;
}

export function CashierConsoleClient({ initialData }: { initialData: CashierConsole }) {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [filter, setFilter] = useState<OrderFilter>("new");
  const [orders, setOrders] = useState<Row[]>(initialData.operationOrders ?? initialData.orders);
  const [cardCode, setCardCode] = useState("");
  const [rewardCode, setRewardCode] = useState("");
  const [pendingOrders, setPendingOrders] = useState<Set<string>>(new Set());
  const [operationPending, setOperationPending] = useState("");
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

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
  const visibleOrders = sortedOrders.filter((order) =>
    matchesFilter(text(order, "status"), filter),
  );
  const today = new Date().toDateString();
  const metrics = {
    new: orders.filter((order) => ["pending", "pending_cafe"].includes(text(order, "status"))).length,
    accepted: orders.filter((order) => ["accepted", "approved"].includes(text(order, "status"))).length,
    completed: orders.filter(
      (order) =>
        text(order, "status") === "completed" &&
        new Date(text(order, "updated_at", "updatedAt", "created_at", "createdAt")).toDateString() === today,
    ).length,
  };

  async function refreshOrders() {
    if (refreshing) return;
    setRefreshing(true);
    setMessage("");
    try {
      const data = await fetchCashierConsoleAction();
      if (!data) {
        window.location.assign("/cashier/session/clear?reason=invalid");
        return;
      }
      setOrders(data.operationOrders ?? data.orders);
      setLastUpdated(new Date());
    } catch {
      setMessage("تعذر تحديث الطلبات الآن");
    } finally {
      setRefreshing(false);
    }
  }

  async function updateOrder(
    id: string,
    status: "accepted" | "rejected" | "completed" | "not_completed",
  ) {
    if (pendingOrders.has(id)) return;
    setPendingOrders((current) => new Set(current).add(id));
    setOrderErrors((current) => ({ ...current, [id]: "" }));
    try {
      await updateCashierOrderStatusAction(
        id,
        status,
        status === "rejected"
          ? "تم رفض الطلب من نقطة التشغيل"
          : status === "not_completed"
            ? "تعذر إكمال الطلب من نقطة التشغيل"
            : undefined,
      );
      setOrders((current) =>
        current.map((order) => (text(order, "id") === id ? { ...order, status } : order)),
      );
    } catch {
      setOrderErrors((current) => ({
        ...current,
        [id]: "تعذر تحديث الطلب؛ ربما عولج من جهاز آخر",
      }));
    } finally {
      setPendingOrders((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function addLoyaltyStamp(detectedCode?: string) {
    const rawCode = detectedCode ?? cardCode;
    const normalized =
      parseBarndaksaQrPayload(rawCode, "loyalty-card") ?? rawCode.trim().toUpperCase();
    if (!normalized || operationPending) return;
    setOperationPending("loyalty");
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
      setOperationPending("");
    }
  }

  async function redeemReward(detectedCode?: string) {
    const rawCode = detectedCode ?? rewardCode;
    const normalized =
      parseBarndaksaQrPayload(rawCode, "experience-reward") ?? rawCode.trim().toUpperCase();
    if (!normalized || operationPending) return;
    setOperationPending("reward");
    setMessage("");
    try {
      const result = await cashierRedeemExperienceRewardAction(normalized);
      const redeemedName = "rewardName" in result ? String(result.rewardName) : "المكافأة";
      setRewardCode("");
      setMessage(`تم صرف ${redeemedName} للعميل ${String(result.customerName ?? "")}`);
    } catch {
      setMessage("تعذر صرف المكافأة. تحقق من الكود وحالته والعلامة التابعة له");
    } finally {
      setOperationPending("");
    }
  }

  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#F8F4EF] text-[#311912]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#311912] px-3 py-3 text-white shadow-lg sm:px-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{initialData.cafe.name}</p>
            <p className="truncate text-xs font-bold text-white/65">
              {initialData.cashier.fullName} · آخر تحديث {formatTime(lastUpdated.toISOString())}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={refreshing} onClick={() => void refreshOrders()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-black disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> تحديث
            </button>
            <button type="button" onClick={() => void logoutCashierAction()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-black text-[#311912]">
              <LogOut className="h-4 w-4" /> خروج
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-3 sm:p-5">
        <nav className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 shadow-sm" aria-label="أقسام نقطة التشغيل">
          {([
            ["orders", "الطلبات", ShoppingBag],
            ["loyalty", "الولاء", BadgeCheck],
            ["rewards", "المكافآت", Gift],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => { setActiveTab(id); setMessage(""); }} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-black ${activeTab === id ? "bg-[#6B3A25] text-white" : "text-[#806A5E] hover:bg-[#F8F4EF]"}`}>
              <Icon className="h-4 w-4" /><span>{label}</span>
            </button>
          ))}
        </nav>

        {message ? <p aria-live="polite" className="mb-4 rounded-2xl border border-[#E8DED5] bg-white p-4 text-sm font-black shadow-sm">{message}</p> : null}

        {activeTab === "orders" ? (
          <section>
            <div className="grid grid-cols-3 gap-2">
              {[["جديدة", metrics.new], ["قيد التنفيذ", metrics.accepted], ["مكتملة اليوم", metrics.completed]].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl bg-white p-3 text-center shadow-sm sm:p-4">
                  <p className="text-xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold text-[#806A5E] sm:text-xs">{label}</p>
                </div>
              ))}
            </div>
            <div className="my-4 flex gap-2 overflow-x-auto pb-1">
              {([
                ["new", "الجديدة"],
                ["accepted", "المقبولة"],
                ["completed", "المكتملة"],
                ["all", "الكل"],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} className={`min-h-10 shrink-0 rounded-xl px-4 text-xs font-black ${filter === id ? "bg-[#311912] text-white" : "bg-white text-[#806A5E]"}`}>{label}</button>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleOrders.map((order) => {
                const id = text(order, "id", "order_id", "orderId");
                const status = text(order, "status") || "pending";
                const isNew = ["pending", "pending_cafe"].includes(status);
                const isAccepted = ["accepted", "approved"].includes(status);
                const isBusy = pendingOrders.has(id);
                const items = rows(order, "items", "order_items");
                return (
                  <article key={id} className={`min-w-0 rounded-3xl bg-white p-5 shadow-sm ${isNew ? "ring-2 ring-amber-300" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words font-black">{text(order, "customer_name", "customerName") || "عميل"}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${isNew ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}>{statusLabel(status)}</span>
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#806A5E]">#{id.slice(0, 8).toUpperCase()} · {formatTime(text(order, "created_at", "createdAt"))}</p>
                      </div>
                      <p className="shrink-0 text-lg font-black">{number(order, "total", "total_amount", "totalAmount").toLocaleString("ar-SA")} ر.س</p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#806A5E]">
                      {text(order, "delivery_method", "deliveryMethod", "fulfillment_type") ? <span className="rounded-lg bg-[#F8F4EF] px-2 py-1">الاستلام: {text(order, "delivery_method", "deliveryMethod", "fulfillment_type")}</span> : null}
                      {text(order, "payment_method", "paymentMethod") ? <span className="rounded-lg bg-[#F8F4EF] px-2 py-1">الدفع: {text(order, "payment_method", "paymentMethod")}</span> : null}
                    </div>

                    <div className="mt-4 space-y-2 border-y border-[#EFE6DD] py-4">
                      {items.map((item, index) => (
                        <div key={text(item, "id") || `${id}-${index}`} className="rounded-xl bg-[#FCFAF7] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 break-words text-sm font-black">{number(item, "quantity", "qty") || 1} × {text(item, "name") || "منتج"}</p>
                            <p className="shrink-0 text-xs font-black">{number(item, "total") || number(item, "unit_price", "unitPrice")} ر.س</p>
                          </div>
                          {text(item, "notes") ? <p className="mt-2 break-words rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-900">ملاحظة: {text(item, "notes")}</p> : null}
                        </div>
                      ))}
                      {!items.length ? <p className="text-xs font-bold text-[#806A5E]">لا توجد عناصر مسجلة لهذا الطلب.</p> : null}
                    </div>

                    {orderErrors[id] ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-black text-red-700">{orderErrors[id]}</p> : null}
                    {isNew ? (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button type="button" disabled={isBusy} onClick={() => void updateOrder(id, "accepted")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-50">{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} قبول</button>
                        <button type="button" disabled={isBusy} onClick={() => void updateOrder(id, "rejected")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white disabled:opacity-50"><XCircle className="h-4 w-4" /> رفض</button>
                      </div>
                    ) : null}
                    {isAccepted ? (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button type="button" disabled={isBusy} onClick={() => void updateOrder(id, "completed")} className="min-h-11 rounded-xl bg-emerald-700 px-3 text-xs font-black text-white disabled:opacity-50">مكتمل</button>
                        <button type="button" disabled={isBusy} onClick={() => void updateOrder(id, "not_completed")} className="min-h-11 rounded-xl bg-stone-700 px-3 text-xs font-black text-white disabled:opacity-50">غير مكتمل</button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            {!visibleOrders.length ? (
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
                <p className="font-black">لا توجد طلبات في هذا القسم</p>
                <button type="button" disabled={refreshing} onClick={() => void refreshOrders()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#6B3A25] px-4 text-sm font-black text-white"><RefreshCw className="h-4 w-4" /> تحديث</button>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "loyalty" ? (
          <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="flex items-center gap-2 text-xl font-black"><BadgeCheck className="h-5 w-5" /> إضافة زيارة ولاء</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">امسح بطاقة العميل أو أدخل الكود لإضافة ختم واحد.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input value={cardCode} onChange={(event) => setCardCode(event.target.value.toUpperCase())} placeholder="كود بطاقة الولاء" className="min-h-12 min-w-0 rounded-2xl border border-[#E8DED5] px-4 font-bold outline-none focus:border-[#6B3A25]" />
              <button type="button" disabled={!cardCode.trim() || Boolean(operationPending)} onClick={() => void addLoyaltyStamp()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 font-black text-white disabled:opacity-50"><BadgeCheck className="h-5 w-5" /> إضافة الزيارة</button>
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
              <button type="button" disabled={!rewardCode.trim() || Boolean(operationPending)} onClick={() => void redeemReward()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 font-black text-white disabled:opacity-50"><Gift className="h-5 w-5" /> صرف المكافأة</button>
            </div>
            <div className="mt-5 border-t border-[#EFE6DD] pt-5">
              <BarcodeCameraScanner label="فتح ماسح المكافأة" expectedKind="experience-reward" onDetected={(value) => { setRewardCode(value); void redeemReward(value); }} />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
