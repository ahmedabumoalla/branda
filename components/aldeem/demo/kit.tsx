"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, BadgeCheck, Download, Plus, Printer, Search } from "lucide-react";
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

/** Full record page: replaces the list in place and keeps a visible trail of every action taken on the record. */
export function RecordPage({ row, cols, title, back, linesTitle }: { row: Row; cols: Col[]; title: string; back: () => void; linesTitle?: string }) {
  const toast = useToast();
  const [actions, setActions] = useState<TraceStep[]>([]);
  const status = cols.find(col => col[2] === "status");
  const highlights = cols.filter(col => col[2] === "money" || col[2] === "num").slice(0, 3);
  const name = cols.find(col => col[2] === "strong");
  const who = String(row.cashier ?? row.requestedBy ?? row.createdBy ?? row.by ?? row.supervisor ?? row.approvedBy ?? row.manager ?? "مدير النظام");
  const date = String(row.date ?? row.start ?? row.joined ?? row.produced ?? today());
  const act = (label: string, message: string) => { setActions(current => [...current, { title: label, meta: `${today()} ${clock()} · مالك الحساب` }]); toast(message); };
  const steps: TraceStep[] = [
    { title: "أُنشئ السجل", meta: `${date} · ${who}` },
    { title: "روجعت البيانات وتم التحقق منها", meta: `${date} · المراجعة الآلية` },
    ...(status ? [{ title: `الحالة الحالية: ${String(row[status[0]])}`, meta: `${date} · ${who}` }] : []),
    ...actions,
  ];
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />العودة إلى {title}</button>
    <section className={s.whHero}>
      <div><p>{title}</p><h2><bdi>{String(row[cols[0][0]] ?? "")}</bdi>{name && name[0] !== cols[0][0] ? ` · ${String(row[name[0]])}` : ""}</h2>{status && <p style={{ marginTop: 8 }}><Badge>{String(row[status[0]])}</Badge></p>}</div>
      <dl>{highlights.map(col => <div key={col[0]}><dt>{col[1]}</dt><dd>{cell(row, col)}</dd></div>)}</dl>
    </section>
    <div className={s.actions}>
      <button type="button" className={s.primary} onClick={() => act("اعتُمد السجل", "اعتُمد السجل وأضيف إلى سجل التتبع")}><BadgeCheck size={16} aria-hidden="true" />اعتماد</button>
      <button type="button" className={s.ghost} onClick={() => act("طُبع السجل", "جُهز السجل للطباعة وسُجلت العملية")}><Printer size={15} aria-hidden="true" />طباعة</button>
      <button type="button" className={s.ghost} onClick={() => act("صُدّر السجل", "صُدّر السجل وسُجلت العملية")}><Download size={15} aria-hidden="true" />تصدير</button>
    </div>
    <div className={s.grid2}>
      <section className={s.panel}><div className={s.panelHead}><h2>بيانات السجل</h2></div><div className={s.panelBody}><dl className={s.fields}>{cols.map(col => <div key={col[0]}><dt>{col[1]}</dt><dd>{cell(row, col)}</dd></div>)}</dl></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>سجل التتبع</h2><span>كل إجراء يظهر هنا بوقته ومنفذه</span></div><div className={s.panelBody}><Trace steps={steps} /></div></section>
    </div>
    <div style={{ marginTop: 20 }}><LinesTable row={row} title={linesTitle} /></div>
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
  if (open) return renderOpen?.(open, () => setOpen(null)) ?? <RecordPage row={open} cols={def.cols} title={title} back={() => setOpen(null)} linesTitle={def.linesTitle} />;
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
