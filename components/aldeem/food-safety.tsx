"use client";
import { useState, useTransition } from "react";
import { ClipboardPlus, ShieldCheck } from "lucide-react";
import { closeFoodSafetyDeviation, getFoodSafety, recordFoodSafety } from "@/app/actions/erp-food-safety";
import { Action, Dialog, Field, Help, aldeem as s, dayTime, quantity } from "./aldeem-ui";
import { foodSafetyHelp, foodSafetyKinds, type FoodSafetyKind, type FoodSafetyRecord, type FoodSafetySnapshot } from "@/lib/erp/food-safety";

const kinds = Object.keys(foodSafetyKinds) as FoodSafetyKind[];
// The extra fields each record type asks for, kept as plain text unless marked numeric
const extraFields: Record<FoodSafetyKind, { key: string; label: string; numeric?: boolean; help: string }[]> = {
  temperature: [{ key: "reading", label: "القراءة بالدرجة المئوية", numeric: true, help: "الحرارة التي أظهرها الميزان وقت القراءة" }, { key: "min", label: "الحد الأدنى المسموح", numeric: true, help: "أقل حرارة مقبولة لهذه المعدة" }, { key: "max", label: "الحد الأعلى المسموح", numeric: true, help: "أعلى حرارة مقبولة لهذه المعدة" }],
  cleaning: [{ key: "area", label: "المنطقة أو المعدة", help: "ما تم تنظيفه وتعقيمه" }, { key: "agent", label: "مادة التعقيم", help: "اسم المادة المستخدمة وتركيزها" }],
  pest_control: [{ key: "company", label: "شركة المكافحة", help: "الشركة المنفذة للزيارة" }, { key: "findings", label: "الملاحظات", help: "ما وجد في المصائد أو أثناء الفحص" }],
  staff_health: [{ key: "employee", label: "اسم العامل", help: "العامل الذي تم فحصه" }, { key: "certificate", label: "رقم الشهادة الصحية وتاريخ انتهائها", help: "بيانات الشهادة الصحية السارية" }],
  receiving: [{ key: "supplier", label: "المورد", help: "الجهة التي وردت المواد" }, { key: "items", label: "المواد المستلمة", help: "الأصناف التي تم فحصها" }, { key: "temperature", label: "حرارة الاستلام", numeric: true, help: "حرارة المواد المبردة أو المجمدة عند الاستلام" }, { key: "expiry", label: "تاريخ الصلاحية", help: "أقرب تاريخ انتهاء في الشحنة" }],
  training: [{ key: "topic", label: "موضوع التدريب", help: "ما تم تدريب العاملين عليه" }, { key: "attendees", label: "الحضور", help: "أسماء أو عدد من حضروا" }],
  calibration: [{ key: "device", label: "الجهاز", help: "ميزان الحرارة أو جهاز القياس" }, { key: "result", label: "نتيجة المعايرة", help: "الفرق عن المرجع وهل هو ضمن المسموح" }],
  recall: [{ key: "product", label: "المنتج", help: "المنتج المسحوب" }, { key: "lot", label: "التشغيلة أو تاريخ الإنتاج", help: "ما يحدد الكمية المتأثرة" }, { key: "quantity", label: "الكمية المسحوبة", numeric: true, help: "عدد الحبات التي سحبت من الفروع" }, { key: "reason", label: "سبب السحب", help: "الخلل الذي استدعى السحب" }],
};

export function FoodSafetyWorkspace({ initialSnapshot }: { initialSnapshot: FoodSafetySnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filter, setFilter] = useState({ from: initialSnapshot.from, to: initialSnapshot.to, kind: initialSnapshot.kind, branchId: initialSnapshot.filterBranchId });
  const [adding, setAdding] = useState<FoodSafetyKind | null>(null);
  const [closing, setClosing] = useState<FoodSafetyRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const branchName = new Map(snapshot.branches.map(row => [row.id, row.name]));
  function load(message = "", next = filter) {
    if (next.to < next.from) return setError("تاريخ البداية يجب أن يسبق تاريخ النهاية");
    setError("");
    start(async () => { const result = await getFoodSafety(next, snapshot.slug); if (result.ok) { setSnapshot(result.data); if (message) setNotice(message); } else setError(result.message); });
  }
  return <main className={s.page} dir="rtl">
    <header className={s.hero}>
      <div><span className={s.eyebrow}>{snapshot.brand}</span><h1>سجل سلامة الغذاء</h1><p>السجلات اليومية للمعمل والفروع التي تطلبها جولات التفتيش مع متابعة كل انحراف حتى إغلاقه</p></div>
      {snapshot.role !== "auditor" && <div className={s.heroActions}>
        <Action tone="primary" side="end" help={foodSafetyHelp.temperature} onClick={() => setAdding("temperature")}><ClipboardPlus aria-hidden="true" />قراءة حرارة</Action>
        <Action side="end" help={foodSafetyHelp.cleaning} onClick={() => setAdding("cleaning")}>نظافة وتعقيم</Action>
        <Action side="end" help={foodSafetyHelp.receiving} onClick={() => setAdding("receiving")}>فحص استلام</Action>
        <Action side="end" help="يفتح نموذج تسجيل لأي نوع آخر: مكافحة الآفات وصحة العاملين والتدريب والمعايرة وسحب المنتجات" onClick={() => setAdding("pest_control")}>سجل آخر</Action>
      </div>}
    </header>
    <div className={s.body}>
      {notice && <p className={s.notice} data-tone="good" role="status">{notice}</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      <section className={s.stats} aria-label="ملخص السجل">
        <div className={s.stat} data-tone={snapshot.openDeviations ? "due" : "good"}><span>انحرافات مفتوحة<Help side="start" text="سجلات خرجت عن الحد المسموح ولم يوثق التحقق من معالجتها بعد" /></span><strong>{quantity(snapshot.openDeviations)}</strong></div>
        {kinds.filter(kind => snapshot.counts[kind]).slice(0, 5).map(kind => <div key={kind} className={s.stat}><span>{foodSafetyKinds[kind]}</span><strong>{quantity(snapshot.counts[kind] ?? 0)}</strong><small>في الفترة</small></div>)}
      </section>
      <div className={s.toolbar}>
        <label className={s.field}><span>من</span><input type="date" value={filter.from} max={filter.to} onChange={event => setFilter({ ...filter, from: event.target.value })} /></label>
        <label className={s.field}><span>إلى</span><input type="date" value={filter.to} min={filter.from} onChange={event => setFilter({ ...filter, to: event.target.value })} /></label>
        <label className={s.field}><span>النوع</span><select value={filter.kind} onChange={event => setFilter({ ...filter, kind: event.target.value })}><option value="">كل الأنواع</option>{kinds.map(kind => <option key={kind} value={kind}>{foodSafetyKinds[kind]}</option>)}</select></label>
        {!snapshot.branchId && <label className={s.field}><span>الفرع</span><select value={filter.branchId} onChange={event => setFilter({ ...filter, branchId: event.target.value })}><option value="">كل الفروع</option>{snapshot.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        <Action tone="primary" side="start" help="يعرض سجلات الفترة والنوع والفرع المختارة مع كل الانحرافات المفتوحة" disabled={pending} onClick={() => load()}>{pending ? "جار العرض" : "عرض"}</Action>
      </div>
      <section className={s.panel}>
        {snapshot.records.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>السجل</th><th>النوع</th><th>الفرع</th><th>التفاصيل</th><th>الحالة</th><th>سجله</th><th>إجراءات</th></tr></thead>
          <tbody>{snapshot.records.map(row => <tr key={row.id}>
            <td><span className={s.rowTitle}>{row.subject}</span><span className={s.rowSub}>رقم {row.number} · {dayTime(row.recordedAt)}</span></td>
            <td>{foodSafetyKinds[row.kind]}</td><td>{branchName.get(row.branchId) ?? ""}</td>
            <td><div className={s.places}>{extraFields[row.kind].filter(field => row.payload[field.key] !== undefined && row.payload[field.key] !== "").map(field => <span key={field.key} className={s.place}>{field.label}<b>{String(row.payload[field.key])}</b></span>)}</div>{row.corrective && <span className={s.rowSub}>الإجراء التصحيحي: {row.corrective}</span>}{row.closedNote && <span className={s.rowSub}>التحقق: {row.closedNote} · {row.closedBy} · {row.closedAt ? dayTime(row.closedAt) : ""}</span>}</td>
            <td><span className={s.badge} data-tone={!row.deviation ? "good" : row.closedAt ? "mute" : "bad"}>{!row.deviation ? "مطابق" : row.closedAt ? "انحراف أغلق" : "انحراف مفتوح"}</span></td>
            <td>{row.actor}</td>
            <td>{row.deviation && !row.closedAt && snapshot.canClose && <Action small tone="primary" side="end" help="يوثق أن الانحراف عولج وتم التحقق منه فيغلق" onClick={() => setClosing(row)}><ShieldCheck aria-hidden="true" />إغلاق</Action>}</td>
          </tr>)}</tbody>
        </table></div> : <div className={s.empty}><ShieldCheck size={30} aria-hidden="true" /><strong>لا توجد سجلات في هذه الفترة</strong><span>ابدأ بتسجيل قراءة حرارة أو جدول نظافة من الأزرار أعلى الصفحة</span></div>}
      </section>
    </div>
    {adding && <RecordDialog snapshot={snapshot} initialKind={adding} onClose={() => setAdding(null)} onSaved={deviation => { setAdding(null); load(deviation ? "تم حفظ السجل كانحراف مفتوح يحتاج تحققًا وإغلاقًا" : "تم حفظ السجل"); }} />}
    {closing && <CloseDialog snapshot={snapshot} record={closing} onClose={() => setClosing(null)} onSaved={() => { setClosing(null); load("تم إغلاق الانحراف وتوثيق التحقق"); }} />}
  </main>;
}

function RecordDialog({ snapshot, initialKind, onClose, onSaved }: { snapshot: FoodSafetySnapshot; initialKind: FoodSafetyKind; onClose: () => void; onSaved: (deviation: boolean) => void }) {
  const [kind, setKind] = useState<FoodSafetyKind>(initialKind);
  const [branchId, setBranchId] = useState(snapshot.branchId ?? (snapshot.branches.length === 1 ? snapshot.branches[0].id : ""));
  const [subject, setSubject] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [deviation, setDeviation] = useState(false);
  const [corrective, setCorrective] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const fields = extraFields[kind];
  const reading = Number(values.reading), low = Number(values.min), high = Number(values.max);
  const outOfRange = kind === "temperature" && values.reading !== undefined && values.reading !== "" && values.min !== "" && values.max !== "" && values.min !== undefined && values.max !== undefined && (reading < low || reading > high);
  const flagged = deviation || outOfRange || kind === "recall";
  function submit() {
    if (!branchId) return setError("اختر الفرع");
    const details: Record<string, string | number> = {};
    for (const field of fields) {
      const raw = (values[field.key] ?? "").trim();
      if (!raw) { if (field.numeric && kind === "temperature") return setError("أدخل القراءة والحدين الأدنى والأعلى"); continue; }
      if (field.numeric) { const value = Number(raw); if (!Number.isFinite(value)) return setError(`القيمة في ${field.label} يجب أن تكون رقمًا`); details[field.key] = value; } else details[field.key] = raw;
    }
    if (flagged && corrective.trim().length < 5) return setError("اكتب الإجراء التصحيحي المتخذ لهذا الانحراف");
    setError("");
    start(async () => { const result = await recordFoodSafety({ kind, branchId, subject, deviation: flagged, corrective, details }, snapshot.slug); if (result.ok) onSaved(result.data.deviation); else setError(result.message); });
  }
  return <Dialog open wide title="سجل سلامة غذاء جديد" subtitle={foodSafetyHelp[kind]} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); submit(); }} style={{ display: "contents" }}>
      <fieldset disabled={pending} className={s.dialogBody} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <div className={s.grid}>
          <Field label="نوع السجل" help="يحدد الحقول المطلوبة ومكان ظهور السجل في التقارير"><select value={kind} onChange={event => { setKind(event.target.value as FoodSafetyKind); setValues({}); }}>{kinds.map(item => <option key={item} value={item}>{foodSafetyKinds[item]}</option>)}</select></Field>
          <Field label="الفرع" help="الفرع أو المعمل الذي يخصه السجل"><select required value={branchId} disabled={!!snapshot.branchId} onChange={event => setBranchId(event.target.value)}><option value="">اختر الفرع</option>{snapshot.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label="الموضوع" help="اسم المعدة أو المنطقة أو المنتج الذي يخصه السجل" hint="مثال ثلاجة عرض الكيك"><input required minLength={2} maxLength={200} value={subject} onChange={event => setSubject(event.target.value)} /></Field>
          {fields.map(field => <Field key={field.key} label={field.label} help={field.help}><input type={field.numeric ? "number" : "text"} step={field.numeric ? "0.1" : undefined} maxLength={field.numeric ? undefined : 500} value={values[field.key] ?? ""} onChange={event => setValues({ ...values, [field.key]: event.target.value })} /></Field>)}
        </div>
        {outOfRange && <p className={s.notice} data-tone="bad" role="status">القراءة خارج الحد المسموح ويسجل هذا السجل انحرافًا</p>}
        {kind !== "recall" && !outOfRange && <label className={s.option} style={{ maxWidth: 460 }}><input type="checkbox" checked={deviation} onChange={event => setDeviation(event.target.checked)} /><span><b>يوجد انحراف أو ملاحظة غير مطابقة</b><small>يبقى السجل مفتوحًا حتى يوثق المدير التحقق من معالجته</small></span></label>}
        {flagged && <Field label="الإجراء التصحيحي المتخذ" help="ما تم فعله فورًا لمعالجة الانحراف وحماية المنتجات"><textarea required minLength={5} maxLength={2000} value={corrective} onChange={event => setCorrective(event.target.value)} /></Field>}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </fieldset>
      <footer className={s.dialogFoot}>
        <Action type="button" help="يغلق النافذة دون حفظ السجل" onClick={onClose} disabled={pending}>إلغاء</Action>
        <Action type="submit" tone="primary" side="end" help="يحفظ السجل باسمك ووقته ولا يمكن تعديله أو حذفه بعد الحفظ" disabled={pending}>{pending ? "جار الحفظ" : "حفظ السجل"}</Action>
      </footer>
    </form>
  </Dialog>;
}

function CloseDialog({ snapshot, record, onClose, onSaved }: { snapshot: FoodSafetySnapshot; record: FoodSafetyRecord; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <Dialog open title="إغلاق انحراف" subtitle={`${record.subject} · رقم ${record.number}`} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); setError(""); start(async () => { const result = await closeFoodSafetyDeviation({ id: record.id, note }, snapshot.slug); if (result.ok) onSaved(); else setError(result.message); }); }} style={{ display: "contents" }}>
      <fieldset disabled={pending} className={s.dialogBody} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <p className={s.notice}>الإجراء التصحيحي المسجل: {record.corrective}</p>
        <Field label="نتيجة التحقق" help="ما تأكدت منه بنفسك قبل إغلاق الانحراف ويحفظ باسمك ووقته"><textarea required minLength={5} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></Field>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </fieldset>
      <footer className={s.dialogFoot}>
        <Action type="button" help="يغلق النافذة ويبقى الانحراف مفتوحًا" onClick={onClose} disabled={pending}>إلغاء</Action>
        <Action type="submit" tone="primary" side="end" help="يوثق التحقق ويغلق الانحراف نهائيًا" disabled={pending}>{pending ? "جار الإغلاق" : "تأكيد الإغلاق"}</Action>
      </footer>
    </form>
  </Dialog>;
}
