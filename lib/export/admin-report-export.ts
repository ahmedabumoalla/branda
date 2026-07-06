import type { AdminOperationsCenterBrand, AdminOperationsCenterData, OperationsMetricKey } from "@/lib/data/admin-operations-center";

export type ExportColumn<T> = {
  key: keyof T | string;
  title: string;
  value?: (row: T) => string | number | null | undefined;
};

function readValue<T extends Record<string, unknown>>(row: T, column: ExportColumn<T>) {
  const raw = column.value ? column.value(row) : row[column.key as keyof T];
  return raw == null ? "" : String(raw);
}

function escapeCell(value: string) {
  const clean = value.replace(/\r?\n/g, " ");
  return /[",]/.test(clean) ? `"${clean.replace(/"/g, '""')}"` : clean;
}

function downloadBlob(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportRowsToExcel<T extends Record<string, unknown>>(filename: string, rows: T[], columns: ExportColumn<T>[]) {
  const header = columns.map((column) => escapeCell(column.title)).join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCell(readValue(row, column))).join(","))
    .join("\n");
  downloadBlob(`${filename}.csv`, "text/csv;charset=utf-8", `\uFEFF${header}\n${body}`);
}

export function exportRowsToPdf<T extends Record<string, unknown>>(title: string, rows: T[], columns: ExportColumn<T>[]) {
  const tableRows = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${readValue(row, column).replace(/[&<>"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[char] || char))}</td>`).join("")}</tr>`)
    .join("");
  const tableHeads = columns.map((column) => `<th>${column.title}</th>`).join("");
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#241610}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #d8c5ae;padding:10px;text-align:right;font-size:12px}th{background:#f6c35b;color:#241610}tr:nth-child(even){background:#fcf8f3}</style></head><body><h1>${title}</h1><p>تاريخ التصدير: ${new Date().toLocaleString("ar-SA")}</p><table><thead><tr>${tableHeads}</tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
}

const operationsMetricLabels: Record<OperationsMetricKey, string> = {
  visits: "الزيارات",
  appInstallClicks: "تحميل التطبيق",
  brandLogins: "دخول العلامة",
  cashierLogins: "دخول الكاشير",
  loyaltyScans: "عمليات الولاء",
  rewardRedemptions: "المكافآت",
  orders: "الطلبات",
  reservations: "الحجوزات",
};

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[char] || char));
}

function metricValue(brand: AdminOperationsCenterBrand, key: OperationsMetricKey) {
  return brand.metrics.find((item) => item.key === key)?.value ?? 0;
}

function metricAccepted(brand: AdminOperationsCenterBrand, key: OperationsMetricKey) {
  return brand.metrics.find((item) => item.key === key)?.accepted ?? 0;
}

function metricRejected(brand: AdminOperationsCenterBrand, key: OperationsMetricKey) {
  return brand.metrics.find((item) => item.key === key)?.rejected ?? 0;
}

function reportPeriod(filters: AdminOperationsCenterData["activeFilters"]) {
  if (filters.from && filters.to) return `${filters.from} إلى ${filters.to}`;
  if (filters.from) return `من ${filters.from}`;
  if (filters.to) return `حتى ${filters.to}`;
  return "كل الفترات";
}

function reportBrandScope(brand: AdminOperationsCenterBrand | null) {
  return brand ? brand.name : "كل العلامات";
}

function limitedRows<T>(rows: T[]) {
  return {
    rows: rows.slice(0, 300),
    limited: rows.length > 300,
  };
}

function simpleTable<T>(title: string, rows: T[], columns: Array<{ title: string; value: (row: T) => string | number | null | undefined }>) {
  const limited = limitedRows(rows);
  if (!limited.rows.length) {
    return `<section class="section"><h2>${escapeHtml(title)}</h2><p class="empty">لا توجد بيانات ضمن الفلتر المحدد</p></section>`;
  }

  const heads = columns.map((column) => `<th>${escapeHtml(column.title)}</th>`).join("");
  const body = limited.rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join("")}</tr>`)
    .join("");
  const note = limited.limited ? `<p class="notice">تم عرض أول 300 سجل في هذا القسم</p>` : "";
  return `<section class="section"><h2>${escapeHtml(title)}</h2>${note}<table><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></section>`;
}

function brandSummaryTable(brands: AdminOperationsCenterBrand[]) {
  if (!brands.length) return `<p class="empty">لا توجد بيانات ضمن الفلتر المحدد</p>`;
  return `<table>
    <thead>
      <tr>
        <th>العلامة</th>
        <th>الرابط</th>
        <th>الحالة</th>
        <th>الزيارات</th>
        <th>تحميل التطبيق</th>
        <th>دخول العلامة</th>
        <th>دخول الكاشير</th>
        <th>عمليات الولاء</th>
        <th>المكافآت</th>
        <th>الطلبات</th>
        <th>الطلبات المقبولة</th>
        <th>الطلبات المرفوضة</th>
        <th>الحجوزات</th>
        <th>الحجوزات المقبولة</th>
        <th>الحجوزات المرفوضة</th>
      </tr>
    </thead>
    <tbody>
      ${brands
        .map(
          (brand) => `<tr>
            <td>${escapeHtml(brand.name)}</td>
            <td>${escapeHtml(brand.publicUrl)}</td>
            <td>${escapeHtml(brand.status || "غير محدد")}</td>
            <td>${metricValue(brand, "visits")}</td>
            <td>${metricValue(brand, "appInstallClicks")}</td>
            <td>${metricValue(brand, "brandLogins")}</td>
            <td>${metricValue(brand, "cashierLogins")}</td>
            <td>${metricValue(brand, "loyaltyScans")}</td>
            <td>${metricValue(brand, "rewardRedemptions")}</td>
            <td>${metricValue(brand, "orders")}</td>
            <td>${metricAccepted(brand, "orders")}</td>
            <td>${metricRejected(brand, "orders")}</td>
            <td>${metricValue(brand, "reservations")}</td>
            <td>${metricAccepted(brand, "reservations")}</td>
            <td>${metricRejected(brand, "reservations")}</td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function brandMetricCards(brand: AdminOperationsCenterBrand) {
  return `<div class="metrics">
    ${brand.metrics
      .map(
        (metric) => `<div class="metric">
          <span>${escapeHtml(operationsMetricLabels[metric.key] ?? metric.title)}</span>
          <strong>${metric.value}</strong>
          ${metric.accepted !== undefined || metric.rejected !== undefined ? `<small>مقبول ${metric.accepted ?? 0} / مرفوض ${metric.rejected ?? 0}</small>` : ""}
        </div>`
      )
      .join("")}
  </div>`;
}

function brandDetailsSections(brand: AdminOperationsCenterBrand) {
  return [
    simpleTable("الزيارات", brand.details.visits, [
      { title: "المسار", value: (row) => row.path },
      { title: "الجلسة", value: (row) => row.sessionId },
      { title: "المدة", value: (row) => row.durationSeconds ?? "" },
      { title: "التاريخ", value: (row) => row.createdAt },
    ]),
    simpleTable("ضغط تحميل التطبيق", brand.details.appInstallClicks, [
      { title: "المسار", value: (row) => row.path },
      { title: "التاريخ", value: (row) => row.createdAt },
    ]),
    simpleTable("تسجيل دخول العلامة", brand.details.brandLogins, [
      { title: "المستخدم", value: (row) => row.actorName },
      { title: "الإيميل", value: (row) => row.actorEmail },
      { title: "التاريخ", value: (row) => row.createdAt },
    ]),
    simpleTable("تسجيل دخول الكاشير", brand.details.cashierLogins, [
      { title: "الكاشير", value: (row) => row.cashierName },
      { title: "الإيميل", value: (row) => row.cashierEmail },
      { title: "التاريخ", value: (row) => row.createdAt },
    ]),
    simpleTable("عمليات الولاء", brand.details.loyaltyScans, [
      { title: "العميل", value: (row) => row.customerName },
      { title: "البطاقة", value: (row) => row.cardCode },
      { title: "العملية", value: (row) => row.eventType },
      { title: "الكاشير", value: (row) => row.cashierName },
      { title: "المبلغ", value: (row) => row.invoiceAmount },
      { title: "التاريخ", value: (row) => row.createdAt },
    ]),
    simpleTable("المكافآت المصروفة", brand.details.rewardRedemptions, [
      { title: "المكافأة", value: (row) => row.rewardTitle },
      { title: "العميل", value: (row) => row.customerName },
      { title: "الكاشير", value: (row) => row.cashierName },
      { title: "الكود", value: (row) => row.scannedCode },
      { title: "التاريخ", value: (row) => row.createdAt },
    ]),
    simpleTable("الطلبات", brand.details.orders, [
      { title: "رقم الطلب", value: (row) => row.id.slice(0, 8).toUpperCase() },
      { title: "العميل", value: (row) => row.customerName },
      { title: "الحالة", value: (row) => row.status },
      { title: "الإجمالي", value: (row) => row.total },
      { title: "الإجراء", value: (row) => `${row.actorType} - ${row.actorName}` },
      { title: "التاريخ", value: (row) => row.createdAt },
    ]),
    simpleTable("الحجوزات", brand.details.reservations, [
      { title: "رقم الحجز", value: (row) => row.id.slice(0, 8).toUpperCase() },
      { title: "العميل", value: (row) => row.customerName },
      { title: "الحالة", value: (row) => row.status },
      { title: "الموعد", value: (row) => [row.date, row.time].filter(Boolean).join(" ") },
      { title: "الضيوف", value: (row) => row.guests },
      { title: "التاريخ", value: (row) => row.createdAt },
    ]),
  ].join("");
}

export function exportOperationsCenterReportToPdf(input: {
  brands: AdminOperationsCenterBrand[];
  filters: AdminOperationsCenterData["activeFilters"];
  brand?: AdminOperationsCenterBrand | null;
}) {
  const brand = input.brand ?? null;
  const brands = brand ? [brand] : input.brands;
  const logoUrl = `${window.location.origin}/brand/barndaksa-logo-brown.png`;
  const exportedAt = new Date().toLocaleString("ar-SA");
  const title = brand ? `تقرير العلامة ${brand.name}` : "تقرير مركز العمليات";
  const body = brand
    ? `<section class="brand-intro">
        <h2>${escapeHtml(brand.name)}</h2>
        <p>${escapeHtml(brand.publicUrl)}</p>
        <p>الحالة: ${escapeHtml(brand.status || "غير محدد")}</p>
      </section>
      ${brandMetricCards(brand)}
      ${brandDetailsSections(brand)}`
    : `<section class="section">
        <h2>ملخص العلامات</h2>
        <p class="muted">عدد العلامات المشمولة: ${brands.length}</p>
        ${brandSummaryTable(brands)}
      </section>`;

  const html = `<!doctype html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body { margin:0; background:#fbf7ee; color:#241610; font-family: Arial, Tahoma, sans-serif; line-height:1.65; }
          .header { border-bottom:4px solid #fbcf72; background:#652117; color:#fff8ea; padding:18px 22px; }
          .brand-row { display:flex; align-items:center; justify-content:space-between; gap:16px; }
          .logo { max-height:54px; max-width:180px; object-fit:contain; background:#fff; border-radius:10px; padding:6px; }
          h1 { margin:12px 0 0; font-size:26px; }
          h2 { margin:0 0 10px; color:#652117; font-size:18px; }
          .meta { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:14px; font-weight:700; }
          .meta span, .metric { border:1px solid #eadcc4; background:#fff; border-radius:10px; padding:8px 10px; }
          main { padding:18px 22px; }
          .section, .brand-intro { page-break-inside: avoid; margin-bottom:18px; border:1px solid #eadcc4; background:#fffdf8; border-radius:12px; padding:14px; }
          .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:18px; }
          .metric span, .metric small { display:block; color:#6b594d; font-weight:700; font-size:11px; }
          .metric strong { display:block; color:#652117; font-size:22px; margin-top:4px; }
          table { width:100%; border-collapse:collapse; table-layout:auto; margin-top:10px; background:#fff; }
          th, td { border:1px solid #e4d2bc; padding:7px 8px; text-align:right; vertical-align:top; font-size:10.5px; overflow-wrap:anywhere; }
          th { background:#fbcf72; color:#241610; font-weight:900; }
          tr:nth-child(even) td { background:#fff9ed; }
          .empty, .notice, .muted { color:#6b594d; font-weight:700; }
          .notice { border:1px solid #fbcf72; background:#fff7df; border-radius:10px; padding:8px; }
          @media print {
            body { background:#fff; }
            .section, .brand-intro, .metric { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <header class="header">
          <div class="brand-row">
            <div>
              <p style="margin:0;font-weight:900;color:#fbcf72">Barndaksa</p>
              <h1>${escapeHtml(title)}</h1>
            </div>
            <img class="logo" src="${escapeHtml(logoUrl)}" alt="Barndaksa">
          </div>
          <div class="meta">
            <span>تاريخ التصدير: ${escapeHtml(exportedAt)}</span>
            <span>فترة التقرير: ${escapeHtml(reportPeriod(input.filters))}</span>
            <span>نطاق التقرير: ${escapeHtml(reportBrandScope(brand))}</span>
            <span>عدد العلامات: ${brands.length}</span>
          </div>
        </header>
        <main>${body}</main>
        <script>window.onload=()=>window.print()</script>
      </body>
    </html>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
}
