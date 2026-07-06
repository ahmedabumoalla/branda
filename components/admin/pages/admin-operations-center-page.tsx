"use client";

import {
  CalendarCheck,
  Download,
  Eye,
  Gift,
  LogIn,
  Search,
  ScanLine,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AdminFilterBar,
  AdminInput,
  AdminPageShell,
  AdminSelect,
  AdminStatPill,
  BentoCard,
  StatusBadge,
} from "@/components/ui/design-system";
import { exportOperationsCenterReportToPdf } from "@/lib/export/admin-report-export";
import type {
  AdminOperationsCenterBrand,
  AdminOperationsCenterData,
  OperationsMetricKey,
  OperationsMetricSummary,
} from "@/lib/data/admin-operations-center";

type Props = {
  data: AdminOperationsCenterData;
  configError?: string;
};

const metricIcons: Record<OperationsMetricKey, typeof Eye> = {
  visits: Eye,
  appInstallClicks: Download,
  brandLogins: LogIn,
  cashierLogins: LogIn,
  loyaltyScans: ScanLine,
  rewardRedemptions: Gift,
  orders: ShoppingBag,
  reservations: CalendarCheck,
};

function formatDateTime(value: string) {
  if (!value) return "لا يوجد وقت مسجل";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sourceText(metric: OperationsMetricSummary) {
  if (metric.status === "missing" || metric.status === "empty") return "لم تسجل عمليات بعد";
  return metric.source;
}

function metricStateText(metric: OperationsMetricSummary) {
  if (metric.status === "missing" || metric.status === "empty") return "لم تسجل عمليات بعد";
  return "بيانات مسجلة";
}

function statusTone(status: string) {
  if (status.includes("مقبول")) return "success" as const;
  if (status.includes("مرفوض")) return "danger" as const;
  if (status.includes("انتظار") || status.includes("تعديل")) return "warning" as const;
  return "neutral" as const;
}

const adminActionButtonClass =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-black text-[#F8F4EF] transition hover:bg-white/10";

const adminGoldButtonClass =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D9A33F] px-4 text-sm font-black text-[#211711] transition hover:bg-[#fbcf72]";

function filterPeriodText(from: string, to: string) {
  if (from && to) return `${from} - ${to}`;
  if (from) return `من ${from}`;
  if (to) return `حتى ${to}`;
  return "كل الفترات";
}

function EmptyState({ message = "لم تسجل عمليات بعد" }: { message?: string }) {
  return (
    <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-5 text-sm font-bold text-[#CBB29C]">
      {message}
    </div>
  );
}

function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-full overflow-hidden rounded-[16px] border border-white/10">
      <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[640px] table-auto text-right text-sm sm:min-w-[760px]">{children}</table>
      </div>
    </div>
  );
}

function Head({ labels }: { labels: string[] }) {
  return (
    <thead className="bg-white/[0.04] text-xs font-black text-[#D9A33F]">
      <tr>
        {labels.map((label) => (
          <th key={label} className="whitespace-nowrap px-4 py-3">
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="max-w-[280px] break-words px-4 py-3 align-top font-bold text-[#F8F4EF]">{children}</td>;
}

function SourceDataBlock({ metric }: { metric: OperationsMetricSummary }) {
  return (
    <details className="mb-4 rounded-[14px] border border-white/10 bg-white/[0.035] p-3 text-sm text-[#CBB29C]">
      <summary className="cursor-pointer select-none font-black text-[#D9A33F]">مصدر البيانات</summary>
      <div className="mt-3 space-y-2 font-bold leading-6">
        <p className="break-words">{sourceText(metric)}</p>
        {metric.note ? <p className="break-words text-[#9E8574]">{metric.note}</p> : null}
      </div>
    </details>
  );
}

function DetailRows({
  brand,
  metric,
}: {
  brand: AdminOperationsCenterBrand;
  metric: OperationsMetricSummary;
}) {
  if (metric.status === "missing") {
    return <EmptyState />;
  }

  if (metric.key === "visits") {
    if (!brand.details.visits.length) return <EmptyState />;
    return (
      <TableFrame>
        <Head labels={["المسار", "الجلسة", "المدة", "الوقت والتاريخ"]} />
        <tbody className="divide-y divide-white/10">
          {brand.details.visits.map((row) => (
            <tr key={row.id}>
              <Cell>{row.path}</Cell>
              <Cell>{row.sessionId}</Cell>
              <Cell>{row.durationSeconds === null ? "غير مسجلة" : `${row.durationSeconds} ثانية`}</Cell>
              <Cell>{formatDateTime(row.createdAt)}</Cell>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  if (metric.key === "appInstallClicks") {
    if (!brand.details.appInstallClicks.length) return <EmptyState />;
    return (
      <TableFrame>
        <Head labels={["المسار", "الوقت والتاريخ"]} />
        <tbody className="divide-y divide-white/10">
          {brand.details.appInstallClicks.map((row) => (
            <tr key={row.id}>
              <Cell>{row.path}</Cell>
              <Cell>{formatDateTime(row.createdAt)}</Cell>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  if (metric.key === "brandLogins") {
    if (!brand.details.brandLogins.length) return <EmptyState />;
    return (
      <TableFrame>
        <Head labels={["المستخدم", "الإيميل", "الوقت والتاريخ"]} />
        <tbody className="divide-y divide-white/10">
          {brand.details.brandLogins.map((row) => (
            <tr key={row.id}>
              <Cell>{row.actorName}</Cell>
              <Cell>{row.actorEmail || "غير مسجل"}</Cell>
              <Cell>{formatDateTime(row.createdAt)}</Cell>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  if (metric.key === "cashierLogins") {
    if (!brand.details.cashierLogins.length) return <EmptyState />;
    return (
      <TableFrame>
        <Head labels={["اسم الكاشير", "الإيميل", "الوقت والتاريخ"]} />
        <tbody className="divide-y divide-white/10">
          {brand.details.cashierLogins.map((row) => (
            <tr key={row.id}>
              <Cell>{row.cashierName}</Cell>
              <Cell>{row.cashierEmail || "غير مسجل"}</Cell>
              <Cell>{formatDateTime(row.createdAt)}</Cell>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  if (metric.key === "loyaltyScans") {
    if (!brand.details.loyaltyScans.length) return <EmptyState />;
    return (
      <TableFrame>
        <Head labels={["العميل", "كود البطاقة", "العملية", "الكاشير", "الفاتورة", "المبلغ", "الوقت والتاريخ"]} />
        <tbody className="divide-y divide-white/10">
          {brand.details.loyaltyScans.map((row) => (
            <tr key={row.id}>
              <Cell>{row.customerName}</Cell>
              <Cell>{row.cardCode || "غير مسجل"}</Cell>
              <Cell>{row.eventType}</Cell>
              <Cell>{row.cashierName}{row.cashierEmail ? ` - ${row.cashierEmail}` : ""}</Cell>
              <Cell>{row.invoiceBarcode || "غير مسجلة"}</Cell>
              <Cell>{row.invoiceAmount}</Cell>
              <Cell>{formatDateTime(row.createdAt)}</Cell>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  if (metric.key === "rewardRedemptions") {
    if (!brand.details.rewardRedemptions.length) return <EmptyState />;
    return (
      <TableFrame>
        <Head labels={["المكافأة", "النوع", "العميل", "الكاشير", "الكود", "الوقت والتاريخ"]} />
        <tbody className="divide-y divide-white/10">
          {brand.details.rewardRedemptions.map((row) => (
            <tr key={row.id}>
              <Cell>{row.rewardTitle}</Cell>
              <Cell>{row.rewardSource || "غير مسجل"}</Cell>
              <Cell>{row.customerName}{row.customerEmail ? ` - ${row.customerEmail}` : ""}</Cell>
              <Cell>{row.cashierName}{row.cashierEmail ? ` - ${row.cashierEmail}` : ""}</Cell>
              <Cell>{row.scannedCode}</Cell>
              <Cell>{formatDateTime(row.createdAt)}</Cell>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  if (metric.key === "orders") {
    if (!brand.details.orders.length) return <EmptyState />;
    return (
      <TableFrame>
        <Head labels={["رقم الطلب", "العميل", "الحالة", "من اتخذ الإجراء", "المنتجات", "منتجات الطلب المرفوض", "سبب الرفض", "الإجمالي", "الوقت"]} />
        <tbody className="divide-y divide-white/10">
          {brand.details.orders.map((row) => (
            <tr key={row.id}>
              <Cell>{row.id.slice(0, 8).toUpperCase()}</Cell>
              <Cell>{row.customerName}</Cell>
              <Cell><StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge></Cell>
              <Cell>{row.actorType} - {row.actorName}{row.actorEmail ? ` - ${row.actorEmail}` : ""}</Cell>
              <Cell>{row.products.length ? row.products.join("، ") : "لا توجد منتجات مسجلة"}</Cell>
              <Cell>{row.status === "مرفوض" ? (row.products.length ? row.products.join("، ") : "لا توجد منتجات مسجلة") : "لا ينطبق"}</Cell>
              <Cell>{row.rejectionReason || "لا يوجد"}</Cell>
              <Cell>{row.total}</Cell>
              <Cell>{formatDateTime(row.respondedAt || row.createdAt)}</Cell>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  if (!brand.details.reservations.length) return <EmptyState />;
  return (
    <TableFrame>
      <Head labels={["رقم الحجز", "العميل", "الحالة", "من اتخذ الإجراء", "التفاصيل", "الموعد", "الضيوف", "سبب الرفض", "الوقت"]} />
      <tbody className="divide-y divide-white/10">
        {brand.details.reservations.map((row) => (
          <tr key={row.id}>
            <Cell>{row.id.slice(0, 8).toUpperCase()}</Cell>
            <Cell>{row.customerName}{row.phone ? ` - ${row.phone}` : ""}</Cell>
            <Cell><StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge></Cell>
            <Cell>{row.actorType} - {row.actorName}{row.actorEmail ? ` - ${row.actorEmail}` : ""}</Cell>
            <Cell>{[row.eventType, row.branchName, row.details].filter(Boolean).join("، ") || "لا توجد تفاصيل إضافية"}</Cell>
            <Cell>{[row.date, row.time].filter(Boolean).join(" ") || "غير مسجل"}</Cell>
            <Cell>{row.guests}</Cell>
            <Cell>{row.rejectionReason || "لا يوجد"}</Cell>
            <Cell>{formatDateTime(row.createdAt)}</Cell>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

function BrandModal({
  brand,
  filters,
  onExportBrand,
  onClose,
}: {
  brand: AdminOperationsCenterBrand;
  filters: AdminOperationsCenterData["activeFilters"];
  onExportBrand: (brand: AdminOperationsCenterBrand) => void;
  onClose: () => void;
}) {
  const [selectedMetric, setSelectedMetric] = useState<OperationsMetricSummary | null>(null);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100vw-1rem)] min-w-0 flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#0f0c0a] shadow-[0_24px_90px_rgba(0,0,0,0.6)] sm:max-h-[92dvh] lg:max-w-6xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="min-w-0">
            <p className="text-xs font-black text-[#D9A33F]">مركز العمليات</p>
            <h2 className="mt-1 break-words text-xl font-black text-[#F8F4EF] sm:text-2xl">{brand.name}</h2>
            <p className="mt-1 break-words text-xs font-bold text-[#CBB29C]">{brand.publicUrl} - {filterPeriodText(filters.from, filters.to)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => onExportBrand(brand)} className={adminGoldButtonClass}>
              <Download className="h-4 w-4" />
              تصدير تقرير العلامة
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#F8F4EF] transition hover:bg-white/10"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!selectedMetric ? (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {brand.metrics.map((item) => {
                const Icon = metricIcons[item.key];
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setSelectedMetric(item)}
                    title={`مصدر البيانات: ${sourceText(item)}`}
                    className="min-w-0 rounded-[16px] border border-white/10 bg-[#1a1210]/80 p-4 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#D9A33F]/40 hover:bg-[#211711]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-black text-[#CBB29C]">{item.title}</p>
                        <p className={`mt-2 break-words font-black text-[#F8F4EF] ${typeof item.value === "number" ? "text-3xl" : "text-base leading-7"}`}>{item.value}</p>
                      </div>
                      <Icon className="h-6 w-6 shrink-0 text-[#D9A33F]" />
                    </div>
                    {item.accepted !== undefined || item.rejected !== undefined ? (
                      <p className="mt-3 text-xs font-bold text-[#CBB29C]">
                        مقبول: {item.accepted ?? 0} - مرفوض: {item.rejected ?? 0}
                      </p>
                    ) : null}
                    <p className="mt-3 break-words text-xs font-bold text-[#9E8574]">{metricStateText(item)}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="min-w-0">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-[#D9A33F]">تفاصيل المؤشر</p>
                  <h3 className="mt-1 break-words text-xl font-black text-[#F8F4EF]">{selectedMetric.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMetric(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-[#F8F4EF] transition hover:bg-white/10"
                >
                  رجوع للبطاقات
                </button>
              </div>
              <SourceDataBlock metric={selectedMetric} />
              <DetailRows brand={brand} metric={selectedMetric} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminOperationsCenterPage({ data, configError }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(data.activeFilters.from);
  const [to, setTo] = useState(data.activeFilters.to);
  const [brandId, setBrandId] = useState(data.activeFilters.brandId);
  const [selectedBrand, setSelectedBrand] = useState<AdminOperationsCenterBrand | null>(null);

  useEffect(() => {
    setFrom(data.activeFilters.from);
    setTo(data.activeFilters.to);
    setBrandId(data.activeFilters.brandId);
  }, [data.activeFilters.brandId, data.activeFilters.from, data.activeFilters.to]);

  const filteredBrands = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return data.brands;
    return data.brands.filter((brand) =>
      [brand.name, brand.slug, brand.status, brand.businessCategory].some((value) => value.includes(normalized)),
    );
  }, [data.brands, query]);

  function pushFilters(next: { brandId?: string; from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (next.brandId) params.set("brandId", next.brandId);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    const search = params.toString();
    router.push(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  function applyFilters() {
    pushFilters({ brandId, from, to });
  }

  function resetFilters() {
    setFrom("");
    setTo("");
    setBrandId("");
    pushFilters({});
  }

  function exportGeneralReport() {
    exportOperationsCenterReportToPdf({
      brands: filteredBrands,
      filters: data.activeFilters,
    });
  }

  function exportBrandReport(brand: AdminOperationsCenterBrand) {
    exportOperationsCenterReportToPdf({
      brands: data.brands,
      filters: data.activeFilters,
      brand,
    });
  }

  return (
    <AdminPageShell
      title="مركز العمليات"
      subtitle="قراءة تشغيلية لكل علامة من الجداول الموجودة فقط، بدون أرقام وهمية أو توسيع صلاحيات."
    >
      <AdminFilterBar>
        <div className="relative min-w-0 w-full flex-1">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
          <AdminInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث باسم العلامة أو الرابط..."
            className="pr-12"
          />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[150px_150px_220px_auto_auto_auto]">
          <label className="min-w-0 text-xs font-black text-[#CBB29C]">
            من
            <AdminInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-2 text-left" />
          </label>
          <label className="min-w-0 text-xs font-black text-[#CBB29C]">
            إلى
            <AdminInput type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-2 text-left" />
          </label>
          <label className="min-w-0 text-xs font-black text-[#CBB29C]">
            العلامة التجارية
            <AdminSelect value={brandId} onChange={(event) => setBrandId(event.target.value)} className="mt-2">
              <option value="">كل العلامات</option>
              {data.brandOptions.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </AdminSelect>
          </label>
          <button type="button" onClick={applyFilters} className={`${adminGoldButtonClass} self-end`}>
            تطبيق الفلاتر
          </button>
          <button type="button" onClick={resetFilters} className={`${adminActionButtonClass} self-end`}>
            إعادة تعيين
          </button>
          <button type="button" onClick={exportGeneralReport} className={`${adminActionButtonClass} self-end`}>
            <Download className="h-4 w-4" />
            تصدير PDF
          </button>
        </div>
        <div className="min-w-0 rounded-[16px] border border-white/10 bg-[#0f0c0a]/60 p-4 sm:min-w-[180px]">
          <AdminStatPill label="العلامات" value={filteredBrands.length} hint={`${filterPeriodText(data.activeFilters.from, data.activeFilters.to)} - من ${data.brands.length} علامة`} />
        </div>
      </AdminFilterBar>

      {configError ? (
        <div className="mb-5 rounded-[16px] border border-red-500/20 bg-red-500/10 p-4 text-sm font-black text-red-200">
          {configError}
        </div>
      ) : null}

      {data.diagnostics.length ? (
        <details className="mb-5 rounded-[16px] border border-white/10 bg-[#1a1210]/60 p-4">
          <summary className="cursor-pointer select-none text-sm font-black text-[#D9A33F]">مصدر البيانات</summary>
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            {data.diagnostics.map((item) => (
              <div key={`${item.metric}-${item.source}`} className="min-w-0 rounded-[14px] border border-white/10 bg-[#0f0c0a]/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black text-[#F8F4EF]">{item.metric}</p>
                  <StatusBadge tone={item.status === "missing" ? "warning" : "success"}>{item.source}</StatusBadge>
                </div>
                <p className="mt-2 break-words text-xs font-bold leading-6 text-[#CBB29C]">{item.note}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="hidden max-w-full overflow-hidden rounded-[16px] border border-white/10 md:block">
        <div className="max-w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[980px] table-auto text-right text-sm">
            <Head labels={["العلامة", "الرابط", "الحالة", "الزيارات", "طلبات", "حجوزات", "الكاشير", "الولاء", "تقرير"]} />
            <tbody className="divide-y divide-white/10 bg-[#0f0c0a]/70">
              {filteredBrands.map((brand) => {
                const visits = brand.metrics.find((item) => item.key === "visits")?.value ?? 0;
                const orders = brand.metrics.find((item) => item.key === "orders");
                const reservations = brand.metrics.find((item) => item.key === "reservations");
                const cashierLogins = brand.metrics.find((item) => item.key === "cashierLogins")?.value ?? 0;
                const loyaltyScans = brand.metrics.find((item) => item.key === "loyaltyScans")?.value ?? 0;
                return (
                  <tr
                    key={brand.id}
                    className="cursor-pointer transition hover:bg-white/[0.04]"
                    onClick={() => setSelectedBrand(brand)}
                  >
                    <Cell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D9A33F]/15 text-[#D9A33F]">
                          <Store className="h-5 w-5" />
                        </span>
                        <span>{brand.name}</span>
                      </div>
                    </Cell>
                    <Cell>{brand.publicUrl}</Cell>
                    <Cell><StatusBadge tone={brand.status === "active" ? "success" : "warning"}>{brand.status || "غير محدد"}</StatusBadge></Cell>
                    <Cell>{visits}</Cell>
                    <Cell>{orders?.value ?? 0} / مرفوض {orders?.rejected ?? 0}</Cell>
                    <Cell>مقبول {reservations?.accepted ?? 0} / مرفوض {reservations?.rejected ?? 0}</Cell>
                    <Cell>{cashierLogins}</Cell>
                    <Cell>{loyaltyScans}</Cell>
                    <Cell>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          exportBrandReport(brand);
                        }}
                        className={adminActionButtonClass}
                      >
                        <Download className="h-4 w-4" />
                        تصدير PDF
                      </button>
                    </Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
        {filteredBrands.map((brand) => {
          const visits = brand.metrics.find((item) => item.key === "visits")?.value ?? 0;
          const orders = brand.metrics.find((item) => item.key === "orders");
          const reservations = brand.metrics.find((item) => item.key === "reservations");
          return (
            <div
              key={brand.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedBrand(brand)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelectedBrand(brand);
              }}
              className="min-w-0 rounded-[16px] border border-white/10 bg-[#0f0c0a]/70 p-4 text-right"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-black text-[#F8F4EF]">{brand.name}</h2>
                  <p className="mt-1 break-words text-xs font-bold text-[#CBB29C]">{brand.publicUrl}</p>
                </div>
                <StatusBadge tone={brand.status === "active" ? "success" : "warning"}>{brand.status || "غير محدد"}</StatusBadge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black text-[#CBB29C]">
                <span className="rounded-xl bg-white/5 p-3">الزيارات: {visits}</span>
                <span className="rounded-xl bg-white/5 p-3">الطلبات: {orders?.value ?? 0}</span>
                <span className="rounded-xl bg-white/5 p-3">حجوزات مقبولة: {reservations?.accepted ?? 0}</span>
                <span className="rounded-xl bg-white/5 p-3">حجوزات مرفوضة: {reservations?.rejected ?? 0}</span>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  exportBrandReport(brand);
                }}
                className={`${adminActionButtonClass} mt-4 w-full`}
              >
                <Download className="h-4 w-4" />
                تصدير تقرير PDF
              </button>
            </div>
          );
        })}
      </div>

      {!filteredBrands.length ? (
        <BentoCard variant="dark" span="4" className="mt-5">
          <EmptyState message="لا توجد علامات مطابقة للبحث" />
        </BentoCard>
      ) : null}

      {selectedBrand ? (
        <BrandModal
          brand={selectedBrand}
          filters={data.activeFilters}
          onExportBrand={exportBrandReport}
          onClose={() => setSelectedBrand(null)}
        />
      ) : null}
    </AdminPageShell>
  );
}
