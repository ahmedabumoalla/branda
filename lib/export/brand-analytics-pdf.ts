import { jsPDF } from "jspdf";
import { autoTable, type UserOptions } from "jspdf-autotable";
import type { BrandAnalyticsExport } from "@/lib/analytics/brand-customer-analytics";

type ReportAssets = { regular: string; bold: string; logo: string };
type Row = string[];
type FontMetadata = { cmap: { unicode: { codeMap: Record<number, number> } } };
const palette = {
  brown: [101, 43, 29] as [number, number, number],
  gold: [213, 178, 106] as [number, number, number],
  ink: [44, 47, 39] as [number, number, number],
  muted: [103, 105, 95] as [number, number, number],
  paper: [248, 246, 240] as [number, number, number],
};
const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
const date = (value: string | null, time = true) => value ? new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  ...(time ? { hour: "2-digit" as const, minute: "2-digit" as const, hourCycle: "h23" as const } : {}),
}).format(new Date(value)) : "غير مسجل";
const stampDate = (value: string | null) => date(value).replace(", ", "\n");
const gap = (value: number | null) => value === null ? "لا تكفي الزيارات" : `${number(value)} يوم`;
const state = (value: string) => ({ active: "نشط", suspended: "موقوف", blocked: "محظور", inactive: "غير نشط", deleted: "محذوف" }[value] ?? value);

/** The export is one brand only and must contain every row, not a visible page. */
export function buildBrandAnalyticsReportContent(data: BrandAnalyticsExport) {
  const { report, customers } = data;
  if (customers.length !== report.total || customers.length !== report.brand.registeredCustomers
    || new Set(customers.map(customer => customer.id)).size !== customers.length) {
    throw new Error("بيانات التقرير غير مكتملة أعد تحميل التقرير");
  }
  const brand = report.brand;
  const snapshotDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(data.generatedAt));
  const periodStart = new Date(`${snapshotDay}T00:00:00Z`);
  periodStart.setUTCDate(periodStart.getUTCDate() - report.days + 1);
  const customerNumber = new Map(customers.map((customer, index) => [customer.id, String(index + 1)]));
  const reference = (id: string) => customerNumber.get(id) ?? "";
  const retention = (items: typeof brand.retention): Row[] => items.map(item => [
    item.rate === null ? "لم تكتمل المدة" : `${number(item.rate)}%`, number(item.retained), number(item.eligible), `${item.days} ${item.days === 7 ? "أيام" : "يومًا"}`,
  ]);
  return {
    title: "تقرير أداء الولاء والعملاء",
    brandName: brand.name,
    period: `من ${date(periodStart.toISOString(), false)} حتى ${date(data.generatedAt)} | ${number(report.days)} يومًا`,
    summary: [
      [number(brand.registeredCustomers), "العملاء المسجلون"],
      [number(brand.cardholders), "حاملو بطاقات الولاء"],
      [number(brand.activeCustomers), "نشطون خلال آخر 10 أيام"],
      [number(brand.visitsInPeriod), "أيام الزيارة في الفترة"],
      [number(brand.returningCustomers), "العملاء العائدون"],
      [number(brand.loyalCustomers), "العملاء منتظمو العودة"],
      [number(brand.inactiveCustomers), "منقطعون أكثر من 10 أيام"],
      [number(brand.walletCustomers), "عملاء طلبوا بطاقة المحفظة"],
    ],
    retention: retention(brand.retention),
    cohortRows: report.cohorts.map(cohort => [
      ...[30, 14, 7].map(days => {
        const item = cohort.retention.find(row => row.days === days);
        return !item || item.rate === null ? "لم تكتمل المدة" : `${number(item.rate)}%\n${number(item.retained)} / ${number(item.eligible)}`;
      }), number(cohort.issued), cohort.month,
    ]),
    inactive: customers.filter(customer => customer.isInactive).sort((a, b) => b.inactiveDays - a.inactiveDays).map(customer => [
      `${number(customer.inactiveDays)} يوم`, stampDate(customer.lastRedemptionAt), stampDate(customer.lastStampAt),
      stampDate(customer.cardIssuedAt ?? customer.joinedAt), customer.phone || "غير مسجل", customer.name, reference(customer.id),
    ]),
    identities: customers.map(customer => [
      stampDate(customer.cardIssuedAt), stampDate(customer.joinedAt), state(customer.status), customer.email || "غير مسجل",
      customer.phone || "غير مسجل", customer.name, reference(customer.id),
    ]),
    activity: customers.map(customer => [
      number(customer.rewardsRedeemed), `${number(customer.currentStamps)} / ${number(customer.totalStamps)}`,
      gap(customer.averageVisitGapDays), number(customer.visitDays), `${number(customer.inactiveDays)} يوم`,
      stampDate(customer.lastRedemptionAt), stampDate(customer.lastStampAt),
      customer.isLoyal ? "منتظم العودة" : customer.isInactive ? "منقطع" : customer.visitDays > 1 ? "عائد" : customer.visitDays ? "زيارة واحدة" : "بلا زيارة",
      customer.name, reference(customer.id),
    ]),
    wallets: customers.map(customer => [
      `الأول: ${date(customer.wallet.firstInstalledAt)}\nالأخير: ${date(customer.wallet.lastInstalledAt)}\nالأجهزة الحالية: ${number(customer.wallet.installedDevices)}`,
      `الأول: ${date(customer.wallet.firstGoogleSaveAt)}\nالأخير: ${date(customer.wallet.lastGoogleSaveAt)}\nالروابط: ${number(customer.wallet.googleSaveLinks)}`,
      `الأول: ${date(customer.wallet.firstDownloadAt)}\nالأخير: ${date(customer.wallet.lastDownloadAt)}\nالتحميلات: ${number(customer.wallet.downloads)}`,
      `${date(customer.cardIssuedAt)}\nالبطاقات: ${number(customer.cardCount)}`,
      customer.phone || "غير مسجل", customer.name, reference(customer.id),
    ]),
    firstReturns: customers.map(customer => [
      stampDate(customer.firstReturnAt), stampDate(customer.lastVisitAt), stampDate(customer.cardIssuedAt),
      gap(customer.averageVisitGapDays), customer.phone || "غير مسجل", customer.name, reference(customer.id),
    ]),
    notes: [
      "هذا التقرير يخص العلامة المحددة ويشمل جميع عملائها المسجلين وقت إعداد البيانات ولا يتقيد بصفحة الجدول أو مرشح البحث في الشاشة",
      "الزيارة يوم مختلف بتوقيت الرياض فيه ختم ناجح أو صرف مكافأة ناجح لا تحسب محاولات المسح أو الدخول أو مشاهدة المنيو أو تحميل البطاقة كزيارة",
      "أيام الزيارة والذروة تخص الفترة المختارة النشطون زاروا العلامة خلال آخر 10 أيام أما المسجلون والعودة والانقطاع والاحتفاظ فمن السجل المتاح حتى وقت التقرير",
      "الفترة أيام تقويمية شاملة بتوقيت الرياض وتنتهي عند وقت إعداد البيانات في اليوم الحالي ولا تفترض اكتمال بقية ساعات اليوم",
      "المنقطع مر أكثر من 10 أيام على آخر ختم أو صرف مكافأة وفي حال عدم وجود زيارة يبدأ الحساب من إصدار البطاقة أو التسجيل لا يدخل العميل الأحدث من هذه المدة",
      "منتظم العودة لديه 3 أيام زيارة مختلفة على الأقل ومتوسط الفاصل بين زياراته لا يتجاوز 4 أيام وزار العلامة خلال آخر 10 أيام",
      "متوسط فاصل العودة يقيس الأيام بين أيام الزيارة المختلفة ولا يحسب تعدد العمليات في اليوم نفسه كعودة جديدة",
      "الاحتفاظ المعروض عودة تراكمية خلال 7 أو 14 أو 30 يومًا من إصدار البطاقة بشرط أن تكون العودة في يوم لاحق ليوم الإصدار المقام يشمل فقط البطاقات التي اكتملت لها مدة القياس",
      "أفواج الاحتفاظ تجمع العملاء حسب شهر إصدار أول بطاقة كل نسبة تعرض عدد العائدين من إجمالي العملاء الذين اكتملت لهم المدة وليست نسبة من جميع عملاء الشهر",
      "تحميل آيفون يسجل تسليم ملف البطاقة ورابط أندرويد يسجل إنشاء رابط الحفظ ولا يثبت أي منهما حفظ البطاقة على الجهاز التثبيت يعرض فقط التأكيد المسجل المتاح",
      "رصيد الأختام الحالي وإجمالي الأختام وعدد الأجهزة الحالية تعكس الحالة وقت جلب التقرير بينما التواريخ والزيارات مرتبطة بوقت إعداد البيانات",
      `بداية سجل تتبع العمليات: ${date(data.recordingStartedAt)} وبداية سجل تتبع المحفظة: ${date(data.walletRecordingStartedAt)} قد تتوفر بيانات أقدم من سجلات تاريخية وغياب السجل لا يثبت عدم حدوث نشاط أقدم خارج البيانات المتاحة`,
      "توحيد العميل داخل العلامة يعتمد على رقم الجوال الموثوق ثم الحساب ثم سجل العميل عند تعذر المطابقة ولا يخلط عملاء العلامات المختلفة",
    ],
  };
}

/** Built on demand in the client after the admin-only export has returned. */
export function buildBrandAnalyticsPdf(data: BrandAnalyticsExport, assets: ReportAssets) {
  const content = buildBrandAnalyticsReportContent(data);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", putOnlyUsedFonts: true, compress: true });
  for (const [style, file, bytes] of [["normal", "Tajawal-Regular.ttf", assets.regular], ["bold", "Tajawal-Bold.ttf", assets.bold]]) {
    doc.addFileToVFS(file, bytes);
    doc.addFont(file, "Tajawal", style);
    doc.setFont("Tajawal", style);
    const { codeMap } = (doc.getFont().metadata as unknown as FontMetadata).cmap.unicode;
    for (let code = 0xfe80; code <= 0xfefc; code++) {
      const base = String.fromCharCode(code).normalize("NFKC");
      if (!codeMap[code] && base.length === 1 && codeMap[base.charCodeAt(0)]) codeMap[code] = codeMap[base.charCodeAt(0)];
    }
  }
  doc.setLanguage("ar-SA");
  doc.setProperties({ title: `${content.title} — ${content.brandName}`, subject: "تحليلات الولاء والاحتفاظ بالعملاء", creator: "Barnda", author: "برندة" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  const tableWidth = width - margin * 2;
  let y = 37;
  function line(text: string, size = 10, color = palette.muted) {
    doc.setFont("Tajawal", "normal").setFontSize(size).setTextColor(...color);
    const lines = doc.splitTextToSize(text, tableWidth) as string[];
    for (const part of lines) {
      if (y > height - 24) { doc.addPage(); y = 37; }
      doc.text(part, width - margin, y, { align: "right" });
      y += size * 0.45 + 1;
    }
  }
  function section(title: string, subtitle?: string, newPage = false) {
    if (newPage || y > height - 48) { doc.addPage(); y = 37; }
    doc.setFont("Tajawal", "bold").setFontSize(19).setTextColor(...palette.brown);
    const lines = doc.splitTextToSize(title, tableWidth) as string[];
    for (const part of lines) {
      if (y > height - 30) { doc.addPage(); y = 37; }
      doc.text(part, width - margin, y, { align: "right" }); y += 8;
    }
    if (subtitle) line(subtitle);
    y += 3;
  }
  function table(head: string[], rows: Row[], widths: number[], options: Partial<UserOptions> = {}) {
    autoTable(doc, {
      startY: y, margin: { top: 32, bottom: 18, left: margin, right: margin }, tableWidth,
      head: [head], body: rows.length ? rows : [head.map((_, index) => index === head.length - 1 ? "لا توجد بيانات مسجلة" : "")],
      theme: "striped", pageBreak: "auto", rowPageBreak: "avoid", showHead: "everyPage",
      styles: { font: "Tajawal", fontSize: 9, textColor: palette.ink, halign: "right", valign: "middle", cellPadding: 2.3, overflow: "linebreak", lineColor: [229, 225, 214], lineWidth: 0.1 },
      headStyles: { fontStyle: "bold", fillColor: palette.brown, textColor: [255, 255, 255], cellPadding: 2.7 },
      alternateRowStyles: { fillColor: palette.paper },
      columnStyles: Object.fromEntries(widths.map((weight, index) => [index, { cellWidth: tableWidth * weight / widths.reduce((sum, value) => sum + value, 0) }])),
      ...options,
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  section(content.title);
  section(content.brandName);
  line(content.period);
  line("جميع الأوقات بتوقيت الرياض | تقرير كامل للعلامة", 10);
  y += 5;
  if (y + 74 > height - 18) { doc.addPage(); y = 37; }
  const cardsWidth = (tableWidth - 18) / 4;
  const cardsHeight = 24;
  content.summary.forEach(([value, label], index) => {
    const x = width - margin - cardsWidth - (index % 4) * (cardsWidth + 6);
    const top = y + Math.floor(index / 4) * (cardsHeight + 5);
    doc.setFillColor(...palette.paper).roundedRect(x, top, cardsWidth, cardsHeight, 2, 2, "F");
    doc.setFillColor(...palette.gold).rect(x + cardsWidth - 1, top + 5, 1, cardsHeight - 10, "F");
    doc.setFont("Tajawal", "bold").setFontSize(21).setTextColor(...palette.brown).text(value, x + cardsWidth - 5, top + 10, { align: "right" });
    doc.setFont("Tajawal", "normal").setFontSize(10).setTextColor(...palette.ink).text(label, x + cardsWidth - 5, top + 19, { align: "right" });
  });
  y += cardsHeight * 2 + 16;
  line(`متوسط الفاصل بين أيام الزيارة: ${gap(data.report.brand.averageVisitGapDays)} | آخر زيارة مؤهلة: ${date(data.report.brand.lastVisitAt)}`);
  line("المنقطعون ومنتظمو العودة والاحتفاظ محسوبون من السجل المتاح حتى وقت التقرير", 10);

  section("معدل الاحتفاظ من إصدار البطاقة", "عودة في يوم لاحق خلال المدة المحددة مع استبعاد العملاء الذين لم تكتمل لهم المدة", true);
  table(["نسبة العودة", "العائدون", "اكتملت لهم المدة", "مدة القياس"], content.retention, [1, 1, 1, 1]);
  section("الاحتفاظ حسب شهر إصدار البطاقة", "كل خلية تعرض النسبة ثم عدد العائدين من العملاء المؤهلين للقياس");
  table(["خلال 30 يومًا", "خلال 14 يومًا", "خلال 7 أيام", "عملاء أصدروا بطاقة", "شهر الإصدار"], content.cohortRows, [1, 1, 1, 1, 1]);

  section("أوقات الذروة", `توزيع الزيارات المؤهلة خلال آخر ${number(data.report.days)} يوم بتوقيت الرياض`, true);
  line("كل عميل يحتسب مرة واحدة في اليوم وتحدد الساعة بأول ختم ناجح أو صرف مكافأة في ذلك اليوم", 10);
  y += 3;
  const cells = new Map(data.report.heatmap.map(cell => [`${cell.day}:${cell.hour}`, cell.visits]));
  const max = Math.max(0, ...data.report.heatmap.map(cell => cell.visits));
  const hours = Array.from({ length: 24 }, (_, index) => 23 - index);
  table([...hours.map(hour => `${String(hour).padStart(2, "0")}`), "اليوم"], weekdays.map((day, index) => [
    ...hours.map(hour => number(cells.get(`${index}:${hour}`) ?? 0)), day,
  ]), [...hours.map(() => 1), 2.5], {
    styles: { font: "Tajawal", fontSize: 8, cellPadding: 1.5, halign: "center", valign: "middle", minCellHeight: 9, textColor: palette.ink, lineColor: [255, 255, 255], lineWidth: 0.4 },
    headStyles: { fillColor: palette.brown, textColor: [255, 255, 255], fontStyle: "bold", halign: "center", cellPadding: 1.5 },
    didParseCell(hook) {
      if (hook.section !== "body" || hook.column.index === 24) return;
      const intensity = max ? (cells.get(`${hook.row.index}:${hours[hook.column.index]}`) ?? 0) / max : 0;
      hook.cell.styles.fillColor = [248 - intensity * 125, 246 - intensity * 137, 240 - intensity * 162];
      hook.cell.styles.textColor = intensity > 0.55 ? [255, 255, 255] : palette.ink;
    },
  });
  const peaks = [...data.report.heatmap].filter(cell => cell.visits > 0).sort((a, b) => b.visits - a.visits || a.day - b.day || a.hour - b.hour).slice(0, 4);
  table(["الزيارات", "الساعة", "اليوم"], peaks.map(cell => [number(cell.visits), `${String(cell.hour).padStart(2, "0")}:00`, weekdays[cell.day]]), [1, 1, 1]);

  section("عملاء لم يعودوا منذ أكثر من 10 أيام", "لم يسجلوا ختمًا ناجحًا ولم يصرفوا مكافأة خلال آخر 10 أيام مرتبة بالأطول انقطاعًا", true);
  table(["مدة الانقطاع", "آخر صرف مكافأة", "آخر ختم", "إصدار البطاقة أو التسجيل", "الجوال", "العميل", "#"], content.inactive, [22, 35, 35, 38, 37, 47, 9]);

  section("دليل العملاء وبيانات إصدار البطاقة", `جميع العملاء وعددهم ${number(data.customers.length)} | الرقم المرجعي موحد في بقية جداول التقرير`, true);
  table(["أول إصدار بطاقة", "تاريخ التسجيل", "الحالة", "البريد الإلكتروني", "الجوال", "العميل", "#"], content.identities, [33, 33, 21, 45, 35, 46, 9]);

  section("تفاصيل الزيارات والأختام والمكافآت", "رصيد الأختام الحالية وإجمالي الأختام يعرضان بهذا الترتيب والعودة تقاس بالأيام المختلفة", true);
  table(["مكافآت مصروفة", "الأختام الحالية / الإجمالي", "فاصل العودة", "أيام الزيارة", "منذ آخر نشاط", "آخر صرف", "آخر ختم", "نمط العودة", "العميل", "#"], content.activity, [20, 26, 23, 18, 23, 33, 33, 25, 43, 9]);

  section("إصدار البطاقات وطلبات المحفظة", "رابط الحفظ أو تحميل الملف لا يثبت التثبيت على الجهاز والتأكيد يظهر في عمود مستقل", true);
  table(["تأكيد التثبيت المسجل", "رابط حفظ أندرويد", "تحميل بطاقة آيفون", "إصدار البطاقة", "الجوال", "العميل", "#"], content.wallets, [49, 49, 49, 36, 33, 43, 9]);

  section("تفاصيل العودة منذ إصدار البطاقة", "أول عودة هي أول يوم زيارة لاحق ليوم إصدار البطاقة بحسب السجل المتاح", true);
  table(["أول عودة لاحقة للإصدار", "آخر زيارة مؤهلة", "أول إصدار بطاقة", "فاصل العودة", "الجوال", "العميل", "#"], content.firstReturns, [37, 37, 37, 26, 35, 43, 9]);

  section("دليل قراءة التقرير وتغطية البيانات", "التعريفات التالية توضح حدود كل مؤشر وتمنع تفسير غياب البيانات على أنه نشاط مؤكد أو انقطاع مؤكد خارج السجل", true);
  table(["طريقة القياس", "#"], content.notes.map((note, index) => [note, String(index + 1)]), [24, 1]);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFillColor(...palette.gold).rect(0, 0, width, 2, "F");
    doc.addImage(assets.logo, "PNG", margin, 6, 31, 16.8, "barnda-logo", "FAST");
    doc.setFont("Tajawal", "bold").setFontSize(10).setTextColor(...palette.brown);
    const fullHeader = doc.splitTextToSize(content.brandName, tableWidth - 48) as string[];
    doc.text(fullHeader[0] + (fullHeader.length > 1 ? "…" : ""), width - margin, 11, { align: "right" });
    doc.setFont("Tajawal", "normal").setFontSize(9).setTextColor(...palette.muted);
    doc.text(`تحليلات العلامة التجارية | آخر ${number(data.report.days)} يوم`, width - margin, 19, { align: "right" });
    doc.setDrawColor(...palette.gold).setLineWidth(0.3).line(margin, 26, width - margin, 26);
    doc.setDrawColor(223, 218, 205).line(margin, height - 13, width - margin, height - 13);
    doc.setFontSize(8).setTextColor(...palette.muted);
    doc.text(`صفحة ${page} من ${pages}`, width - margin, height - 7, { align: "right" });
    doc.text("barndaksa.com", margin, height - 7);
    doc.text(`إعداد برندة | ${date(data.generatedAt)}`, width / 2, height - 7, { align: "center" });
  }
  return doc;
}

async function asset(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("تعذر تحميل هوية التقرير أعد المحاولة");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

export async function downloadBrandAnalyticsPdf(data: BrandAnalyticsExport) {
  const [regular, bold, logo] = await Promise.all([
    asset("/fonts/tajawal-regular.ttf"), asset("/fonts/tajawal-bold.ttf"), asset("/brand/barndaksa-logo-brown.png"),
  ]);
  const doc = buildBrandAnalyticsPdf(data, { regular, bold, logo });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(data.generatedAt));
  const slug = data.report.brand.slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 80) || "brand";
  await doc.save(`barnda-${slug}-loyalty-${day}.pdf`, { returnPromise: true });
}
