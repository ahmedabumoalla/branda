import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  reportMetricLabels, reportMetrics, totalReportMetrics,
  type OperationsReport, type ReportBrand, type ReportFilters,
} from "@/lib/analytics/operations-report";
import { getPlatformFeatureDefinition } from "@/lib/platform/feature-registry";

type ReportFonts = { regular: string; bold: string };
type ReportRow = [string, string];
type EmbeddedFontMetadata = { cmap: { unicode: { codeMap: Record<number, number> } } };
const number = (value: number) => new Intl.NumberFormat("en-US").format(value);
const saudiDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value)) : "لا توجد زيارة مسجلة";
const featureLabel = (feature: string) => feature === "standalone_menu" ? "المنيو المستقل"
  : getPlatformFeatureDefinition(feature)?.titleAr ?? feature;
const statusLabel = (status: string) => ({ active: "نشط", trial: "تجريبي", trialing: "تجريبي",
  expired: "منتهي", cancelled: "ملغي", canceled: "ملغي", suspended: "موقوف", inactive: "غير نشط",
  pending: "قيد الانتظار", none: "لا يوجد" }[status] ?? status);

/** Plain text only: query/brand data are never treated as HTML or PDF actions. */
export function buildOperationsReportContent(report: OperationsReport, brands: ReportBrand[], filters: ReportFilters) {
  const selected = report.brands.find(brand => brand.id === filters.brandId);
  const sortLabel = filters.sort === "name" ? "اسم العلامة" : filters.sort === "lastMenuVisit" ? "آخر زيارة للمنيو"
    : filters.sort === "lastStorefrontVisit" ? "آخر زيارة للفرع" : reportMetricLabels[filters.sort];
  const filterRows: ReportRow[] = [
    [saudiDate(report.generatedAt), "وقت إعداد البيانات — بتوقيت الرياض"],
    [`${report.from ?? "بداية السجل"} — ${report.to ?? "نهاية السجل"}`, "الفترة — أيام شاملة بتوقيت الرياض"],
    [number(brands.length), "عدد العلامات المطابقة"],
    [selected?.name ?? (filters.brandId || "جميع العلامات"), "العلامة المحددة"],
    [filters.query.trim() || "بدون بحث", "نص البحث"],
    [filters.subscription === "subscribed" ? "المشتركة فقط" : filters.subscription === "unsubscribed" ? "غير المشتركة فقط" : "جميع حالات الاشتراك", "الاشتراك"],
    [filters.feature ? featureLabel(filters.feature) : "جميع الميزات", "الميزة المفعلة"],
    [`${sortLabel} — ${filters.direction === "asc" ? "تصاعدي" : "تنازلي"}`, "الترتيب"],
    ...filters.conditions.map((condition): ReportRow => [
      `${{ gte: "أكبر من أو يساوي", lte: "أقل من أو يساوي", eq: "يساوي" }[condition.operator]} ${number(condition.value)}`,
      reportMetricLabels[condition.metric],
    ]),
  ];
  const totals = totalReportMetrics(brands);
  const metricRows = (metrics: ReportBrand["metrics"]): ReportRow[] => reportMetrics.map(metric => [number(metrics[metric]), reportMetricLabels[metric]]);
  return {
    filterRows,
    totalRows: metricRows(totals),
    notes: [
      `تتبع الزيارات متاح منذ ${saudiDate(report.menuTrackingSince)}. تتبع إصدار المحافظ منذ ${saudiDate(report.walletTrackingSince)}. تصنيف مصدر التسجيل منذ ${saudiDate(report.registrationTrackingSince)}.`,
      "الأصفار تعني عدم وجود سجلات ضمن البيانات المتاحة؛ لا تعني استعادة زيارات تاريخية قبل بدء التتبع. الزوار متصفحات مميزة تقريبية وليست أعداد أشخاص مؤكدة.",
      "بطاقات آيفون وأندرويد تعني سجلات إصدار أو تسليم رابط المحفظة، ولا تثبت حفظ البطاقة على الجهاز. قد تظهر البطاقة نفسها لدى المزودين وتُحسب مرة واحدة في الإجمالي.",
      "الختم والمكافأة عمليتان ناجحتان فقط؛ لا تُحسب محاولات المسح أو العمليات المرفوضة. الحسابات ذات المصدر غير المحدد لم يُفترض أنها مسجلة من الفرع.",
      "كل المؤشرات العددية ضمن الفترة المختارة. الاشتراك والباقة والميزات حالات حالية وقت إعداد التقرير. آخر زيارة إجمالية مستقلة عن مرشح الفترة.",
      "الإجماليات تجمع أرقام العلامات المطابقة؛ قد يُحسب العميل أو المتصفح نفسه لدى أكثر من علامة، وليست أعداد أشخاص فريدة على مستوى المنصة.",
    ],
    brands: brands.map(brand => ({
      id: brand.id, name: brand.name, subscribed: brand.subscribed,
      details: [
        [brand.slug, "معرّف الرابط"],
        [statusLabel(brand.status), "حالة العلامة"],
        [brand.subscribed ? "مشتركة" : "غير مشتركة", "الاشتراك الحالي"],
        [statusLabel(brand.subscriptionStatus), "حالة الاشتراك"],
        [brand.planName || "لا توجد باقة", "الباقة"],
        [brand.expiresAt ? saudiDate(brand.expiresAt) : "غير محدد", "انتهاء الاشتراك"],
        [brand.features.map(featureLabel).join("، ") || "لا توجد ميزات مفعلة", "الميزات المفعلة حالياً"],
      ] as ReportRow[],
      metrics: metricRows(brand.metrics),
      visits: [
        [saudiDate(brand.lastMenuVisit), "آخر زيارة للمنيو — إجمالاً"],
        [saudiDate(brand.lastStorefrontVisit), "آخر زيارة للفرع — إجمالاً"],
        [saudiDate(brand.periodLastMenuVisit), "آخر زيارة للمنيو — ضمن الفترة"],
        [saudiDate(brand.periodLastStorefrontVisit), "آخر زيارة للفرع — ضمن الفترة"],
      ] as ReportRow[],
    })),
  };
}

/** Builds every supplied result, irrespective of the screen's current pagination. */
export function buildOperationsReportPdf(report: OperationsReport, brands: ReportBrand[], filters: ReportFilters, fonts: ReportFonts) {
  const content = buildOperationsReportContent(report, brands, filters);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", putOnlyUsedFonts: true, compress: true });
  doc.addFileToVFS("Tajawal-Regular.ttf", fonts.regular);
  doc.addFont("Tajawal-Regular.ttf", "Tajawal", "normal");
  doc.addFileToVFS("Tajawal-Bold.ttf", fonts.bold);
  doc.addFont("Tajawal-Bold.ttf", "Tajawal", "bold");
  // Tajawal maps isolated Arabic glyphs to their base Unicode characters. jsPDF's
  // shaper emits presentation forms; alias only missing, single-character forms
  // to those existing glyphs so isolated letters are not silently dropped.
  for (const style of ["normal", "bold"]) {
    doc.setFont("Tajawal", style);
    const { codeMap } = (doc.getFont().metadata as unknown as EmbeddedFontMetadata).cmap.unicode;
    for (let code = 0xfe80; code <= 0xfefc; code++) {
      const base = String.fromCharCode(code).normalize("NFKC");
      if (!codeMap[code] && base.length === 1 && codeMap[base.charCodeAt(0)]) codeMap[code] = codeMap[base.charCodeAt(0)];
    }
  }
  doc.setFont("Tajawal");
  doc.setLanguage("ar-SA");
  doc.setProperties({ title: "تقرير عمليات العلامات", subject: "إحصاءات العلامات والولاء", creator: "Barnda" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 24;
  function heading(text: string, subtitle?: string) {
    doc.setFillColor(35, 65, 55);
    doc.rect(0, 0, width, 4, "F");
    doc.setFont("Tajawal", "bold").setFontSize(19).setTextColor(35, 65, 55);
    const lines = doc.splitTextToSize(text, width - margin * 2) as string[];
    doc.text(lines, width - margin, 16, { align: "right" });
    y = 16 + lines.length * 8;
    if (subtitle) {
      doc.setFont("Tajawal", "normal").setFontSize(10).setTextColor(80);
      doc.text(subtitle, width - margin, y, { align: "right" });
      y += 7;
    }
  }
  function table(rows: ReportRow[], title: string, paired = false) {
    const body = paired ? Array.from({ length: Math.ceil(rows.length / 2) }, (_, index) => [
      ...(rows[index * 2 + 1] ?? ["", ""]), ...rows[index * 2],
    ]) : rows;
    autoTable(doc, {
      startY: y, margin: { left: margin, right: margin, top: 14, bottom: 16 },
      head: [paired ? ["القيمة", title, "القيمة", title] : ["القيمة", title]], body,
      theme: "striped", pageBreak: "auto", rowPageBreak: "avoid",
      styles: { font: "Tajawal", fontSize: 10, halign: "right", valign: "middle", cellPadding: 1.2, overflow: "linebreak", textColor: [35, 44, 40] },
      headStyles: { font: "Tajawal", fontStyle: "bold", fillColor: [35, 65, 55], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 247, 245] },
      columnStyles: paired
        ? { 0: { cellWidth: 29 }, 1: { cellWidth: (width - margin * 2) / 2 - 29 }, 2: { cellWidth: 29 }, 3: { cellWidth: (width - margin * 2) / 2 - 29 } }
        : { 0: { cellWidth: 176 }, 1: { cellWidth: width - margin * 2 - 176 } },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }
  heading("تقرير عمليات العلامات", "الأرقام حسب الفترة والمرشحات المحددة — بتوقيت الرياض");
  table(content.filterRows, "نطاق التقرير والمرشحات");
  table(content.totalRows, "إجمالي العلامات المطابقة", true);
  doc.addPage();
  heading("تغطية البيانات وتعريف المؤشرات");
  table(content.notes.map((note, index) => [note, number(index + 1)]), "ملاحظات القراءة");
  for (const [index, brand] of content.brands.entries()) {
    doc.addPage();
    heading(brand.name, `العلامة ${number(index + 1)} من ${number(content.brands.length)} — ${brand.subscribed ? "مشتركة" : "غير مشتركة"}`);
    table(brand.details, "بيانات العلامة والاشتراك");
    table(brand.metrics, "مؤشرات الفترة", true);
    table(brand.visits, "آخر الزيارات — بتوقيت الرياض");
  }
  if (!brands.length) table([["لا توجد علامات تطابق المرشحات المحددة", "النتيجة"]], "العلامات");
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFont("Tajawal", "normal").setFontSize(9).setTextColor(90);
    doc.text(`صفحة ${number(page)} من ${number(pages)}`, width - margin, height - 7, { align: "right" });
    doc.text("Barnda", margin, height - 7);
  }
  return doc;
}

async function fetchFont(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("تعذر تحميل خط التقرير. أعد المحاولة.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

export async function downloadOperationsReportPdf(report: OperationsReport, brands: ReportBrand[], filters: ReportFilters) {
  const [regular, bold] = await Promise.all([fetchFont("/fonts/tajawal-regular.ttf"), fetchFont("/fonts/tajawal-bold.ttf")]);
  const doc = buildOperationsReportPdf(report, brands, filters, { regular, bold });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(report.generatedAt));
  await doc.save(`barnda-operations-${day}.pdf`, { returnPromise: true });
}
