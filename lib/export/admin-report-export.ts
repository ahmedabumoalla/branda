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
