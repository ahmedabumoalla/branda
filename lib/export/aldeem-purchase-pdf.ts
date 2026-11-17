import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type AldeemPurchasePrintModel = {
  brand: string; title: string; number: string; date: string; supplier: string;
  warehouse?: string; currency: string; exchangeRate?: number; status?: string; sourceNumber?: string;
  note: string; terms?: string; showPrices?: boolean;
  lines: { name: string; unit?: string; quantity: number; price: number; discount: number; tax: number; total: number }[];
  total: number; tax: number; paid?: number; paidLabel?: string; outstanding?: number;
};

let fontsPromise: Promise<{ regular: string; bold: string }> | undefined;
function loadFonts() {
  if (!fontsPromise) {
    const font = async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error("تعذر تحميل خط المستند أعد المحاولة");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    };
    fontsPromise = Promise.all([font("/fonts/tajawal-regular.ttf"), font("/fonts/tajawal-bold.ttf")])
      .then(([regular, bold]) => ({ regular, bold })).catch(error => { fontsPromise = undefined; throw error; });
  }
  return fontsPromise;
}

/** Generates only on explicit preview/print intent, with no customer data retained globally. */
export async function createAldeemPurchasePdf(model: AldeemPurchasePrintModel): Promise<Blob> {
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
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
  doc.setProperties({ title: `${model.title} ${model.number}`, creator: "Barnda" });
  const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const table = (body: string[][], head?: string[][]) => autoTable(doc, {
    startY: ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 9) + 5,
    margin: { top: 14, bottom: 18, right: 14, left: 14 }, body, head, theme: "striped", rowPageBreak: "avoid",
    styles: { font: "Tajawal", fontSize: 10, halign: "right", cellPadding: 3, overflow: "linebreak", textColor: [81, 69, 82] },
    headStyles: { fillColor: [164, 55, 166], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 245, 249] },
  });
  table([[model.brand], [`${model.title}${model.number ? ` #${model.number}` : ""}`]], [[model.status ?? model.title]]);
  table([[model.date, "تاريخ المستند"], [model.supplier || "غير محدد", "المورد"],
    ...(model.warehouse ? [[model.warehouse, "المستودع"]] : []),
    ...(model.sourceNumber ? [[model.sourceNumber, "المستند الأصلي"]] : []),
    ...(model.showPrices === false ? [] : [[model.currency, "العملة"], ...(model.currency !== "SAR" && model.exchangeRate ? [[String(model.exchangeRate), "ريال لكل وحدة عملة"]] : [])]),
  ]);
  if (model.showPrices === false) table(model.lines.map(line => [String(line.quantity), line.unit ?? "", line.name]), [["الكمية", "الوحدة", "الصنف"]]);
  else {
    table(model.lines.map(line => [money(line.total), money(line.tax), money(line.discount), money(line.price), `${line.quantity} ${line.unit ?? ""}`, line.name]), [["الإجمالي", "الضريبة", "الخصم", "سعر الوحدة", "الكمية", "الصنف"]]);
    table([[money(model.total - model.tax), "الإجمالي قبل الضريبة"], [money(model.tax), "الضريبة"], [money(model.total), `الإجمالي ${model.currency}`],
      ...(model.paid !== undefined ? [[money(model.paid), model.paidLabel ?? "المدفوع"]] : []), ...(model.outstanding !== undefined ? [[money(model.outstanding), "المتبقي"]] : []),
    ]);
  }
  if (model.note) table([[model.note]], [["ملاحظات"]]);
  if (model.terms) table([[model.terms]], [["الشروط"]]);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFont("Tajawal", "normal").setFontSize(9).setTextColor(127, 112, 128);
    doc.text(`${page} / ${pages}`, 105, 289, { align: "center" });
  }
  return doc.output("blob");
}
