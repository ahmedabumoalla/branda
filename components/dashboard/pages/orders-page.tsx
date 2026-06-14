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

const statusStyle: Record<OrderStatus, string> = {
  "بانتظار موافقة الكوفي": "bg-amber-50 text-amber-700",
  مقبول: "bg-green-50 text-green-700",
  مرفوض: "bg-red-50 text-red-700",
  "ملغي من العميل": "bg-[#F8F4EF] text-[#7A6255]",
};

type Props = {
  initialOrders: CafeOrder[];
  configError?: string;
};

export function OrdersPageClient({ initialOrders, configError }: Props) {
  const [orders, setOrders] = useState<CafeOrder[]>(initialOrders);
  const [selected, setSelected] = useState<CafeOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function printOrderThermal(order: CafeOrder) {
    printThermalReceipt({
      title: "طلب منيو",
      cafeName: order.cafeSlug || "برندة",
      subtitle: order.status,
      lines: [
        { label: "رقم الطلب", value: order.id },
        { label: "العميل", value: order.customerName, strong: true },
        { label: "الجوال", value: order.customerPhone },
        { label: "الفرع", value: order.branchName || "غير محدد" },
        { label: "وقت الاستلام", value: order.pickupAt || "غير محدد" },
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
      { key: "id", title: "رقم الطلب" },
      { key: "customer", title: "العميل" },
      { key: "phone", title: "الجوال" },
      { key: "status", title: "الحالة" },
      { key: "total", title: "الإجمالي" },
      { key: "branch", title: "الفرع" },
      { key: "createdAt", title: "تاريخ الطلب" },
    ];
    if (format === "pdf") exportRowsToPdf("تقرير طلبات المنيو", rows, columns);
    else exportRowsToExcel("menu-orders-report", rows, columns);
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

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="طلبات الاستلام"
        subtitle="طلبات الاستلام من صفحة الكوفي — قبول أو رفض مع سبب واضح."
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
                            {order.status}
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
                  <h2 className="text-2xl font-black">لا توجد طلبات</h2>
                  <p className="mt-2 text-[#7A6255]">
                    ستظهر طلبات الاستلام هنا عند إنشائها.
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
                  <p className="mt-2 text-[#7A6255]">{selected.customerName}</p>
                  <p className="text-[#7A6255]">{selected.customerPhone}</p>
                  <p className="text-[#7A6255]">
                    {selected.customerEmail || "بدون بريد"}
                  </p>
                </SoftCard>

                <SoftCard className="mt-5 p-4">
                  <p className="font-black">تفاصيل الاستلام</p>
                  <p className="mt-2 text-[#7A6255]">
                    الفرع: {selected.branchName || "—"}
                  </p>
                  <p className="text-[#7A6255]">
                    وقت الاستلام: {selected.pickupAt || "—"}
                  </p>
                  <p className="text-[#7A6255]">
                    الدفع: {selected.paymentStatus}
                  </p>
                  <p className="text-[#7A6255]">الحالة: {selected.status}</p>
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
                      {item.notes ? (
                        <p className="mt-2 text-xs font-bold text-[#7A6255]">
                          ملاحظات: {item.notes}
                        </p>
                      ) : null}
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

                <button
                  onClick={() => printOrderThermal(selected)}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white"
                >
                  <Printer className="h-4 w-4" /> طباعة الطلب على الطابعة
                  الحرارية
                </button>

                {selected.notes ? (
                  <div className="mt-5 rounded-2xl bg-[#FFF8EF] p-4 font-bold text-[#7A6255]">
                    ملاحظات الطلب: {selected.notes}
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
