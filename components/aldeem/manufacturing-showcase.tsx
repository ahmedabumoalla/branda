"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, Check, ClipboardCheck, Clock3, FileText, FlaskConical, PackageCheck, Printer, Search, ShieldAlert, Truck } from "lucide-react";
import { foodStages as sharedFoodStages, prerequisiteKinds } from "@/lib/erp/aldeem-food-quality";
import { manufacturingDemoBatches, manufacturingDemoChecks, manufacturingDemoStageResult, manufacturingDemoStatuses, type ManufacturingDemoBatch, type ManufacturingDemoStatus } from "@/lib/aldeem/manufacturing-showcase";
import s from "./manufacturing-showcase.module.css";
import { useAldeemLocation } from "./use-location";

type View = "monitor" | "quality" | "report" | "trace" | "programs" | "daily";
const foodStages = sharedFoodStages.map(stage => stage.id === "dispatch" ? { ...stage, name: "تسليم المنتج النهائي للمستودع", fields: ["المستودع المستلم ومرجع إذن الاستلام", "أرقام التشغيلات والكميات المسلمة", "شروط النقل والحفظ ونتيجة مطابقة الاستلام"] } : stage);
const views: Record<View, string> = { monitor: "لوحة المراقبة", quality: "مركز الجودة", report: "تقرير الجودة", trace: "تتبع الباتشات", programs: "المتطلبات الأساسية", daily: "سلامة الغذاء اليومية" };
const stateLabels: Record<string, string> = { pass: "مطابق", hold: "موقوف", pending: "بانتظار الفحص", active: "قيد التنفيذ" };
const normalize = (value: string) => value.trim().toLocaleLowerCase("ar").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
const qty = (batch: ManufacturingDemoBatch) => `${batch.quantity} ${batch.unit}`;
const dailyExamples = [
  { subject: "تنظيف خط التعبئة", type: "نظافة وتعقيم", place: "المصنع", owner: "مشرف الوردية", time: "07:30", result: "pass", detail: "راجع المشرف قائمة التنظيف وسجل التنفيذ قبل بدء التشغيل", next: "المراجعة التالية عند نهاية الوردية" },
  { subject: "مطابقة بطاقة تشيزكيك الفراولة", type: "انحراف وإجراء تصحيحي", place: "المصنع", owner: "مسؤول الجودة", time: "09:15", result: "hold", detail: "اكتشف اختلاف نسخة بطاقة العبوة عن نسخة المنتج المعتمدة في المثال", next: "استبدال البطاقة ثم إعادة الفحص قبل الإفراج" },
  { subject: "التحقق من ميزان التعبئة", type: "معايرة وتحقق", place: "المصنع", owner: "فني المعايرة", time: "07:45", result: "pass", detail: "مرجع سجل تحقق توضيحي مرتبط بالميزان وخط التعبئة", next: "تطبق خطة المعايرة المعتمدة للموقع" },
] as const;

export function AldeemManufacturingShowcase({ initialView = "monitor" }: { initialView?: "monitor" | "quality" | "report" | "trace" }) {
  const [view, setView] = useAldeemLocation<View>("manufacturingView", initialView, Object.keys(views) as View[]);
  const [selected, setSelected] = useAldeemLocation("manufacturingBatch", manufacturingDemoBatches[0].id, manufacturingDemoBatches.map(batch => batch.id));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ManufacturingDemoStatus | "all">("all");
  const [printError, setPrintError] = useState("");
  const frame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => () => frame.current?.remove(), []);
  const batch = manufacturingDemoBatches.find(row => row.id === selected) ?? manufacturingDemoBatches[0];
  const matches = manufacturingDemoBatches.filter(row => (status === "all" || row.status === status) && normalize([row.id, row.product, row.sku, row.owner, ...row.destinations.map(destination => destination.warehouse)].join(" ")).includes(normalize(query)));
  const go = (next: View, id = selected) => { setSelected(id); setView(next); setPrintError(""); };

  function printReport() {
    setPrintError("");
    frame.current?.remove();
    const node = document.createElement("iframe");
    node.title = "طباعة تقرير جودة توضيحي";
    node.setAttribute("aria-hidden", "true");
    node.style.cssText = "position:fixed;width:1px;height:1px;inset:0;opacity:0;pointer-events:none;border:0";
    frame.current = node;
    const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    const checks = manufacturingDemoChecks(batch);
    node.onload = () => {
      const printWindow = node.contentWindow;
      if (!printWindow) { setPrintError("تعذر تجهيز الطباعة حاول مرة أخرى"); node.remove(); return; }
      printWindow.addEventListener("afterprint", () => node.remove(), { once: true });
      try { printWindow.focus(); printWindow.print(); }
      catch { setPrintError("تعذر فتح نافذة الطباعة حاول مرة أخرى"); node.remove(); }
    };
    node.srcdoc = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير جودة توضيحي ${escape(batch.id)}</title><style>body{font:14px Tahoma,sans-serif;color:#352b39;padding:24px;line-height:1.9}h1{color:#8b2e90;font-size:23px}header{border-bottom:2px solid #a437a6;padding-bottom:14px}p{margin:8px 0}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:10px;text-align:right}th{background:#fcf7fc}footer{border-top:1px solid #ddd;margin-top:22px;padding-top:12px;font-size:12px}@page{size:A4;margin:14mm}</style></head><body><header><h1>الديم / تقرير الجودة</h1><strong>بيانات توضيحية للعرض فقط</strong><p>${escape(batch.product)} / ${escape(batch.id)}</p></header><p>الكمية: ${escape(qty(batch))} / التعبئة: ${escape(batch.pack)}</p><p>المسؤول في المثال: ${escape(batch.owner)}</p><p>الحالة: ${escape(manufacturingDemoStatuses[batch.status])}</p><table><thead><tr><th>الفحص</th><th>المرجع</th><th>النتيجة</th><th>الملاحظة</th></tr></thead><tbody>${checks.map(check => `<tr><td>${escape(check.name)}</td><td>${escape(check.reference)}</td><td>${escape(stateLabels[check.result])}</td><td>${escape(check.note)}</td></tr>`).join("")}</tbody></table><p>${escape(batch.note)}</p><footer>هذا نموذج عرض لا يمثل تقرير فحص فعليًا أو اعتمادًا للتشغيلة</footer></body></html>`;
    document.body.append(node);
  }

  return <section className={s.showcase} dir="rtl" aria-label="عرض التصنيع التوضيحي">
    <div className={s.demoNotice}><FlaskConical size={20} aria-hidden="true" /><div><strong>بيانات توضيحية للعرض</strong><p>أمثلة مترابطة تشرح الخامات والوصفة والتصنيع والجودة واستلام المنتج النهائي ولا تدخل في السجلات الفعلية</p></div></div>
    <nav className={s.views} aria-label="أقسام العرض التوضيحي">{Object.entries(views).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => go(key as View)}>{label}</button>)}</nav>
    <header className={s.heading}><div><h2>{views[view]}</h2><p>{view === "monitor" ? "تابع أوامر التصنيع والخامات وحالات الجودة والمنتجات النهائية" : view === "programs" ? "ملف كل متطلب ومسؤوله ومراجعته في مكان واحد" : view === "daily" ? "سجلات التشغيل اليومية والانحرافات والإجراءات المطلوبة" : "اختر التشغيلة لمراجعة تفاصيلها المترابطة"}</p></div>{["quality", "report", "trace"].includes(view) && <label className={s.batchPicker}>التشغيلة<select value={selected} onChange={event => setSelected(event.target.value)}>{manufacturingDemoBatches.map(row => <option key={row.id} value={row.id}>{row.product} / {row.id}</option>)}</select></label>}</header>

    {view === "monitor" && <>
      <div className={s.metrics}>
        <Metric icon={<Activity size={22} />} title="تشغيلات العرض" value={manufacturingDemoBatches.length} detail="من المواد الخام إلى المنتج النهائي" />
        <Metric icon={<Clock3 size={22} />} title="قيد الإنتاج" value={manufacturingDemoBatches.filter(row => row.status === "processing").length} detail="يتابعها مشرف التشغيل" />
        <Metric icon={<ShieldAlert size={22} />} title="تحتاج تدخل الجودة" value={manufacturingDemoBatches.filter(row => row.status === "hold").length} detail="لا يسمح بتوزيعها" tone="hold" />
        <Metric icon={<Truck size={22} />} title="جاهزة لاستلام المنتج النهائي" value={manufacturingDemoBatches.filter(row => row.status === "ready").length} detail="بعد اعتماد الإفراج من الجودة" tone="pass" />
      </div>
      <div className={s.monitorGrid}><div className={s.board}>
        <div className={s.filters}><label><span>ابحث عن تشغيلة أو منتج أو مستودع</span><div className={s.search}><Search size={18} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم المنتج أو رقم التشغيلة" /></div></label><label><span>حالة التشغيل</span><select value={status} onChange={event => setStatus(event.target.value as ManufacturingDemoStatus | "all")}><option value="all">كل الحالات</option>{Object.entries(manufacturingDemoStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        <p className={s.resultCount} role="status">{matches.length} تشغيلات توضيحية معروضة</p>
        <div className={s.batchList}>{matches.map(row => <article key={row.id} className={s.batchCard}>
          <div className={s.cardTop}><div><bdi>{row.id}</bdi><h3>{row.product}</h3></div><Status batch={row} /></div>
          <div className={s.batchMeta}><span><PackageCheck size={16} aria-hidden="true" />{qty(row)}</span><span><Clock3 size={16} aria-hidden="true" />موعد العرض {row.due}</span><span>{row.owner}</span></div>
          <p className={s.stageCaption}>المرحلة الحالية <strong>{foodStages[row.stage].name}</strong></p>
          <div className={s.progress} role="img" aria-label={`اكتملت ${row.stage} من ${foodStages.length} مراحل`}>{foodStages.map((stage, index) => <span key={stage.id} data-state={manufacturingDemoStageResult(row, index).status} title={stage.name} />)}</div>
          <div className={s.cardFoot}><span>{row.destinations.map(destination => destination.warehouse).join(" / ")}</span><div><button type="button" className={s.primary} onClick={() => go("quality", row.id)}>تفاصيل التشغيلة<ArrowLeft size={15} aria-hidden="true" /></button><button type="button" onClick={() => go("trace", row.id)}>التتبع</button></div></div>
        </article>)}</div>
        {!matches.length && <div className={s.empty}><Search size={26} aria-hidden="true" /><h3>لا توجد نتائج مطابقة</h3><p>غيّر عبارة البحث أو الحالة لاستعراض التشغيلات</p><button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>مسح الفلاتر</button></div>}
      </div><aside className={s.attention} aria-label="المتابعة المطلوبة"><h3><ShieldAlert size={20} aria-hidden="true" />تحتاج متابعة</h3><article><span className={s.badge} data-state="hold">أولوية الجودة</span><h4>مراجعة بطاقة تشيزكيك الفراولة</h4><p>التشغيلة متوقفة لحين تصحيح البطاقة وإعادة فحصها</p><button type="button" onClick={() => go("quality", "DEMO-B2403")}>فتح حالة الجودة<ArrowLeft size={15} aria-hidden="true" /></button></article><article><span className={s.badge} data-state="pass">منتج نهائي جاهز</span><h4>استلام تشغيلة الكليجا</h4><p>90 علبة معتمدة لمستودع المنتجات النهائية في هذا المثال</p><button type="button" onClick={() => go("trace", "DEMO-B2401")}>عرض مسار التشغيلة<ArrowLeft size={15} aria-hidden="true" /></button></article><div className={s.hint}><ClipboardCheck size={20} aria-hidden="true" /><p>كل خطوة تسجل المسؤول والمرجع والنتيجة قبل الانتقال للخطوة التالية</p></div></aside></div>
    </>}

    {["quality", "report", "trace"].includes(view) && <BatchIdentity batch={batch} />}
    {view === "quality" && <><div className={s.nextStep} data-state={batch.status}><div><h3>الإجراء التالي</h3><p>{batch.note}</p></div><button type="button" onClick={() => go("report")}>عرض تقرير الجودة<FileText size={16} aria-hidden="true" /></button></div><ol className={s.steps}>{foodStages.map((stage, index) => { const result = manufacturingDemoStageResult(batch, index); return <li key={stage.id} data-state={result.status}><details open={index === batch.stage}><summary><span className={s.stepNumber}>{result.status === "pass" ? <Check size={17} aria-hidden="true" /> : index + 1}</span><strong>{stage.name}</strong><span className={s.badge} data-state={result.status}>{result.label}</span></summary><div className={s.stepBody}><p>يسجل المسؤول الأدلة التالية لهذه المرحلة</p><ul>{stage.fields.map(field => <li key={field}>{field}</li>)}</ul><dl><div><dt>المسؤول في المثال</dt><dd>{index >= 6 ? "مسؤول الجودة" : "مشرف التشغيل"}</dd></div><div><dt>مرجع السجل</dt><dd><bdi>{batch.id} / {String(index + 1).padStart(2, "0")}</bdi></dd></div><div><dt>حالة المراجعة</dt><dd>{result.label}</dd></div></dl>{result.status === "hold" && <p className={s.holdMessage}>{batch.note}</p>}</div></details></li>; })}</ol></>}
    {view === "report" && <section className={s.report}><div className={s.reportHeader}><div><h3>تقرير فحص التشغيلة</h3><p>نموذج توضيحي يربط نتائج الفحص بقرار الإفراج</p></div><button type="button" className={s.primary} onClick={printReport}><Printer size={17} aria-hidden="true" />طباعة التقرير</button></div>{printError && <p className={s.holdMessage} role="alert">{printError}</p>}<div className={s.tableWrap}><table><caption className={s.srOnly}>نتائج فحص التشغيلة التوضيحية</caption><thead><tr><th>الفحص</th><th>المرجع</th><th>النتيجة</th><th>الملاحظة</th></tr></thead><tbody>{manufacturingDemoChecks(batch).map(check => <tr key={check.name}><th scope="row">{check.name}</th><td>{check.reference}</td><td><span className={s.badge} data-state={check.result}>{stateLabels[check.result]}</span></td><td>{check.note}</td></tr>)}</tbody></table></div><div className={s.reportDecision} data-state={batch.status === "ready" ? "pass" : "hold"}><ClipboardCheck size={24} aria-hidden="true" /><div><strong>{batch.status === "ready" ? "قرار المثال: جاهز لاستلام المنتج النهائي" : "قرار المثال: لم يعتمد الإفراج"}</strong><p>{batch.note}</p></div></div><p className={s.hint}>المواصفات وخطط العينات والحدود المعتمدة تحدد لكل منتج بواسطة المختص ولا يعد هذا المثال تقرير فحص فعليًا</p></section>}
    {view === "trace" && <div className={s.trace}><section className={s.tracePart}><span className={s.traceLabel}>01 / المواد الداخلة</span><h3>من أي مواد جاءت التشغيلة</h3>{batch.materials.map(material => <article key={material.lot}><div><strong>{material.name}</strong><bdi>{material.lot}</bdi></div><dl><div><dt>الكمية في المثال</dt><dd>{material.quantity}</dd></div><div><dt>المستودع</dt><dd>{material.warehouse}</dd></div><div><dt>المستند</dt><dd>{material.reference}</dd></div></dl></article>)}</section><section className={s.tracePart}><span className={s.traceLabel}>02 / التشغيلة</span><h3>{batch.product}</h3><div className={s.traceBatch}><PackageCheck size={36} aria-hidden="true" /><bdi>{batch.id}</bdi><strong>{qty(batch)}</strong><Status batch={batch} /></div><dl><div><dt>الوصفة</dt><dd>{batch.recipe}</dd></div><div><dt>التعبئة</dt><dd>{batch.pack}</dd></div><div><dt>الفحص</dt><dd>{batch.status === "ready" ? "مكتمل في المثال" : "لا يسمح بالإفراج قبل اكتماله"}</dd></div></dl><button type="button" onClick={() => go("report")}>فتح تقرير الجودة</button></section><section className={s.tracePart}><span className={s.traceLabel}>03 / المنتج النهائي</span><h3>أين يستلم المنتج بعد التصنيع</h3>{batch.destinations.map(destination => <article key={destination.reference}><div><strong>{destination.warehouse}</strong><bdi>{destination.reference}</bdi></div><p>{destination.quantity} {batch.unit}</p><span className={s.badge} data-state={batch.status === "ready" ? "pass" : "pending"}>{batch.status === "ready" ? "بانتظار الاستلام المخزني" : "بانتظار الإفراج"}</span></article>)}<p className={s.hint}>يرتبط المنتج النهائي بالخامات وأمر التصنيع ومستند الاستلام بنفس رقم التشغيلة وتظهر التحويلات اللاحقة في سجل المخزون</p></section></div>}
    {view === "programs" && <div className={s.programs}>{Object.entries(prerequisiteKinds).map(([key, label], index) => <article className={s.program} key={key}><div><ClipboardCheck size={21} aria-hidden="true" /><span className={s.badge} data-state={key === "training" ? "pending" : "pass"}>{key === "training" ? "مراجعة مجدولة" : "مستند توضيحي"}</span></div><h3>{label}</h3><dl><div><dt>مرجع المستند</dt><dd><bdi>DEMO-PR-{String(index + 1).padStart(2, "0")}</bdi></dd></div><div><dt>المسؤول</dt><dd>{["maintenance", "calibration"].includes(key) ? "مسؤول الصيانة" : key === "staff_health" ? "مسؤول الموظفين" : "مسؤول الجودة"}</dd></div><div><dt>المراجعة والتجديد</dt><dd>يضبط الموعد حسب المستند الفعلي عند التشغيل</dd></div></dl><p>يعرض الملف مرجع المستند ونتيجة مراجعته والمسؤول ومواعيد الصلاحية</p></article>)}</div>}
    {view === "daily" && <div className={s.daily}>{dailyExamples.map(record => <article key={record.subject}><div className={s.cardTop}><div><span className={s.traceLabel}>{record.type}</span><h3>{record.subject}</h3></div><span className={s.badge} data-state={record.result}>{record.result === "hold" ? "متابعة مفتوحة" : "مكتمل في المثال"}</span></div><p>{record.detail}</p><dl><div><dt>الموقع</dt><dd>{record.place}</dd></div><div><dt>المسؤول</dt><dd>{record.owner}</dd></div><div><dt>وقت العرض</dt><dd><bdi>{record.time}</bdi></dd></div></dl><div className={s.nextStep} data-state={record.result}><strong>المتابعة المطلوبة</strong><span>{record.next}</span></div>{record.result === "hold" && <button type="button" onClick={() => go("quality", "DEMO-B2403")}>عرض التشغيلة المرتبطة</button>}</article>)}</div>}
  </section>;
}

function Status({ batch }: { batch: ManufacturingDemoBatch }) {
  return <span className={s.badge} data-state={batch.status === "ready" ? "pass" : batch.status === "hold" ? "hold" : batch.status === "processing" ? "active" : "pending"}>{manufacturingDemoStatuses[batch.status]}</span>;
}

function BatchIdentity({ batch }: { batch: ManufacturingDemoBatch }) {
  return <div className={s.identity}><div><span className={s.traceLabel}>التشغيلة التوضيحية <bdi>{batch.id}</bdi></span><h3>{batch.product}</h3><p>{batch.recipe}</p></div><div><strong>{qty(batch)}</strong><span>{batch.pack}</span></div><Status batch={batch} /></div>;
}

function Metric({ icon, title, value, detail, tone }: { icon: ReactNode; title: string; value: number; detail: string; tone?: string }) {
  return <article className={s.metric} data-state={tone}><div aria-hidden="true">{icon}</div><span>{title}</span><strong>{value}</strong><small>{detail}</small></article>;
}
