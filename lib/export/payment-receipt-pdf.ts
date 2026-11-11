import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { PaymentReceiptData } from "@/lib/finance/payment-receipt";

export function buildPaymentReceiptPdf(data: PaymentReceiptData, thermal: boolean, fonts: { regular: string; bold: string }) {
  if (data.status === "pending" || data.status === "deleted" || data.amount <= 0) throw new Error("إيصال المدفوعات متاح بعد اكتمال التحصيل");
  const pdf = new jsPDF({ unit: "mm", format: thermal ? [80, 180] : "a4", compress: true });
  for (const [style, font] of Object.entries(fonts)) {
    const file = "Tajawal-" + style + ".ttf";
    pdf.addFileToVFS(file, font); pdf.addFont(file, "Tajawal", style === "regular" ? "normal" : "bold"); pdf.setFont("Tajawal", style === "regular" ? "normal" : "bold");
    const { codeMap } = (pdf.getFont().metadata as unknown as { cmap: { unicode: { codeMap: Record<number, number> } } }).cmap.unicode;
    for (let code = 0xfe80; code <= 0xfefc; code++) {
      const base = String.fromCharCode(code).normalize("NFKC");
      if (!codeMap[code] && base.length === 1 && codeMap[base.charCodeAt(0)]) codeMap[code] = codeMap[base.charCodeAt(0)];
    }
  }
  const title = data.refund ? "إيصال استرداد مدفوعات" : "إيصال مدفوعات";
  pdf.setLanguage("ar-SA"); pdf.setProperties({ title, creator: "Barnda" });
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "short", ...(/^\d{4}-\d{2}-\d{2}$/.test(data.date) ? {} : { timeStyle: "short" as const, hourCycle: "h23" as const }) }).format(new Date(data.date));
  const margin = thermal ? 5 : 18;
  autoTable(pdf, {
    startY: 12, margin: { left: margin, right: margin, top: 12, bottom: 12 },
    head: [[data.brand, title]],
    body: [[data.paymentNumber, "رقم عملية الدفع"], [data.invoiceNumber, "رقم الفاتورة"], [date, "تاريخ الدفع"], [data.customer, "العميل"], [data.method, "طريقة الدفع"], [data.account, "الحساب"], [data.actor, "بواسطة"], ...(data.reference ? [[data.reference, "رقم معرف"]] : []), [data.amount.toFixed(2) + " SAR", data.refund ? "المبلغ المسترد" : "المبلغ المدفوع"], ...(data.note ? [[data.note, "ملاحظات"]] : [])],
    styles: { font: "Tajawal", fontSize: thermal ? 9 : 12, halign: "right", cellPadding: thermal ? 2 : 4, overflow: "linebreak", textColor: [40, 35, 27] },
    headStyles: { fillColor: [40, 35, 27], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 1: { cellWidth: thermal ? 26 : 52 } }, alternateRowStyles: { fillColor: [248, 246, 241] }, theme: "striped", rowPageBreak: "avoid",
  });
  return pdf;
}

export async function createPaymentReceiptPdf(data: PaymentReceiptData, thermal: boolean) {
  async function font(file: string) {
    const response = await fetch("/fonts/" + file);
    if (!response.ok) throw new Error("تعذر تحميل خط الإيصال أعد المحاولة");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  }
  const [regular, bold] = await Promise.all([font("tajawal-regular.ttf"), font("tajawal-bold.ttf")]);
  return buildPaymentReceiptPdf(data, thermal, { regular, bold }).output("blob");
}
