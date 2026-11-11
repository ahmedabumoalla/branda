import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { JournalDetail } from "@/lib/finance/journal-detail";

export function journalPrintable(data: JournalDetail) {
  const cents = (value: number) => Math.round(value * 100);
  return !data.journalTruncated && data.journal.length > 0 && data.journal.length === data.journalCount &&
    data.journal.every(line => Number.isFinite(line.debit) && Number.isFinite(line.credit) && line.debit >= 0 && line.credit >= 0) &&
    cents(data.totals.debit) === cents(data.totals.credit) &&
    data.journal.reduce((sum, line) => sum + cents(line.debit), 0) === cents(data.totals.debit) &&
    data.journal.reduce((sum, line) => sum + cents(line.credit), 0) === cents(data.totals.credit);
}

export function buildFinanceJournalPdf(data: JournalDetail, brand: string, fonts: { regular: string; bold: string }) {
  if (!journalPrintable(data)) throw new Error("لا يمكن طباعة قيد غير مكتمل أو غير متوازن");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  for (const [style, font] of Object.entries(fonts)) {
    const file = "Tajawal-" + style + ".ttf";
    pdf.addFileToVFS(file, font); pdf.addFont(file, "Tajawal", style === "regular" ? "normal" : "bold"); pdf.setFont("Tajawal", style === "regular" ? "normal" : "bold");
    const { codeMap } = (pdf.getFont().metadata as unknown as { cmap: { unicode: { codeMap: Record<number, number> } } }).cmap.unicode;
    for (let code = 0xfe80; code <= 0xfefc; code++) {
      const base = String.fromCharCode(code).normalize("NFKC");
      if (!codeMap[code] && base.length === 1 && codeMap[base.charCodeAt(0)]) codeMap[code] = codeMap[base.charCodeAt(0)];
    }
  }
  const number = String(data.document.number).padStart(6, "0");
  pdf.setLanguage("ar-SA"); pdf.setProperties({ title: "قيد يومية " + number, creator: "Barnda" });
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "short" }).format(new Date(data.document.createdAt));
  autoTable(pdf, {
    startY: 16, margin: { left: 16, right: 16, top: 16, bottom: 16 }, theme: "plain",
    body: [[brand], ["قيد يومية #" + number], ["التاريخ: " + date], ...(data.document.note ? [[data.document.note]] : [])],
    styles: { font: "Tajawal", fontSize: 12, halign: "right", cellPadding: 2, textColor: [40, 35, 27], overflow: "linebreak" },
  });
  const top = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  autoTable(pdf, {
    startY: top, margin: { left: 16, right: 16, top: 16, bottom: 16 },
    head: [["دائن", "مدين", "الوصف", "الحساب", "رقم الحساب"]],
    body: data.journal.map(line => [line.credit ? line.credit.toFixed(2) : "", line.debit ? line.debit.toFixed(2) : "", line.memo || data.document.note, line.partyName ? line.accountName + " — " + line.partyName : line.accountName, line.accountCode]),
    foot: [[data.totals.credit.toFixed(2), data.totals.debit.toFixed(2), "", "الإجمالي SAR", ""]], showFoot: "lastPage",
    styles: { font: "Tajawal", fontSize: 10, halign: "right", cellPadding: 3, overflow: "linebreak", textColor: [40, 35, 27], lineColor: [232, 226, 215], lineWidth: .15 },
    headStyles: { fillColor: [248, 246, 241], textColor: [40, 35, 27], fontStyle: "bold" },
    footStyles: { fillColor: [248, 246, 241], textColor: [40, 35, 27], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 23 }, 1: { cellWidth: 23 }, 4: { cellWidth: 26 } }, theme: "grid", rowPageBreak: "avoid",
  });
  return pdf;
}

export async function createFinanceJournalPdf(data: JournalDetail, brand: string) {
  if (!journalPrintable(data)) throw new Error("لا يمكن طباعة قيد غير مكتمل أو غير متوازن");
  async function font(file: string) {
    const response = await fetch("/fonts/" + file);
    if (!response.ok) throw new Error("تعذر تحميل خط القيد أعد المحاولة");
    const bytes = new Uint8Array(await response.arrayBuffer()); let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  }
  const [regular, bold] = await Promise.all([font("tajawal-regular.ttf"), font("tajawal-bold.ttf")]);
  return buildFinanceJournalPdf(data, brand, { regular, bold }).output("blob");
}
