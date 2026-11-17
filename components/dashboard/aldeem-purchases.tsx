"use client";
import { useAldeemAutoLoad } from "@/components/aldeem/use-auto-load";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, Plus, Printer, RefreshCw, Search } from "lucide-react";
import { listAldeemPurchases, readAldeemPurchaseRecord } from "@/app/actions/aldeem-purchases";
import type { AldeemPurchaseDetail, AldeemPurchaseKind, AldeemPurchaseListRow } from "@/lib/erp/aldeem-purchases";
import { AldeemPurchaseEditor, AldeemPurchaseReceipt } from "./aldeem-purchase-editor";
import { Modal } from "./ui/modal";
import css from "./aldeem-sales-quotes.module.css";

const labels = { request: ["طلبات الشراء", "طلب شراء"], order: ["أوامر الشراء", "أمر شراء"], invoice: ["فواتير المشتريات", "فاتورة مشتريات"] } as const;
const statuses: Record<string, string> = { draft: "مسودة", pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", converted: "محوّل", posted: "مرحل", cancelled: "ملغى" };
const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

/** Each entered purchase register reads its own first page automatically. */
export function AldeemPurchases({ kind }: { kind: Exclude<AldeemPurchaseKind, "return"> }) {
  const [rows, setRows] = useState<AldeemPurchaseListRow[]>([]);
  const [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [appliedQuery, setAppliedQuery] = useState(""), [offset, setOffset] = useState(0), [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<{ key: number; detail?: AldeemPurchaseDetail } | null>(null);
  const busy = useRef(false), generation = useRef(0), key = useRef(0);
  const returnButton = useRef<HTMLButtonElement | null>(null);
  const cache = useRef(new Map<string, AldeemPurchaseDetail>());

  useAldeemAutoLoad(() => load(0, ""));
  async function load(nextOffset = 0, nextQuery = query) {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    const version = generation.current;
    try {
      const result = await listAldeemPurchases(kind, nextQuery, nextOffset);
      if (!result.ok) throw new Error(result.message);
      if (version === generation.current) { setRows(result.data.items); setOffset(nextOffset); setAppliedQuery(nextQuery); setHasMore(result.data.hasMore); setLoaded(true); cache.current.clear(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة سجل المشتريات"); }
    finally { busy.current = false; setLoading(false); }
  }
  async function open(id: string, button?: HTMLButtonElement | null) {
    if (busy.current) return;
    if (button) returnButton.current = button;
    const cached = cache.current.get(id);
    if (cached) { setEditor({ key: ++key.current, detail: cached }); return; }
    busy.current = true; setLoading(true); setError("");
    try {
      const result = await readAldeemPurchaseRecord(id);
      if (!result.ok) throw new Error(result.message);
      if (!result.data.record && !result.data.document) throw new Error("لم يعد المستند متاحا");
      cache.current.set(id, result.data);
      if (cache.current.size > 30) cache.current.delete(cache.current.keys().next().value!);
      setEditor({ key: ++key.current, detail: result.data });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر فتح المستند"); }
    finally { busy.current = false; setLoading(false); }
  }
  function saved(detail: AldeemPurchaseDetail) {
    generation.current++;
    const record = detail.record;
    if (!record) return;
    cache.current.set(record.id, detail);
    if (record.kind === kind) setRows(current => [{ id: record.id, kind, number: record.number, displayNumber: null, date: record.date, createdAt: record.createdAt, status: record.status, supplierName: detail.supplier?.name ?? "", total: record.total, financeId: record.financeId }, ...current.filter(row => row.id !== record.id)]);
  }
  function back() { setEditor(null); requestAnimationFrame(() => returnButton.current?.focus({ preventScroll: true })); }
  const visible = rows.filter(row => status === "all" || row.status === status);
  const editorKind = editor?.detail?.record?.kind;
  return <div className={css.page}>
    {editor && error && <p className={css.error} role="alert">{error}</p>}
    {editor && loading && <p role="status">جار فتح المستند</p>}
    {editor && (editor.detail?.document && !editor.detail.record
      ? <PostedPurchase detail={editor.detail} onBack={back} onSaved={detail => { if (detail.document) cache.current.set(detail.document.id, detail); }} />
      : <AldeemPurchaseEditor key={editor.key} kind={editorKind === "request" || editorKind === "order" || editorKind === "invoice" ? editorKind : kind} initial={editor.detail} onBack={back} onSaved={saved} onOpenRecord={id => { cache.current.delete(id); void open(id); }} />)}
    <div hidden={!!editor}>
      <header className={css.toolbar}><div><h2>سجل {labels[kind][0]}</h2><p>{kind === "request" ? "حدّد احتياجك من الأصناف ثم أرسل الطلب للاعتماد" : kind === "order" ? "جهّز أمر المورد وتابع اعتماده وتحويله إلى فاتورة" : "أضف فواتير الموردين وتابع اعتمادها واستلامها"}</p></div><div className={css.actions}>
        <button type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" />{loading ? "جار قراءة البيانات" : error ? "إعادة المحاولة" : "تحديث السجل"}</button>
        <button type="button" className={css.primary} disabled={loading} onClick={event => { returnButton.current = event.currentTarget; generation.current++; setEditor({ key: ++key.current }); }}><Plus size={18} aria-hidden="true" />إنشاء {labels[kind][1]}</button>
      </div></header>
      {error && <p className={css.error} role="alert">{error}</p>}
      <form className={css.filters} onSubmit={event => { event.preventDefault(); void load(0); }}><label><span><Search size={16} aria-hidden="true" />المورد أو رقم المستند</span><input type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في المستندات المحفوظة" /></label><div className={css.actions}><button type="submit" disabled={loading}>بحث</button></div><label>الحالة في النتائج المعروضة<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">جميع الحالات</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></form>
      <section className={css.register} aria-label={labels[kind][0]} aria-busy={loading}>
        {visible.length ? <div className={css.tableScroll} role="region" aria-label="المستندات المحفوظة" tabIndex={0}><table><thead><tr>{["المستند", "المورد", "التاريخ", "الإجمالي بالريال", "الحالة"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id} onClick={event => void open(row.id, event.currentTarget.querySelector("button"))}><td><button className={css.recordLink} type="button" disabled={loading} onClick={event => { event.stopPropagation(); void open(row.id, event.currentTarget); }}>{row.displayNumber || row.number || "مسودة"}</button></td><td>{row.supplierName || "غير محدد"}</td><td>{row.date}</td><td>{money(row.total)}</td><td><span className={css.badge}>{statuses[row.status]}</span></td></tr>)}</tbody></table></div>
          : <div className={css.empty}><FileText size={32} aria-hidden="true" /><h3>{loading ? "جار قراءة البيانات" : loaded ? "لا توجد مستندات تطابق البحث" : `ابدأ ${labels[kind][1]} جديدا`}</h3><p>تظهر هنا المستندات المحفوظة ويمكن إضافة مستند جديد</p></div>}
        <footer className={css.footer}><span>{visible.length} مستند معروض</span><div className={css.actions}><button type="button" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - 30), appliedQuery)}>السابق</button><span>صفحة {Math.floor(offset / 30) + 1}</span><button type="button" disabled={loading || !hasMore} onClick={() => void load(offset + 30, appliedQuery)}>التالي</button></div></footer>
      </section>
    </div>
  </div>;
}

function PostedPurchase({ detail: initial, onBack, onSaved }: { detail: AldeemPurchaseDetail; onBack: () => void; onSaved: (detail: AldeemPurchaseDetail) => void }) {
  const [detail, setDetail] = useState(initial);
  const document = detail.document!;
  const [pdf, setPdf] = useState(""), [show, setShow] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const url = useRef(""), busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (url.current) URL.revokeObjectURL(url.current); }; }, []);
  async function preview() {
    setShow(true);
    if (url.current || busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try {
      const { createAldeemPurchasePdf } = await import("@/lib/export/aldeem-purchase-pdf");
      const blob = await createAldeemPurchasePdf({ brand: detail.brand, title: "فاتورة مشتريات", number: document.display_number || String(document.number), date: date(document.created_at), supplier: detail.supplier?.name ?? "", currency: document.currency || "SAR", status: "مرحلة", note: document.note, total: document.total, tax: document.tax, paid: document.paid, outstanding: document.outstanding, lines: document.lines.map(line => ({ name: line.name, unit: line.unit_label ?? "", quantity: line.quantity, price: line.unit_price, discount: 0, tax: line.tax, total: line.net + line.tax })) });
      if (alive.current) { url.current = URL.createObjectURL(blob); setPdf(url.current); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "تعذر تجهيز المستند"); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  }
  return <div className={css.editor}>
    <header className={css.toolbar}><div><h2>فاتورة مشتريات #{document.display_number || document.number}</h2><p>{detail.supplier?.name || "مورد"} · {date(document.created_at)}</p></div><div className={css.actions}><button type="button" onClick={onBack}><ArrowRight size={17} aria-hidden="true" />رجوع للسجل</button><button type="button" className={css.primary} onClick={() => void preview()}><Printer size={17} aria-hidden="true" />استعراض الفاتورة</button></div></header>
    <section className={css.card}><div className={css.tableScroll}><table><thead><tr>{["الصنف", "الكمية", "سعر الوحدة", "الضريبة", "الإجمالي"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{document.lines.map(line => <tr key={line.id}><td>{line.name}</td><td>{line.quantity} {line.unit_label}</td><td>{money(line.unit_price)}</td><td>{money(line.tax)}</td><td>{money(line.net + line.tax)}</td></tr>)}</tbody></table></div><div className={css.totals}><p>الضريبة: {money(document.tax)}</p><strong>الإجمالي: {money(document.total)} {document.currency || "SAR"}</strong><p>المدفوع: {money(document.paid)}</p><p>المتبقي: {money(document.outstanding)}</p></div>{document.note && <p>{document.note}</p>}</section>
    <AldeemPurchaseReceipt detail={detail} onSaved={next => { setDetail(next); onSaved(next); }} />
    <Modal open={show} title="استعراض فاتورة المشتريات" onClose={() => setShow(false)} panelClassName={css.previewDialog}>
      {error && <p className={css.error} role="alert">{error}</p>}
      {pdf ? <div className={css.preview}><div className={css.actions}><a href={pdf} target="_blank" rel="noopener">فتح للطباعة</a><a href={pdf} download={`purchase-${document.number}.pdf`}>تنزيل المستند</a></div><iframe className={css.pdf} src={pdf} title="فاتورة المشتريات للطباعة" /></div> : <div className={css.preview}><p role="status">{loading ? "جار تجهيز المستند" : "تعذر تجهيز المستند"}</p>{!loading && <button type="button" onClick={() => void preview()}>إعادة المحاولة</button>}</div>}
    </Modal>
  </div>;
}
