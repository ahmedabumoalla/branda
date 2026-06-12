"use client";

export type ThermalPaperSize = "58mm" | "80mm";

export type ThermalLine = {
  label?: string;
  value: string | number | null | undefined;
  strong?: boolean;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  }[char] ?? char));
}

function normalize(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function thermalRows(lines: ThermalLine[]) {
  return lines
    .map((line) => {
      const value = escapeHtml(normalize(line.value));
      const label = line.label ? `<span>${escapeHtml(line.label)}</span>` : "";
      return `<div class=\"row ${line.strong ? "strong" : ""}\">${label}<b>${value}</b></div>`;
    })
    .join("");
}

export function thermalItems(items: Array<{ name: string; quantity?: number; price?: number | string; notes?: string }>) {
  if (!items.length) return "";
  return `<div class=\"items\">${items
    .map((item) => {
      const qty = item.quantity ?? 1;
      const price = item.price == null ? "" : `<b>${escapeHtml(String(item.price))}</b>`;
      const notes = item.notes ? `<small>${escapeHtml(item.notes)}</small>` : "";
      return `<div class=\"item\"><div><b>${escapeHtml(item.name)}</b><span>× ${qty}</span>${notes}</div>${price}</div>`;
    })
    .join("")}</div>`;
}

export function printThermalReceipt({
  title,
  subtitle,
  cafeName,
  lines,
  items = [],
  footer = "برندة — Barndaksa",
  paperSize = "80mm",
}: {
  title: string;
  subtitle?: string;
  cafeName?: string;
  lines: ThermalLine[];
  items?: Array<{ name: string; quantity?: number; price?: number | string; notes?: string }>;
  footer?: string;
  paperSize?: ThermalPaperSize;
}) {
  const width = paperSize === "58mm" ? "58mm" : "80mm";
  const html = `<!doctype html><html dir=\"rtl\" lang=\"ar\"><head><meta charset=\"utf-8\"><title>${escapeHtml(title)}</title><style>
    @page{size:${width} auto;margin:0}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:#111;font-family:Arial,Tahoma,sans-serif;font-size:${paperSize === "58mm" ? "10px" : "11px"};line-height:1.55}
    .receipt{width:${width};padding:8px 7px 12px;margin:0 auto}
    h1{font-size:${paperSize === "58mm" ? "15px" : "17px"};margin:0 0 4px;text-align:center;font-weight:900}
    h2{font-size:${paperSize === "58mm" ? "12px" : "13px"};margin:0 0 6px;text-align:center;font-weight:900}
    .sub{text-align:center;font-size:10px;font-weight:700;margin-bottom:8px}
    .divider{border-top:1px dashed #111;margin:8px 0}
    .row{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;padding:2px 0;border-bottom:1px dotted #ddd}
    .row span{color:#333;white-space:nowrap}.row b{font-weight:900;text-align:left;word-break:break-word}.row.strong{font-size:1.08em;border-bottom:1px dashed #111;padding:5px 0}
    .items{margin-top:6px}.item{display:flex;justify-content:space-between;gap:6px;padding:5px 0;border-bottom:1px dotted #bbb}.item div{display:grid;gap:1px}.item span,.item small{font-size:.9em;color:#333}
    .footer{text-align:center;font-weight:900;margin-top:10px}.cut{text-align:center;letter-spacing:2px;margin-top:8px;color:#444}
    @media screen{body{background:#eee}.receipt{background:#fff;min-height:100vh}}
  </style></head><body><section class=\"receipt\"><h1>${escapeHtml(title)}</h1>${cafeName ? `<h2>${escapeHtml(cafeName)}</h2>` : ""}${subtitle ? `<div class=\"sub\">${escapeHtml(subtitle)}</div>` : ""}<div class=\"divider\"></div>${thermalRows(lines)}${items.length ? `<div class=\"divider\"></div>${thermalItems(items)}` : ""}<div class=\"divider\"></div><div class=\"footer\">${escapeHtml(footer)}</div><div class=\"cut\">••••••••••••••</div><script>window.onload=()=>{window.focus();window.print();}</script></section></body></html>`;
  const popup = window.open("", "_blank", "width=420,height=720");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

export function printThermalTable({
  title,
  cafeName,
  rows,
  paperSize = "80mm",
}: {
  title: string;
  cafeName?: string;
  rows: ThermalLine[];
  paperSize?: ThermalPaperSize;
}) {
  printThermalReceipt({ title, cafeName, lines: rows, paperSize });
}
