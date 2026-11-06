import "server-only";
import ExcelJS from "exceljs";
import { isCurrentSubscription } from "@/lib/platform/active-subscription";
import type { AdminBrandExportBrand, AdminBrandExportSnapshot, AdminBrandExportSubscription } from "@/lib/data/admin-brand-export";

export const BRAND_EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const BRAND_EXCEL_COLUMNS = ["العلامة التجارية", "تاريخ الانضمام", "حالة الحساب", "حالة الاشتراك", "المتبقي في الاشتراك بالأيام"];
const DAY_MS = 86_400_000;
const saudiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
const saudiTimestamp = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function timestamp(value: string | null | undefined) {
  const result = value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : null;
}

function isPrepared(row: AdminBrandExportSubscription) {
  return row.status === "trialing" && row.activation_source === "admin_prepared_trial";
}

/** Match current service access: active assignments precede trials, newest first */
export function selectExportSubscription(rows: AdminBrandExportSubscription[], now: number) {
  const ordered = [...rows].sort((a, b) => (timestamp(b.created_at) ?? 0) - (timestamp(a.created_at) ?? 0) || b.id.localeCompare(a.id));
  const current = ordered.filter(row => !isPrepared(row) && isCurrentSubscription(row, now));
  return current.find(row => row.status === "active") ?? current[0] ?? ordered[0] ?? null;
}

export function exportSubscriptionCells(row: AdminBrandExportSubscription | null, now: number): [string, string | number] {
  if (!row) return ["بدون اشتراك", "لا يوجد اشتراك"];
  const trial = row.status === "trialing";
  if (isPrepared(row)) return ["فترة تجربة لم تبدأ", "تبدأ بعد إرسال بيانات الدخول"];
  if (row.status === "cancelled") return ["اشتراك ملغي", "غير متاح"];
  const start = timestamp(row.started_at);
  const end = timestamp(row.expires_at);
  if (row.status === "expired" || (end !== null && end <= now)) return [trial ? "فترة تجربة منتهية" : "اشتراك منتهي", 0];
  if (["pending", "past_due"].includes(row.status)) return ["بانتظار التفعيل", "لم يبدأ بعد"];
  if (row.platform_plans?.active !== true || (row.started_at && start === null) || (row.expires_at && end === null)) return ["اشتراك غير فعال", "غير متاح"];
  if (start !== null && start > now) return [trial ? "فترة تجربة لم تبدأ" : "اشتراك لم يبدأ", "لم يبدأ بعد"];
  if (!isCurrentSubscription(row, now)) return ["اشتراك غير فعال", "غير متاح"];
  return [trial ? "فترة تجربة" : "اشتراك فعال", end === null ? "بدون تاريخ انتهاء" : Math.ceil((end - now) / DAY_MS)];
}

function cleanText(value: string) {
  // Keep every customer value as text, including names beginning with = or +
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function brandExportCells(brand: AdminBrandExportBrand, now: number) {
  const joined = timestamp(brand.createdAt);
  // Excel date cells have no timezone: store the actual Riyadh calendar day
  const joinedDate = joined === null ? "غير متاح" : new Date(`${saudiDate.format(new Date(joined))}T00:00:00Z`);
  return [cleanText(brand.name), joinedDate, brand.accountStatus === "active" ? "نشط" : "موقوف", ...exportSubscriptionCells(selectExportSubscription(brand.subscriptions, now), now)];
}

export async function buildBrandDirectoryExcel(snapshot: AdminBrandExportSnapshot) {
  const now = timestamp(snapshot.exportedAt);
  if (now === null) throw new Error("Invalid export timestamp");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "برندة";
  workbook.created = new Date(now);
  workbook.modified = new Date(now);
  workbook.title = "تقرير العلامات التجارية";
  const sheet = workbook.addWorksheet("العلامات التجارية", {
    views: [{ state: "frozen", ySplit: 5, topLeftCell: "A6", rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [36, 23, 20, 30, 36].map(width => ({ width }));
  sheet.mergeCells("A1:E1");
  sheet.getCell("A1").value = "برندة | تقرير العلامات التجارية";
  sheet.getRow(1).height = 38;
  sheet.mergeCells("A2:E2");
  sheet.getCell("A2").value = `تاريخ التصدير ${saudiTimestamp.format(new Date(now))} بتوقيت السعودية | ${snapshot.brands.length} علامة`;
  sheet.getRow(2).height = 28;
  sheet.mergeCells("A3:E3");
  sheet.getCell("A3").value = "المدة المتبقية وقت التصدير ويحتسب جزء اليوم يومًا كاملًا | عند تعدد الاشتراكات يظهر الاشتراك الحالي الأساسي";
  sheet.getRow(3).height = 30;
  sheet.getRow(4).height = 10;
  sheet.addTable({
    name: "BrandaBrands",
    ref: "A5",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium4", showRowStripes: true },
    columns: BRAND_EXCEL_COLUMNS.map(name => ({ name, filterButton: true })),
    rows: snapshot.brands.map(brand => brandExportCells(brand, now)),
  });
  const brown = "FF3D2418", gold = "FFE8BF77", ink = "FF30251D";
  sheet.eachRow((row, index) => {
    row.height = index >= 5 ? 33 : row.height;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: "Tahoma", size: index === 1 ? 18 : 11, color: { argb: ink } };
      cell.alignment = { vertical: "middle", horizontal: "right", readingOrder: "rtl", wrapText: true };
      if (index === 1 || index === 5) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brown } };
        cell.font = { ...cell.font, bold: true, color: { argb: index === 1 ? gold : "FFFFFFFF" } };
      } else if (index > 5) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF8F2E7" : "FFFFFFFF" } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE6D8C3" } } };
      } else if (index === 2 || index === 3) {
        cell.font = { ...cell.font, size: 10, color: { argb: "FF6D5A47" } };
      }
    });
    if (index > 5) {
      row.getCell(2).numFmt = "yyyy-mm-dd";
      row.getCell(5).numFmt = '0" يوم"';
      row.getCell(5).alignment = { ...row.getCell(5).alignment, horizontal: "center" };
      row.height = Math.max(33, Math.min(90, Math.ceil(String(row.getCell(1).value).length / 30) * 19));
    }
  });
  sheet.pageSetup.printTitlesRow = "1:5";
  sheet.pageSetup.printArea = `A1:E${Math.max(5, snapshot.brands.length + 5)}`;
  sheet.headerFooter.oddFooter = "&Cبرندة&R&P / &N";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
