"use client";
import { useAldeemAutoLoad } from "@/components/aldeem/use-auto-load";


import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Plus, Printer, RefreshCw, RotateCcw, Search } from "lucide-react";
import { getAldeemPurchaseDefaults, listAldeemPurchases, readAldeemPurchaseRecord, searchAldeemPurchaseReturnSources } from "@/app/actions/aldeem-purchases";
import { actPurchases } from "@/app/actions/erp-purchases";
import type { FinanceDocumentLine } from "@/lib/finance/brand-finance";
import { Modal } from "./ui/modal";
import css from "./aldeem-sales-quotes.module.css";

type Success<T> = T extends { ok: true; data: infer D } ? D : never;
type Detail = Success<Awaited<ReturnType<typeof readAldeemPurchaseRecord>>>;
type Defaults = Success<Awaited<ReturnType<typeof getAldeemPurchaseDefaults>>>;
type Row = Success<Awaited<ReturnType<typeof listAldeemPurchases>>>["items"][number];
const money = (n: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const date = (value: string) => Number.isNaN(Date.parse(value)) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", calendar: "gregory", timeZone: "Asia/Riyadh" }).format(new Date(value));
const errorText = (e: unknown) => e instanceof Error ? e.message : "تعذر إكمال العملية أعد المحاولة";

// Purchase debit notes change the refundable basis without changing the original invoice lines.
function refundableLine(line: FinanceDocumentLine) {
  const adjusted = line as FinanceDocumentLine & { refund_net?: number; refund_tax?: number; refund_returned_net?: number; refund_returned_tax?: number };
  return { ...line, net: adjusted.refund_net ?? line.net, tax: adjusted.refund_tax ?? line.tax, returned_net: adjusted.refund_returned_net ?? line.returned_net ?? 0, returned_tax: adjusted.refund_returned_tax ?? line.returned_tax ?? 0 };
}

export function AldeemPurchaseReturns() {
  const [creating, setCreating] = useState(false), [detail, setDetail] = useState<Detail | null>(null);
  const [rows, setRows] = useState<Row[]>([]), [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0), [hasMore, setHasMore] = useState(false), [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [savedId, setSavedId] = useState("");
  const lock = useRef(false), appliedQuery = useRef("");
  const cache = useRef(new Map<string, Detail>());
  const trigger = useRef<HTMLButtonElement | null>(null);
  useAldeemAutoLoad(load, !creating && !detail);
  async function load(next = 0, search = query.trim()) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await listAldeemPurchases("return", search, next);
      if (!result.ok) throw new Error(result.message);
      setRows(result.data.items); setHasMore(result.data.hasMore); setOffset(next); setLoaded(true); appliedQuery.current = search; cache.current.clear();
    } catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  async function open(id: string, button?: HTMLButtonElement) {
    if (lock.current) return;
    trigger.current = button ?? null;
    const cached = cache.current.get(id);
    if (cached) { setDetail(cached); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await readAldeemPurchaseRecord(id);
      if (!result.ok) throw new Error(result.message);
      if (result.data.document?.kind !== "refund") throw new Error("سجل مرتجع المشتريات غير متاح");
      if (cache.current.size >= 20) cache.current.clear();
      cache.current.set(id, result.data); setDetail(result.data);
    } catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  return <div className={css.page} dir="rtl">
    {creating ? <ReturnEditor onBack={() => setCreating(false)} onSaved={id => { setCreating(false); setSavedId(id); setRows([]); setLoaded(false); setHasMore(false); setOffset(0); cache.current.clear(); }} /> : detail ? <ReturnDetail key={detail.document!.id} detail={detail} onBack={() => { setDetail(null); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }} /> : <>
      <header className={css.toolbar}><div><h2>مرتجعات المشتريات</h2><p>أعد الأصناف للمورد وسو المبلغ على فاتورة الشراء الأصلية</p></div><div className={css.actions}><button type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" />{busy ? "جار قراءة السجل" : error ? "إعادة المحاولة" : "تحديث السجل"}</button><button type="button" className={css.primary} disabled={busy} onClick={() => { setError(""); setCreating(true); }}><Plus size={18} aria-hidden="true" />إنشاء مرتجع مشتريات</button></div></header>
      {error && <p role="alert" className={css.error}>{error}</p>}
      {savedId && <div role="status" className={css.notice}>تم تسجيل مرتجع المشتريات وتسويته على الفاتورة الأصلية <button type="button" disabled={busy} onClick={event => void open(savedId, event.currentTarget)}>عرض المرتجع المحفوظ</button></div>}
      <form className={css.filters} onSubmit={event => { event.preventDefault(); void load(); }}><label>المورد أو رقم المرتجع<input type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} /></label><button type="submit" disabled={busy}><Search size={16} aria-hidden="true" />بحث</button></form>
      <section className={css.register} aria-busy={busy}>{rows.length ? <div className={css.tableScroll} role="region" tabIndex={0} aria-label="سجل مرتجعات المشتريات"><table><thead><tr><th>المرتجع</th><th>المورد</th><th>تاريخ الإصدار</th><th>الإجمالي بالريال</th><th>الحالة</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><button type="button" className={css.recordLink} disabled={busy} onClick={event => void open(row.id, event.currentTarget)}>{row.displayNumber || row.number}</button></td><td>{row.supplierName || "—"}</td><td>{date(row.createdAt)}</td><td>{money(row.total)}</td><td><span className={css.badge}>مرحل</span></td></tr>)}</tbody></table></div> : <div className={css.empty}><RotateCcw size={32} aria-hidden="true" /><h3>{loaded ? "لا توجد مرتجعات مطابقة" : "سجل مرتجعات المشتريات"}</h3><p>{busy ? "جار تحميل مرتجعات المشتريات" : "يمكن إنشاء مرتجع من فاتورة شراء مسجلة"}</p></div>}<footer className={css.footer}><span>{loaded ? `الصفحة ${Math.floor(offset / 30) + 1}` : ""}</span><div className={css.actions}><button type="button" disabled={busy || offset === 0} onClick={() => void load(offset - 30, appliedQuery.current)}>السابق</button><button type="button" disabled={busy || !hasMore} onClick={() => void load(offset + 30, appliedQuery.current)}>التالي</button></div></footer></section>
    </>}
  </div>;
}

function ReturnEditor({ onBack, onSaved }: { onBack: () => void; onSaved: (id: string) => void }) {
  const [query, setQuery] = useState(""), [rows, setRows] = useState<Row[]>([]), [searched, setSearched] = useState(false);
  const [offset, setOffset] = useState(0), [hasMore, setHasMore] = useState(false);
  const [source, setSource] = useState<Detail | null>(null), [defaults, setDefaults] = useState<Defaults | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({}), [account, setAccount] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false), commands = useRef(new Map<string, string>()), appliedQuery = useRef("");
  const invoice = source?.document;
  const lines = (invoice?.lines ?? []).map(refundableLine);
  const selected = lines.filter(line => (quantities[line.id] ?? 0) > 0);
  const values = selected.map(line => {
    const cumulative = (line.returned_quantity ?? 0) + quantities[line.id];
    const net = round(line.net * cumulative / line.quantity) - line.returned_net;
    const tax = round(line.tax * cumulative / line.quantity) - line.returned_tax;
    return { net: round(net), tax: round(tax) };
  });
  const tax = round(values.reduce((sum, line) => sum + line.tax, 0));
  const total = round(values.reduce((sum, line) => sum + line.net + line.tax, 0));
  const debt = round(Math.min(total, Math.max(0, invoice?.outstanding ?? 0)));
  const received = round(total - debt);
  const accounts = (defaults?.accounts ?? []).filter(item => item.active && (item.kind === "cash" || item.kind === "bank"));
  async function search(next = 0, text = query.trim()) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await searchAldeemPurchaseReturnSources(text, next);
      if (!result.ok) throw new Error(result.message);
      setRows(result.data.items); setHasMore(result.data.hasMore); setOffset(next); setSearched(true); appliedQuery.current = text;
    } catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  async function choose(id: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await readAldeemPurchaseRecord(id);
      if (!result.ok) throw new Error(result.message);
      if (result.data.document?.kind !== "purchase") throw new Error("اختر فاتورة شراء مرحلة");
      if (!result.data.canApprove) throw new Error("لا تملك صلاحية اعتماد مرتجعات المشتريات");
      setSource(result.data); setQuantities({}); setAccount(""); setDefaults(null); setConfirmed(false);
    } catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  async function loadAccounts() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await getAldeemPurchaseDefaults();
      if (!result.ok) throw new Error(result.message);
      if (source && (result.data.branchScope.branchId !== source.branchScope.branchId || result.data.branchScope.revision !== source.branchScope.revision)) throw new Error("تغير الفرع أعد اختيار الفاتورة قبل المتابعة");
      setDefaults(result.data);
    } catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (!source || !invoice || lock.current) return;
    setError("");
    if (!selected.length || selected.some(line => !Number.isFinite(quantities[line.id]) || quantities[line.id] > line.quantity - (line.returned_quantity ?? 0))) { setError("حدد كميات صحيحة ضمن الكمية المتاحة للإرجاع"); return; }
    if (!Number.isFinite(total) || total < 0) { setError("تعذر احتساب المبلغ أعد اختيار الفاتورة"); return; }
    if (received > 0 && !accounts.some(item => item.id === account)) { setError("اختر حساب استلام المبلغ من المورد"); return; }
    if (!note.trim() || !confirmed) { setError("أدخل سبب المرتجع وأكد مراجعة الكميات والتسوية"); return; }
    const input = { action: "return", branchScope: source.branchScope, payload: { invoiceId: invoice.id, accountId: received > 0 ? account : null, expectedTotal: total, lines: selected.map(line => ({ lineId: line.id, quantity: quantities[line.id], expectedReturnedQuantity: line.returned_quantity ?? 0 })), note: note.trim() } };
    const key = JSON.stringify(input);
    if (!commands.current.has(key)) commands.current.set(key, crypto.randomUUID());
    lock.current = true; setBusy(true);
    try {
      const result = await actPurchases("khayal-aldeem", input, commands.current.get(key)!);
      if (!result.ok) throw new Error(result.message);
      const id = result.data.financeId || result.data.id;
      if (!id) throw new Error("تمت العملية دون رقم مستند أعد المحاولة بنفس البيانات للتحقق");
      onSaved(id);
    } catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  return <div className={css.editor}>
    <header className={css.toolbar}><div><h2>إنشاء مرتجع مشتريات</h2><p>اختر الفاتورة ثم حدد الكميات المعادة للمورد</p></div><button type="button" disabled={busy} onClick={onBack}><ArrowRight size={17} aria-hidden="true" />سجل المرتجعات</button></header>
    {error && <p role="alert" className={css.error}>{error}</p>}
    {!invoice ? <><form className={css.filters} onSubmit={event => { event.preventDefault(); void search(); }}><label>المورد أو رقم فاتورة الشراء<input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /></label><button type="submit" disabled={busy}><Search size={17} aria-hidden="true" />{busy ? "جار البحث" : "بحث في فواتير الشراء"}</button></form><section className={css.register} aria-busy={busy}>{rows.length ? <div className={css.tableScroll} role="region" tabIndex={0} aria-label="فواتير الشراء المتاحة للإرجاع"><table><thead><tr><th>الفاتورة</th><th>المورد</th><th>التاريخ</th><th>الإجمالي بالريال</th><th>الإجراء</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.displayNumber || row.number}</td><td>{row.supplierName}</td><td>{row.date}</td><td>{money(row.total)}</td><td><button type="button" disabled={busy} onClick={() => void choose(row.id)}>اختيار الفاتورة</button></td></tr>)}</tbody></table></div> : <div className={css.empty}><h3>{searched ? "لا توجد فواتير متاحة مطابقة" : "اختر فاتورة الشراء الأصلية"}</h3><p>ابحث باسم المورد أو رقم الفاتورة لعرض الأصناف المتاحة للإرجاع</p></div>}<footer className={css.footer}><span>{searched ? `الصفحة ${Math.floor(offset / 30) + 1}` : ""}</span><div className={css.actions}><button type="button" disabled={busy || !offset} onClick={() => void search(offset - 30, appliedQuery.current)}>السابق</button><button type="button" disabled={busy || !hasMore} onClick={() => void search(offset + 30, appliedQuery.current)}>التالي</button></div></footer></section></> : <form className={css.editor} onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset className={css.formBody} disabled={busy}><div className={css.metadata}><section className={css.card}><h3>الفاتورة {invoice.display_number || `#${invoice.number}`}</h3><p>{source?.supplier?.name || "المورد"}</p><p>{date(invoice.created_at)}</p><button type="button" onClick={() => { setSource(null); setConfirmed(false); }}>اختيار فاتورة أخرى</button></section><section className={css.card}><h3>التسوية على الفاتورة الأصلية</h3><p>المتبقي للمورد {money(invoice.outstanding)} ر س</p><p className={css.hint}>يخفض المرتجع المبلغ المستحق أولًا ويستلم الفرق من المورد في الحساب المختار</p><p className={css.hint}>الضريبة وقيمة الأصناف محسوبة من الفاتورة بعد التسويات السابقة</p></section></div>
      <section className={css.lines}><h3>الأصناف المعادة للمورد</h3><div className={css.tableScroll} role="region" tabIndex={0} aria-label="كميات مرتجع المشتريات"><table><thead><tr><th>الصنف</th><th>الكمية الأصلية</th><th>المرتجع سابقًا</th><th>المتاح</th><th>الكمية المعادة</th></tr></thead><tbody>{lines.map(line => { const available = Math.max(0, line.quantity - (line.returned_quantity ?? 0)); return <tr key={line.id}><td>{line.name}{line.unit_label && <p className={css.hint}>{line.unit_label}</p>}</td><td>{line.quantity}</td><td>{line.returned_quantity ?? 0}</td><td>{available}</td><td><input type="number" aria-label={`الكمية المعادة من ${line.name}`} min={0} max={available} step="0.001" disabled={available <= 0} value={quantities[line.id] ?? 0} onChange={event => { setQuantities(previous => ({ ...previous, [line.id]: Number(event.target.value) })); setConfirmed(false); }} /></td></tr>; })}</tbody></table></div></section>
      <div className={css.metadata}><section className={css.card}><label>سبب المرتجع<textarea required rows={3} maxLength={1000} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false); }} /></label>{received > 0 && <><div className={css.actions}><button type="button" onClick={() => void loadAccounts()}><RefreshCw size={16} aria-hidden="true" />{defaults ? "تحديث حسابات الاستلام" : "عرض حسابات الاستلام"}</button></div><label>حساب استلام المبلغ من المورد<select required value={account} onChange={event => { setAccount(event.target.value); setConfirmed(false); }}><option value="">اختر الحساب</option>{accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{defaults && !accounts.length && <p className={css.hint}>لا يوجد حساب نقدي أو بنكي متاح للاستلام</p>}</>}</section><section className={css.totals}>{[["القيمة قبل الضريبة", total - tax], ["ضريبة الأصناف المعادة", tax], ["تخفيض المبلغ المستحق للمورد", debt], ["المبلغ المستلم من المورد", received], ["إجمالي المرتجع بالريال", total]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</section></div>
      <label className={css.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />راجعت الأصناف والكميات وأؤكد إعادتها للمورد وتسوية المبلغ</label><div className={css.actions}><button type="submit" className={css.primary} disabled={!selected.length || !confirmed}>{busy ? "جار تسجيل المرتجع" : "تأكيد مرتجع المشتريات"}</button><button type="button" onClick={onBack}>إلغاء</button></div></fieldset>
    </form>}
  </div>;
}

function ReturnDetail({ detail, onBack }: { detail: Detail; onBack: () => void }) {
  const document = detail.document!;
  const [printOpen, setPrintOpen] = useState(false), [pdf, setPdf] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const url = useRef(""), mounted = useRef(true), lock = useRef(false), frame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (url.current) URL.revokeObjectURL(url.current); }; }, []);
  async function preview() {
    setPrintOpen(true);
    if (url.current || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const { createAldeemPurchasePdf } = await import("@/lib/export/aldeem-purchase-pdf");
      const blob = await createAldeemPurchasePdf({ brand: detail.brand, title: "مرتجع مشتريات", number: document.display_number || String(document.number), date: date(document.created_at), supplier: detail.supplier?.name || "المورد", currency: "SAR", status: "مرحل", sourceNumber: document.reference_number ? String(document.reference_number) : undefined, note: document.note, lines: document.lines.map(line => ({ name: line.name, unit: line.unit_label || undefined, quantity: line.quantity, price: line.unit_price, discount: Math.max(0, round(line.quantity * line.unit_price - line.net - (document.tax_inclusive ? line.tax : 0))), tax: line.tax, total: round(line.net + line.tax) })), total: document.total, tax: document.tax, paid: document.paid, paidLabel: "المستلم من المورد" });
      if (mounted.current) { url.current = URL.createObjectURL(blob); setPdf(url.current); }
    } catch (e) { if (mounted.current) setError(errorText(e)); } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className={css.editor}>
    <header className={css.toolbar}><div><h2>مرتجع مشتريات {document.display_number || `#${document.number}`}</h2><p>{date(document.created_at)}</p></div><div className={css.actions}><button type="button" onClick={onBack}><ArrowRight size={17} aria-hidden="true" />سجل المرتجعات</button><button type="button" className={css.primary} onClick={() => void preview()}><Printer size={17} aria-hidden="true" />استعراض وطباعة المرتجع</button></div></header>
    <div className={css.metadata}><section className={css.card}><h3>{detail.supplier?.name || "المورد"}</h3>{detail.supplier?.phone && <p dir="ltr">{detail.supplier.phone}</p>}{detail.supplier?.taxNumber && <p>الرقم الضريبي {detail.supplier.taxNumber}</p>}<p>الفاتورة الأصلية {document.reference_number ? `#${document.reference_number}` : "مرتبطة بالسجل"}</p><span className={css.badge}>مرحل</span></section><section className={css.card}><h3>سبب المرتجع</h3><p className={css.note}>{document.note || "—"}</p></section></div>
    <section className={css.register}><div className={css.tableScroll} role="region" tabIndex={0} aria-label="أصناف المرتجع"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>القيمة قبل الضريبة</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>{document.lines.map(line => <tr key={line.id}><td>{line.name}</td><td>{line.quantity} {line.unit_label}</td><td>{money(line.net)}</td><td>{money(line.tax)}</td><td>{money(line.net + line.tax)}</td></tr>)}</tbody></table></div></section>
    <div className={css.totals}>{[["القيمة قبل الضريبة", document.total - document.tax], ["الضريبة", document.tax], ["تخفيض المستحق للمورد", document.total - document.paid], ["المبلغ المستلم من المورد", document.paid], ["الإجمالي بالريال", document.total]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</div>
    <Modal open={printOpen} title="استعراض مرتجع المشتريات" onClose={() => setPrintOpen(false)} panelClassName={css.previewDialog}><div className={css.preview}>{error && <p role="alert" className={css.error}>{error}</p>}<div className={css.actions}><button type="button" disabled={!pdf} className={css.primary} onClick={() => { try { frame.current?.contentWindow?.print(); } catch { setError("استخدم زر الطباعة داخل عارض المستند"); } }}><Printer size={16} aria-hidden="true" />طباعة المرتجع</button>{pdf && <a href={pdf} download={`purchase-return-${document.number}.pdf`}><Download size={16} aria-hidden="true" />تنزيل المستند</a>}{!pdf && !busy && <button type="button" onClick={() => void preview()}>إعادة تجهيز المستند</button>}</div>{pdf ? <iframe ref={frame} className={css.pdf} src={pdf} title={`مرتجع مشتريات ${document.number}`} /> : <p role="status">{busy ? "جار تجهيز المستند" : "تعذر تجهيز المستند"}</p>}</div></Modal>
  </div>;
}
