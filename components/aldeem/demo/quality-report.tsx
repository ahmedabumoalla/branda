"use client";

import { useState } from "react";
import { ArrowRight, BadgeCheck, Download, Printer, Send, ShieldCheck } from "lucide-react";
import type { Row } from "./data";
import { Badge, Trace, today, useToast, type TraceStep } from "./kit";
import { clock, useDemo } from "./store";
import s from "./demo.module.css";
import q from "./quality-report.module.css";

const n = (value: number) => value.toLocaleString("en-US");
const one = (value: number) => value.toFixed(1);
const pad = (value: number) => String(value).padStart(2, "0");
const shift = (date: string, days: number) => { const t = new Date(`${date}T00:00:00Z`); if (Number.isNaN(t.getTime())) return date; t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
// Splits a total by weights so the parts always add up to the total.
const spread = (total: number, weights: number[], extra: number) => { const sum = weights.reduce((a, b) => a + b, 0); const out = weights.map(weight => Math.floor(total * weight / sum)); out[extra] += total - out.reduce((a, b) => a + b, 0); return out; };

const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const STAGE_WEIGHTS = [12, 8, 9, 9, 14, 11, 8, 11, 10, 8];
const DAY_WEIGHTS = [15, 14, 15, 14, 16, 14, 12];
const FINDINGS: [string, string, string][] = [
  ["حرارة استلام مادة مبردة أعلى من الحد", "تأخر مركبة المورد في التسليم", "رفض الشحنة وإشعار المورد كتابيًا"],
  ["مادة مسببة للحساسية خارج رفها المخصص", "ازدحام المستودع وقت الاستلام", "إعادة الترتيب وتذكير أمين المستودع"],
  ["انحراف وزن مكون عن بطاقة الوصفة", "ميزان التحضير لم يعاير بداية الوردية", "إعادة المعايرة وإعادة وزن الدفعة"],
  ["بقاء العجين خارج التبريد أطول من الحد", "توقف قصير في خط التشكيل", "إتلاف العجينة وتعديل حجم الدفعات"],
  ["حرارة قلب المنتج أقل من الحد الحرج", "تحميل الفرن فوق الطاقة المعتمدة", "إعادة المعالجة الحرارية وإعادة القياس"],
  ["تجاوز زمن التبريد السريع", "فتح متكرر لباب غرفة التبريد", "تبريد سريع ثانٍ وتقليل حمولة العربة"],
  ["حرارة الحشوة المبردة أعلى من الحد", "إخراج الحشوة قبل وقت الاستخدام", "استبدال الحشوة وتحديد كمية الإخراج"],
  ["بطاقة بيان بتاريخ انتهاء غير صحيح", "خطأ إدخال في طابعة الملصقات", "إعادة الطباعة وفحص كل العبوات"],
  ["إخفاق اختبار كاشف المعادن بقطعة الاختبار", "انحراف حساسية الجهاز", "إعادة الضبط وإعادة تمرير عبوات الفترة"],
  ["حرارة غرفة التخزين المبرد خارج الحد", "عطل مؤقت في ضاغط التبريد", "نقل المنتج لغرفة بديلة وإصلاح الضاغط"],
];
const CCP: { stage: number; limit: string; unit: string; ok: number[]; bad: number[] }[] = [
  { stage: 4, limit: "75 م أو أعلى", unit: "م", ok: [76.4, 82.1, 88.6], bad: [73.2, 81.7, 88.6] },
  { stage: 5, limit: "5 م أو أقل", unit: "م", ok: [2.8, 4.1, 4.9], bad: [2.8, 4.3, 6.2] },
  { stage: 8, limit: "حديدي 1.5 مم أو أدق", unit: "مم", ok: [1.2, 1.4, 1.5], bad: [1.2, 1.4, 1.8] },
  { stage: 9, limit: "من 0 إلى 5 م", unit: "م", ok: [1.9, 3.1, 4.6], bad: [1.9, 3.3, 5.8] },
];
const PRP: [string, number][] = [["التنظيف والتطهير", 21], ["مكافحة الآفات", 7], ["صحة العاملين ونظافتهم", 14], ["المياه", 7], ["معايرة الأجهزة", 6], ["حرارة غرف التبريد", 42], ["إدارة مسببات الحساسية", 14], ["النفايات", 14], ["تدريب العاملين", 3]];
const SUPPLIERS = ["مطاحن الرياض الحديثة", "شركة ألبان الصافي", "مكسرات الشام للتجارة", "شركة السكر المتحدة", "مصنع التغليف الذهبي"];
const DEVICES = ["ميزان التحضير 1", "ميزان التحضير 2", "مجس حرارة الفرن", "مجس غرفة التبريد", "كاشف المعادن", "ميزان التعبئة"];
const MANAGERS = ["م. عبدالعزيز الراشد", "د. منى السبيعي", "م. تركي الغامدي"];
const COMPLAINTS: [string, string, string][] = [["تطبيق الولاء", "طراوة المنتج أقل من المعتاد", "استبدال المنتج ومراجعة زمن العرض في الفرع"], ["اتصال هاتفي", "عبوة بغطاء غير محكم", "تعويض العميل وفحص عبوات الباتش في الفرع"], ["الفرع", "اختلاف شكل التزيين عن الصورة", "تذكير فريق التزيين ببطاقة المنتج"]];

export function QualityReport({ row, back }: { row: Row; back: () => void }) {
  const { d, log } = useDemo();
  const toast = useToast();
  const no = String(row.no ?? "");
  const seed = Number(no.replace(/\D/g, "")) || 7;
  const week = String(row.period ?? "").replace("أسبوع ", "") || today();
  const issue = row.status === "معتمد" ? shift(week, 7) : today();
  const B = Number(row.batches) || 0; const C = Number(row.checks) || 0; const R = Math.min(B, Number(row.rejected) || 0); const K = Number(row.complaints) || 0;
  const given = Number.parseFloat(String(row.pass ?? "100")) || 100;
  // Every rejected batch needs at least one failed check, so the failed checks never fall below the rejected batches.
  const fromRate = Math.round(C * (100 - given) / 100);
  const nc = Math.min(C, Math.max(fromRate, R));
  const rate = nc === fromRate ? `${one(given)}%` : `${one((C - nc) / (C || 1) * 100)}%`;
  const held = Math.min(B - R, Math.max(0, Math.min(2, nc - R)));
  const released = B - R - held;
  const prepared = String(row.issuedBy ?? "مسؤول الجودة"); const reviewer = MANAGERS[seed % 3]; const approver = MANAGERS[(seed + 1) % 3];
  const [approvedAt, setApprovedAt] = useState(row.status === "معتمد" ? `${issue} 10:30` : "");
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [all, setAll] = useState(false);
  const status = approvedAt ? "معتمد" : String(row.status ?? "مسودة");

  const stageChecks = spread(C, STAGE_WEIGHTS, 4);
  const dayChecks = spread(C, DAY_WEIGHTS, 4);
  const stamp = week.slice(2).replaceAll("-", "");
  const orders = d.mfgOrders;
  const covered = Array.from({ length: B }, (_, i) => { const order = orders[(seed + i) % orders.length]; return { batch: `B-${stamp}-${pad(i + 1)}`, product: String(order.product), qty: Number(order.planned) || 0, unit: String(order.unit), line: String(order.line), decision: i < R ? "مرفوض" : i < R + held ? "محجوز" : "مفرج عنه", inspector: String(order.inspector) }; });
  const good = covered.filter(item => item.decision === "مفرج عنه");
  // One row per failed check: the first ones belong to the rejected batches, the next to the held batches, the rest were corrected on the line.
  const findings = Array.from({ length: nc }, (_, k) => { const stage = (seed + k * 3) % 10; const day = (seed * 2 + k * 5) % 7; const item = k < R + held ? covered[k] : good[k % (good.length || 1)] ?? covered[0]; const open = k >= R && k < R + held; return { no: `NC-${stamp}-${pad(k + 1)}`, stage, day, date: shift(week, day), batch: item?.batch ?? "", product: item?.product ?? "", finding: FINDINGS[stage], disposition: k < R ? "رفض الباتش وإتلافه" : open ? "حجز الباتش لحين إعادة الفحص" : "تصحيح فوري ثم الإفراج", owner: item?.inspector ?? prepared, closed: open ? "" : shift(week, Math.min(6, day + 1)), status: open ? "قيد المعالجة" : "مكتمل" }; });
  const stageBad = Array.from({ length: 10 }, (_, i) => findings.filter(item => item.stage === i).length);
  const dayBad = Array.from({ length: 7 }, (_, i) => findings.filter(item => item.day === i).length);
  const pct = (total: number, bad: number) => total ? (total - bad) / total * 100 : 100;
  const first = new Date(`${week}T00:00:00Z`); const firstDay = Number.isNaN(first.getTime()) ? 0 : first.getUTCDay();
  const prp = PRP.map(([name, planned], i) => { const done = planned - ((seed + i * 2) % 5 === 0 ? 1 : 0); return { name, planned, done, pct: Math.round(done / planned * 100) }; });
  const prpAll = Math.round(prp.reduce((total, item) => total + item.done, 0) / prp.reduce((total, item) => total + item.planned, 0) * 1000) / 10;
  const lab = good.slice(0, 6).map((item, i) => ({ ...item, count: `${one(1.1 + ((seed + i * 3) % 8) * 0.4)} × 10²`, at: shift(week, i % 6 + 1) }));
  const suppliers = SUPPLIERS.map((name, i) => { const total = 4 + (seed + i * 3) % 6; const refused = (seed + i) % 9 === 0 ? 1 : 0; return { name, total, refused, score: Math.round((total - refused) / total * 100) - (i + seed) % 3 }; });
  const complaints = Array.from({ length: K }, (_, i) => { const item = good[(seed + i * 4) % (good.length || 1)]; return { no: `CC-${stamp}-${pad(i + 1)}`, date: shift(week, (seed + i * 2) % 7), batch: item?.batch ?? "", product: item?.product ?? "", text: COMPLAINTS[(seed + i) % 3] }; });
  const releaseHours = one(3.5 + (seed % 5) * 0.4);
  const totalQty = covered.reduce((total, item) => total + item.qty, 0);

  const act = (title: string, message: string) => { setSteps(current => [...current, { title, meta: `${today()} ${clock()} · مالك الحساب` }]); log(`${title} ${no}`); toast(message); };
  const approve = () => { const at = `${today()} ${clock()}`; setApprovedAt(at); const saved = d.qualityReports.find(item => item.id === row.id); if (saved) saved.status = "معتمد"; act("اعتُمد تقرير الجودة", "اعتُمد التقرير وأضيف توقيع الاعتماد"); };
  const trail: TraceStep[] = [
    { title: "أُعد التقرير من سجلات التشغيل", meta: `${issue} 08:${pad(10 + seed % 40)} · ${prepared}` },
    { title: "روجعت الأرقام مع سجلات نقاط التحكم الحرجة", meta: `${issue} 09:${pad(5 + seed % 50)} · ${reviewer}` },
    ...(row.status === "معتمد" ? [{ title: "اعتُمد التقرير", meta: `${issue} 10:30 · ${approver}` }] : []),
    ...steps,
  ];
  const kpis: [string, string, string?][] = [["الباتشات المشمولة", n(B)], ["الفحوصات المنفذة", n(C)], ["نسبة المطابقة", rate, "good"], ["باتشات مفرج عنها", n(released), "good"], ["باتشات مرفوضة", n(R), R ? "bad" : "good"], ["باتشات محجوزة", n(held), held ? "warn" : "good"], ["شكاوى العملاء", n(K), K ? "warn" : "good"], ["انحرافات مفتوحة", n(held), held ? "warn" : "good"], ["متوسط زمن الإفراج", `${releaseHours} ساعة`]];
  const shown = all ? covered : covered.slice(0, 10);

  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />العودة إلى تقارير الجودة</button>
    <div className={s.actions}>
      <button type="button" className={s.primary} disabled={!!approvedAt} onClick={approve}><BadgeCheck size={16} aria-hidden="true" />{approvedAt ? "التقرير معتمد" : "اعتماد التقرير"}</button>
      <button type="button" className={s.ghost} onClick={() => act("طُبع تقرير الجودة", "أُرسل التقرير للطابعة")}><Printer size={15} aria-hidden="true" />طباعة</button>
      <button type="button" className={s.ghost} onClick={() => act("نُزلت نسخة PDF من تقرير الجودة", "جُهزت نسخة PDF من التقرير")}><Download size={15} aria-hidden="true" />تنزيل PDF</button>
      <button type="button" className={s.ghost} onClick={() => act("أُرسل للإدارة تقرير الجودة", "أُرسل التقرير للإدارة في العرض التجريبي")}><Send size={15} aria-hidden="true" />إرسال للإدارة</button>
    </div>

    <article className={q.doc} aria-label="تقرير الجودة">
      <header className={q.head}>
        <div className={q.brand}><i><ShieldCheck size={26} aria-hidden="true" /></i><div><strong>مصنع خيال الديم للحلويات</strong><span>إدارة الجودة وسلامة الغذاء</span></div></div>
        <div className={q.title}><span>تقرير الجودة وسلامة الغذاء الأسبوعي</span><h2><bdi>{no}</bdi></h2><Badge>{status}</Badge></div>
      </header>
      <dl className={q.meta}>
        <div><dt>الفترة</dt><dd><bdi>{week}</bdi> إلى <bdi>{shift(week, 6)}</bdi></dd></div>
        <div><dt>تاريخ الإصدار</dt><dd><bdi>{issue}</bdi></dd></div>
        <div><dt>أعده</dt><dd>{prepared}</dd></div>
        <div><dt>راجعه</dt><dd>{reviewer}</dd></div>
        <div><dt>اعتمده</dt><dd>{approvedAt ? approver : "بانتظار الاعتماد"}</dd></div>
        <div><dt>نطاق التقرير</dt><dd>كل خطوط الإنتاج</dd></div>
      </dl>

      <section className={q.summary}><h3>الملخص التنفيذي</h3>
        <p>خلال الفترة أُنتج <b><bdi>{n(B)}</bdi> باتش</b> بإجمالي <b><bdi>{n(totalQty)}</bdi> وحدة</b> ونُفذ عليها <b><bdi>{n(C)}</bdi> فحص</b> طابق منها <b><bdi>{n(C - nc)}</bdi></b> بنسبة مطابقة <b><bdi>{rate}</bdi></b> وسُجلت <b><bdi>{n(nc)}</bdi> حالة عدم مطابقة</b> أُغلق منها <b><bdi>{n(nc - held)}</bdi></b> وأُفرج عن <b><bdi>{n(released)}</bdi> باتش</b> ورُفض <b><bdi>{n(R)}</bdi></b> وبقي <b><bdi>{n(held)}</bdi></b> محجوزًا ووردت <b><bdi>{n(K)}</bdi> شكوى</b> من العملاء</p>
      </section>
      <div className={q.kpis}>{kpis.map(([label, value, tone]) => <div key={label} className={tone ? q[tone] : ""}><span>{label}</span><strong><bdi>{value}</bdi></strong></div>)}</div>

      <div className={q.two}>
        <section className={q.sec}><h3><em>1</em>المطابقة حسب مرحلة التصنيع</h3>
          <div className={q.bars}>{d.stages.map((name, i) => { const value = pct(stageChecks[i], stageBad[i]); return <div key={name} className={q.bar}>
            <div><strong>{name}</strong><span><bdi>{n(stageChecks[i])}</bdi> فحص · <bdi>{n(stageBad[i])}</bdi> عدم مطابقة</span></div>
            <div className={q.track}><i className={stageBad[i] ? q.fillWarn : ""} style={{ width: `${Math.max(6, (value - 90) * 10)}%` }} /></div>
            <b><bdi>{one(value)}%</bdi></b>
          </div>; })}</div>
          <p className={q.foot}>مجموع الفحوص <bdi>{n(C)}</bdi> ومجموع حالات عدم المطابقة <bdi>{n(nc)}</bdi> والشريط يبدأ من 90%</p>
        </section>
        <section className={q.sec}><h3><em>2</em>اتجاه المطابقة اليومي</h3>
          <div className={q.trend} role="img" aria-label="نسبة المطابقة لكل يوم من أيام الأسبوع">{dayChecks.map((total, i) => { const value = pct(total, dayBad[i]); return <div key={i}>
            <b><bdi>{one(value)}%</bdi></b>
            <div className={q.col}><i className={dayBad[i] ? q.fillWarn : ""} style={{ height: `${Math.max(8, (value - 90) * 10)}%` }} /></div>
            <strong>{DAYS[(firstDay + i) % 7]}</strong><span><bdi>{n(total)}</bdi> فحص</span>
          </div>; })}</div>
          <p className={q.foot}>أعلى يوم <bdi>{one(Math.max(...dayChecks.map((total, i) => pct(total, dayBad[i]))))}%</bdi> وأدنى يوم <bdi>{one(Math.min(...dayChecks.map((total, i) => pct(total, dayBad[i]))))}%</bdi></p>
        </section>
      </div>

      <section className={q.sec}><h3><em>3</em>نقاط التحكم الحرجة</h3>
        <div className={q.wrap}><table className={q.tbl}><thead><tr><th>نقطة التحكم</th><th>الحد الحرج</th><th>عدد القراءات</th><th>أدنى قراءة</th><th>المتوسط</th><th>أعلى قراءة</th><th>خارج الحد</th><th>النتيجة</th></tr></thead>
          <tbody>{CCP.map(point => { const bad = stageBad[point.stage]; const values = bad ? point.bad : point.ok; return <tr key={point.stage}><td><strong>{d.stages[point.stage]}</strong></td><td>{point.limit}</td><td><bdi>{n(stageChecks[point.stage])}</bdi></td>{values.map((value, i) => <td key={i}><bdi>{one(value)} {point.unit}</bdi></td>)}<td><bdi className={bad ? q.red : ""}>{n(bad)}</bdi></td><td><Badge>{bad ? "غير مطابق" : "مطابق"}</Badge></td></tr>; })}</tbody></table></div>
        <p className={q.foot}>كل قراءة خارج الحد أوقفت الباتش وفتحت إجراء تصحيحي في القسم 5</p>
      </section>

      <section className={q.sec}><h3><em>4</em>الباتشات المشمولة بالتقرير</h3>
        <div className={q.wrap}><table className={q.tbl}><thead><tr><th>الباتش</th><th>المنتج</th><th>الكمية</th><th>الخط</th><th>قرار الفحص النهائي</th><th>مسؤول الفحص</th></tr></thead>
          <tbody>{shown.map(item => <tr key={item.batch}><td><bdi className={q.code}>{item.batch}</bdi></td><td><strong>{item.product}</strong></td><td><bdi>{n(item.qty)}</bdi> {item.unit}</td><td>{item.line}</td><td><Badge>{item.decision}</Badge></td><td>{item.inspector}</td></tr>)}{!B && <tr><td colSpan={6}>لم تضف باتشات لهذا التقرير بعد</td></tr>}</tbody></table></div>
        <p className={q.foot}>الباتشات ذات الملاحظات أولًا · مفرج عنه <bdi>{n(released)}</bdi> · محجوز <bdi>{n(held)}</bdi> · مرفوض <bdi>{n(R)}</bdi> · المجموع <bdi>{n(B)}</bdi>{B > 10 && <button type="button" className={q.more} onClick={() => setAll(!all)}>{all ? "عرض أول 10 باتشات" : `عرض كل الباتشات ${n(B)}`}</button>}</p>
      </section>

      <section className={q.sec}><h3><em>5</em>حالات عدم المطابقة والإجراءات التصحيحية</h3>
        <div className={q.wrap}><table className={q.tbl}><thead><tr><th>الرقم</th><th>التاريخ</th><th>الباتش</th><th>المرحلة</th><th>الملاحظة</th><th>السبب الجذري</th><th>الإجراء التصحيحي</th><th>التصرف في المنتج</th><th>المسؤول</th><th>تاريخ الإغلاق</th><th>الحالة</th></tr></thead>
          <tbody>{findings.map(item => <tr key={item.no}><td><bdi className={q.code}>{item.no}</bdi></td><td><bdi>{item.date}</bdi></td><td><bdi className={q.code}>{item.batch}</bdi></td><td>{d.stages[item.stage]}</td><td><strong>{item.finding[0]}</strong></td><td>{item.finding[1]}</td><td>{item.finding[2]}</td><td>{item.disposition}</td><td>{item.owner}</td><td>{item.closed ? <bdi>{item.closed}</bdi> : "مفتوح"}</td><td><Badge>{item.status}</Badge></td></tr>)}{!nc && <tr><td colSpan={11}>لم تسجل أي حالة عدم مطابقة في هذه الفترة</td></tr>}</tbody></table></div>
        <p className={q.foot}>المسجل <bdi>{n(nc)}</bdi> · المغلق <bdi>{n(nc - held)}</bdi> · المفتوح <bdi>{n(held)}</bdi></p>
      </section>

      <div className={q.two}>
        <section className={q.sec}><h3><em>6</em>الالتزام بالبرامج الأولية</h3>
          <div className={q.bars}>{prp.map(item => <div key={item.name} className={q.bar}>
            <div><strong>{item.name}</strong><span>نُفذ <bdi>{n(item.done)}</bdi> من <bdi>{n(item.planned)}</bdi></span></div>
            <div className={q.track}><i className={item.pct < 100 ? q.fillWarn : ""} style={{ width: `${item.pct}%` }} /></div>
            <b><bdi>{item.pct}%</bdi></b>
          </div>)}</div>
          <p className={q.foot}>الالتزام العام <bdi>{one(prpAll)}%</bdi></p>
        </section>
        <section className={q.sec}><h3><em>7</em>حالة معايرة الأجهزة</h3>
          <div className={q.wrap}><table className={q.tbl}><thead><tr><th>الجهاز</th><th>آخر معايرة</th><th>المعايرة القادمة</th><th>الانحراف</th><th>الحالة</th></tr></thead>
            <tbody>{DEVICES.map((name, i) => <tr key={name}><td><strong>{name}</strong></td><td><bdi>{shift(week, -((seed + i * 5) % 20) - 1)}</bdi></td><td><bdi>{shift(week, 30 - (seed + i * 5) % 20)}</bdi></td><td><bdi>{one(((seed + i) % 4) * 0.1)}</bdi></td><td><Badge>ساري</Badge></td></tr>)}</tbody></table></div>
          <p className={q.foot}>كل الأجهزة ضمن حد الانحراف المسموح ومعايرتها سارية</p>
        </section>
      </div>

      <section className={q.sec}><h3><em>8</em>نتائج المختبر الميكروبية</h3>
        <div className={q.wrap}><table className={q.tbl}><thead><tr><th>الباتش</th><th>المنتج</th><th>تاريخ النتيجة</th><th>العد الكلي للبكتيريا</th><th>القولونيات</th><th>الإشريكية القولونية</th><th>السالمونيلا في 25 جم</th><th>الخمائر والأعفان</th><th>النتيجة</th></tr></thead>
          <tbody>{lab.map(item => <tr key={item.batch}><td><bdi className={q.code}>{item.batch}</bdi></td><td><strong>{item.product}</strong></td><td><bdi>{item.at}</bdi></td><td><bdi>{item.count}</bdi></td><td><bdi>أقل من 10</bdi></td><td>لم تكتشف</td><td>لم تكتشف</td><td><bdi>أقل من 10</bdi></td><td><Badge>مطابق</Badge></td></tr>)}{!lab.length && <tr><td colSpan={9}>لا توجد عينات مفرج عنها في هذه الفترة</td></tr>}</tbody></table></div>
        <p className={q.foot}>القيم بوحدة مستعمرة لكل جرام وسُحبت عينة من كل باتش وتعرض هنا <bdi>{n(lab.length)}</bdi> عينات من الباتشات المفرج عنها</p>
      </section>

      <div className={q.two}>
        <section className={q.sec}><h3><em>9</em>شكاوى العملاء</h3>
          <div className={q.wrap}><table className={q.tbl}><thead><tr><th>الرقم</th><th>التاريخ</th><th>القناة</th><th>الباتش</th><th>الشكوى</th><th>الإجراء</th><th>الحالة</th></tr></thead>
            <tbody>{complaints.map(item => <tr key={item.no}><td><bdi className={q.code}>{item.no}</bdi></td><td><bdi>{item.date}</bdi></td><td>{item.text[0]}</td><td><bdi className={q.code}>{item.batch}</bdi></td><td><strong>{item.text[1]}</strong></td><td>{item.text[2]}</td><td><Badge>مكتمل</Badge></td></tr>)}{!K && <tr><td colSpan={7}>لم ترد أي شكوى في هذه الفترة</td></tr>}</tbody></table></div>
          <p className={q.foot}>الشكاوى الواردة <bdi>{n(K)}</bdi> وأُغلقت كلها خلال الفترة</p>
        </section>
        <section className={q.sec}><h3><em>10</em>تقييم الموردين</h3>
          <div className={q.wrap}><table className={q.tbl}><thead><tr><th>المورد</th><th>الشحنات</th><th>المقبولة</th><th>المرفوضة</th><th>التقييم</th></tr></thead>
            <tbody>{suppliers.map(item => <tr key={item.name}><td><strong>{item.name}</strong></td><td><bdi>{n(item.total)}</bdi></td><td><bdi>{n(item.total - item.refused)}</bdi></td><td><bdi className={item.refused ? q.red : ""}>{n(item.refused)}</bdi></td><td><bdi>{item.score}%</bdi></td></tr>)}</tbody></table></div>
          <p className={q.foot}>الشحنات المستلمة <bdi>{n(suppliers.reduce((total, item) => total + item.total, 0))}</bdi> والمرفوضة <bdi>{n(suppliers.reduce((total, item) => total + item.refused, 0))}</bdi></p>
        </section>
      </div>

      <div className={q.two}>
        <section className={q.sec}><h3><em>11</em>التوقيعات</h3>
          <div className={q.signs}>
            <div><span>أعده</span><strong>{prepared}</strong><small>مسؤول الجودة</small><bdi>{issue} 08:{pad(10 + seed % 40)}</bdi></div>
            <div><span>راجعه</span><strong>{reviewer}</strong><small>مدير المصنع</small><bdi>{issue} 09:{pad(5 + seed % 50)}</bdi></div>
            <div className={approvedAt ? "" : q.pending}><span>اعتمده</span><strong>{approver}</strong><small>مدير سلامة الغذاء</small>{approvedAt ? <bdi>{approvedAt}</bdi> : <em>بانتظار الاعتماد</em>}</div>
          </div>
        </section>
        <section className={q.sec}><h3><em>12</em>سجل التقرير</h3><Trace steps={trail} /></section>
      </div>
      <p className={q.note}>أرقام هذا التقرير تجريبية للعرض ويراجعها مسؤول الجودة لديكم قبل أي اعتماد رسمي</p>
    </article>
  </>;
}
