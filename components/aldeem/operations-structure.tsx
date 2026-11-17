"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Building2, Check, CreditCard, Factory, Landmark, MapPin, Package, Plus, RotateCcw, Search, ShieldCheck, Store, Wallet, Warehouse } from "lucide-react";
import s from "./operations-structure.module.css";

type Kind = "warehouses" | "treasury";
type Template = { type: string; title: string; purpose: string; group: string; icon: typeof Warehouse; linkLabel: string };
type PlanItem = { id: string; type: string; name: string; owner: string; location: string; linkedTo: string; notes: string };

const warehouseTypes: Template[] = [
  { type: "main", title: "المستودع الرئيسي", purpose: "استلام التوريد وتوزيع المواد والمنتجات على المستودعات التابعة", group: "المركز والفروع", icon: Warehouse, linkLabel: "الإدارة أو المنطقة" },
  { type: "branch", title: "مستودع الفرع", purpose: "مخزون الفرع وطلبات التزويد والتحويلات الواردة والصادرة", group: "المركز والفروع", icon: Store, linkLabel: "الفرع المرتبط" },
  { type: "lab", title: "مستودع المعمل", purpose: "خامات طلبات المعمل والتغليف والمنتجات الجاهزة للتسليم", group: "الإنتاج والتجهيز", icon: Package, linkLabel: "المعمل المرتبط" },
  { type: "factory", title: "مستودع المصنع", purpose: "المواد الخام والتشغيلات والمنتج التام المرتبط بالباتش", group: "الإنتاج والتجهيز", icon: Factory, linkLabel: "المصنع المرتبط" },
  { type: "returns", title: "مستودع المرتجعات", purpose: "عزل المرتجع حتى الفحص وتحديد إعادة القبول أو الإتلاف", group: "العزل والمعالجة", icon: RotateCcw, linkLabel: "الفرع أو المنشأة" },
  { type: "disposal", title: "مستودع الإتلاف", purpose: "عزل المواد المقرر إتلافها وتوثيق الموافقة والتنفيذ", group: "العزل والمعالجة", icon: ShieldCheck, linkLabel: "الفرع أو المنشأة" },
];

const treasuryTypes: Template[] = [
  { type: "central", title: "الخزينة الرئيسية", purpose: "متابعة العهد والتحويلات والتجميع على مستوى المنشأة", group: "الخزائن النقدية", icon: Landmark, linkLabel: "الإدارة المالية" },
  { type: "region", title: "خزينة المنطقة", purpose: "تجميع خزائن الفروع وتسليماتها بحسب المنطقة", group: "الخزائن النقدية", icon: Building2, linkLabel: "المنطقة المرتبطة" },
  { type: "branch", title: "خزينة الفرع", purpose: "خزينة باسم الفرع لمتابعة استلام صناديق الكاشير والتحويلات", group: "الخزائن النقدية", icon: Store, linkLabel: "الفرع المرتبط" },
  { type: "cashier", title: "صندوق الكاشير", purpose: "عهدة مستقلة لكل صندوق مرتبطة بالفرع والكاشير والوردية", group: "الخزائن النقدية", icon: Wallet, linkLabel: "الفرع والكاشير" },
  { type: "bank", title: "الحساب البنكي", purpose: "إيداعات النقد والتحويلات وتسويات نقاط البيع بحسب الحساب", group: "البنوك والشبكة", icon: Landmark, linkLabel: "البنك والحساب" },
  { type: "terminal", title: "حساب شبكة الكاشير", purpose: "مطابقة عمليات جهاز الشبكة مع التسوية والرسوم والإيداع البنكي", group: "البنوك والشبكة", icon: CreditCard, linkLabel: "الفرع والجهاز والحساب البنكي" },
];

const definitions = { warehouses: warehouseTypes, treasury: treasuryTypes };
const money = (value: number) => new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR" }).format(value);
const initialItems = (kind: Kind): PlanItem[] => definitions[kind].map((type) => ({ id: `${kind}-${type.type}`, type: type.type, name: type.title, owner: "", location: "", linkedTo: "", notes: "" }));

/** Presentation-only configuration plan. It never writes accounts, locations or financial records. */
export function AldeemOperationsStructure({ kind }: { kind: Kind }) {
  return <StructurePlan key={kind} kind={kind} />;
}

function StructurePlan({ kind }: { kind: Kind }) {
  const [items, setItems] = useState(() => initialItems(kind));
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"structure" | "reconciliation">("structure");
  const [search, setSearch] = useState("");
  const [newType, setNewType] = useState(kind === "warehouses" ? "branch" : "cashier");
  const [notice, setNotice] = useState("");
  const options = definitions[kind];
  const chosen = items.find(item => item.id === selected);
  const groups = [...new Set(options.map(option => option.group))];
  const visible = items.filter(item => `${item.name} ${item.location} ${item.linkedTo} ${item.owner}`.toLowerCase().includes(search.trim().toLowerCase()));
  const isWarehouse = kind === "warehouses";

  function add() {
    const template = options.find(option => option.type === newType)!;
    const id = crypto.randomUUID();
    const count = items.filter(item => item.type === newType).length + 1;
    setItems(previous => [...previous, { id, type: newType, name: `${template.title} ${count}`, owner: "", location: "", linkedTo: "", notes: "" }]);
    setSelected(id); setSearch(""); setNotice("أضيفت بطاقة إلى مخطط العرض لتحديد بياناتها");
  }

  return <section className={s.page} dir="rtl" aria-label={isWarehouse ? "مخطط المستودعات" : "مخطط الخزائن والمطابقة"}>
    <header className={s.heading}>
      <div><span className={s.label}>مخطط إعداد للعرض</span><h2>{isWarehouse ? "مستودع واضح لكل مهمة" : "كل صندوق مرتبط بفرعه وحسابه"}</h2><p>{isWarehouse ? "من التوريد إلى الإنتاج والفروع ثم المرتجعات والإتلاف" : "تنظيم النقد والشبكة والبنوك من الكاشير إلى الإدارة المالية"}</p></div>
      <span className={s.planBadge}><MapPin size={16} aria-hidden="true" />{isWarehouse ? "المواقع تحدد لاحقًا" : "الربط والمسؤوليات تحدد لاحقًا"}</span>
    </header>
    <div className={s.explainer}><strong>هذا مخطط توضيحي قابل للتعديل</strong><span>الأسماء والروابط هنا لتجهيز العرض وتبقى خلال فتح الصفحة فقط وليست {isWarehouse ? "مستودعات أو أرصدة مخزون فعلية" : "حسابات أو أرصدة مالية فعلية"}</span></div>
    {!isWarehouse && <nav className={s.tabs} aria-label="عرض الخزائن"><button type="button" aria-pressed={view === "structure"} onClick={() => setView("structure")}>هيكل الخزائن والحسابات</button><button type="button" aria-pressed={view === "reconciliation"} onClick={() => setView("reconciliation")}>المطابقة والموازنات</button></nav>}
    {view === "reconciliation" ? <Reconciliation items={items} /> : <>
      <ol className={s.flow} aria-label={isWarehouse ? "مسار المخزون" : "مسار التحصيل"}>{(isWarehouse ? ["استلام وتوريد", "معمل ومصنع", "توزيع للفروع", "عزل المرتجع والإتلاف"] : ["صندوق الكاشير", "خزينة الفرع", "خزينة المنطقة والرئيسية", "الإيداع والمطابقة البنكية"]).map((text, index) => <li key={text}><span className={s.step}>{index + 1}</span><span>{text}</span>{index < 3 && <ArrowLeft size={15} aria-hidden="true" />}</li>)}</ol>
      <div className={s.toolbar}>
        <label className={s.search}><Search size={18} aria-hidden="true" /><span className={s.srOnly}>بحث في المخطط</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الفرع أو المسؤول" /></label>
        <div className={s.add}><label><span className={s.srOnly}>نوع البطاقة الجديدة</span><select value={newType} onChange={event => setNewType(event.target.value)}>{options.map(option => <option key={option.type} value={option.type}>{option.title}</option>)}</select></label><button className={s.primary} type="button" onClick={add}><Plus size={16} aria-hidden="true" />إضافة للمخطط</button></div>
      </div>
      {notice && <p className={s.notice} role="status">{notice}</p>}
      <div className={s.layout}>
        <div className={s.groups}>
          {groups.map(group => {
            const rows = visible.filter(item => options.find(option => option.type === item.type)?.group === group);
            if (!rows.length) return null;
            return <section key={group} className={s.group}><h3>{group}<span>{rows.length} {rows.length === 1 ? "بطاقة" : "بطاقات"}</span></h3><div className={s.cards}>{rows.map(item => {
              const template = options.find(option => option.type === item.type)!;
              const Icon = template.icon;
              return <button className={s.card} type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
                <span className={s.cardTop}><span className={s.icon}><Icon size={22} aria-hidden="true" /></span><span className={s.cardTitle}>{item.name}<small>{template.title}</small></span></span>
                <span className={s.purpose}>{template.purpose}</span>
                <span className={s.cardMeta}><span>{isWarehouse ? "الموقع" : "الارتباط"}<b>{(isWarehouse ? item.location : item.linkedTo) || "يحدد لاحقًا"}</b></span><span>المسؤول<b>{item.owner || "لم يحدد"}</b></span></span>
                <span className={s.open}>تحديد البيانات والارتباط<ArrowLeft size={16} aria-hidden="true" /></span>
              </button>;
            })}</div></section>;
          })}
          {!visible.length && <p className={s.empty}>لا توجد بطاقة مطابقة للبحث</p>}
        </div>
        {chosen ? <PlanEditor key={chosen.id} item={chosen} kind={kind} template={options.find(option => option.type === chosen.type)!} onClose={() => setSelected(null)} onSave={next => { setItems(old => old.map(item => item.id === next.id ? next : item)); setNotice("تم تحديث مخطط العرض فقط"); setSelected(null); }} /> : <aside className={s.guide}><span className={s.icon}>{isWarehouse ? <Warehouse size={24} aria-hidden="true" /> : <Wallet size={24} aria-hidden="true" />}</span><h3>{isWarehouse ? "حدّد مكان كل مستودع لاحقًا" : "ابدأ بالفرع ثم الصندوق"}</h3><p>اختر أي بطاقة لتحديد الاسم والمسؤول والارتباط داخل مخطط العرض</p><ul>{(isWarehouse ? ["لكل فرع بطاقة مستودع مستقلة", "المعمل والمصنع لهما مخزون منفصل", "المرتجع يعزل حتى قرار الجودة", "الإتلاف له موقع وسجل معتمد"] : ["لكل منطقة خزينة تجميع", "لكل فرع خزينة باسمه", "لكل كاشير صندوق وعهدة مستقلة", "لكل جهاز شبكة حساب تسوية مرتبط بالبنك"]).map(text => <li key={text}><Check size={15} aria-hidden="true" />{text}</li>)}</ul></aside>}
      </div>
    </>}
  </section>;
}

function PlanEditor({ item, kind, template, onSave, onClose }: { item: PlanItem; kind: Kind; template: Template; onSave: (next: PlanItem) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(item);
  function field(key: keyof Pick<PlanItem, "name" | "owner" | "location" | "linkedTo" | "notes">, value: string) { setDraft(old => ({ ...old, [key]: value })); }
  function submit(event: FormEvent) { event.preventDefault(); if (!draft.name.trim()) return; onSave({ ...draft, name: draft.name.trim(), owner: draft.owner.trim(), location: draft.location.trim(), linkedTo: draft.linkedTo.trim(), notes: draft.notes.trim() }); }
  return <aside className={s.editor}><div className={s.editorHead}><h3>بيانات {template.title}</h3><span>تعديل مخطط العرض</span></div><form onSubmit={submit}>
    <label>الاسم في المخطط<input autoFocus required maxLength={120} value={draft.name} onChange={event => field("name", event.target.value)} /></label>
    <label>{template.linkLabel}<input maxLength={180} value={draft.linkedTo} onChange={event => field("linkedTo", event.target.value)} placeholder="يحدد لاحقًا" /></label>
    <label>المسؤول<input maxLength={120} value={draft.owner} onChange={event => field("owner", event.target.value)} placeholder="يحدد لاحقًا" /></label>
    <label>{kind === "warehouses" ? "الموقع أو العنوان" : "الموقع أو مرجع الحساب"}<input maxLength={240} value={draft.location} onChange={event => field("location", event.target.value)} placeholder="يمكن تركه حتى تحديد المواقع" /></label>
    <label>ملاحظات الإعداد<textarea maxLength={600} rows={3} value={draft.notes} onChange={event => field("notes", event.target.value)} /></label>
    <p className={s.hint}>هذه البيانات للعرض فقط ولا تنشئ {kind === "warehouses" ? "مستودعًا فعليًا" : "خزينة أو حسابًا ماليًا"}</p>
    <div className={s.editorActions}><button type="submit" className={s.primary}>تحديث المخطط</button><button type="button" className={s.secondary} onClick={onClose}>إلغاء</button></div>
  </form></aside>;
}

const cashFields = [
  ["opening", "عهدة بداية الوردية"], ["cashSales", "تحصيل المبيعات النقدية"], ["receipts", "مقبوضات نقدية أخرى"], ["refunds", "مرتجعات نقدية"], ["payments", "مصروفات وتسليمات الخزينة"], ["counted", "النقد المعدود فعليًا"],
] as const;
const cardFields = [["gross", "إجمالي عمليات الشبكة"], ["refunds", "مرتجعات الشبكة"], ["fees", "رسوم التسوية شامل ضريبتها"], ["received", "المبلغ المودع في البنك"]] as const;

function Reconciliation({ items }: { items: PlanItem[] }) {
  const [mode, setMode] = useState<"cash" | "card">("cash");
  const [values, setValues] = useState<Record<string, string>>({});
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const fields = mode === "cash" ? cashFields : cardFields;
  const validAmount = (value: string) => /^\d{1,9}(?:\.\d{1,2})?$/.test(value);
  const invalid = fields.some(([key]) => values[key]?.trim() && !validAmount(values[key]));
  const complete = fields.every(([key]) => validAmount(values[key] ?? ""));
  const minor = (key: string) => Math.round(Number(values[key] || 0) * 100);
  const expected = mode === "cash" ? minor("opening") + minor("cashSales") + minor("receipts") - minor("refunds") - minor("payments") : minor("gross") - minor("refunds") - minor("fees");
  const difference = minor(mode === "cash" ? "counted" : "received") - expected;
  const match = complete && difference === 0;
  function reset() { setValues({}); setAccount(""); setReference(""); }
  return <div className={s.reconciliation}>
    <section className={s.reconcileForm}><h3>حاسبة مراجعة توضيحية</h3><p className={s.hint}>أدخل أرقامًا للمقارنة فقط ولا تحفظ هذه الحاسبة حركة أو تسوية مالية</p>
      <div className={s.tabs} aria-label="نوع المطابقة"><button type="button" aria-pressed={mode === "cash"} onClick={() => { setMode("cash"); reset(); }}><Wallet size={16} aria-hidden="true" />الصندوق النقدي</button><button type="button" aria-pressed={mode === "card"} onClick={() => { setMode("card"); reset(); }}><CreditCard size={16} aria-hidden="true" />الشبكة والبنك</button></div>
      <div className={s.formGrid}><label>{mode === "cash" ? "الصندوق في المخطط" : "حساب الشبكة في المخطط"}<select value={account} onChange={event => setAccount(event.target.value)}><option value="">اختر من مخطط العرض</option>{items.filter(item => item.type === (mode === "cash" ? "cashier" : "terminal")).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{mode === "cash" ? "مرجع الوردية" : "مرجع التسوية البنكية"}<input maxLength={100} value={reference} onChange={event => setReference(event.target.value)} placeholder="اختياري للعرض" /></label>{fields.map(([key, label]) => <label key={key}>{label}<span className={s.amount}><input type="number" min="0" max="999999999" step="0.01" inputMode="decimal" value={values[key] ?? ""} placeholder="لم يدخل مبلغ" onChange={event => setValues(old => ({ ...old, [key]: event.target.value }))} /><span>ر س</span></span></label>)}</div>
      {invalid && <p className={s.notice} role="alert">أدخل مبالغ موجبة أو صفرًا وبحد أقصى منزلتين عشريتين وتسعة أرقام قبل الفاصلة</p>}
      <button type="button" className={s.secondary} onClick={reset}><RotateCcw size={16} aria-hidden="true" />مسح المدخلات</button>
    </section>
    <aside className={s.reconcileResult} aria-live="polite"><span className={s.label}>نتيجة المقارنة</span><h3>{!complete ? "بانتظار إدخال المبالغ" : match ? "المبالغ متطابقة" : "يوجد فرق يحتاج مراجعة"}</h3><p>{mode === "cash" ? "العهدة والتحصيل والمقبوضات ناقص المرتجعات والمصروفات والتسليمات" : "عمليات الشبكة ناقص المرتجعات ورسوم التسوية شامل ضريبتها"}</p><dl><div><dt>{mode === "cash" ? "النقد المتوقع" : "صافي الإيداع المتوقع"}</dt><dd>{complete ? money(expected / 100) : "—"}</dd></div><div><dt>{mode === "cash" ? "النقد المعدود" : "المودع في البنك"}</dt><dd>{complete ? money(minor(mode === "cash" ? "counted" : "received") / 100) : "—"}</dd></div><div className={s.difference} data-match={complete ? match : undefined}><dt>الفرق</dt><dd>{complete ? money(difference / 100) : "—"}</dd></div></dl><strong>{complete && !match ? difference > 0 ? "المبلغ الفعلي أعلى من المتوقع" : "المبلغ الفعلي أقل من المتوقع" : complete ? "تساوي المبالغ لا يعني اعتماد التسوية" : "أدخل جميع الحقول ويمكن إدخال صفر للبنود التي لا تنطبق"}</strong><ol><li>اختيار الصندوق أو جهاز الشبكة والفترة</li><li>مطابقة العمليات مع النقد أو كشف البنك</li><li>توثيق سبب الفرق والمرفقات</li><li>مراجعة المسؤول ثم اعتماد التسوية من السجل الفعلي</li></ol></aside>
  </div>;
}
