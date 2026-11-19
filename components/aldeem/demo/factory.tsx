"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Factory, PackageSearch, ShieldCheck, Tag, Undo2 } from "lucide-react";
import type { Row } from "./data";
import { Badge, Kpis, Register, useToast } from "./kit";
import { clock, FullScreen, useDemo } from "./store";
import s from "./demo.module.css";
import f from "./factory.module.css";

type Check = { label: string; limit: string; sample?: string };
type StageDef = { ccp?: string; checks: Check[] };

// Stage checks follow food-safety and HACCP practice; critical control points carry their critical limit.
const STAGE_DEFS: StageDef[] = [
  { checks: [{ label: "المورد ضمن قائمة الموردين المعتمدين", limit: "اعتماد ساري" }, { label: "شهادة التحليل مرفقة ومطابقة", limit: "لكل تشغيلة مستلمة" }, { label: "درجة حرارة استلام المواد المبردة", limit: "5 م أو أقل", sample: "3.8 م" }, { label: "تاريخ الانتهاء وسلامة العبوات", limit: "صلاحية متبقية كافية" }, { label: "نظافة مركبة النقل وخلوها من الآفات", limit: "نظيفة ومبردة" }] },
  { checks: [{ label: "تطبيق ما ينتهي أولًا يصرف أولًا", limit: "بطاقة التشغيلة ظاهرة" }, { label: "فصل مسببات الحساسية عن باقي المواد", limit: "أرفف مخصصة وموسومة" }, { label: "حرارة غرفة التبريد", limit: "من 0 إلى 5 م", sample: "3.1 م" }, { label: "رطوبة المستودع الجاف", limit: "60% أو أقل", sample: "48%" }, { label: "رفع المواد عن الأرض والجدران", limit: "15 سم على الأقل" }] },
  { checks: [{ label: "مطابقة الوصفة المعتمدة والكميات", limit: "حسب بطاقة الوصفة" }, { label: "معايرة الميزان قبل التشغيل", limit: "وزن مرجعي مطابق", sample: "1000 جم" }, { label: "تسجيل تشغيلات المواد المستخدمة", limit: "لكل مادة" }, { label: "أدوات مخصصة لمسببات الحساسية", limit: "لون مميز" }] },
  { checks: [{ label: "نظافة الأسطح والمعدات قبل البدء", limit: "بعد التنظيف والتطهير" }, { label: "نظافة العاملين وغسل الأيدي والقفازات", limit: "قبل كل دفعة" }, { label: "زمن بقاء العجين خارج التبريد", limit: "30 دقيقة أو أقل", sample: "18 د" }, { label: "خلو المنتج من الأجسام الغريبة", limit: "فحص بصري" }] },
  { ccp: "درجة حرارة قلب المنتج وزمن المعالجة", checks: [{ label: "درجة حرارة قلب المنتج", limit: "75 م أو أعلى", sample: "82 م" }, { label: "زمن المعالجة الحرارية", limit: "حسب بطاقة المنتج", sample: "22 د" }, { label: "معايرة مجس الحرارة", limit: "يوميًا قبل التشغيل" }, { label: "تسجيل القراءة لكل دفعة", limit: "كل دفعة" }] },
  { ccp: "الوصول إلى 5 م أو أقل خلال الزمن المحدد", checks: [{ label: "درجة حرارة المنتج بعد التبريد", limit: "5 م أو أقل", sample: "4.2 م" }, { label: "زمن التبريد", limit: "120 دقيقة أو أقل", sample: "95 د" }, { label: "تغطية المنتج أثناء التبريد", limit: "مغطى بالكامل" }] },
  { checks: [{ label: "حرارة الحشوات المبردة", limit: "5 م أو أقل", sample: "3.5 م" }, { label: "تبديل القفازات وتعقيم الأدوات", limit: "كل 30 دقيقة" }, { label: "فصل منتجات مسببات الحساسية", limit: "خط أو وقت مستقل" }] },
  { checks: [{ label: "سلامة العبوة وإحكام الإغلاق", limit: "بدون تسريب" }, { label: "مطابقة بطاقة البيان للمنتج والتشغيلة", limit: "مطابقة كاملة" }, { label: "إبراز مسببات الحساسية ضمن المكونات", limit: "بخط مميز" }, { label: "الوزن الصافي", limit: "ضمن حد السماح", sample: "502 جم" }, { label: "تاريخ الإنتاج والانتهاء ورقم التشغيلة", limit: "مطبوعة وواضحة" }] },
  { ccp: "كشف المعادن لكل العبوات", checks: [{ label: "اختبار الجهاز بقطع الاختبار", limit: "حديدي وغير حديدي وفولاذ" }, { label: "مرور كل العبوات عبر الجهاز", limit: "كل العبوات" }, { label: "عزل العبوات المرفوضة", limit: "صندوق مقفل" }, { label: "الفحص الحسي وحفظ العينة المرجعية", limit: "حتى نهاية الصلاحية" }] },
  { ccp: "درجة حرارة التخزين المبرد", checks: [{ label: "حرارة غرفة التخزين المبرد", limit: "من 0 إلى 5 م", sample: "2.9 م" }, { label: "مراجعة سجلات كل المراحل", limit: "مكتملة وموقعة" }, { label: "قرار الإفراج من مسؤول الجودة", limit: "موقع" }, { label: "حرارة مركبة التوزيع قبل التحميل", limit: "5 م أو أقل", sample: "3.4 م" }] },
];

const INGREDIENTS: Record<string, { list: [string, boolean][]; storage: string; raw: [string, string][] }> = {
  "حلويات شرقية": { list: [["طحين القمح", true], ["سكر", false], ["سمن بلدي (حليب)", true], ["فستق حلبي", true], ["قشطة (حليب)", true], ["ماء ورد", false]], storage: "يحفظ مبردًا من 0 إلى 5 م", raw: [["طحين فاخر", "مطاحن الرياض الحديثة"], ["سمن بلدي", "مؤسسة السمن البلدي"], ["فستق حلبي", "مكسرات الشام للتجارة"], ["سكر ناعم", "شركة السكر المتحدة"]] },
  "كيك وحلى": { list: [["طحين القمح", true], ["سكر", false], ["بيض", true], ["زبدة (حليب)", true], ["كريمة خفق (حليب)", true], ["شوكولاتة (صويا)", true]], storage: "يحفظ مبردًا من 0 إلى 5 م", raw: [["طحين فاخر", "مطاحن الرياض الحديثة"], ["زبدة غير مملحة", "شركة ألبان الصافي"], ["كريمة خفق", "شركة ألبان الصافي"], ["شوكولاتة خام بلجيكية", "شوكولاتة بروكسل للاستيراد"]] },
  "شوكولاتة وتمور": { list: [["تمر", false], ["شوكولاتة (حليب وصويا)", true], ["لوز", true], ["سكر", false], ["هيل", false]], storage: "يحفظ في مكان جاف وبارد بعيدًا عن الشمس", raw: [["تمر سكري", "مؤسسة تمور القصيم"], ["شوكولاتة خام بلجيكية", "شوكولاتة بروكسل للاستيراد"], ["لوز مقشر", "مكسرات الشام للتجارة"], ["علب تغليف فاخرة", "مصنع التغليف الذهبي"]] },
  "ضيافة ومناسبات": { list: [["طحين القمح", true], ["سكر", false], ["سمن بلدي (حليب)", true], ["مكسرات مشكلة", true], ["تمر", false], ["عسل طبيعي", false]], storage: "يحفظ مبردًا من 0 إلى 5 م", raw: [["طحين فاخر", "مطاحن الرياض الحديثة"], ["عسل طبيعي", "مزارع العسل الجبلي"], ["جوز مقشر", "مكسرات الشام للتجارة"], ["علب تغليف فاخرة", "مصنع التغليف الذهبي"]] },
  "مبردات": { list: [["حليب", true], ["سكر", false], ["قشطة (حليب)", true], ["فستق حلبي", true], ["مستكة", false]], storage: "يحفظ مبردًا من 0 إلى 5 م", raw: [["قشطة طازجة", "شركة ألبان الصافي"], ["كريمة خفق", "شركة ألبان الصافي"], ["فستق حلبي", "مكسرات الشام للتجارة"], ["سكر ناعم", "شركة السكر المتحدة"]] },
};
const PRP: [string, string[]][] = [
  ["التنظيف والتطهير", ["تنظيف وتطهير خطوط الإنتاج قبل التشغيل", "تطهير الأسطح الملامسة للغذاء بعد كل دفعة", "تنظيف الأرضيات والمصارف نهاية الوردية"]],
  ["مكافحة الآفات", ["فحص المصائد ومحطات الطعوم", "سلامة الستائر الهوائية وإغلاق المنافذ"]],
  ["صحة العاملين ونظافتهم", ["سريان الشهادات الصحية للعاملين", "الزي النظيف وغطاء الرأس والقفازات", "استبعاد من تظهر عليه أعراض مرضية"]],
  ["المياه", ["قراءة الكلور الحر في مياه التشغيل", "نظافة خزانات المياه وسجل تعقيمها"]],
  ["معايرة الأجهزة", ["معايرة موازين التحضير", "معايرة مجسات الحرارة وكاشف المعادن"]],
  ["حرارة غرف التبريد", ["غرفة التبريد من 0 إلى 5 م", "غرفة التجميد 18 م تحت الصفر أو أقل"]],
  ["إدارة مسببات الحساسية", ["تخزين مسببات الحساسية في أرفف موسومة", "تنظيف فاصل بين منتجات مسببات الحساسية"]],
  ["النفايات", ["تفريغ الحاويات المغطاة وغسلها", "فصل المنتجات التالفة في منطقة العزل"]],
  ["تدريب العاملين", ["تذكير بداية الوردية بممارسات سلامة الغذاء", "تدريب العاملين الجدد قبل دخول الخط"]],
];
const PEOPLE = ["فهد العتيبي", "نورة القحطاني", "سلطان الدوسري", "ريم الشمري", "خالد الحربي", "سارة المطيري"];
const pad = (value: number) => String(value).padStart(2, "0");
const stageTime = (order: number, stage: number) => `${pad(6 + stage)}:${pad((order * 7 + stage * 11) % 60)}`;
const n = (value: number) => value.toLocaleString("en-US");

function Rail({ live, held, view, onPick }: { live: number; held?: boolean; view?: number; onPick?: (stage: number) => void }) {
  return <div className={f.rail} role="list" aria-label="مراحل التصنيع العشر">{STAGE_DEFS.map((def, index) => {
    const state = index < live ? f.done : index === live ? (held ? f.held : f.now) : "";
    return <button type="button" role="listitem" key={index} disabled={!onPick} aria-current={view === index ? "step" : undefined} className={`${f.step} ${state} ${view === index ? f.viewing : ""}`} onClick={() => onPick?.(index)} title={def.ccp ? "نقطة تحكم حرجة" : undefined}>
      <i>{index < live ? <Check size={13} aria-hidden="true" /> : <bdi>{index + 1}</bdi>}</i>{def.ccp && <em>حرجة</em>}
    </button>;
  })}</div>;
}

export function DemoFactory({ section }: { section: string }) {
  const { d, stages, passStage, log } = useDemo();
  const toast = useToast();
  const [openId, setOpenId] = useState("");
  const [view, setView] = useState<number | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [approvals, setApprovals] = useState<Record<string, { by: string; at: string }>>({});
  const [holds, setHolds] = useState<Record<string, string>>({});
  const [deviation, setDeviation] = useState<string | null>(null);
  const [traceId, setTraceId] = useState("");
  const [recalled, setRecalled] = useState<Record<string, boolean>>({});
  const [prp, setPrp] = useState<Record<string, string>>(() => Object.fromEntries(PRP.flatMap(([, items], group) => items.map((_, index) => [`${group}:${index}`, (group + index) % 4 === 3 ? "" : `${pad(6 + (group % 3))}:${pad((group * 13 + index * 9) % 60)}`]))));

  const orders = d.mfgOrders;
  const liveOf = (order: Row) => stages[order.id] ?? 0;
  const statusOf = (order: Row) => liveOf(order) >= 10 ? "مكتمل" : holds[order.id] ? "محجوز" : "قيد الإنتاج";
  const product = (name: string) => d.products.find(item => item.name === name) ?? d.products[0];
  const open = (id: string) => { setOpenId(id); setView(null); setDeviation(null); };
  const running = orders.filter(order => liveOf(order) < 10);
  const kpis = [
    { label: "أوامر قيد الإنتاج", value: n(running.length) },
    { label: "أوامر مكتملة ومفرج عنها", value: n(orders.length - running.length), tone: "good" as const },
    { label: "باتشات محجوزة", value: n(Object.keys(holds).length), tone: Object.keys(holds).length ? "bad" as const : "good" as const },
    { label: "نقاط التحكم الحرجة", value: "4", note: "خبز وتبريد وكشف معادن وتخزين مبرد" },
    { label: "مراحل معتمدة اليوم", value: n(orders.reduce((total, order) => total + liveOf(order), 0)), tone: "good" as const },
  ];
  const honest = <p className={s.note}>المراحل وفحوصها مبنية على ممارسات سلامة الغذاء ونظام تحليل المخاطر ونقاط التحكم الحرجة المطبقة ضمن متطلبات الهيئة العامة للغذاء والدواء والمواصفات الخليجية للنظافة وبطاقة البيان ومدد الصلاحية ويراجعها مسؤول الجودة لديكم قبل الاعتماد الرسمي</p>;

  const current = orders.find(order => order.id === openId);
  const operator = current && (() => {
    const index = orders.indexOf(current); const live = liveOf(current); const stage = view ?? Math.min(live, 9); const def = STAGE_DEFS[stage];
    const key = (check: number) => `${current.id}:${stage}:${check}`;
    const isLive = stage === live && live < 10; const held = holds[current.id];
    const ready = def.checks.every((_, check) => ticks[key(check)]);
    const item = product(String(current.product)); const recipe = INGREDIENTS[item.category] ?? INGREDIENTS["حلويات شرقية"];
    const approved = approvals[`${current.id}:${stage}`] ?? { by: stage % 2 ? String(current.inspector) : String(current.supervisor), at: stageTime(index, stage) };
    const approve = () => { passStage(current.id); setApprovals(all => ({ ...all, [`${current.id}:${stage}`]: { by: String(current.inspector), at: clock() } })); setView(null); toast(stage === 9 ? `أُفرج عن الباتش ${String(current.batch)} وسُلّم للتخزين المبرد` : `اعتُمدت مرحلة ${d.stages[stage]}`); };
    const facts = [["الطاقة", `${320 + (index * 17) % 140} سعرة`], ["الدهون الكلية", `${12 + index % 9} جم`], ["الدهون المشبعة", `${5 + index % 5} جم`], ["الكربوهيدرات", `${38 + (index * 3) % 20} جم`], ["السكريات", `${18 + (index * 5) % 16} جم`], ["البروتين", `${4 + index % 5} جم`], ["الملح", `0.${2 + index % 6} جم`]];
    return <FullScreen title="واجهة تشغيل خط الإنتاج" subtitle={`${String(current.line)} · أمر ${String(current.no)} · باتش ${String(current.batch)}`} onClose={() => setOpenId("")}>
      <div className={f.op}>
        <aside className={f.list} aria-label="أوامر الإنتاج">{orders.map(order => <button type="button" key={order.id} className={`${f.listItem} ${order.id === current.id ? f.listOn : ""}`} onClick={() => open(order.id)}>
          <strong>{String(order.product)}</strong><span><bdi>{String(order.no)}</bdi> · {String(order.line)}</span>
          <div className={f.mini}><i style={{ width: `${liveOf(order) * 10}%` }} /></div><small>{liveOf(order) >= 10 ? "اكتملت كل المراحل" : `${d.stages[liveOf(order)]}`}</small>
        </button>)}</aside>
        <main className={f.main}>
          <section className={f.block}>
            <div className={f.blockHead}><div><h2>{String(current.product)}</h2><span>المخطط <bdi>{n(Number(current.planned))}</bdi> {String(current.unit)} · المشرف {String(current.supervisor)}</span></div><Badge>{statusOf(current)}</Badge></div>
            <Rail live={live} held={!!held} view={stage} onPick={setView} />
          </section>
          {held && <div className={f.hold} role="alert"><AlertTriangle size={20} aria-hidden="true" /><div><strong>الباتش محجوز بسبب انحراف</strong><span>الإجراء التصحيحي: {held}</span></div><button type="button" className={s.ghost} onClick={() => { setHolds(all => { const next = { ...all }; delete next[current.id]; return next; }); log(`إغلاق انحراف ورفع الحجز عن الباتش ${String(current.batch)}`); toast("أُغلق الانحراف ورُفع الحجز"); }}><Undo2 size={15} aria-hidden="true" />إغلاق الانحراف ورفع الحجز</button></div>}
          <section className={f.block}>
            <div className={f.blockHead}><div><span>المرحلة <bdi>{stage + 1}</bdi> من <bdi>10</bdi></span><h2>{d.stages[stage]}</h2></div>{def.ccp ? <span className={f.ccp}><ShieldCheck size={15} aria-hidden="true" />نقطة تحكم حرجة</span> : <span className={f.plain}>فحص تشغيلي</span>}</div>
            {def.ccp && <p className={f.limit}>الحد الحرج: {def.ccp} وأي قراءة خارج الحد توقف الباتش وتفتح إجراء تصحيحي</p>}
            <div className={f.checks}>{def.checks.map((check, i) => { const done = stage < live || !!ticks[key(i)]; return <div key={i} className={`${f.check} ${done ? f.checkOn : ""}`}>
              <div><strong>{check.label}</strong><span>الحد المطلوب: {check.limit}</span></div>
              {check.sample !== undefined && <input aria-label={`قراءة ${check.label}`} dir="ltr" lang="en" disabled={!isLive} value={readings[key(i)] ?? check.sample} onChange={event => setReadings(all => ({ ...all, [key(i)]: event.target.value }))} />}
              <button type="button" role="checkbox" aria-checked={done} aria-label={`تحقق من ${check.label}`} disabled={!isLive || !!held} className={f.tick} onClick={() => setTicks(all => ({ ...all, [key(i)]: !all[key(i)] }))}><Check size={16} aria-hidden="true" />{done ? "مطابق" : "تحقق"}</button>
            </div>; })}</div>
            {stage < live ? <p className={f.signed}><ClipboardCheck size={16} aria-hidden="true" />اعتمدها {approved.by} الساعة <bdi>{approved.at}</bdi></p>
              : isLive ? <div className={f.actions}>
                <button type="button" className={s.primary} disabled={!ready || !!held} onClick={approve}>{stage === 9 ? "اعتماد الإفراج عن الباتش" : "اعتماد المرحلة"}</button>
                <button type="button" className={s.ghost} disabled={!!held} onClick={() => setDeviation(deviation === null ? "" : null)}><AlertTriangle size={15} aria-hidden="true" />تسجيل انحراف</button>
                {!ready && !held && <small>تحقق من كل البنود لتفعيل الاعتماد</small>}
              </div> : <p className={f.signed}>تفتح هذه المرحلة بعد اعتماد ما قبلها</p>}
            {deviation !== null && isLive && !held && <div className={f.deviation}><label>الإجراء التصحيحي<textarea rows={2} value={deviation} placeholder="مثال: إعادة المعالجة الحرارية وإعادة القياس" onChange={event => setDeviation(event.target.value)} /></label><button type="button" className={s.primary} disabled={!deviation.trim()} onClick={() => { setHolds(all => ({ ...all, [current.id]: deviation.trim() })); log(`انحراف في ${d.stages[stage]} وحجز الباتش ${String(current.batch)}`); setDeviation(null); toast("حُجز الباتش وسُجل الانحراف"); }}>حجز الباتش</button></div>}
          </section>
          {honest}
        </main>
        <aside className={f.side}>
          <section className={f.block}><h3><Tag size={16} aria-hidden="true" />بطاقة البيان</h3>
            <div className={f.label}>
              <strong>{item.name}</strong>
              <p><b>المكونات بترتيب تنازلي:</b> {recipe.list.map(([name, allergen], i) => <span key={name}>{allergen ? <mark>{name}</mark> : name}{i < recipe.list.length - 1 ? "، " : ""}</span>)}</p>
              <p><b>مسببات الحساسية:</b> {recipe.list.filter(([, allergen]) => allergen).map(([name]) => name).join("، ")}</p>
              <dl>
                <div><dt>الوزن الصافي</dt><dd><bdi>500 جم</bdi></dd></div>
                <div><dt>رقم التشغيلة</dt><dd><bdi>{String(current.batch)}</bdi></dd></div>
                <div><dt>تاريخ الإنتاج</dt><dd><bdi>{String(current.date)}</bdi></dd></div>
                <div><dt>تاريخ الانتهاء</dt><dd><bdi>{d.day(item.shelf - Math.floor(index / 3))}</bdi></dd></div>
              </dl>
              <p><b>ظروف التخزين:</b> {recipe.storage}</p>
              <p><b>المنتج:</b> مصنع خيال الديم للحلويات - الرياض - المملكة العربية السعودية</p>
              <p><b>بلد المنشأ:</b> المملكة العربية السعودية</p>
              <table><caption>الحقائق التغذوية لكل 100 جم</caption><tbody>{facts.map(([name, value]) => <tr key={name}><td>{name}</td><td><bdi>{value}</bdi></td></tr>)}</tbody></table>
            </div>
          </section>
          <section className={f.block}><h3><ClipboardCheck size={16} aria-hidden="true" />سجل الباتش</h3>
            <ol className={f.log}>{Array.from({ length: Math.min(live, 10) }, (_, i) => { const record = approvals[`${current.id}:${i}`]; return <li key={i}><bdi>{record?.at ?? stageTime(index, i)}</bdi><span>{d.stages[i]}</span></li>; }).reverse()}{live === 0 && <li><span>لم تعتمد أي مرحلة بعد</span></li>}</ol>
          </section>
        </aside>
      </div>
    </FullScreen>;
  })();

  if (section === "manufacturing-quality-reports") return <Register title="تقارير الجودة" def={{ action: "إصدار تقرير", kpis: [{ label: "تقارير الجودة", value: n(d.qualityReports.length) }, { label: "متوسط المطابقة", value: "97.8%", tone: "good" }, { label: "باتشات مرفوضة", value: n(d.qualityReports.reduce((total, row) => total + Number(row.rejected), 0)), tone: "bad" }, { label: "شكاوى العملاء", value: n(d.qualityReports.reduce((total, row) => total + Number(row.complaints), 0)), tone: "warn" }], rows: d.qualityReports, cols: [["no", "رقم التقرير", "code"], ["period", "الفترة"], ["batches", "الباتشات", "num"], ["checks", "الفحوصات", "num"], ["pass", "نسبة المطابقة"], ["rejected", "مرفوض", "num"], ["complaints", "شكاوى", "num"], ["issuedBy", "أعده"], ["status", "الحالة", "status"]] }} />;

  if (section === "manufacturing-quality") {
    const total = Object.keys(prp).length; const done = Object.values(prp).filter(Boolean).length;
    const ccpRows = orders.slice(0, 10).flatMap((order, index) => [4, 5, 8, 9].filter(stage => stage < liveOf(order)).slice(0, 2).map(stage => ({ id: `${order.id}:${stage}`, batch: String(order.batch), product: String(order.product), point: d.stages[stage], limit: String(STAGE_DEFS[stage].ccp), reading: STAGE_DEFS[stage].checks[0].sample ?? "مطابق", at: stageTime(index, stage), by: String(order.inspector) })));
    return <>
      <Kpis items={[{ label: "بنود البرامج الأولية اليوم", value: `${done} / ${total}`, tone: done === total ? "good" : "warn" }, { label: "قراءات نقاط التحكم الحرجة", value: n(ccpRows.length), tone: "good" }, { label: "انحرافات مفتوحة", value: n(Object.keys(holds).length), tone: Object.keys(holds).length ? "bad" : "good" }, { label: "فحوصات مسجلة", value: n(d.quality.length) }]} />
      <section className={s.panel}><div className={s.panelHead}><h2>سجل البرامج الأولية اليومي</h2><span>اضغط البند لتسجيل تنفيذه باسم المسؤول ووقته</span></div><div className={s.panelBody}><div className={f.prp}>{PRP.map(([group, items], g) => <div key={group} className={f.prpGroup}><h3>{group}</h3>{items.map((item, i) => { const id = `${g}:${i}`; const at = prp[id]; return <button type="button" key={id} role="checkbox" aria-checked={!!at} className={`${f.prpItem} ${at ? f.prpOn : ""}`} onClick={() => { setPrp(all => ({ ...all, [id]: at ? "" : clock() })); if (!at) log(`تنفيذ بند ${item}`); toast(at ? "أُلغي تسجيل البند" : "سُجل تنفيذ البند"); }}><i><Check size={14} aria-hidden="true" /></i><span>{item}</span><small>{at ? <>{PEOPLE[(g + i) % PEOPLE.length]} · <bdi>{at}</bdi></> : "لم ينفذ بعد"}</small></button>; })}</div>)}</div></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>قراءات نقاط التحكم الحرجة</h2><span>تسجل تلقائيًا من واجهة التشغيل</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>الباتش</th><th>المنتج</th><th>نقطة التحكم</th><th>الحد الحرج</th><th>القراءة</th><th>الوقت</th><th>المراقب</th><th>النتيجة</th></tr></thead><tbody>{ccpRows.map(row => <tr key={row.id}><td><bdi className={s.code}>{row.batch}</bdi></td><td><strong>{row.product}</strong></td><td>{row.point}</td><td>{row.limit}</td><td><bdi className={s.num}>{row.reading}</bdi></td><td><bdi className={s.num}>{row.at}</bdi></td><td>{row.by}</td><td><Badge>مطابق</Badge></td></tr>)}</tbody></table></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>الانحرافات والإجراءات التصحيحية</h2><span>تفتح من واجهة التشغيل عند تجاوز أي حد</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>الباتش</th><th>المنتج</th><th>المرحلة</th><th>الإجراء التصحيحي</th><th>الحالة</th><th /></tr></thead><tbody>
        {orders.filter(order => holds[order.id]).map(order => <tr key={order.id}><td><bdi className={s.code}>{String(order.batch)}</bdi></td><td><strong>{String(order.product)}</strong></td><td>{d.stages[Math.min(liveOf(order), 9)]}</td><td>{holds[order.id]}</td><td><Badge>محجوز</Badge></td><td><button type="button" className={s.ghost} onClick={() => open(order.id)}>فتح واجهة التشغيل</button></td></tr>)}
        <tr><td><bdi className={s.code}>{String(orders[9].batch)}</bdi></td><td><strong>{String(orders[9].product)}</strong></td><td>{d.stages[5]}</td><td>تجاوز زمن التبريد وأعيد التبريد السريع ثم أعيد القياس</td><td><Badge>مكتمل</Badge></td><td /></tr>
      </tbody></table></div></section>
      {honest}{operator}
    </>;
  }

  if (section === "manufacturing-batches") {
    const batch = d.batches.find(row => row.id === traceId);
    if (batch) {
      const order = orders.find(item => item.id === batch.orderId) ?? orders[0]; const index = orders.indexOf(order); const live = liveOf(order);
      const item = product(String(batch.product)); const recipe = INGREDIENTS[item.category] ?? INGREDIENTS["حلويات شرقية"];
      const qty = Number(batch.qty); const sample = Math.min(2, qty); const waste = Math.min(index % 4, Math.max(0, qty - sample)); const pool = qty - sample - waste; const soldRate = Number.parseInt(String(batch.sold), 10) / 100;
      const places = [d.warehouses[0].name, d.branches[index % 6].name, d.branches[(index + 2) % 6].name, d.branches[(index + 4) % 6].name];
      const shares = [0.3, 0.25, 0.25]; let left = pool;
      const flow = places.map((place, i) => { const sent = i < 3 ? Math.floor(pool * shares[i]) : left; left -= sent; const sold = live >= 10 ? Math.min(sent, Math.round(sent * (i === 0 ? soldRate * 0.4 : soldRate))) : 0; return { place, sent: live >= 10 ? sent : 0, sold, remaining: live >= 10 ? sent - sold : 0 }; });
      const held = recalled[batch.id]; const remaining = flow.reduce((total, row) => total + row.remaining, 0);
      return <>
        <button type="button" className={s.back} onClick={() => setTraceId("")}><ArrowRight size={16} aria-hidden="true" />كل الباتشات</button>
        <section className={f.traceHero}><div><span>تتبع الباتش</span><h2><bdi>{String(batch.batch)}</bdi></h2><p>{String(batch.product)} · أمر الإنتاج <bdi>{String(order.no)}</bdi> · {String(order.line)}</p></div><div className={f.traceStats}><div><span>الكمية المنتجة</span><strong><bdi>{n(qty)}</bdi> {String(batch.unit)}</strong></div><div><span>تاريخ الإنتاج</span><strong><bdi>{String(batch.produced)}</bdi></strong></div><div><span>تاريخ الانتهاء</span><strong><bdi>{String(batch.expiry)}</bdi></strong></div><div><span>الحالة</span><strong>{held ? "محجوز للسحب" : live >= 10 ? "مفرج عنه" : "قيد الإنتاج"}</strong></div></div></section>
        <div className={f.trace}>
          <section className={s.panel}><div className={s.panelHead}><h2>خطوة للخلف</h2><span>من أين جاءت المواد</span></div><div className={s.panelBody}><div className={f.cards}>{recipe.raw.map(([name, supplier], i) => <article key={name} className={f.rawCard}><strong>{name}</strong><span>{supplier}</span><dl><div><dt>تشغيلة المورد</dt><dd><bdi>RM-{String(batch.produced).slice(2).replaceAll("-", "")}-{pad(index + i + 3)}</bdi></dd></div><div><dt>تاريخ الاستلام</dt><dd><bdi>{d.day(-(index % 5) - i - 2)}</bdi></dd></div><div><dt>شهادة التحليل</dt><dd>مرفقة ومطابقة</dd></div><div><dt>حرارة الاستلام</dt><dd><bdi>{name.includes("قشطة") || name.includes("كريمة") || name.includes("زبدة") ? "3.6 م" : "محيط"}</bdi></dd></div></dl></article>)}</div></div></section>
          <section className={s.panel}><div className={s.panelHead}><h2>مراحل التصنيع</h2><span>من اعتمد ومتى</span></div><div className={s.panelBody}><ol className={f.timeline}>{d.stages.map((name, i) => <li key={name} className={i < live ? f.tDone : i === live ? f.tNow : ""}><i>{i < live ? <Check size={12} aria-hidden="true" /> : <bdi>{i + 1}</bdi>}</i><div><strong>{name}{STAGE_DEFS[i].ccp && <em>نقطة تحكم حرجة</em>}</strong><span>{i < live ? <>{approvals[`${order.id}:${i}`]?.by ?? (i % 2 ? String(order.inspector) : String(order.supervisor))} · <bdi>{approvals[`${order.id}:${i}`]?.at ?? stageTime(index, i)}</bdi></> : i === live ? "جارية الآن" : "لم تبدأ"}</span></div></li>)}</ol><button type="button" className={s.ghost} style={{ marginTop: 12 }} onClick={() => open(order.id)}><Factory size={15} aria-hidden="true" />فتح واجهة التشغيل لهذا الباتش</button></div></section>
          <section className={s.panel}><div className={s.panelHead}><h2>خطوة للأمام</h2><span>إلى أين ذهب المنتج</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>الموقع</th><th>المرسل</th><th>المباع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{flow.map(row => <tr key={row.place}><td><strong>{row.place}</strong></td><td><bdi className={s.num}>{n(row.sent)}</bdi></td><td><bdi className={s.num}>{n(row.sold)}</bdi></td><td><bdi className={s.num}>{n(row.remaining)}</bdi></td><td><Badge>{live < 10 ? "قيد الإنتاج" : held && row.remaining > 0 ? "محجوز" : row.remaining === 0 ? "مباعة" : "صالح"}</Badge></td></tr>)}</tbody></table></div>
            <p className={s.hint}>ميزان الكميات: المنتج <bdi>{n(qty)}</bdi> يساوي الموزع <bdi>{n(pool)}</bdi> مع العينة المرجعية <bdi>{sample}</bdi> والهدر <bdi>{waste}</bdi></p>
          </section>
        </div>
        <section className={s.panel}><div className={s.panelHead}><h2>سحب المنتج</h2><span>تجربة تحدد مكان كل وحدة متبقية خلال دقائق</span></div><div className={s.panelBody}>
          {held ? <div className={f.hold} role="status"><PackageSearch size={20} aria-hidden="true" /><div><strong>حُجزت <bdi>{n(remaining)}</bdi> {String(batch.unit)} في <bdi>{flow.filter(row => row.remaining > 0).length}</bdi> مواقع</strong><span>أُبلغت الفروع بإيقاف البيع وعُزلت الكمية ويمكن إبلاغ عملاء الولاء الذين اشتروا من هذا الباتش</span></div><button type="button" className={s.ghost} onClick={() => { setRecalled(all => ({ ...all, [batch.id]: false })); log(`إنهاء محاكاة سحب الباتش ${String(batch.batch)}`); toast("أُنهيت المحاكاة ورُفع الحجز"); }}><Undo2 size={15} aria-hidden="true" />إنهاء المحاكاة</button></div>
            : <div className={f.actions}><button type="button" className={s.primary} disabled={live < 10} onClick={() => { setRecalled(all => ({ ...all, [batch.id]: true })); log(`محاكاة سحب الباتش ${String(batch.batch)} وحجز ${remaining} وحدة`); toast("حُددت مواقع الكمية المتبقية وحُجزت"); }}><PackageSearch size={16} aria-hidden="true" />محاكاة سحب المنتج</button><small>{live < 10 ? "تتاح بعد الإفراج عن الباتش وتوزيعه" : "تحدد مواقع الكمية المتبقية وتحجزها فورًا"}</small></div>}
        </div></section>
        {honest}{operator}
      </>;
    }
    return <>
      <Kpis items={[{ label: "باتشات متتبعة", value: n(d.batches.length) }, { label: "مفرج عنها", value: n(orders.length - running.length), tone: "good" }, { label: "قيد الإنتاج", value: n(running.length), tone: "warn" }, { label: "محجوزة للسحب", value: n(Object.values(recalled).filter(Boolean).length), tone: Object.values(recalled).some(Boolean) ? "bad" : "good" }]} />
      <section className={s.panel}><p className={s.hint}>اضغط أي باتش لفتح صفحة تتبعه من المواد الخام حتى الفرع الذي بيع فيه</p><div className={s.tableWrap}><table className={s.table}><thead><tr><th>الباتش</th><th>المنتج</th><th>تاريخ الإنتاج</th><th>الانتهاء</th><th>الكمية</th><th>الموقع الحالي</th><th>المباع</th><th>الحالة</th></tr></thead><tbody>{d.batches.map(row => { const order = orders.find(item => item.id === row.orderId); const live = order ? liveOf(order) : 10; return <tr key={row.id} tabIndex={0} className={s.rowLink} onClick={() => setTraceId(row.id)} onKeyDown={event => { if (event.key === "Enter") setTraceId(row.id); }}><td><bdi className={s.code}>{String(row.batch)}</bdi></td><td><strong>{String(row.product)}</strong></td><td><bdi className={s.num}>{String(row.produced)}</bdi></td><td><bdi className={s.num}>{String(row.expiry)}</bdi></td><td><bdi className={s.num}>{n(Number(row.qty))}</bdi> {String(row.unit)}</td><td>{live < 10 ? "خط الإنتاج" : String(row.location)}</td><td><bdi className={s.num}>{live < 10 ? "0%" : String(row.sold)}</bdi></td><td><Badge>{recalled[row.id] ? "محجوز" : live >= 10 ? "مفرج عنه" : "قيد الإنتاج"}</Badge></td></tr>; })}</tbody></table></div></section>
      {operator}
    </>;
  }

  if (section === "manufacturing-operations") return <>
    <Kpis items={kpis} />
    <section className={s.panel}><p className={s.hint}>اضغط أي أمر إنتاج لفتح واجهة التشغيل واعتماد مراحله</p><div className={s.tableWrap}><table className={s.table}><thead><tr><th>أمر الإنتاج</th><th>التاريخ</th><th>المنتج</th><th>الباتش</th><th>الخط</th><th>المخطط</th><th>المرحلة الحالية</th><th>الإنجاز</th><th>المشرف</th><th>الحالة</th></tr></thead><tbody>{orders.map(order => <tr key={order.id} tabIndex={0} className={s.rowLink} onClick={() => open(order.id)} onKeyDown={event => { if (event.key === "Enter") open(order.id); }}><td><bdi className={s.code}>{String(order.no)}</bdi></td><td><bdi className={s.num}>{String(order.date)}</bdi></td><td><strong>{String(order.product)}</strong></td><td><bdi className={s.code}>{String(order.batch)}</bdi></td><td>{String(order.line)}</td><td><bdi className={s.num}>{n(Number(order.planned))}</bdi> {String(order.unit)}</td><td>{liveOf(order) >= 10 ? "اكتملت كل المراحل" : d.stages[liveOf(order)]}</td><td><bdi className={s.num}>{liveOf(order) * 10}%</bdi></td><td>{String(order.supervisor)}</td><td><Badge>{statusOf(order)}</Badge></td></tr>)}</tbody></table></div></section>
    {honest}{operator}
  </>;

  return <>
    <Kpis items={kpis} />
    <div className={f.board}>{[...running, ...orders.filter(order => liveOf(order) >= 10).slice(0, 3)].map(order => { const live = liveOf(order); return <article key={order.id} className={`${f.card} ${holds[order.id] ? f.cardHeld : ""}`}>
      <header><div><strong>{String(order.product)}</strong><span><bdi>{String(order.no)}</bdi> · {String(order.line)} · باتش <bdi>{String(order.batch)}</bdi></span></div><Badge>{statusOf(order)}</Badge></header>
      <Rail live={live} held={!!holds[order.id]} />
      <footer><div><span>{live >= 10 ? "الحالة" : "المرحلة الحالية"}</span><b>{live >= 10 ? "اكتملت كل المراحل" : d.stages[live]}</b></div><div><span>الإنجاز</span><b><bdi>{live * 10}%</bdi></b></div><button type="button" className={s.primary} onClick={() => open(order.id)}><Factory size={16} aria-hidden="true" />فتح واجهة التشغيل</button></footer>
    </article>; })}</div>
    {honest}{operator}
  </>;
}
