import "server-only";
import ExcelJS from "exceljs";
import type { BrandContactReport } from "@/lib/data/admin-brand-contact-report";

const DAY_TIME = "yyyy-mm-dd hh:mm";
const columns = [
  ["اسم العلامة", 33], ["جوال المالك", 22], ["تاريخ الانضمام", 21],
  ["حالة الحساب", 24], ["حالة تسليم بيانات الدخول", 30], ["حالة التجربة", 29],
  ["بداية التجربة", 21], ["مدة التجربة (يوم)", 20], ["آخر نشاط مسجّل", 31], ["وقت آخر نشاط", 22],
  ["الباقات المفعلة", 40], ["انتهاء الاشتراك", 23], ["البطاقات المصدرة", 22],
  ["عمليات الختم المسجلة", 23], ["زوار المنيو المسجلون", 25], ["مرات دخول لوحة التحكم المسجلة", 34],
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
  sheet.mergeCells("A1:P1");
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
      item.trial_days, item.last_activity || "لا يوجد نشاط موثّق", riyadhTime(item.last_activity_at),
      item.active_plan_names, riyadhTime(item.subscription_expires_at) ?? (item.active_plan_names === "لا توجد باقة مفعلة" ? "لا يوجد انتهاء مسجّل" : "دون تاريخ انتهاء"),
      item.issued_card_count, item.stamp_operation_count, item.menu_visitor_count ?? "لا يوجد منيو مفعّل أو زيارات مسجلة", item.dashboard_login_count]);
    row.height = 23;
    row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
    row.getCell(2).numFmt = "@";
    row.getCell(2).alignment = { horizontal: "right", vertical: "middle", readingOrder: "ltr" };
    for (const col of [3, 7, 10, 12]) row.getCell(col).numFmt = DAY_TIME;
    if (row.number % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F4ED" } };
  }
  sheet.autoFilter = { from: "A2", to: `P${sheet.rowCount}` };
  const notes = book.addWorksheet("دليل المؤشرات", { views: [{ rightToLeft: true, showGridLines: false }] });
  notes.columns = [{ width: 31 }, { width: 110 }];
  const menuSince = rows.find(item => item.menu_tracking_since)?.menu_tracking_since ?? null;
  const stampSince = rows.find(item => item.stamp_tracking_since)?.stamp_tracking_since ?? null;
  const details: [string, string | Date | null][] = [
    ["وقت استخراج التقرير", riyadhTime(exportedAt)],
    ["نطاق التقرير", "العلامات ذات رقم تواصل وإرسال بيانات دخول موثّق أو تسجيل ذاتي موثّق مع دخول المالك وتُستبعد الحسابات التجريبية"],
    ["الباقات المفعلة", "كل الباقات السارية الآن بما فيها الاشتراك التجريبي الحقيقي للعميل ولا تعني الباقة التجريبية أن الحساب حساب اختبار"],
    ["انتهاء الاشتراك", "أقرب انتهاء بين الباقات المفعلة وعند عدم وجود باقة مفعلة يظهر آخر انتهاء مسجّل"],
    ["البطاقات المصدرة", "عدد بطاقات الولاء الموجودة في سجل الإصدار ويشمل إصدار العميل لبطاقته بنفسه ولا يمثل مرات إضافتها إلى المحفظة"],
    ["عمليات الختم المسجلة", "عدد عمليات الختم الناجحة في سجل التدقيق بما فيه التاريخ المستورد ولا تُحسب المحاولات الفاشلة أو المكررة ولا عدد الأختام في العملية الواحدة"],
    ["بدء تسجيل عمليات الولاء", riyadhTime(stampSince)],
    ["زوار المنيو المسجلون", "عدد معرّفات الزوار المختلفة في سجل المنيو وليس عدد مشاهدات الصفحة مع الاحتفاظ بالزيارات التاريخية عند انتهاء اشتراك المنيو وقد يُحسب الشخص أكثر من مرة عند تغيير المتصفح أو الجهاز"],
    ["بدء تسجيل زوار المنيو", riyadhTime(menuSince)],
    ["مرات دخول لوحة التحكم", "عدد أحداث دخول مستخدمي العلامة المسجلة فقط مع استبعاد المدير والصيانة ودخول الكاشير ولا تمثل فتح الصفحات أو جميع جلسات المصادقة"],
    ["قراءة الصفر", "الصفر يعني عدم وجود عمليات في السجل المتاح ولا يثبت عدم وجود استخدام سابق على بدء التسجيل أو أثناء أي انقطاع للتتبع"],
    ["آخر نشاط مسجّل", "أحدث نشاط موثّق للعلامة أو الكاشير أو إصدار بطاقة ولاء مع استبعاد أعمال صيانة مدير المنصة التي يمكن نسبتها إليه"],
  ];
  for (const values of details) {
    const row = notes.addRow(values);
    row.height = 42;
    row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true };
    row.getCell(1).font = { bold: true };
    if (values[1] instanceof Date) row.getCell(2).numFmt = DAY_TIME;
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
