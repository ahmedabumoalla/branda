import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { PaymentReceiptData } from "@/lib/finance/payment-receipt";

type ReceiptFonts = { regular: string; bold: string };
export type PaymentReceiptIdentity = { logoDataUrl?: string | null; color?: string };
type Color = [number, number, number];
const ink: Color = [40, 35, 27], muted: Color = [108, 100, 89], line: Color = [225, 221, 212], paper: Color = [248, 247, 243];

function receiptColor(value?: string): Color {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return [40, 57, 48];
  const rgb = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  return rgb.map(channel => Math.round(channel * Math.min(1, 95 / luminance))) as Color;
}

/** Shared renderer uses posted payment values and the authorized brand identity. */
export function buildPaymentReceiptPdf(data: PaymentReceiptData, thermal: boolean, fonts: ReceiptFonts, identity: PaymentReceiptIdentity = {}) {
  if (data.status === "pending" || data.status === "deleted" || !Number.isFinite(data.amount) || data.amount <= 0) throw new Error("إيصال المدفوعات متاح بعد اكتمال التحصيل");
  const pdf = new jsPDF({ unit: "mm", format: thermal ? [80, 180] : "a4", compress: true, putOnlyUsedFonts: true });
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
  const amountLabel = data.refund ? "المبلغ المسترد للعميل" : "المبلغ المستلم";
  const accent = receiptColor(identity.color);
  pdf.setLanguage("ar-SA"); pdf.setProperties({ title: `${title} ${data.paymentNumber}`, subject: data.brand, creator: "Barnda" });
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "short", ...(/^\d{4}-\d{2}-\d{2}$/.test(data.date) ? {} : { timeStyle: "short" as const, hourCycle: "h23" as const }) }).format(new Date(data.date));
  const margin = thermal ? 5 : 18, width = pdf.internal.pageSize.getWidth(), right = width - margin, available = width - margin * 2;
  const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data.amount);
  const text = (value: string, x: number, y: number, size = 11, bold = false, color: Color = ink, align: "right" | "center" | "left" = "right") => {
    pdf.setFont("Tajawal", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color).text(value, x, y, { align });
  };
  const wrapped = (value: string, x: number, y: number, maxWidth: number, size: number, align: "right" | "center" = "right") => {
    pdf.setFont("Tajawal", "bold").setFontSize(size).setTextColor(...ink);
    const rows = pdf.splitTextToSize(value, maxWidth) as string[];
    pdf.text(rows, x, y, { align, lineHeightFactor: 1.3 });
    return y + Math.max(0, rows.length - 1) * size * .3528 * 1.3;
  };
  const logo = (x: number, y: number, boxWidth: number, boxHeight: number) => {
    if (!identity.logoDataUrl) return false;
    const image = pdf.getImageProperties(identity.logoDataUrl);
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    const imageWidth = image.width * scale, imageHeight = image.height * scale;
    pdf.addImage(identity.logoDataUrl, "PNG", x + (boxWidth - imageWidth) / 2, y + (boxHeight - imageHeight) / 2, imageWidth, imageHeight);
    return true;
  };

  let y: number;
  if (thermal) {
    const hasLogo = logo((width - 38) / 2, 6, 38, 18);
    y = wrapped(data.brand, width / 2, hasLogo ? 30 : 12, available, 12, "center") + 7;
    text(title, width / 2, y, 12, true, ink, "center");
    y += 6;
    pdf.setDrawColor(...line).line(margin, y, right, y);
    y += 4;
    pdf.setFillColor(...paper).roundedRect(margin, y, available, 26, 2, 2, "F");
    text(amountLabel, width / 2, y + 6, 9, false, muted, "center");
    let amountSize = 23;
    pdf.setFont("Tajawal", "bold").setFontSize(amountSize);
    while (pdf.getTextWidth(money) > available - 8 && amountSize > 10) pdf.setFontSize(--amountSize);
    text(money, width / 2, y + 16, amountSize, true, ink, "center");
    text("ريال سعودي", width / 2, y + 22, 8, false, muted, "center");
    y += 31;
  } else {
    pdf.setFillColor(...accent).rect(margin, 12, available, 1.2, "F");
    const hasLogo = logo(right - 50, 20, 50, 23);
    const brandBottom = wrapped(data.brand, right, hasLogo ? 50 : 32, 82, 13);
    text(title, margin, 30, 23, true, accent, "left");
    text(data.refund ? "إثبات إعادة مبلغ للعميل" : "إثبات استلام دفعة من العميل", margin, 39, 11, false, muted, "left");
    y = Math.max(60, brandBottom + 12);
    autoTable(pdf, {
      startY: y, margin: { left: margin, right: margin, top: 20, bottom: 18 }, theme: "plain",
      body: [[date, "تاريخ الدفع", data.paymentNumber, "رقم الإيصال"]],
      styles: { font: "Tajawal", fontSize: 11, halign: "right", cellPadding: { top: 4, bottom: 4, left: 3, right: 3 }, valign: "middle", overflow: "linebreak", textColor: ink, fillColor: paper },
      columnStyles: { 0: { cellWidth: 50, halign: "left" }, 1: { cellWidth: 30, textColor: muted }, 2: { cellWidth: available - 112, fontStyle: "bold" }, 3: { cellWidth: 32, textColor: muted } },
    });
    y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
    pdf.setFillColor(...accent).roundedRect(margin, y, available, 35, 3, 3, "F");
    text(amountLabel, right - 8, y + 11, 13, true, [255, 255, 255]);
    text(data.refund ? "تمت إعادة المبلغ الموضح" : "تم تسجيل الدفعة بنجاح", right - 8, y + 23, 10, false, [234, 236, 229]);
    let amountSize = 32;
    pdf.setFont("Tajawal", "bold").setFontSize(amountSize);
    while (pdf.getTextWidth(money) > 82 && amountSize > 16) pdf.setFontSize(--amountSize);
    text(money, margin + 8, y + 20, amountSize, true, [255, 255, 255], "left");
    text("ريال سعودي", margin + 8, y + 28, 10, false, [234, 236, 229], "left");
    y += 47;
    text("بيانات العميل والفاتورة", right, y, 12, true, accent);
    y += 5;
  }
  const repeatedHeaders = new Set<number>([1]);
  const continuation = () => {
    const page = pdf.getCurrentPageInfo().pageNumber;
    if (repeatedHeaders.has(page)) return;
    repeatedHeaders.add(page);
    text(title, right, thermal ? 9 : 14, thermal ? 10 : 12, true, accent);
  };
  const table = (body: string[][], startY: number) => {
    autoTable(pdf, {
      startY, margin: { left: margin, right: margin, top: thermal ? 16 : 23, bottom: thermal ? 17 : 27 },
      body, theme: "plain", rowPageBreak: "avoid", willDrawPage: continuation,
      styles: { font: "Tajawal", fontSize: thermal ? 9 : 12, halign: "right", valign: "middle", cellPadding: thermal ? { top: 2, bottom: 2, left: 0, right: 0 } : { top: 5, bottom: 5, left: 4, right: 4 }, textColor: ink, overflow: "linebreak", lineColor: line, lineWidth: { bottom: .15 } },
      columnStyles: { 0: { cellWidth: available - (thermal ? 24 : 43), fontStyle: "bold" }, 1: { cellWidth: thermal ? 24 : 43, textColor: muted, fontSize: thermal ? 8 : 10 } },
    });
    return (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };
  const accountLabel = data.refund ? "حساب الاسترداد" : "حساب التحصيل";
  y = table(thermal
    ? [[data.paymentNumber, "رقم الإيصال"], [data.invoiceNumber, "رقم الفاتورة"], [date, "تاريخ الدفع"], [data.customer, data.refund ? "أعيد إلى" : "استلمنا من"], [data.method, "طريقة الدفع"], [data.account, accountLabel], [data.actor, "بواسطة"]]
    : [[data.customer, data.refund ? "أعيد المبلغ إلى" : "استلمنا من"], [data.invoiceNumber, "عن الفاتورة رقم"]], y);
  if (!thermal) {
    y += 12;
    text("تفاصيل الدفع", right, y, 12, true, accent);
    y = table([[data.method, "طريقة الدفع"], [data.account, accountLabel], [data.actor, "مسجل العملية"], ...(data.reference ? [[data.reference, "مرجع الدفع"]] : [])], y + 5);
  } else if (data.reference) y = table([[data.reference, "مرجع الدفع"]], y);
  if (data.details || data.note) table([...(data.details ? [[data.details, "بيانات الدفع"]] : []), ...(data.note ? [[data.note, "ملاحظات"]] : [])], y + (thermal ? 3 : 7));
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    const bottom = pdf.internal.pageSize.getHeight();
    pdf.setDrawColor(...line).line(margin, bottom - (thermal ? 14 : 23), right, bottom - (thermal ? 14 : 23));
    text("شكرًا لتعاملكم معنا", width / 2, bottom - (thermal ? 9 : 16), thermal ? 8 : 10, true, accent, "center");
    text(`${page} / ${pages}`, margin, bottom - (thermal ? 4 : 9), 7, false, muted, "left");
    text("نسخة العميل", right, bottom - (thermal ? 4 : 9), thermal ? 7 : 8, false, muted);
  }
  return pdf;
}

let fontAssets: Promise<ReceiptFonts> | undefined;
async function paymentReceiptFonts() {
  async function font(file: string) {
    const response = await fetch("/fonts/" + file);
    if (!response.ok) throw new Error("تعذر تحميل خط الإيصال أعد المحاولة");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  }
  // Share only public fonts, never customer data or private brand identity.
  fontAssets ??= Promise.all([font("tajawal-regular.ttf"), font("tajawal-bold.ttf")]).then(([regular, bold]) => ({ regular, bold })).catch(error => { fontAssets = undefined; throw error; });
  return fontAssets;
}

async function paymentReceiptIdentity(slug?: string): Promise<PaymentReceiptIdentity> {
  if (!slug) return {};
  const response = await fetch(`/api/finance/${encodeURIComponent(slug)}/receipt-brand`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("تعذر تحميل هوية العلامة للإيصال أعد المحاولة");
  const brand = await response.json() as { logoUrl?: unknown; color?: unknown };
  const color = typeof brand.color === "string" ? brand.color : undefined;
  if (!brand.logoUrl) return { color };
  if (typeof brand.logoUrl !== "string") throw new Error("تعذر تحميل شعار العلامة");
  const source = brand.logoUrl;
  if (!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(source)) {
    const url = new URL(source, window.location.origin);
    if ((url.protocol !== "https:" && url.origin !== window.location.origin) || url.username || url.password) throw new Error("تعذر تحميل شعار العلامة");
  }
  const logoDataUrl = await new Promise<string>((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error("تعذر تحميل شعار العلامة أعد المحاولة")); }, 12_000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      window.clearTimeout(timer);
      try {
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error("تعذر تجهيز شعار العلامة");
        const scale = Math.min(1, 900 / image.naturalWidth, 450 / image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("تعذر تجهيز شعار العلامة");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) { reject(error); }
    };
    image.onerror = () => { window.clearTimeout(timer); reject(new Error("تعذر تحميل شعار العلامة أعد المحاولة")); };
    image.src = source;
  });
  return { color, logoDataUrl };
}

export async function createPaymentReceiptPdf(data: PaymentReceiptData, thermal: boolean) {
  const [fonts, identity] = await Promise.all([paymentReceiptFonts(), paymentReceiptIdentity(data.brandSlug)]);
  return buildPaymentReceiptPdf(data, thermal, fonts, identity).output("blob");
}
