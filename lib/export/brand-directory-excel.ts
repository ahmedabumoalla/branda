import "server-only";
import ExcelJS from "exceljs";
import { isCurrentSubscription } from "@/lib/platform/active-subscription";
import type { AdminBrandExportBrand, AdminBrandExportSnapshot, AdminBrandExportSubscription } from "@/lib/data/admin-brand-export";

export const BRAND_EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const BRAND_EXCEL_COLUMNS = ["اسم العلامة التجارية", "تاريخ الانضمام وإنشاء الحساب", "حالة الحساب", "تاريخ بداية الباقة الحالية", "تاريخ نهاية الباقة الحالية", "المدة المتبقية بالأيام", "إجمالي مدفوعات العلامة", "عدد التجديدات"];
type ExportCell = string | number | Date;
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

/** Excel date cells have no timezone: store the actual Riyadh calendar day */
function saudiDay(value: number) {
  return new Date(`${saudiDate.format(new Date(value))}T00:00:00Z`);
}

/** Account state, package start, package end and remaining days of one package */
export function exportSubscriptionCells(row: AdminBrandExportSubscription | null, now: number): [string, ExportCell, ExportCell, ExportCell] {
  const same = (state: string, text: string): [string, ExportCell, ExportCell, ExportCell] => [state, text, text, text];
  if (!row) return same("بدون اشتراك", "لا يوجد");
  const trial = row.status === "trialing";
  // Prepared by the administration: the trial clock starts when the owner receives the login details
  if (isPrepared(row)) return ["جاهز ولم تبدأ التجربة", "تبدأ بعد إرسال بيانات الدخول", "لم تبدأ بعد", "لم تبدأ بعد"];
  if (row.status === "cancelled") return same("اشتراك ملغي", "غير متاح");
  const start = timestamp(row.started_at);
  const end = timestamp(row.expires_at);
  if (row.status === "expired" || (end !== null && end <= now)) {
    return [trial ? "فترة تجربة منتهية" : "اشتراك منتهي", start === null ? "غير متاح" : saudiDay(start), end === null ? "غير متاح" : saudiDay(end), 0];
  }
  if (["pending", "past_due"].includes(row.status)) return same("بانتظار التفعيل", "لم تبدأ بعد");
  if (row.platform_plans?.active !== true || (row.started_at && start === null) || (row.expires_at && end === null)) return same("اشتراك غير فعال", "غير متاح");
  const endDay = end === null ? "بدون تاريخ انتهاء" : saudiDay(end);
  if (start !== null && start > now) return [trial ? "فترة تجربة لم تبدأ" : "اشتراك لم يبدأ", saudiDay(start), endDay, "لم تبدأ بعد"];
  if (!isCurrentSubscription(row, now)) return same("اشتراك غير فعال", "غير متاح");
  return [trial ? "في فترة تجربة" : "نشط", start === null ? "غير محدد" : saudiDay(start), endDay, end === null ? "بدون تاريخ انتهاء" : Math.ceil((end - now) / DAY_MS)];
}

function cleanText(value: string) {
  // Keep every customer value as text, including names beginning with = or +
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function brandExportCells(brand: AdminBrandExportBrand, now: number): (ExportCell | null)[] {
  const joined = timestamp(brand.createdAt);
  const [state, start, end, remaining] = exportSubscriptionCells(selectExportSubscription(brand.subscriptions, now), now);
  const current = brand.subscriptions.filter(row => !isPrepared(row) && isCurrentSubscription(row, now));
  const mixed = current.length > 1 && new Set(current.map(row => timestamp(row.expires_at))).size > 1;
  // Payments and renewals are left blank for the administration to fill in
  return [cleanText(brand.name), joined === null ? "غير متاح" : saudiDay(joined), brand.accountStatus === "active" ? state : "موقوف",
    start, mixed ? "مواعيد مختلفة" : end, mixed ? "مواعيد مختلفة" : remaining, null, null];
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
  sheet.columns = [36, 27, 26, 28, 28, 22, 26, 18].map(width => ({ width }));
  sheet.mergeCells("A1:H1");
  sheet.getCell("A1").value = "برندة | تقرير العلامات التجارية";
  sheet.getRow(1).height = 38;
  sheet.mergeCells("A2:H2");
  sheet.getCell("A2").value = `تاريخ التصدير ${saudiTimestamp.format(new Date(now))} بتوقيت السعودية | ${snapshot.brands.length} علامة`;
  sheet.getRow(2).height = 28;
  sheet.mergeCells("A3:H3");
  sheet.getCell("A3").value = "المدة المتبقية حتى نهاية الباقة الحالية ويحتسب جزء اليوم يومًا كاملًا | تظهر مواعيد مختلفة عند وجود باقات سارية لم توحد نهايتها بعد | عمودا المدفوعات والتجديدات فارغان للتعبئة";
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
      for (const column of [2, 4, 5]) row.getCell(column).numFmt = "yyyy-mm-dd";
      row.getCell(6).numFmt = '0" يوم"';
      row.getCell(7).numFmt = "#,##0.00";
      row.getCell(8).numFmt = "0";
      for (const column of [6, 7, 8]) row.getCell(column).alignment = { ...row.getCell(column).alignment, horizontal: "center" };
      row.height = Math.max(33, Math.min(90, Math.ceil(String(row.getCell(1).value).length / 30) * 19));
    }
  });
  sheet.pageSetup.printTitlesRow = "1:5";
  sheet.pageSetup.printArea = `A1:H${Math.max(5, snapshot.brands.length + 5)}`;
  sheet.headerFooter.oddFooter = "&Cبرندة&R&P / &N";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
