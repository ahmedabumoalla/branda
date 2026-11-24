import "server-only";
import ExcelJS from "exceljs";
import type { LoyaltyBranchExportSnapshot } from "@/lib/loyalty/branch-report-types";

export const LOYALTY_BRANCH_EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
type Cell = string | number | Date;
const minute = 60_000;
const day = 86_400_000;
const activityLabels: Record<string, string> = {
  issue: "إصدار بطاقة", download: "تحميل أو حفظ بطاقة آبل", scan: "قراءة بطاقة", stamp: "إضافة ختم",
  redeem: "صرف مكافأة", void: "إلغاء عملية", installed: "حفظ بطاقة آبل", save_link: "إنشاء رابط حفظ جوجل",
  registration: "تسجيل عميل", wallet_download: "تحميل بطاقة آبل", wallet_install: "حفظ بطاقة آبل",
};
const unknown = "غير مسجل";
const clean = (value: string | null | undefined) => (value || unknown).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const time = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
// Excel dates do not carry a time zone: store the Riyadh wall-clock value explicitly.
const dateCell = (value: string | null | undefined): Cell => time(value) === null ? unknown : new Date(time(value)! + 3 * 60 * minute);

export function branchActivityAge(value: string | null, generatedAt: string): { label: string; minutes: number | null } {
  const previous = time(value), current = time(generatedAt);
  if (previous === null || current === null) return { label: unknown, minutes: null };
  if (previous > current) return { label: "بعد وقت التقرير", minutes: null };
  const elapsed = current - previous, minutes = Math.floor(elapsed / minute);
  return { label: elapsed < minute ? "أقل من دقيقة" : elapsed < 60 * minute ? `${minutes} دقيقة` : elapsed < day ? `${Math.floor(elapsed / (60 * minute))} ساعة` : `${Math.floor(elapsed / day)} يوم`, minutes };
}

function activityCells(at: string | null, kind: string | null, generatedAt: string): Cell[] {
  const age = branchActivityAge(at, generatedAt);
  return [dateCell(at), kind ? activityLabels[kind] ?? "نشاط آخر" : unknown, age.label, age.minutes ?? unknown];
}

export const BRANCH_EXCEL_HEADERS = ["الفرع", "حالة الفرع", "العنوان", "المدينة", "رقم التواصل", "أوقات العمل", "تاريخ إنشاء الفرع", "البطاقات الصادرة", "بطاقات آبل المحملة أو المحفوظة", "بطاقات آبل المحفوظة", "بطاقات لها رابط حفظ جوجل", "الأختام المضافة", "المكافآت المصروفة", "العملاء", "الموظفون", "آخر نشاط", "نوع آخر نشاط", "منذ آخر نشاط", "المدة بالدقائق"];
export const CUSTOMER_EXCEL_HEADERS = ["الفرع", "العميل", "رقم الجوال", "تاريخ إصدار البطاقة", "مصدر الإصدار", "موظف الإصدار", "آخر تحميل أو حفظ آبل", "آخر حفظ آبل", "آخر إنشاء رابط حفظ جوجل", "الأختام المضافة", "المكافآت المصروفة", "آخر نشاط", "نوع آخر نشاط", "منذ آخر نشاط", "المدة بالدقائق"];
export const STAFF_EXCEL_HEADERS = ["الفرع الحالي", "الموظف", "حالة الموظف", "البطاقات الصادرة", "الأختام المضافة", "المكافآت المصروفة", "آخر نشاط", "نوع آخر نشاط", "منذ آخر نشاط", "المدة بالدقائق"];

function addSheet(book: ExcelJS.Workbook, name: string, table: string, headers: string[], rows: Cell[][], snapshot: LoyaltyBranchExportSnapshot, dateColumns: number[] = []) {
  // Fail explicitly instead of silently truncating Excel's row limit.
  if (rows.length > 1_048_571) throw new Error("Branch export exceeds worksheet capacity");
  const sheet = book.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 5, topLeftCell: "A6", rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:5" },
  });
  sheet.columns = headers.map((heading, index) => ({ width: index === 0 ? 29 : /تاريخ|نشاط|تحميل|حفظ/.test(heading) ? 26 : 22 }));
  for (const index of [1, 2, 3]) sheet.mergeCells(index, 1, index, headers.length);
  sheet.getCell(1, 1).value = `${clean(snapshot.brandName)} | ${name}`;
  const generated = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.generatedAt));
  sheet.getCell(2, 1).value = `تاريخ التصدير ${generated} بتوقيت الرياض | الفترة ${snapshot.from || "من البداية"} إلى ${snapshot.to || "وقت التقرير"}`;
  sheet.getCell(3, 1).value = "إصدار البطاقة يشمل عميل الكاشير دون تحميل | إنشاء رابط جوجل لا يثبت فتحه أو حفظ البطاقة | التفاصيل والتغطية في دليل المؤشرات";
  sheet.getRow(4).height = 10;
  sheet.addTable({ name: table, ref: "A5", headerRow: true, style: { theme: "TableStyleMedium4", showRowStripes: true }, columns: headers.map(name => ({ name, filterButton: true })), rows });
  sheet.eachRow((row, index) => {
    row.height = index === 1 ? 38 : index === 3 ? 40 : index === 4 ? 10 : 34;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: "Tahoma", size: index === 1 ? 16 : 11, color: { argb: "FF30251D" } };
      cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true };
      if (index === 1 || index === 5) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3D2418" } };
        cell.font = { ...cell.font, bold: true, color: { argb: index === 1 ? "FFE8BF77" : "FFFFFFFF" } };
      } else if (index > 5) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF8F2E7" : "FFFFFFFF" } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE6D8C3" } } };
        if (typeof cell.value === "number") cell.numFmt = "#,##0";
      }
    });
    if (index > 5) for (const column of dateColumns) row.getCell(column).numFmt = "yyyy-mm-dd hh:mm:ss";
  });
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(headers.length).letter}${Math.max(5, rows.length + 5)}`;
  sheet.headerFooter.oddFooter = "&Cبرندة&R&P / &N";
  return sheet;
}

export async function buildLoyaltyBranchExcel(snapshot: LoyaltyBranchExportSnapshot) {
  if (time(snapshot.generatedAt) === null) throw new Error("Invalid branch export timestamp");
  const book = new ExcelJS.Workbook();
  book.creator = "برندة";
  book.title = "متابعة عملاء الفروع";
  book.created = book.modified = new Date(snapshot.generatedAt);
  const summary = snapshot.summary;
  addSheet(book, "ملخص المتابعة", "BrandaBranchSummary", ["المؤشر", "القيمة"], [
    ["الفروع المشمولة", snapshot.branches.filter(branch => branch.id !== null).length],
    ["البطاقات الصادرة", summary.issuedCards], ["بطاقات آبل المحملة أو المحفوظة", summary.downloadedCards],
    ["بطاقات آبل المحفوظة", summary.appleInstalledCards], ["بطاقات لها رابط حفظ جوجل", summary.googleSaveLinks],
    ["الأختام المضافة", summary.stamps], ["المكافآت المصروفة", summary.redemptions],
    ["العملاء", summary.customers], ["الموظفون", summary.staff],
    ["آخر نشاط", dateCell(summary.lastActivityAt)],
    ["نوع آخر نشاط", summary.lastActivityKind ? activityLabels[summary.lastActivityKind] ?? "نشاط آخر" : unknown],
    ["منذ آخر نشاط", branchActivityAge(summary.lastActivityAt, snapshot.generatedAt).label],
  ], snapshot);
  book.worksheets[0].getCell("B15").numFmt = "yyyy-mm-dd hh:mm:ss";
  addSheet(book, "الفروع", "BrandaBranches", BRANCH_EXCEL_HEADERS, snapshot.branches.map(branch => [
    clean(branch.name), branch.id === null ? "الفرع غير مسجل" : branch.active ? "نشط" : "غير نشط", clean(branch.address), clean(branch.city), clean(branch.phone), clean(branch.workingHours), dateCell(branch.createdAt),
    branch.issuedCards, branch.downloadedCards, branch.appleInstalledCards, branch.googleSaveLinks, branch.stamps, branch.redemptions, branch.customers, branch.staff,
    ...activityCells(branch.lastActivityAt, branch.lastActivityKind, snapshot.generatedAt),
  ]), snapshot, [7, 16]);
  const sources: Record<string, string> = { cashier: "موظف الكاشير", registration: "تسجيل العميل", unknown };
  addSheet(book, "العملاء والبطاقات", "BrandaBranchCustomers", CUSTOMER_EXCEL_HEADERS, snapshot.customers.map(customer => [
    clean(customer.branchName), clean(customer.name), clean(customer.phone), dateCell(customer.issuedAt), sources[customer.source] ?? unknown, clean(customer.cashierName),
    dateCell(customer.downloadedAt), dateCell(customer.appleInstalledAt), dateCell(customer.googleSaveLinkAt), customer.stamps, customer.redemptions,
    ...activityCells(customer.lastActivityAt, customer.lastActivityKind, snapshot.generatedAt),
  ]), snapshot, [4, 7, 8, 9, 12]);
  addSheet(book, "الموظفون", "BrandaBranchStaff", STAFF_EXCEL_HEADERS, snapshot.staff.map(employee => [
    clean(employee.branchName), clean(employee.name), employee.active ? "نشط" : "غير نشط", employee.issuedCards, employee.stamps, employee.redemptions,
    ...activityCells(employee.lastActivityAt, employee.lastActivityKind, snapshot.generatedAt),
  ]), snapshot, [7]);
  addSheet(book, "دليل المؤشرات", "BrandaBranchGuide", ["المؤشر", "طريقة الاحتساب"], [
    ["البطاقات الصادرة", "بطاقات ولاء فعلية أُنشئت خلال الفترة وتشمل إضافة العميل من الكاشير حتى لو لم يحمّل البطاقة ويُحتسب الإصدار مرة واحدة"],
    ["بطاقات آبل المحملة أو المحفوظة", "عدد البطاقات المختلفة التي سُجل لها تحميل ملف آبل أو تسجيل حفظ من جهاز آبل خلال الفترة وتُحسب البطاقة مرة واحدة حتى لو تكرر الحدث والتحميل وحده لا يثبت الحفظ"],
    ["بطاقات آبل المحفوظة", "عدد البطاقات المختلفة ذات تسجيل حفظ من جهاز آبل خلال الفترة ولا يثبت أنها ما زالت محفوظة الآن"],
    ["بطاقات لها رابط حفظ جوجل", "عدد البطاقات المختلفة التي أُنشئ لها رابط حفظ جوجل خلال الفترة لا يعني أن العميل أكمل الحفظ"],
    ["الأختام والمكافآت", "الأختام المضافة والمكافآت المصروفة فعليًا وفق السجل ولا تشمل محاولات الرفض أو الفشل أو الطلبات المكررة"],
    ["بطاقات باركود الفرع", "تُحتسب البطاقات المسجلة من باركود الفرع ضمن إصدار الفرع دون اشتراط تدخل الموظف"],
    ["نسبة العملية للفرع", "فرع إصدار البطاقة محفوظ على البطاقة أما الأختام والصرف فتتبع فرع العملية المسجل وقد يختلف عن فرع إصدار البطاقة"],
    ["الفرع غير مسجل", "تظهر العمليات التي لا يتوفر لها إثبات فرع ضمن غير مسجل ولا تُنسب تلقائيًا إلى فرع الموظف الحالي"],
    ["الموظفون", "يظهر الفرع الحالي للموظف وتعرض الأعداد العمليات المنفذة المنسوبة إليه ضمن نطاق التقرير"],
    ["آخر نشاط", "آخر نشاط ولاء متاح في سجل التقرير وليس آخر تسجيل دخول للوحة التحكم"],
    ["منذ آخر نشاط", "المدة محسوبة عند إنشاء الملف بالدقائق أو الساعات أو الأيام المكتملة ولا تتحدث تلقائيًا بعد تنزيله"],
    ["الفترة", "الأوقات بتوقيت الرياض وتُطبّق فترة التقرير على وقت كل عملية وقد يعود إصدار البطاقة إلى فترة أقدم من نشاطها الأخير"],
    ["سرية بيانات البطاقة", "لا يتضمن الملف رموز البطاقات السرية أو روابط الوصول إليها"],
  ], snapshot);
  book.worksheets[4].getColumn(2).width = 105;
  return new Uint8Array(await book.xlsx.writeBuffer());
}
