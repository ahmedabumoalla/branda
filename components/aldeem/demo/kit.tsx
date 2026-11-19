"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Archive, ArrowRight, BadgeCheck, Check, Download, Eye, FileSpreadsheet, Paperclip, Pencil, Plus, Printer, Search, Share2, TrendingDown, TrendingUp } from "lucide-react";
import { demoData, money, type Row } from "./data";
import s from "./demo.module.css";

export type ColKind = "text" | "code" | "money" | "num" | "date" | "status" | "strong";
export type Col = [key: string, label: string, kind?: ColKind];
export type Kpi = { label: string; value: string; note?: string; tone?: "good" | "warn" | "bad" };
export type Def = { kpis: Kpi[]; rows: Row[]; cols: Col[]; tabKey?: string; action?: string; hint?: string; linesTitle?: string };

const GOOD = ["مدفوعة", "مقبول", "معتمد", "مكتمل", "نشط", "نشطة", "مستلم", "مستلم بالكامل", "مرحّل", "صالح", "مفتوحة", "محول إلى فاتورة", "تعمل الآن", "منفذ", "مباعة", "مصروفة", "مصروف", "مسددة", "سارية", "مطابق", "مفرج عنه", "حاضر", "على رأس العمل", "مفعّل", "متاح للطلب", "متاح للشركاء", "مضافة", "ختم جديد", "السعر الأساسي", "مستلم من المورد", "مدين", "دائن", "موثق", "ضمن الحد", "استبدل المكافأة", "مستبدلة", "صادرة", "صدرت الفاتورة", "مستلم في الفرع", "متاح", "فروعنا", "اكتساب"];
const BAD = ["غير متاح للبيع", "ملغاة", "مرفوض", "منتهي", "تالف", "متوقفة", "محجوز", "غير مطابق", "موقوف", "موقوفة مؤقتًا", "متأخر", "آجلة", "مستحقة", "غائب منذ شهر", "نافد"];
export const tone = (value: string) => GOOD.includes(value) ? "good" : BAD.includes(value) ? "bad" : "warn";
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const clock = () => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date());

/** Product picture by name; items without a photo show their first letter on the Aldeem tint. */
export function Thumb({ name, size = 44 }: { name: string; size?: number }) {
  const image = demoData().products.find(product => product.name === name)?.image;
  // eslint-disable-next-line @next/next/no-img-element
  return image ? <img className={s.thumb} src={image} alt={name} width={size} height={size} loading="lazy" style={{ width: size, height: size }} /> : <span className={s.thumb} aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.4 }}>{name.slice(0, 1)}</span>;
}

export function Badge({ children }: { children: string }) {
  return <span className={`${s.badge} ${s[tone(children)]}`}>{children}</span>;
}

export function cell(row: Row, [key, , kind]: Col): ReactNode {
  const value = row[key];
  if (value === undefined || Array.isArray(value)) return "—";
  if (kind === "money") return <bdi className={s.num}>{money(Number(value))}</bdi>;
  if (kind === "num") return <bdi className={s.num}>{Number(value).toLocaleString("en-US")}</bdi>;
  if (kind === "status") return <Badge>{String(value)}</Badge>;
  if (kind === "code" || kind === "date") return <bdi className={kind === "code" ? s.code : s.num}>{value}</bdi>;
  if (kind === "strong") return <strong>{value}</strong>;
  return value;
}

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastHost({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(""), 2600); return () => window.clearTimeout(timer); }, [message]);
  return <ToastContext.Provider value={setMessage}>{children}{message && <div className={s.toast} role="status">{message}</div>}</ToastContext.Provider>;
}

export function Kpis({ items }: { items: Kpi[] }) {
  return <div className={s.kpis}>{items.map(item => <article key={item.label} className={`${s.kpi} ${item.tone ? s[`kpi_${item.tone}`] : ""}`}><span>{item.label}</span><strong><bdi>{item.value}</bdi></strong>{item.note && <small>{item.note}</small>}</article>)}</div>;
}

export type TraceStep = { title: string; meta: string; done?: boolean };
export function Trace({ steps }: { steps: TraceStep[] }) {
  return <ol className={s.trace}>{steps.map((step, index) => <li key={index} className={step.done === false ? s.tracePending : ""}><strong>{step.title}</strong><small>{step.meta}</small></li>)}</ol>;
}

export function LinesTable({ row, title = "الأصناف" }: { row: Row; title?: string }) {
  const lines = row.lines ?? [];
  if (!lines.length) return null;
  const net = lines.reduce((total, line) => total + line.qty * line.price, 0);
  return <section className={s.panel}><div className={s.panelHead}><h2>{title}</h2><span><bdi>{lines.length}</bdi> صنف</span></div><div className={s.tableWrap}><table className={s.table}>
    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
    <tbody>{lines.map((line, index) => <tr key={index}><td><strong>{line.name}</strong></td><td><bdi className={s.num}>{line.qty}</bdi> {line.unit}</td><td><bdi className={s.num}>{money(line.price)}</bdi></td><td><bdi className={s.num}>{money(line.qty * line.price)}</bdi></td></tr>)}</tbody>
    <tfoot><tr><td colSpan={3}>الإجمالي قبل الضريبة</td><td><bdi className={s.num}>{money(net)}</bdi></td></tr><tr><td colSpan={3}>ضريبة القيمة المضافة 15%</td><td><bdi className={s.num}>{money(net * 0.15)}</bdi></td></tr><tr><td colSpan={3}><strong>الإجمالي</strong></td><td><strong><bdi className={s.num}>{money(net * 1.15)}</bdi></strong></td></tr></tfoot>
  </table></div></section>;
}

const PATH = ["إنشاء السجل", "المراجعة والتدقيق", "الاعتماد", "الإغلاق والأرشفة"];
const plain = (value: number, kind?: ColKind) => kind === "money" ? money(value) : (Math.round(value * 10) / 10).toLocaleString("en-US");

/** Full record page: replaces the list in place, compares the record with its register and keeps a visible trail of every action. */
export function RecordPage({ row: first, cols, title, back, linesTitle, rows = [] }: { row: Row; cols: Col[]; title: string; back: () => void; linesTitle?: string; rows?: Row[] }) {
  const toast = useToast();
  const [row, setRow] = useState(first);
  const [tab, setTab] = useState("overview");
  const [actions, setActions] = useState<TraceStep[]>([]);
  const [approved, setApproved] = useState(false);
  const [notes, setNotes] = useState<{ text: string; at: string }[]>([]);
  const [draft, setDraft] = useState("");
  const status = cols.find(col => col[2] === "status");
  const numeric = cols.filter(col => (col[2] === "money" || col[2] === "num") && Number.isFinite(Number(row[col[0]])));
  const highlights = numeric.slice(0, 3);
  const name = cols.find(col => col[2] === "strong");
  const code = String(row[cols[0][0]] ?? "");
  const who = String(row.cashier ?? row.requestedBy ?? row.createdBy ?? row.issuedBy ?? row.by ?? row.supervisor ?? row.approvedBy ?? row.manager ?? "مدير النظام");
  const date = String(row.date ?? row.start ?? row.joined ?? row.produced ?? today());
  const state = status ? String(row[status[0]]) : "";
  const mood = approved || !state ? "good" : tone(state);
  const reached = mood === "good" ? 4 : mood === "bad" ? 1 : 2;
  const act = (label: string, message: string) => { setActions(current => [...current, { title: label, meta: `${today()} ${clock()} · مالك الحساب` }]); toast(message); };
  const steps: TraceStep[] = [
    { title: "أُنشئ السجل", meta: `${date} · ${who}` },
    { title: "روجعت البيانات وتم التحقق منها", meta: `${date} · المراجعة الآلية` },
    ...(status ? [{ title: `الحالة الحالية: ${state}`, meta: `${date} · ${who}` }] : []),
    ...actions,
  ];
  // Every figure is placed against the rest of its register: average, highest value and rank.
  const stats = numeric.map(col => { const values = rows.map(item => Number(item[col[0]])).filter(Number.isFinite); const value = Number(row[col[0]]); const avg = values.length ? values.reduce((total, item) => total + item, 0) / values.length : value; return { col, value, avg, max: Math.max(value, ...values, 1), rank: values.filter(item => item > value).length + 1, total: Math.max(values.length, 1), diff: avg ? (value - avg) / avg * 100 : 0 }; });
  const peers = rows.filter(item => item !== row && item.id !== row.id && (!status || item[status[0]] === row[status[0]])).slice(0, 6);
  const openPeer = (item: Row) => { setRow(item); setActions([]); setApproved(false); setNotes([]); setTab("overview"); };
  const files = [[`${title} ${code}.pdf`, "نسخة السجل المعتمدة", "184 ك.ب"], [`مستند داعم ${code}.pdf`, "أرفقه منشئ السجل", "96 ك.ب"], [`صورة التوثيق ${code}.jpg`, "التقطت عند التنفيذ", "412 ك.ب"]];
  const tabs: [string, string, number?][] = [["overview", "نظرة عامة"], ["compare", "المؤشرات والمقارنة", stats.length], ["trail", "سجل التتبع", steps.length + notes.length], ["files", "المرفقات والملاحظات", files.length + notes.length]];
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />العودة إلى {title}</button>
    <section className={s.whHero}>
      <div><p>{title}</p><h2><bdi>{code}</bdi>{name && name[0] !== cols[0][0] ? ` · ${String(row[name[0]])}` : ""}</h2>
        <div className={s.recMeta}>{status && <Badge>{approved ? "معتمد" : state}</Badge>}<span>أنشئ <bdi>{date}</bdi></span><span>المسؤول {who}</span>{row.branch !== undefined && <span>{String(row.branch)}</span>}</div>
      </div>
      <dl>{highlights.map(col => <div key={col[0]}><dt>{col[1]}</dt><dd>{cell(row, col)}</dd></div>)}</dl>
    </section>
    <ol className={s.recPath} aria-label="مسار السجل">{PATH.map((label, index) => <li key={label} className={index < reached ? s.recDone : index === reached ? (mood === "bad" ? s.recStop : s.recNow) : ""}><i>{index < reached ? <Check size={15} aria-hidden="true" /> : <bdi>{index + 1}</bdi>}</i><strong>{label}</strong><span>{index < reached ? "مكتملة" : index === reached ? (mood === "bad" ? "متوقفة" : "جارية الآن") : "لم تبدأ"}</span></li>)}</ol>
    <div className={s.actions}>
      <button type="button" className={s.primary} disabled={approved} onClick={() => { setApproved(true); act("اعتُمد السجل", "اعتُمد السجل وأضيف إلى سجل التتبع"); }}><BadgeCheck size={16} aria-hidden="true" />{approved ? "تم الاعتماد" : "اعتماد"}</button>
      <button type="button" className={s.ghost} onClick={() => act("فُتح السجل للتعديل", "فُتح السجل للتعديل وسُجلت العملية")}><Pencil size={15} aria-hidden="true" />تعديل</button>
      <button type="button" className={s.ghost} onClick={() => act("طُبع السجل", "جُهز السجل للطباعة وسُجلت العملية")}><Printer size={15} aria-hidden="true" />طباعة</button>
      <button type="button" className={s.ghost} onClick={() => act("نُزلت نسخة PDF", "جُهزت نسخة PDF من السجل")}><Download size={15} aria-hidden="true" />تنزيل PDF</button>
      <button type="button" className={s.ghost} onClick={() => act("صُدّر السجل إلى Excel", "صُدّر السجل إلى Excel")}><FileSpreadsheet size={15} aria-hidden="true" />تصدير Excel</button>
      <button type="button" className={s.ghost} onClick={() => act("شورك رابط السجل", "نُسخ رابط السجل للمشاركة")}><Share2 size={15} aria-hidden="true" />مشاركة</button>
      <button type="button" className={s.ghost} onClick={() => act("أُرشف السجل", "أُرشف السجل ويبقى متاحًا للبحث")}><Archive size={15} aria-hidden="true" />أرشفة</button>
    </div>
    <div className={`${s.tabs} ${s.recTabs}`} role="tablist" aria-label="أقسام السجل">{tabs.map(([id, label, total]) => <button type="button" role="tab" key={id} aria-selected={tab === id} className={tab === id ? s.tabOn : ""} onClick={() => setTab(id)}>{label}{total !== undefined && <b>{total}</b>}</button>)}</div>
    {tab === "overview" && <>
      <div className={s.recGrid}>
        <div>
          <section className={s.panel}><div className={s.panelHead}><h2>البيانات الأساسية</h2><span><bdi>{cols.length}</bdi> حقل</span></div><div className={s.panelBody}><dl className={s.fields}>{cols.map(col => <div key={col[0]}><dt>{col[1]}</dt><dd>{cell(row, col)}</dd></div>)}</dl></div></section>
          <LinesTable row={row} title={linesTitle} />
        </div>
        <div>
          <section className={s.panel}><div className={s.panelHead}><h2>قراءة السجل</h2><span>مقارنة بباقي {title}</span></div><div className={s.panelBody}><ul className={s.recInsight}>
            {stats.slice(0, 4).map(item => <li key={item.col[0]}>{item.diff >= 0 ? <TrendingUp size={17} className={s.recUp} aria-hidden="true" /> : <TrendingDown size={17} className={s.recDown} aria-hidden="true" />}<span>{item.col[1]} {item.diff >= 0 ? "أعلى من" : "أقل من"} المتوسط بنسبة <bdi>{Math.abs(item.diff).toFixed(0)}%</bdi> وترتيبه <bdi>{item.rank}</bdi> من <bdi>{item.total}</bdi></span></li>)}
            <li><Check size={17} className={s.recUp} aria-hidden="true" /><span>{mood === "bad" ? "السجل متوقف ويحتاج إجراء قبل إكمال مساره" : mood === "good" ? "السجل مكتمل المسار وكل بياناته مدققة" : "السجل في المراجعة وينتظر الاعتماد"}</span></li>
            <li><Paperclip size={17} aria-hidden="true" /><span><bdi>{files.length}</bdi> مرفقات و<bdi>{steps.length}</bdi> إجراءات مسجلة على هذا السجل</span></li>
          </ul></div></section>
          <section className={s.panel}><div className={s.panelHead}><h2>آخر الإجراءات</h2><button type="button" className={s.ghost} onClick={() => setTab("trail")}>السجل كاملًا</button></div><div className={s.panelBody}><Trace steps={steps.slice(-3)} /></div></section>
        </div>
      </div>
    </>}
    {tab === "compare" && <>
      {stats.length > 0 ? <div className={s.recStats}>{stats.map(item => <article key={item.col[0]} className={s.recStat}><span>{item.col[1]}</span><strong>{cell(row, item.col)}</strong>
        <div className={s.recBar}><i style={{ width: `${Math.min(100, Math.max(2, item.value / item.max * 100))}%` }} /><b style={{ insetInlineStart: `${Math.min(100, item.avg / item.max * 100)}%` }} title="المتوسط" /></div>
        <small>المتوسط <bdi>{plain(item.avg, item.col[2])}</bdi> · الأعلى <bdi>{plain(item.max, item.col[2])}</bdi><br />الترتيب <bdi>{item.rank}</bdi> من <bdi>{item.total}</bdi> · {item.diff >= 0 ? "أعلى من" : "أقل من"} المتوسط بنسبة <bdi>{Math.abs(item.diff).toFixed(0)}%</bdi></small>
      </article>)}</div> : <section className={s.panel}><p className={s.hint}>هذا السجل لا يحمل أرقامًا للمقارنة</p></section>}
      {peers.length > 0 && <section className={s.panel} style={{ marginTop: 20 }}><div className={s.panelHead}><h2>سجلات مشابهة</h2><span>اضغط أي سجل لفتحه</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr>{cols.slice(0, 6).map(col => <th key={col[0]}>{col[1]}</th>)}</tr></thead><tbody>{peers.map((item, index) => <tr key={index} tabIndex={0} className={s.rowLink} onClick={() => openPeer(item)} onKeyDown={event => { if (event.key === "Enter") openPeer(item); }}>{cols.slice(0, 6).map(col => <td key={col[0]}>{cell(item, col)}</td>)}</tr>)}</tbody></table></div></section>}
    </>}
    {tab === "trail" && <section className={s.panel}><div className={s.panelHead}><h2>سجل التتبع</h2><span>كل إجراء يظهر هنا بوقته ومنفذه</span></div><div className={s.panelBody}><Trace steps={[...steps, ...notes.map(note => ({ title: `ملاحظة: ${note.text}`, meta: `${note.at} · مالك الحساب` }))]} /></div></section>}
    {tab === "files" && <div className={s.recGrid}>
      <div><section className={s.panel}><div className={s.panelHead}><h2>المرفقات</h2><button type="button" className={s.ghost} onClick={() => act("أُضيف مرفق جديد", "أُضيف المرفق إلى السجل")}><Paperclip size={15} aria-hidden="true" />إضافة مرفق</button></div><div className={s.panelBody}><ul className={s.recFiles}>{files.map(([file, note, size]) => <li key={file}><Paperclip size={18} aria-hidden="true" /><div><strong>{file}</strong><small>{note} · <bdi>{size}</bdi></small></div><button type="button" className={s.ghost} onClick={() => act(`عُرض المرفق ${file}`, "فُتحت معاينة المرفق")}><Eye size={15} aria-hidden="true" />معاينة</button><button type="button" className={s.ghost} onClick={() => act(`نُزل المرفق ${file}`, "نُزل المرفق")}><Download size={15} aria-hidden="true" />تنزيل</button></li>)}</ul></div></section></div>
      <div><section className={s.panel}><div className={s.panelHead}><h2>الملاحظات</h2><span><bdi>{notes.length}</bdi> ملاحظة</span></div><div className={s.panelBody}><div className={s.recNote}>
        <textarea value={draft} aria-label="ملاحظة جديدة" placeholder="اكتب ملاحظة تظهر لكل من يفتح السجل" onChange={event => setDraft(event.target.value)} />
        <button type="button" className={s.primary} disabled={!draft.trim()} onClick={() => { setNotes(list => [...list, { text: draft.trim(), at: `${today()} ${clock()}` }]); setDraft(""); toast("أُضيفت الملاحظة إلى السجل"); }}>إضافة ملاحظة</button>
        {notes.length > 0 && <ul className={s.recInsight}>{notes.map((note, index) => <li key={index}><span>{note.text}<br /><small><bdi>{note.at}</bdi> · مالك الحساب</small></span></li>)}</ul>}
      </div></div></section></div>
    </div>}
  </>;
}

const PAGE = 12;
export function Register({ def, title, onOpen, onCreate, renderOpen }: { def: Def; title: string; onOpen?: (row: Row) => void; onCreate?: () => void; renderOpen?: (row: Row, back: () => void) => ReactNode | null }) {
  const toast = useToast();
  const tabKey = def.tabKey ?? "status";
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Row | null>(null);
  const [created, setCreated] = useState<Row[]>([]);
  const all = useMemo(() => [...created, ...def.rows], [created, def.rows]);
  const tabs = useMemo(() => { const counts = new Map<string, number>(); all.forEach(row => { const value = String(row[tabKey] ?? ""); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }); return [...counts.entries()]; }, [all, tabKey]);
  const rows = useMemo(() => { const needle = query.trim().toLowerCase(); return all.filter(row => (!tab || row[tabKey] === tab) && (!needle || def.cols.some(([key]) => String(row[key] ?? "").toLowerCase().includes(needle)))); }, [all, def.cols, query, tab, tabKey]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const show = (row: Row) => onOpen ? onOpen(row) : setOpen(row);
  // The add button drafts a new record numbered after the latest one and opens it, so the action leaves a visible record.
  function create() {
    const first = def.rows[0]; if (!first) return;
    const key = def.cols[0][0]; const match = /^(.*?)(\d+)$/.exec(String(first[key] ?? ""));
    const row: Row = { ...first, id: `new-${created.length}`, [key]: match ? `${match[1]}${String(Number(match[2]) + created.length + 1).padStart(match[2].length, "0")}` : `${String(first[key])} جديد`, ...(first.date !== undefined ? { date: today() } : {}), ...(first.status !== undefined ? { status: "مسودة" } : {}) };
    setCreated(list => [row, ...list]); setTab(""); setPage(0); toast("أُنشئ سجل جديد كمسودة وفُتحت صفحته"); setOpen(row);
  }
  if (open) return renderOpen?.(open, () => setOpen(null)) ?? <RecordPage key={String(open.id ?? "")} row={open} rows={all} cols={def.cols} title={title} back={() => setOpen(null)} linesTitle={def.linesTitle} />;
  return <>
    {def.kpis.length > 0 && <Kpis items={def.kpis} />}
    <section className={s.panel}>
      <div className={s.toolbar}>
        <label className={s.search}><Search size={16} aria-hidden="true" /><input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder={`ابحث في ${title}`} aria-label={`بحث في ${title}`} /></label>
        <button type="button" className={s.ghost} onClick={() => toast(`صُدّر ${rows.length} سجل من ${title}`)}><Download size={15} aria-hidden="true" />تصدير</button>
        {def.action && <button type="button" className={s.primary} onClick={onCreate ?? create}><Plus size={16} aria-hidden="true" />{def.action}</button>}
      </div>
      {tabs.length > 1 && <div className={s.tabs} role="tablist" aria-label="تصفية السجل">
        <button type="button" role="tab" aria-selected={!tab} className={!tab ? s.tabOn : ""} onClick={() => { setTab(""); setPage(0); }}>الكل<b>{all.length}</b></button>
        {tabs.map(([value, total]) => <button type="button" role="tab" key={value} aria-selected={tab === value} className={tab === value ? s.tabOn : ""} onClick={() => { setTab(value); setPage(0); }}>{value}<b>{total}</b></button>)}
      </div>}
      {def.hint && <p className={s.hint}>{def.hint}</p>}
      <div className={s.tableWrap}><table className={s.table}>
        <thead><tr>{def.cols.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>{rows.slice(current * PAGE, current * PAGE + PAGE).map(row => <tr key={row.id} tabIndex={0} className={s.rowLink} onClick={() => show(row)} onKeyDown={event => { if (event.key === "Enter") show(row); }}>{def.cols.map(col => <td key={col[0]}>{cell(row, col)}</td>)}</tr>)}</tbody>
      </table>{rows.length === 0 && <p className={s.empty}>لا توجد نتائج مطابقة للبحث</p>}</div>
      <div className={s.pager}><span><bdi>{rows.length}</bdi> سجل</span><div><button type="button" className={s.ghost} disabled={current === 0} onClick={() => setPage(current - 1)}>السابق</button><bdi>{current + 1} / {pages}</bdi><button type="button" className={s.ghost} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>التالي</button></div></div>
    </section>
  </>;
}
