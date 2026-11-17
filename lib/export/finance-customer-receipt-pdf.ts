import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { financeCustomerReceiptSchema, type FinanceCustomerReceipt, type FinanceCustomerReceiptFonts } from "@/lib/finance/customer-receipt";
import { financeReceiptQr, getFinanceReceiptTaxStatus } from "@/lib/finance/receipt-tax";

type EmbeddedFontMetadata = { cmap: { unicode: { codeMap: Record<number, number> } } };
const money = (value: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const quantity = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
const ink: [number, number, number] = [57, 37, 27];
const muted: [number, number, number] = [110, 96, 86];
const cream: [number, number, number] = [248, 244, 238];

/** Server-compatible PDF bytes; values come from the posted invoice, never current product prices. */
export function buildFinanceCustomerReceiptPdf(receipt: FinanceCustomerReceipt, fonts: FinanceCustomerReceiptFonts, options: { includeIdentity?: boolean } = {}): Uint8Array {
  const data = financeCustomerReceiptSchema.parse(receipt);
  if (!fonts.regular || !fonts.bold) throw new Error("خطوط الفاتورة غير متاحة");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", putOnlyUsedFonts: true, compress: true });
  doc.addFileToVFS("Tajawal-Regular.ttf", fonts.regular);
  doc.addFont("Tajawal-Regular.ttf", "Tajawal", "normal");
  doc.addFileToVFS("Tajawal-Bold.ttf", fonts.bold);
  doc.addFont("Tajawal-Bold.ttf", "Tajawal", "bold");
  // Match the established report renderer: retain isolated Arabic glyphs when shaping.
  for (const style of ["normal", "bold"]) {
    doc.setFont("Tajawal", style);
    const { codeMap } = (doc.getFont().metadata as unknown as EmbeddedFontMetadata).cmap.unicode;
    for (let code = 0xfe80; code <= 0xfefc; code++) {
      const base = String.fromCharCode(code).normalize("NFKC");
      if (!codeMap[code] && base.length === 1 && codeMap[base.charCodeAt(0)]) codeMap[code] = codeMap[base.charCodeAt(0)];
    }
  }
  doc.setLanguage("ar-SA");
  doc.setProperties({ title: `فاتورة ${data.number} — ${data.brandName}`, subject: "نسخة فاتورة مبيعات", creator: "Barnda" });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const margin = 15, right = width - margin;
  const taxDocument = { kind: "sale", receipt_seller: data.receiptSeller, created_at: data.createdAt, total: data.total, tax: data.tax };
  const taxQr = options.includeIdentity ? financeReceiptQr(taxDocument) : null;
  const taxStatus = options.includeIdentity ? getFinanceReceiptTaxStatus(taxDocument) : "not_applicable";
  const taxNotice = options.includeIdentity && data.tax > 0 && !taxQr
    ? taxStatus === "missing_identity" ? "الرمز الضريبي غير متاح لعدم اكتمال هوية البائع المحفوظة" : "تعذر إنشاء الرمز الضريبي من بيانات الفاتورة المحفوظة"
    : "";
  const footerReserve = taxQr ? 67 : taxNotice ? 32 : 0;
  doc.setFont("Tajawal", "bold").setFontSize(18);
  const brandLines = doc.splitTextToSize(data.brandName, 112) as string[];
  const brandEnd = 19 + (brandLines.length - 1) * 7;
  const metadataY = Math.max(35, brandEnd + 10);
  doc.setFont("Tajawal", "normal").setFontSize(9);
  const referenceLines = data.localReference ? doc.splitTextToSize(data.localReference, width - margin * 2 - 39) as string[] : [];
  const bodyTop = metadataY + 21 + (referenceLines.length ? 5 + referenceLines.length * 4.5 : 0);
  const issuedAt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(data.createdAt));
  const drawnHeaders = new Set<number>();
  function header() {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (drawnHeaders.has(page)) return;
    drawnHeaders.add(page);
    doc.setFillColor(...ink).rect(0, 0, width, 3, "F");
    doc.setFont("Tajawal", "bold").setFontSize(18).setTextColor(...ink);
    doc.text(brandLines, right, 19, { align: "right", lineHeightFactor: 1.1 });
    doc.setFontSize(12).text("فاتورة مبيعات", margin, 18);
    doc.setFontSize(17).text(`#${data.number}`, margin, 27);
    doc.setFont("Tajawal", "normal").setFontSize(9).setTextColor(...muted);
    doc.text("تاريخ الإصدار بتوقيت الرياض", right, metadataY, { align: "right" });
    doc.setFont("Tajawal", "bold").setFontSize(11).setTextColor(...ink);
    doc.text(issuedAt, right, metadataY + 6, { align: "right" });
    doc.setFont("Tajawal", "normal").setFontSize(9).setTextColor(...muted);
    doc.text("جميع المبالغ بالريال السعودي", right, metadataY + 13, { align: "right" });
    if (referenceLines.length) {
      doc.text("المرجع المحلي", right, metadataY + 20, { align: "right" });
      doc.text(referenceLines, margin, metadataY + 20, { lineHeightFactor: 1.4 });
    }
    doc.setDrawColor(226, 216, 204).setLineWidth(.3).line(margin, bodyTop - 4, right, bodyTop - 4);
  }
  autoTable(doc, {
    startY: bodyTop,
    margin: { top: bodyTop, bottom: Math.max(20, footerReserve), left: margin, right: margin },
    theme: "striped", rowPageBreak: "avoid", showHead: "everyPage", willDrawPage: header,
    head: [["الإجمالي شامل الضريبة", "سعر الوحدة", "الكمية", "الصنف"]],
    body: data.lines.map(line => [money(line.net + line.tax), money(line.unitPrice), quantity(line.quantity), line.name]),
    styles: { font: "Tajawal", fontSize: 10, textColor: ink, halign: "right", valign: "middle", cellPadding: 3, overflow: "linebreak", lineColor: [230, 220, 208], lineWidth: 0 },
    headStyles: { fontStyle: "bold", fillColor: ink, textColor: [255, 255, 255], fontSize: 9 },
    alternateRowStyles: { fillColor: cream },
    columnStyles: { 0: { cellWidth: 39 }, 1: { cellWidth: 32 }, 2: { cellWidth: 23, halign: "center" }, 3: { cellWidth: width - margin * 2 - 94 } },
  });
  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const paymentLabel = { cash: "نقدي", pos: "شبكة", bank: "تحويل بنكي", "": "غير محدد" }[data.paymentMethod];
  const summary = [
    ...(options.includeIdentity ? [
      [data.receiptSeller?.name || data.brandName, "البائع"],
      ...(data.receiptSeller?.vatNumber ? [[data.receiptSeller.vatNumber, "الرقم الضريبي للبائع"]] : []),
      [data.customerName || "عميل نقدي", "العميل"],
      ...(data.customerPhone ? [[data.customerPhone, "جوال العميل"]] : []),
      ...(data.customerTaxNumber ? [[data.customerTaxNumber, "الرقم الضريبي للعميل"]] : []),
    ] : []),
    [money(data.subtotal), "المجموع قبل الخصم"],
    [money(data.discount), "الخصم"],
    [money(data.total - data.tax), "القيمة قبل الضريبة"],
    [money(data.tax), "ضريبة القيمة المضافة"],
    [money(data.total), "الإجمالي المستحق"],
    [money(data.paid), options.includeIdentity ? "المدفوع عند الإصدار" : "المبلغ المدفوع"],
    ...(options.includeIdentity && data.outstanding !== undefined ? [[money(data.outstanding), "المبلغ المستحق الحالي"]] : []),
    ...(options.includeIdentity && data.refundedTotal ? [[money(data.refundedTotal), "إجمالي المرتجع"]] : []),
    [paymentLabel, "طريقة الدفع"],
    ...(data.vatRate === null ? [] : [[`${quantity(data.vatRate)}%`, "نسبة ضريبة القيمة المضافة"]]),
    ...(data.taxInclusive === null ? [] : [[data.taxInclusive ? "شاملة الضريبة" : "غير شاملة الضريبة", "الأسعار المسجلة"]]),
    ...(options.includeIdentity && data.note ? [[data.note, "ملاحظات الفاتورة"]] : []),
  ];
  autoTable(doc, {
    startY: finalY + 9, margin: { top: bodyTop, bottom: Math.max(24, footerReserve), left: width - margin - 117, right: margin },
    body: summary, theme: "plain", pageBreak: "avoid", rowPageBreak: "avoid", willDrawPage: header,
    styles: { font: "Tajawal", fontSize: 10, textColor: ink, halign: "right", valign: "middle", cellPadding: 2.5, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 54, fontStyle: "bold" }, 1: { cellWidth: 63 } },
    didParseCell: hook => {
      if (summary[hook.row.index]?.[1] === "الإجمالي المستحق") { hook.cell.styles.fillColor = ink; hook.cell.styles.textColor = [255, 255, 255]; hook.cell.styles.fontSize = 12; hook.cell.styles.fontStyle = "bold"; }
      else if (hook.row.index % 2 === 0) hook.cell.styles.fillColor = cream;
    },
  });
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    if (taxQr) {
      // The shared helper includes a four-module quiet zone on every edge.
      const qrWidth = 36, qrTop = height - 61, moduleWidth = qrWidth / taxQr.size;
      doc.setFillColor(255, 255, 255).rect(margin, qrTop, qrWidth, qrWidth, "F").setFillColor(0, 0, 0);
      for (const cell of taxQr.path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
        doc.rect(margin + Number(cell[1]) * moduleWidth, qrTop + Number(cell[2]) * moduleWidth, moduleWidth, moduleWidth, "F");
      }
      doc.setFont("Tajawal", "normal").setFontSize(8).setTextColor(...muted);
      doc.text("الرمز الضريبي", margin + qrWidth / 2, height - 21, { align: "center" });
    } else if (taxNotice) {
      doc.setFont("Tajawal", "normal").setFontSize(8).setTextColor(...muted);
      doc.text(taxNotice, right, height - 23, { align: "right" });
    }
    doc.setDrawColor(226, 216, 204).setLineWidth(.2).line(margin, height - 17, right, height - 17);
    doc.setFont("Tajawal", "normal").setFontSize(9).setTextColor(...muted);
    doc.text("نسخة من الفاتورة المسجلة", right, height - 10, { align: "right" });
    doc.text(`${page} / ${pageCount}`, width / 2, height - 10, { align: "center" });
    doc.text("Barnda", margin, height - 10);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
