import "server-only";
import ExcelJS from "exceljs";
import type { BrandContactReport } from "@/lib/data/admin-brand-contact-report";

const DAY_TIME = "yyyy-mm-dd hh:mm";
const columns = [
  ["اسم العلامة", 33], ["جوال المالك", 22], ["تاريخ الانضمام", 21],
  ["حالة الحساب", 24], ["حالة تسليم بيانات الدخول", 30], ["حالة التجربة", 29],
  ["بداية التجربة", 21], ["مدة التجربة (يوم)", 20], ["آخر نشاط مسجّل", 31], ["وقت آخر نشاط", 22],
] as const;

function riyadhTime(value: string | null) {
  // Excel dates have no timezone. All report dates are local to Riyadh (UTC+3).
  return value === null ? null : new Date(Date.parse(value) + 3 * 60 * 60 * 1000);
}

export async function buildBrandContactExcel({ rows, exportedAt }: BrandContactReport) {
  const book = new ExcelJS.Workbook();
  book.creator = "برندة";
  book.created = new Date(exportedAt);
  const sheet = book.addWorksheet("متابعة التفعيل", {
    views: [{ state: "frozen", ySplit: 2, rightToLeft: true, showGridLines: false }],
  });
  sheet.columns = columns.map(([, width]) => ({ width }));
  sheet.mergeCells("A1:J1");
  const title = sheet.getCell("A1");
  title.value = "متابعة تفعيل العلامات التجارية · التواريخ بتوقيت الرياض";
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF342519" } };
  title.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
  sheet.getRow(1).height = 33;
  const header = sheet.addRow(columns.map(([label]) => label));
  header.height = 26;
  header.font = { bold: true, color: { argb: "FF392B1B" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8D5B0" } };
  header.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
  const names = new Intl.Collator("ar");
  for (const item of [...rows].sort((a,b) => names.compare(a.brand_name,b.brand_name))) {
    const row = sheet.addRow([item.brand_name, item.owner_phone || "غير مسجّل", riyadhTime(item.joined_at),
      item.account_status, item.handoff_status, item.trial_state, riyadhTime(item.trial_started_at),
      item.trial_days, item.last_activity || "لا يوجد نشاط موثّق", riyadhTime(item.last_activity_at)]);
    row.height = 23;
    row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
    row.getCell(2).numFmt = "@";
    row.getCell(2).alignment = { horizontal: "right", vertical: "middle", readingOrder: "ltr" };
    for (const col of [3, 7, 10]) row.getCell(col).numFmt = DAY_TIME;
    if (row.number % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F4ED" } };
  }
  sheet.autoFilter = { from: "A2", to: `J${sheet.rowCount}` };
  return new Uint8Array(await book.xlsx.writeBuffer());
}
