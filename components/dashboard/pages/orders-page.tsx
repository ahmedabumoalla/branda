"use client";

import {
  Receipt,
  UserRound,
  Check,
  X,
  Clock,
  MapPin,
  Printer,
  FileSpreadsheet,
  Phone,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";
import {
  acceptPickupOrderAction,
  fetchOwnerOrdersAction,
  rejectPickupOrderAction,
} from "@/app/actions/orders";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import {
  exportRowsToExcel,
  exportRowsToPdf,
} from "@/lib/export/admin-report-export";
import { printThermalReceipt } from "@/lib/print/thermal";
import { type CafeOrder, type OrderStatus } from "@/lib/mock/orders";
import { getBusinessCopy } from "@/lib/platform/business-copy";

const statusStyle: Record<OrderStatus, string> = {
  "بانتظار موافقة الكوفي":
    "border-amber-200 bg-amber-50 text-amber-800",
  مقبول: "border-green-200 bg-green-50 text-green-700",
  مكتمل: "border-blue-200 bg-blue-50 text-blue-700",
  "غير مكتمل": "border-orange-200 bg-orange-50 text-orange-700",
  مرفوض: "border-red-200 bg-red-50 text-red-700",
  "ملغي من العميل": "border-[#E7D7C6] bg-[#F8F4EF] text-[#7A6255]",
};

const actionButtonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60";

function orderItemsCount(order: CafeOrder) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function visibleOrderItems(order: CafeOrder) {
  return order.items.slice(0, 4);
}

function hiddenItemsCount(order: CafeOrder) {
  return Math.max(0, order.items.length - visibleOrderItems(order).length);
}

type Props = {
  initialOrders: CafeOrder[];
  businessCategory?: string;
  configError?: string;
};

export function OrdersPageClient({ initialOrders, businessCategory, configError }: Props) {
  const copy = getBusinessCopy(businessCategory);
  const isEvents = copy.kind === "events";
  const ordersTitle = isEvents ? "طلبات شراء التذاكر" : "طلبات الاستلام";
  const ordersSubtitle = isEvents
    ? `طلبات شراء التذاكر من ${copy.pageNoun} — قبول أو رفض مع سبب واضح.`
    : `طلبات الاستلام من ${copy.pageNoun} — قبول أو رفض مع سبب واضح.`;
  const itemLabel = isEvents ? "تذاكر" : "منتجات";
  const itemSingular = isEvents ? "تذكرة" : "منتج";
  const pickupTimeLabel = isEvents ? "وقت الحضور" : "وقت الاستلام";
  const fulfillmentDetailsLabel = isEvents ? "تفاصيل الدخول" : "تفاصيل الاستلام";
  const acceptLabel = isEvents ? "قبول شراء التذاكر" : "قبول الطلب";
  const rejectLabel = isEvents ? "رفض شراء التذاكر" : "رفض الطلب";
  const detailsLabel = isEvents ? "تفاصيل شراء التذاكر" : "تفاصيل الطلب";
  const moreItemsLabel = isEvents ? "تذاكر أخرى" : "منتجات أخرى";
  const [orders, setOrders] = useState<CafeOrder[]>(initialOrders);
  const [selected, setSelected] = useState<CafeOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function printOrderThermal(order: CafeOrder) {
    printThermalReceipt({
      title: isEvents ? "شراء تذكرة" : "طلب منيو",
      cafeName: order.cafeSlug || "برندة",
      subtitle: order.status,
      lines: [
        { label: "رقم الطلب", value: order.id },
        { label: "العميل", value: order.customerName, strong: true },
        { label: "الجوال", value: order.customerPhone },
        { label: "الفرع", value: order.branchName || "غير محدد" },
        { label: pickupTimeLabel, value: order.pickupAt || "غير محدد" },
        { label: "الدفع", value: order.paymentStatus },
        { label: "الإجمالي", value: formatSar(order.total), strong: true },
        { label: "ملاحظات", value: order.notes || "-" },
      ],
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: formatSar(item.unitPrice),
        notes: item.notes,
      })),
      paperSize: "80mm",
    });
  }

  function exportOrders(format: "pdf" | "excel") {
    const rows = orders.map((order) => ({
      id: order.id,
      customer: order.customerName,
      phone: order.customerPhone,
      status: order.status,
      total: formatSar(order.total),
      branch: order.branchName || "-",
      createdAt: order.createdAt,
    }));
    const columns = [
      { key: "id", title: isEvents ? "رقم شراء التذاكر" : "رقم الطلب" },
      { key: "customer", title: "العميل" },
      { key: "phone", title: "الجوال" },
      { key: "status", title: "الحالة" },
      { key: "total", title: "الإجمالي" },
      { key: "branch", title: "الفرع" },
      { key: "createdAt", title: isEvents ? "تاريخ الشراء" : "تاريخ الطلب" },
    ];
    if (format === "pdf") exportRowsToPdf(isEvents ? "تقرير شراء التذاكر" : "تقرير طلبات المنيو", rows, columns);
    else exportRowsToExcel(isEvents ? "ticket-orders-report" : "menu-orders-report", rows, columns);
  }

  async function refreshOrders() {
    try {
      const next = await fetchOwnerOrdersAction();
      setOrders(next);
    } catch {
      /* keep current list */
    }
  }

  async function handleAccept(orderId: string) {
    setBusy(true);
    try {
      const result = await acceptPickupOrderAction(orderId);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      await refreshOrders();
      setSelected((prev) => (prev?.id === orderId ? result.order : prev));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(orderId: string) {
    if (!rejectReason.trim()) {
      alert("اكتب سبب الرفض");
      return;
    }
    setBusy(true);
    try {
      const result = await rejectPickupOrderAction(orderId, rejectReason);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setRejectReason("");
      setShowRejectForm(null);
      await refreshOrders();
      setSelected((prev) => (prev?.id === orderId ? result.order : prev));
    } finally {
      setBusy(false);
    }
  }

  const pendingOrders = orders.filter(
    (o) => o.status === "بانتظار موافقة الكوفي",
  ).length;
  const acceptedOrders = orders.filter((o) => o.status === "مقبول").length;
  const acceptedRevenue = orders
    .filter((o) => o.status === "مقبول")
    .reduce((sum, o) => sum + o.total, 0);
  const displayStatus = (status: OrderStatus) =>
    status === "بانتظار موافقة الكوفي"
      ? `بانتظار موافقة ${copy.casualNoun}`
      : status;

  return (
    <div dir="rtl">
      <DashboardPageShell
        title={ordersTitle}
        subtitle={ordersSubtitle}
      >
        {configError ? (
          <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            {configError}
          </SoftCard>
        ) : null}

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
          <button
            onClick={() => exportOrders("pdf")}
            className={`${actionButtonClass} bg-[#3A2117] text-white`}
          >
            <FileSpreadsheet className="h-4 w-4" /> PDF
          </button>
          <button
            onClick={() => exportOrders("excel")}
            className={`${actionButtonClass} bg-[#D9A33F] text-[#311912]`}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SoftCard className="p-4 sm:p-5">
            <StatPill label={isEvents ? "إجمالي طلبات التذاكر" : "إجمالي الطلبات"} value={orders.length} />
          </SoftCard>
          <SoftCard className="p-4 sm:p-5">
            <StatPill label="بانتظار الموافقة" value={pendingOrders} />
          </SoftCard>
          <SoftCard className="p-4 sm:p-5">
            <StatPill label={isEvents ? "تذاكر مقبولة" : "طلبات مقبولة"} value={acceptedOrders} />
          </SoftCard>
          <SoftCard className="p-4 sm:p-5">
            <StatPill
              label={isEvents ? "قيمة رسوم الدخول المقبولة" : "قيمة الطلبات المقبولة المتوقعة"}
              value={formatSar(acceptedRevenue)}
            />
          </SoftCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            {orders.length === 0 ? (
              <SoftCard className="flex min-h-64 flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF8EA] text-[#6B3A25]">
                  <Receipt className="h-8 w-8" />
                </div>
                <h2 className="mt-4 text-2xl font-black">{isEvents ? "لا توجد طلبات تذاكر" : "لا توجد طلبات"}</h2>
                <p className="mt-2 max-w-md text-sm font-bold leading-7 text-[#7A6255]">
                  {isEvents
                    ? "ستظهر طلبات شراء التذاكر هنا فور وصولها من صفحة التذاكر، مع بيانات العميل والإجراءات المطلوبة."
                    : "ستظهر طلبات الاستلام هنا فور وصولها من صفحة المنيو، مع بيانات العميل والإجراءات المطلوبة."}
                </p>
              </SoftCard>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                {orders.map((order) => {
                  const isPending = order.status === "بانتظار موافقة الكوفي";
                  const moreItems = hiddenItemsCount(order);

                  return (
                    <article
                      key={order.id}
                      className="min-w-0 rounded-[24px] border border-[#E7D7C6] bg-[#FCF8F3] p-4 shadow-[inset_2px_2px_6px_rgba(255,255,255,0.9),6px_8px_20px_rgba(49,25,18,0.06)] sm:p-5"
                    >
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                        <div className="flex min-w-0 gap-3 sm:gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF] sm:h-14 sm:w-14">
                            <Receipt className="h-6 w-6 sm:h-7 sm:w-7" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <h2 className="break-words text-xl font-black text-[#311912] sm:text-2xl">
                                {order.id}
                              </h2>
                              <span
                                className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-black leading-5 ${statusStyle[order.status]}`}
                              >
                                {displayStatus(order.status)}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm font-bold text-[#7A6255] sm:grid-cols-2 xl:grid-cols-3">
                              <span className="flex min-w-0 items-center gap-2">
                                <UserRound className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 break-words">
                                  {order.customerName || "عميل"}
                                </span>
                              </span>
                              <span
                                className="flex min-w-0 items-center gap-2"
                                dir="ltr"
                              >
                                <Phone className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 break-all">
                                  {order.customerPhone || "بدون رقم"}
                                </span>
                              </span>
                              <span className="min-w-0 break-words">
                                {order.type} • {order.createdAt}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-[#FFF8EA] px-4 py-3 text-right lg:text-left">
                          <p className="text-xs font-black text-[#7A6255]">
                            الإجمالي
                          </p>
                          <p className="mt-1 text-2xl font-black text-[#6B3A25]">
                            {formatSar(order.total)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-2xl bg-[#F8F4EF] p-4">
                          <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                            <Clock className="h-4 w-4" />
                            {pickupTimeLabel}
                          </p>
                          <p className="mt-1 break-words font-black">
                            {order.pickupAt || "غير محدد"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#F8F4EF] p-4">
                          <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                            <MapPin className="h-4 w-4" />
                            الفرع
                          </p>
                          <p className="mt-1 break-words font-black">
                            {order.branchName || "غير محدد"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#F8F4EF] p-4">
                          <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                            <ShoppingBag className="h-4 w-4" />
                            {itemLabel}
                          </p>
                          <p className="mt-1 font-black">
                            {orderItemsCount(order)} {itemSingular}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#F8F4EF] p-4">
                          <p className="text-xs font-black text-[#7A6255]">
                            الدفع
                          </p>
                          <p className="mt-1 break-words font-black">
                            {order.paymentStatus}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-[#E7D7C6] bg-white/60 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-black text-[#311912]">
                            {itemLabel} والمجموع
                          </p>
                          <p className="font-black text-[#6B3A25]">
                            {formatSar(order.total)}
                          </p>
                        </div>
                        <div className="mt-3 grid max-h-36 gap-2 overflow-auto pr-1">
                          {visibleOrderItems(order).map((item) => (
                            <div
                              key={item.id}
                              className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-[#F8F4EF] px-3 py-2 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="break-words font-black">
                                  {item.name}
                                </p>
                                {item.notes ? (
                                  <p className="mt-1 break-words text-xs font-bold text-[#7A6255]">
                                    {item.notes}
                                  </p>
                                ) : null}
                              </div>
                              <span className="shrink-0 font-black text-[#6B3A25]">
                                {item.quantity}x
                              </span>
                            </div>
                          ))}
                          {moreItems ? (
                            <p className="rounded-xl bg-[#FFF8EA] px-3 py-2 text-sm font-black text-[#6B3A25]">
                              + {moreItems} {moreItemsLabel}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {isPending ? (
                        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            onClick={() => void handleAccept(order.id)}
                            disabled={busy}
                            className={`${actionButtonClass} bg-green-50 text-green-700`}
                          >
                            <Check className="h-4 w-4" />
                            {acceptLabel}
                          </button>
                          <button
                            onClick={() =>
                              setShowRejectForm((prev) =>
                                prev === order.id ? null : order.id,
                              )
                            }
                            disabled={busy}
                            className={`${actionButtonClass} bg-red-50 text-red-700`}
                          >
                            <X className="h-4 w-4" />
                            {rejectLabel}
                          </button>
                        </div>
                      ) : null}

                      {showRejectForm === order.id ? (
                        <div className="mt-4 rounded-2xl bg-red-50/70 p-4">
                          <label className="block">
                            <span className="text-xs font-black text-[#7A6255]">
                              سبب الرفض
                            </span>
                            <textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              rows={2}
                              placeholder={isEvents ? "مثال: التذاكر غير متوفرة حاليًا" : "مثال: المنتج غير متوفر حاليًا"}
                              className="mt-2 w-full resize-none rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold outline-none"
                            />
                          </label>
                          <button
                            onClick={() => void handleReject(order.id)}
                            disabled={busy}
                            className={`${actionButtonClass} mt-3 w-full bg-red-600 text-white sm:w-auto`}
                          >
                            تأكيد الرفض
                          </button>
                        </div>
                      ) : null}

                      {order.rejectionReason ? (
                        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold leading-7 text-red-700">
                          سبب الرفض: {order.rejectionReason}
                        </div>
                      ) : null}

                      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          onClick={() => printOrderThermal(order)}
                          className={`${actionButtonClass} bg-[#FFF8EA] text-[#6B3A25]`}
                        >
                          <Printer className="h-4 w-4" /> طباعة حرارية
                        </button>
                        <button
                          onClick={() => setSelected(order)}
                          className={`${actionButtonClass} bg-[#F8F4EF] text-[#3A2117]`}
                        >
                          {detailsLabel}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[24px] border border-[#E7D7C6] bg-[#FCF8F3] p-4 shadow-[inset_2px_2px_6px_rgba(255,255,255,0.9),6px_8px_20px_rgba(49,25,18,0.06)] sm:p-5">
              {selected ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between xl:flex-col">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[#7A6255]">
                        {detailsLabel}
                      </p>
                      <h2 className="mt-1 break-words text-2xl font-black text-[#3A2117]">
                        {selected.id}
                      </h2>
                    </div>
                    <span
                      className={`inline-flex w-fit max-w-full rounded-full border px-3 py-1 text-xs font-black leading-5 ${statusStyle[selected.status]}`}
                    >
                      {selected.status}
                    </span>
                  </div>

                  <div className="mt-5 rounded-2xl bg-[#F8F4EF] p-4">
                    <p className="flex items-center gap-2 font-black text-[#311912]">
                      <UserRound className="h-5 w-5" />
                      بيانات العميل
                    </p>
                    <div className="mt-3 grid gap-2 text-sm font-bold text-[#7A6255]">
                      <p className="break-words">{selected.customerName}</p>
                      <p className="break-all" dir="ltr">
                        {selected.customerPhone}
                      </p>
                      <p className="break-words">
                        {selected.customerEmail || "بدون بريد"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="font-black text-[#311912]">
                        {fulfillmentDetailsLabel}
                      </p>
                      <p className="mt-2 break-words text-sm font-bold text-[#7A6255]">
                        الفرع: {selected.branchName || "—"}
                      </p>
                      <p className="break-words text-sm font-bold text-[#7A6255]">
                        {pickupTimeLabel}: {selected.pickupAt || "—"}
                      </p>
                      <p className="break-words text-sm font-bold text-[#7A6255]">
                        الدفع: {selected.paymentStatus}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#FFF8EA] p-4">
                      <p className="text-xs font-black text-[#7A6255]">
                        الإجمالي
                      </p>
                      <p className="mt-2 text-2xl font-black text-[#6B3A25]">
                        {formatSar(selected.total)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[#7A6255]">
                        {orderItemsCount(selected)} {itemSingular}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 max-h-[340px] space-y-3 overflow-auto pr-1">
                    {selected.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-[#F8F4EF] p-4"
                      >
                        <div className="flex min-w-0 justify-between gap-3">
                          <h3 className="min-w-0 break-words font-black">
                            {item.name}
                          </h3>
                          <span className="shrink-0 font-black">
                            {item.quantity}x
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#7A6255]">
                          {formatSar(item.unitPrice)}
                        </p>
                        {item.notes ? (
                          <p className="mt-2 break-words text-xs font-bold text-[#7A6255]">
                            ملاحظات: {item.notes}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl bg-[#F8F4EF] p-4 text-sm font-bold text-[#7A6255]">
                    <p>المجموع: {formatSar(selected.subtotal)}</p>
                    <p>الخصم: {formatSar(selected.discountAmount)}</p>
                    <p>الضريبة: {formatSar(selected.taxAmount)}</p>
                    <p className="mt-2 text-xl font-black text-[#6B3A25]">
                      الإجمالي: {formatSar(selected.total)}
                    </p>
                  </div>

                  <button
                    onClick={() => printOrderThermal(selected)}
                    className={`${actionButtonClass} mt-5 w-full bg-[#3A2117] text-white`}
                  >
                    <Printer className="h-4 w-4" /> {isEvents ? "طباعة شراء التذاكر على الطابعة" : "طباعة الطلب على الطابعة"}
                    الحرارية
                  </button>

                  {selected.notes ? (
                    <div className="mt-5 rounded-2xl bg-[#FFF8EF] p-4 font-bold leading-7 text-[#7A6255]">
                      {isEvents ? "ملاحظات شراء التذاكر" : "ملاحظات الطلب"}: {selected.notes}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F8F4EF] text-[#6B3A25]">
                    <Receipt className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 text-xl font-black">{isEvents ? "اختر عملية شراء" : "اختر طلبًا"}</h2>
                  <p className="mt-2 max-w-xs text-sm font-bold leading-7 text-[#7A6255]">
                    {isEvents ? "اضغط تفاصيل شراء التذاكر لعرض كامل البيانات." : "اضغط تفاصيل الطلب لعرض كامل البيانات."}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </DashboardPageShell>
    </div>
  );

  return (
    <div dir="rtl">
      <DashboardPageShell
        title={ordersTitle}
        subtitle={ordersSubtitle}
      >
        {configError ? (
          <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            {configError}
          </SoftCard>
        ) : null}
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={() => exportOrders("pdf")}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white"
          >
            <FileSpreadsheet className="h-4 w-4" /> PDF
          </button>
          <button
            onClick={() => exportOrders("excel")}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#D9A33F] px-5 py-3 font-black text-[#311912]"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        </div>
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي الطلبات" value={orders.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="بانتظار الموافقة" value={pendingOrders} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="طلبات مقبولة" value={acceptedOrders} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill
              label="قيمة الطلبات المقبولة المتوقعة"
              value={formatSar(acceptedRevenue)}
            />
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
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-black">{order.id}</h2>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${statusStyle[order.status]}`}
                          >
                            {displayStatus(order.status)}
                          </span>
                        </div>
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

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                        <MapPin className="h-4 w-4" />
                        الفرع
                      </p>
                      <p className="mt-1 font-black">
                        {order.branchName || "غير محدد"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                        <Clock className="h-4 w-4" />
                        وقت الاستلام
                      </p>
                      <p className="mt-1 font-black">
                        {order.pickupAt || "غير محدد"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="text-xs font-black text-[#7A6255]">الدفع</p>
                      <p className="mt-1 font-black">{order.paymentStatus}</p>
                    </div>
                  </div>

                  {order.status === "بانتظار موافقة الكوفي" ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        onClick={() => void handleAccept(order.id)}
                        disabled={busy}
                        className="flex items-center gap-2 rounded-2xl bg-green-50 px-5 py-3 text-sm font-black text-green-700"
                      >
                        <Check className="h-4 w-4" />
                        قبول الطلب
                      </button>
                      <button
                        onClick={() =>
                          setShowRejectForm((prev) =>
                            prev === order.id ? null : order.id,
                          )
                        }
                        className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                      >
                        <X className="h-4 w-4" />
                        رفض الطلب
                      </button>
                    </div>
                  ) : null}

                  {showRejectForm === order.id ? (
                    <div className="mt-4 rounded-2xl bg-red-50/50 p-4">
                      <label className="block">
                        <span className="text-xs font-black text-[#7A6255]">
                          سبب الرفض
                        </span>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={2}
                          placeholder="مثال: المنتج غير متوفر حاليًا"
                          className="mt-2 w-full resize-none rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold outline-none"
                        />
                      </label>
                      <button
                        onClick={() => void handleReject(order.id)}
                        disabled={busy}
                        className="mt-3 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white"
                      >
                        تأكيد الرفض
                      </button>
                    </div>
                  ) : null}

                  {order.rejectionReason ? (
                    <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                      سبب الرفض: {order.rejectionReason}
                    </div>
                  ) : null}

                  <div className="mt-5">
                    <button
                      onClick={() => printOrderThermal(order)}
                      className="rounded-2xl bg-[#FFF8EA] px-5 py-2 font-black text-[#6B3A25]"
                    >
                      <Printer className="inline h-4 w-4" /> طباعة حرارية
                    </button>
                    <button
                      onClick={() => setSelected(order)}
                      className="rounded-2xl bg-[#F8F4EF] px-5 py-2 font-black text-[#3A2117]"
                    >
                      تفاصيل الطلب
                    </button>
                  </div>
                </SoftCard>
              ))}

              {orders.length === 0 ? (
                <SoftCard className="text-center">
                  <h2 className="text-2xl font-black">{isEvents ? "لا توجد طلبات تذاكر" : "لا توجد طلبات"}</h2>
                  <p className="mt-2 text-[#7A6255]">
                    {isEvents ? "ستظهر طلبات شراء التذاكر هنا عند إنشائها." : "ستظهر طلبات الاستلام هنا عند إنشائها."}
                  </p>
                </SoftCard>
              ) : null}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="row2">
            {selected ? (
              <>
                <h2 className="text-2xl font-black text-[#3A2117]">
                  تفاصيل الطلب
                </h2>

                <SoftCard className="mt-5 p-4">
                  <p className="flex items-center gap-2 font-black">
                    <UserRound className="h-5 w-5" />
                    بيانات العميل
                  </p>
                  <p className="mt-2 text-[#7A6255]">{selected!.customerName}</p>
                  <p className="text-[#7A6255]">{selected!.customerPhone}</p>
                  <p className="text-[#7A6255]">
                    {selected!.customerEmail || "بدون بريد"}
                  </p>
                </SoftCard>

                <SoftCard className="mt-5 p-4">
                  <p className="font-black">تفاصيل الاستلام</p>
                  <p className="mt-2 text-[#7A6255]">
                    الفرع: {selected!.branchName || "—"}
                  </p>
                  <p className="text-[#7A6255]">
                    وقت الاستلام: {selected!.pickupAt || "—"}
                  </p>
                  <p className="text-[#7A6255]">
                    الدفع: {selected!.paymentStatus}
                  </p>
                  <p className="text-[#7A6255]">الحالة: {selected!.status}</p>
                </SoftCard>

                <div className="mt-5 space-y-3">
                  {selected!.items.map((item) => (
                    <SoftCard key={item.id} className="p-4">
                      <div className="flex justify-between gap-3">
                        <h3 className="font-black">{item.name}</h3>
                        <span className="font-black">{item.quantity}x</span>
                      </div>
                      <p className="mt-1 text-sm text-[#7A6255]">
                        {formatSar(item.unitPrice)}
                      </p>
                      {item.notes ? (
                        <p className="mt-2 text-xs font-bold text-[#7A6255]">
                          ملاحظات: {item.notes}
                        </p>
                      ) : null}
                    </SoftCard>
                  ))}
                </div>

                <SoftCard className="mt-5 p-4">
                  <p>المجموع: {formatSar(selected!.subtotal)}</p>
                  <p>الخصم: {formatSar(selected!.discountAmount)}</p>
                  <p>الضريبة: {formatSar(selected!.taxAmount)}</p>
                  <p className="mt-2 text-xl font-black text-[#6B3A25]">
                    الإجمالي: {formatSar(selected!.total)}
                  </p>
                </SoftCard>

                <button
                  onClick={() => printOrderThermal(selected!)}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white"
                >
                  <Printer className="h-4 w-4" /> طباعة الطلب على الطابعة
                  الحرارية
                </button>

                {selected!.notes ? (
                  <div className="mt-5 rounded-2xl bg-[#FFF8EF] p-4 font-bold text-[#7A6255]">
                    ملاحظات الطلب: {selected!.notes}
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
