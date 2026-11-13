import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export async function createFinancePriceListPdf(input: { brand: string; name: string; active: boolean; rows: { code: string; name: string; category: string; price: number }[] }) {
  const fonts = await Promise.all(["regular", "bold"].map(async style => {
    const response = await fetch(`/fonts/tajawal-${style}.ttf`);
    if (!response.ok) throw new Error("تعذر تحميل خط قائمة الأسعار أعد المحاولة");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { style, value: btoa(binary) };
  }));
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  for (const font of fonts) {
    const file = `Tajawal-${font.style}.ttf`, style = font.style === "bold" ? "bold" : "normal";
    pdf.addFileToVFS(file, font.value); pdf.addFont(file, "Tajawal", style); pdf.setFont("Tajawal", style);
    const { codeMap } = (pdf.getFont().metadata as unknown as { cmap: { unicode: { codeMap: Record<number, number> } } }).cmap.unicode;
    for (let code = 0xfe80; code <= 0xfefc; code++) {
      const base = String.fromCharCode(code).normalize("NFKC");
      if (!codeMap[code] && base.length === 1 && codeMap[base.charCodeAt(0)]) codeMap[code] = codeMap[base.charCodeAt(0)];
    }
  }
  pdf.setLanguage("ar-SA"); pdf.setProperties({ title: input.name, creator: "Branda" });
  autoTable(pdf, { body: [[input.brand], [`قائمة الأسعار: ${input.name}`], [input.active ? "نشط" : "غير نشط"], ["أسعار الوحدة بالريال السعودي"]], startY: 15, theme: "plain", styles: { font: "Tajawal", halign: "right", fontSize: 11, textColor: [40, 35, 27] } });
  const startY = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 50) + 6;
  autoTable(pdf, { head: [["سعر الوحدة", "التصنيف", "البند", "الكود"]], body: input.rows.map(row => [new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(row.price), row.category || "غير مسجل", row.name, row.code]), startY, margin: { top: 15, bottom: 15 }, styles: { font: "Tajawal", halign: "right", fontSize: 10, overflow: "linebreak", cellPadding: 3, lineColor: [232, 226, 215], lineWidth: .15 }, headStyles: { fontStyle: "bold", fillColor: [248, 246, 241], textColor: [40, 35, 27] }, columnStyles: { 0: { cellWidth: 28 }, 3: { cellWidth: 45 } }, theme: "grid", rowPageBreak: "avoid" });
  return pdf.output("blob");
}
