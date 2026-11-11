import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import qrcode from "qrcode-generator";

export type CompanyInvoicePreview = {
  brand: string; customer: string; taxNumber: string; thermal: boolean; note: string;
  lines: { name: string; description?: string; quantity: number; price: number; discount: number; tax: number; total: number; vatRate?: number; exemptionReason?: string }[];
  subtotal: number; discount: number; tax: number; total: number;
  paid?: number;
  currency?: string; exchangeRate?: number; decimalDisplay?: "always" | "never" | "auto";
  documentType?: "invoice" | "debit"; sourceNumber?: string; reason?: string;
  sar?: { tax: number; total: number }; cashPaid?: number; creditApplied?: number;
  adjustment?: { name?: string; net: number; tax: number; total: number };
  savedDraft?: boolean;
  quote?: { number?: number; date: string; validUntil: string; warehouse: string; draft: boolean };
  issued?: { id?: string; number: number; displayNumber?: string; invoiceType?: "standard" | "simplified"; issuedAt: string; supplyDate: string; sellerName: string; sellerVat: string; sellerAddress: string; customerAddress: string; taxInclusive: boolean };
};

export function companyInvoiceQr(data: CompanyInvoicePreview) {
  if (!data.issued) throw new Error("Issued invoice required");
  const values = [data.issued.sellerName, data.issued.sellerVat, new Date(data.issued.issuedAt).toISOString(), (data.sar?.total ?? data.total).toFixed(2), (data.sar?.tax ?? data.tax).toFixed(2)];
  const bytes = values.flatMap((value, index) => {
    const encoded = new TextEncoder().encode(value);
    if (encoded.length > 255) throw new Error("Invoice QR field too long");
    return [index + 1, encoded.length, ...encoded];
  });
  return btoa(String.fromCharCode(...bytes));
}

/** Unsaved local preview only: never uses posted receipt numbering or cashier APIs. */
export function buildCompanyInvoicePreviewPdf(data: CompanyInvoicePreview, fonts: { regular: string; bold: string }) {
  const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: data.decimalDisplay === "never" || (data.decimalDisplay === "auto" && Math.abs(value) >= 1000) ? 0 : 2, maximumFractionDigits: 2 });
  const currency = data.currency ?? "SAR";
  const doc = new jsPDF({ unit: "mm", format: data.thermal ? [80, 297] : "a4", compress: true });
  if (data.issued?.id) {
    doc.setFileId(data.issued.id.replaceAll("-", ""));
    doc.setCreationDate(`D:${new Date(data.issued.issuedAt).toISOString().slice(0, 19).replace(/[-T:]/g, "")}+00'00'`);
  }
  for (const [style, content] of Object.entries(fonts)) {
    const file = `Tajawal-${style}.ttf`;
    doc.addFileToVFS(file, content);
    doc.addFont(file, "Tajawal", style === "regular" ? "normal" : "bold");
    doc.setFont("Tajawal", style === "regular" ? "normal" : "bold");
    const { codeMap } = (doc.getFont().metadata as unknown as { cmap: { unicode: { codeMap: Record<number, number> } } }).cmap.unicode;
    for (let code = 0xfe80; code <= 0xfefc; code++) {
      const base = String.fromCharCode(code).normalize("NFKC");
      if (!codeMap[code] && base.length === 1 && codeMap[base.charCodeAt(0)]) codeMap[code] = codeMap[base.charCodeAt(0)];
    }
  }
  doc.setLanguage("ar-SA");
  const draftLabel = data.documentType === "debit" ? "إشعار مدين" : data.quote ? `${data.quote.draft ? "مسودة عرض سعر" : "عرض سعر"}${data.quote.number ? ` رقم ${data.quote.number}` : " غير محفوظ"}` : data.issued ? data.issued.invoiceType === "simplified" ? "فاتورة ضريبية مبسطة" : "فاتورة ضريبية" : data.savedDraft ? "مسودة فاتورة غير معتمدة" : "معاينة غير محفوظة";
  doc.setProperties({ title: draftLabel, creator: "Barnda" });
  const width = doc.internal.pageSize.getWidth(), margin = data.thermal ? 5 : 14;
  const table = (body: string[][], head?: string[][], headerPanel = false) => autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5 : 14,
    margin: { left: headerPanel ? margin + 44 : margin, right: margin, top: 14, bottom: 15 }, body, head,
    styles: { font: "Tajawal", fontSize: data.thermal ? 8 : 9.5, halign: "right", cellPadding: data.thermal ? 1.5 : 2.4, overflow: "linebreak", textColor: [41, 37, 30] },
    headStyles: { fillColor: [41, 37, 30], textColor: [255, 254, 250], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 242, 235] }, theme: "striped", rowPageBreak: "avoid",
    columnStyles: !data.thermal && head?.[0]?.length === 7 ? { 0: { cellWidth: 22 }, 1: { cellWidth: 22 }, 2: { cellWidth: 30 }, 3: { cellWidth: 22 }, 4: { cellWidth: 24 }, 5: { cellWidth: 20 }, 6: { cellWidth: 42 } } : undefined,
  });
  const drawQr = (x: number, y: number) => {
    const qr = qrcode(0, "M"); qr.addData(companyInvoiceQr(data)); qr.make();
    const size = 36, count = qr.getModuleCount(), cell = size / (count + 8);
    doc.setFillColor(255, 255, 255).rect(x, y, size, size, "F").setFillColor(0, 0, 0);
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) doc.rect(x + (col + 4) * cell, y + (row + 4) * cell, cell + .01, cell + .01, "F");
  };
  table([[data.brand], [draftLabel], [data.customer], ...(data.taxNumber ? [[`الرقم الضريبي: ${data.taxNumber}`]] : [])], undefined, !!data.issued && !data.thermal);
  if (data.quote) table([[data.quote.date, "تاريخ العرض"], [data.quote.validUntil || "غير محدد", "صالح حتى"], [data.quote.warehouse, "المستودع"], ["عرض سعر وليس فاتورة ضريبية"]]);
  if (data.issued && !data.thermal) {
    drawQr(margin, 14);
    const previous = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable;
    previous.finalY = Math.max(previous.finalY, 50);
  }
  if (data.issued) table([
    [data.issued.displayNumber || String(data.issued.number), data.documentType === "debit" ? "رقم الإشعار" : "رقم الفاتورة"],
    ...(data.sourceNumber ? [[data.sourceNumber, "الفاتورة الأصلية"]] : []),
    ...(data.documentType === "debit" && data.reason ? [[data.reason, "سبب الإشعار المدين"]] : []),
    [new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date(data.issued.issuedAt)), "تاريخ الإصدار بتوقيت الرياض"],
    [data.issued.supplyDate, "تاريخ التوريد"],
    [data.issued.sellerName, "اسم البائع"], [data.issued.sellerVat, "الرقم الضريبي للبائع"], [data.issued.sellerAddress, "عنوان البائع"],
    [data.customer, "اسم المشتري"], ...(data.taxNumber ? [[data.taxNumber, "الرقم الضريبي للمشتري"]] : []), ...(data.issued.customerAddress ? [[data.issued.customerAddress, "عنوان المشتري"]] : []),
    [data.issued.taxInclusive ? "أسعار الوحدات شاملة الضريبة" : "أسعار الوحدات غير شاملة الضريبة", "الأسعار"], [data.currency && data.lines.some(line => line.vatRate !== undefined) ? [...new Set(data.lines.map(line => `${line.vatRate ?? 15}%`))].join(" / ") : "١٥٪", "نسبة ضريبة القيمة المضافة"],
  ]);
  if (currency !== "SAR") table([[currency, "عملة الفاتورة"], [String(data.exchangeRate ?? 1), "ريال لكل وحدة عملة"], ...(data.sar ? [[money(data.sar.tax), "الضريبة بالريال السعودي"], [money(data.sar.total), "الإجمالي بالريال السعودي"]] : [])]);
  if (data.thermal) {
    table(data.lines.map(line => [money(line.total), `${[line.name, line.description].filter(Boolean).join("\n")}\nالكمية: ${line.quantity}\nسعر الوحدة: ${money(line.price)}\nالخصم: ${money(line.discount)}\nالمبلغ الخاضع للضريبة: ${money(line.total - line.tax)}\nالضريبة: ${money(line.tax)}`]), [["الإجمالي", "البند"]]);
  } else {
    table(data.lines.map(line => [money(line.total), money(line.tax), money(line.total - line.tax), money(line.discount), money(line.price), String(line.quantity), [line.name, line.description].filter(Boolean).join("\n")]), [["الإجمالي", "الضريبة", "المبلغ الخاضع للضريبة", "الخصم", "سعر الوحدة", "الكمية", "البند"]]);
  }
  table([[money(data.subtotal), "المجموع قبل الخصم"], [money(data.discount), "الخصم"], ...(data.adjustment?.total ? [[money(data.adjustment.total), data.adjustment.name || "تسوية المبيعات"]] : []), [money(data.tax), "الضريبة"], [money(data.total), currency === "SAR" ? "الإجمالي بالريال السعودي" : `الإجمالي ${currency}`]]);
  const taxReasons = [...new Set(data.lines.map(line => line.exemptionReason).filter((reason): reason is string => !!reason))];
  if (taxReasons.length) table(taxReasons.map(reason => [reason]), [["أسباب المعاملة الضريبية"]]);
  if (data.creditApplied) table([[money(data.creditApplied), "رصيد مقدم مستخدم"], [money(data.cashPaid ?? 0), "تحصيل جديد عند الإصدار"]]);
  if (data.issued) table([[money(data.total - data.tax), "إجمالي المبلغ الخاضع للضريبة"], [money(data.paid ?? 0), "المبلغ المدفوع عند الإصدار"], [money(data.total - (data.paid ?? 0)), "المتبقي عند الإصدار"]]);
  else if (data.paid !== undefined) table([[money(data.paid), "مدفوع"], [money(data.total - data.paid), "المبلغ المستحق"]]);
  if (data.note) table([[data.note]], [["الملاحظات والشروط"]]);
  if (data.issued && data.thermal) {
    const size = 36;
    let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    if (y + size > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); y = 14; }
    drawQr(width - margin - size, y);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFont("Tajawal", "normal").setFontSize(8).setTextColor(122, 114, 101);
    doc.setDrawColor(198, 163, 93).setLineWidth(1).line(margin, 5, width - margin, 5);
    doc.text(`${draftLabel} — ${page} / ${pages}`, width - margin, doc.internal.pageSize.getHeight() - 6, { align: "right" });
  }
  return doc;
}

export async function createCompanyInvoicePreviewPdf(data: CompanyInvoicePreview): Promise<Blob> {
  async function font(path: string) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("تعذر تحميل خط الفاتورة أعد المحاولة");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  const [regular, bold] = await Promise.all([font("/fonts/tajawal-regular.ttf"), font("/fonts/tajawal-bold.ttf")]);
  return buildCompanyInvoicePreviewPdf(data, { regular, bold }).output("blob");
}
