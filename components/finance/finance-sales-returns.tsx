"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Check, FileText, Printer, RefreshCw, Search, X } from "lucide-react";
import { readSalesReturnsAction, readSalesReturnAction, transitionSalesReturnStockAction } from "@/app/actions/finance-sales-returns";
import type { SalesReturnDetail, SalesReturnSummary, SalesReturnFilters } from "@/lib/finance/sales-return";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { Modal } from "@/components/dashboard/ui/modal";
import { SalesReturnDocument, salesReturnPreview } from "./sales-return-document";
import { Field, Numeric, financeDate } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";

export const returnStockLabels = { none: "بدون حركة مخزنية", pending: "بانتظار الاستلام", received: "تم الاستلام", rejected: "رُفض الاستلام" };
export const returnPaymentLabels = { cash: "أُعيد المبلغ", credit: "تخفيض الآجل", mixed: "إعادة مبلغ وتخفيض الآجل" };
function returnCostKnown(line: SalesReturnDetail["stockLines"][number]) {
  return !["unknown", "untracked"].includes(line.costStatus) && !(line.costStatus === "legacy" && line.total === 0);
}
export function navigateSalesReturns(id?: string) {
  const params = new URLSearchParams({ section: "sales", view: id ? "return-detail" : "returns" });
  if (id) params.set("return", id);
  window.history.pushState(null, "", `/dashboard/finance?${params}`);
}

// Keep the already authorized workspace mounted on same-page navigation.
function followFinanceLink(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState(null, "", event.currentTarget.getAttribute("href"));
}

export function FinanceSalesReturns({ snapshot, view, returnId, stale, pending, onChanged }: {
  snapshot: FinanceSnapshot; view: string; returnId: string | null; stale: boolean; pending: boolean; onChanged: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [partyId, setPartyId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [stockStatus, setStockStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [filters, setFilters] = useState<SalesReturnFilters>({ offset: 0, limit: 30 });
  const list = view === "returns";
  const requestKey = JSON.stringify([snapshot.cafe.id, snapshot.userId, snapshot.role, view, returnId, filters, revision]);
  const [result, setResult] = useState<{ key: string; items: SalesReturnSummary[]; detail?: SalesReturnDetail; total: number; error: string }>({ key: "", items: [], total: 0, error: "" });
  const [preview, setPreview] = useState<CompanyInvoicePreview | null>(null);
  const [pdf, setPdf] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [printing, setPrinting] = useState(false);
  const pdfAttempt = useRef(0);
  useEffect(() => {
    let active = true;
    const read = async () => {
      if (list) {
        const response = await readSalesReturnsAction(snapshot.cafe.slug, filters);
        if (active) setResult(response.ok ? { key: requestKey, items: response.data.items, total: response.data.total, error: "" } : { key: requestKey, items: [], total: 0, error: response.message });
      } else if (returnId) {
        const response = await readSalesReturnAction(returnId, snapshot.cafe.slug);
        if (active) setResult(response.ok ? { key: requestKey, items: [], detail: response.data, total: 1, error: "" } : { key: requestKey, items: [], total: 0, error: response.message });
      } else if (active) setResult({ key: requestKey, items: [], total: 0, error: "لم تُحدد الفاتورة المرتجعة المطلوبة" });
    };
    void read().catch(() => { if (active) setResult({ key: requestKey, items: [], total: 0, error: "تعذر الاتصال أعد تحميل الفواتير المرتجعة" }); });
    return () => { active = false; };
  }, [snapshot.cafe.slug, filters, list, returnId, requestKey]);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  useEffect(() => () => { pdfAttempt.current++; }, []);
  const showPdf = async (record: SalesReturnDetail) => {
    const model = salesReturnPreview(record, snapshot), attempt = ++pdfAttempt.current;
    setPreview(model); setPdf(""); setPdfError(""); setPrinting(true);
    try {
      const { createCompanyInvoicePreviewPdf } = await import("@/lib/export/company-invoice-preview-pdf");
      const blob = await createCompanyInvoicePreviewPdf(model);
      if (pdfAttempt.current === attempt) setPdf(URL.createObjectURL(blob));
    } catch { if (pdfAttempt.current === attempt) setPdfError("تعذر إعداد نسخة الطباعة أعد المحاولة من صفحة المرتجع"); }
    finally { if (pdfAttempt.current === attempt) setPrinting(false); }
  };
  const changed = () => { setRevision(v => v + 1); onChanged(); };
  const loading = result.key !== requestKey;
  const detail = !loading && !list ? result.detail : undefined;
  return <div className={css.page}>
    <div className={css.page} inert={!!preview}>
      {list && <><div className={css.bar}><div><h2>الفواتير المرتجعة</h2><p>كل مرتجع برقم مستقل مرتبط بفاتورته الأصلية</p></div><button className={styles.secondary} disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} aria-hidden="true" />تحديث</button></div>
        <form className={css.panel} onSubmit={e => { e.preventDefault(); setFilters({ query: query.trim() || undefined, partyId: partyId || undefined, paymentStatus: paymentStatus === "cash" || paymentStatus === "credit" || paymentStatus === "mixed" ? paymentStatus : undefined, stockStatus: stockStatus === "pending" || stockStatus === "received" || stockStatus === "rejected" || stockStatus === "none" ? stockStatus : undefined, from: from || undefined, to: to || undefined, offset: 0, limit: 30 }); }}>
          <div className={css.panelHead}><h2>بحث</h2><button type="button" className={styles.secondary} aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>بحث متقدم</button></div>
          <div className={css.fields}><Field label="العميل"><select value={partyId} onChange={e => setPartyId(e.target.value)}><option value="">كل العملاء</option>{snapshot.parties.filter(p => p.kind === "customer").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="رقم المرتجع أو الفاتورة الأصلية"><input type="search" maxLength={100} value={query} onChange={e => setQuery(e.target.value)} /></Field><Field label="حالة تسوية المبلغ"><select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(returnPaymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          {advanced && <><Field label="حالة الإذن المخزني"><select value={stockStatus} onChange={e => setStockStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(returnStockLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="من تاريخ"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="إلى تاريخ"><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></Field></>}</div>
          <div className={css.footer}><div className={css.actions}><button type="submit" className={styles.primary} disabled={loading}><Search size={16} aria-hidden="true" />بحث</button><button type="button" className={styles.secondary} onClick={() => { setQuery(""); setPartyId(""); setPaymentStatus(""); setStockStatus(""); setFrom(""); setTo(""); setFilters({ offset: 0, limit: 30 }); }}>إلغاء الفلتر</button></div></div>
        </form></>}
      {loading ? <p className={styles.notice} role="status">جار تحميل الفواتير المرتجعة</p> : result.error ? <section className={css.panel}><p className={styles.error} role="alert">{result.error}</p><div className={css.toolbar}><button className={styles.secondary} onClick={() => setRevision(v => v + 1)}>إعادة المحاولة</button>{!list && <button className={styles.secondary} onClick={() => navigateSalesReturns()}>قائمة المرتجعات</button>}</div></section> : detail ? <SalesReturnDetails key={`${detail.id}:${revision}`} record={detail} snapshot={snapshot} disabled={stale || pending} onChanged={changed} onPrint={() => void showPdf(detail)} /> : list ?
        <section className={css.panel} aria-label="قائمة الفواتير المرتجعة">
          <div className={css.footer}><span className={css.hint}>{result.total} فاتورة مرتجعة</span><div className={css.pagination}><span>صفحة {Math.floor((filters.offset ?? 0) / 30) + 1} من {Math.max(1, Math.ceil(result.total / 30))}</span><button className={styles.secondary} disabled={!filters.offset} onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - 30) }))}>السابق</button><button className={styles.secondary} disabled={(filters.offset ?? 0) + 30 >= result.total} onClick={() => setFilters(f => ({ ...f, offset: (f.offset ?? 0) + 30 }))}>التالي</button></div></div>
          {!result.items.length ? <div className={css.empty}><FileText size={32} aria-hidden="true" /><strong>{Object.values(filters).some(v => typeof v === "string" && v) ? "لا توجد مرتجعات تطابق البحث" : "لا توجد فواتير مرتجعة بعد"}</strong><p>تظهر المرتجعات هنا بعد اعتماد المالك يمكنك تقديم طلب مرتجع من تفاصيل الفاتورة الأصلية</p><a onClick={followFinanceLink} className={styles.secondary} href="/dashboard/finance?section=sales">إدارة الفواتير</a></div> : <div className={css.tableWrap} role="region" tabIndex={0} aria-label="نتائج الفواتير المرتجعة"><table className={css.table}><thead><tr>{["رقم المرتجع", "العميل", "الفاتورة الأصلية", "أنشئ بواسطة", "حالة الإذن المخزني", "تسوية المبلغ", "المبلغ", "الإجراءات"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{result.items.map(r => <tr key={r.id}><td><button className={css.number} onClick={() => navigateSalesReturns(r.id)}>#{String(r.number).padStart(6, "0")}</button><small>{financeDate(r.createdAt)}</small></td><td>{r.customerName}</td><td><a onClick={followFinanceLink} className={css.number} href={`/dashboard/finance?section=sales&view=invoice&invoice=${encodeURIComponent(r.sourceId)}`}>#{r.sourceNumber}</a></td><td>{r.createdByName}</td><td><span className={css.badge} data-status={r.stockStatus}>{returnStockLabels[r.stockStatus]}</span></td><td>{returnPaymentLabels[r.paymentStatus]}</td><td><Numeric value={r.total} money /></td><td><button className={styles.secondary} onClick={() => navigateSalesReturns(r.id)}>عرض</button></td></tr>)}</tbody></table></div>}
        </section> : <p className={styles.notice}>الفاتورة المرتجعة غير موجودة أو لم تعد متاحة</p>}
    </div>
    <Modal open={!!preview} title="طباعة الفاتورة المرتجعة" onClose={() => { pdfAttempt.current++; setPreview(null); setPdf(""); setPrinting(false); }} footer={pdf ? <a className={styles.primary} href={pdf} target="_blank" rel="noopener noreferrer">فتح ملف الطباعة أو حفظه</a> : undefined}><div className={`${css.page} ${css.previewBody}`}>{printing && <p role="status">جار إعداد ملف الطباعة</p>}{pdfError && <p className={styles.error} role="alert">{pdfError}</p>}{pdf ? <iframe title="الفاتورة المرتجعة للطباعة" src={pdf} className={css.pdf} /> : preview && <SalesReturnDocument model={preview} />}</div></Modal>
  </div>;
}

const activityLabels: Record<string, string> = { posted: "اعتماد المرتجع وترحيل المبلغ", requested: "تقديم طلب المرتجع", request: "تقديم طلب المرتجع", create: "إصدار الفاتورة المرتجعة", approve: "اعتماد المرتجع وترحيل المبلغ", receive: "تأكيد استلام البضاعة", reject: "رفض الاستلام" };
export function SalesReturnDetails({ record, snapshot, disabled, onChanged, onPrint }: { record: SalesReturnDetail; snapshot: FinanceSnapshot; disabled: boolean; onChanged: () => void; onPrint: () => void }) {
  const [tab, setTab] = useState("document");
  const [confirm, setConfirm] = useState<"receive" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false), request = useRef({ fingerprint: "", id: "" });
  const canReceive = canFinance(snapshot.role, "inventory_write");
  const transition = async () => {
    if (!confirm || lock.current || disabled || !canReceive || record.stockStatus !== "pending") return;
    if (confirm === "reject" && !note.trim()) { setError("اكتب سبب رفض الاستلام"); return; }
    const fingerprint = JSON.stringify([record.id, confirm, note.trim()]);
    if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await transitionSalesReturnStockAction({ id: record.id, revision: record.stockRevision, operation: confirm, requestId: request.current.id, note: note.trim() }, snapshot.cafe.slug);
      if (!response.ok) { setError(response.message); return; }
      setConfirm(null); onChanged();
    } catch { setError("تعذر تأكيد العملية أعد المحاولة بنفس الطلب"); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className={css.page}>
    <div inert={!!confirm} className={css.page}>
      <div className={css.bar}><div><h2>فاتورة مرتجعة #{String(record.number).padStart(6, "0")}</h2><p>{record.customerName} <span className={css.badge} data-status={record.stockStatus}>{returnStockLabels[record.stockStatus]}</span></p></div><button className={styles.secondary} onClick={() => navigateSalesReturns()}><ArrowRight size={16} aria-hidden="true" />قائمة المرتجعات</button></div>
      <section className={css.panel}>
        <div className={css.toolbar}><button className={styles.primary} onClick={onPrint}><Printer size={16} aria-hidden="true" />طباعة / PDF</button><a onClick={followFinanceLink} className={styles.secondary} href={`/dashboard/finance?section=sales&view=invoice&invoice=${encodeURIComponent(record.sourceId)}`}>الفاتورة الأصلية #{record.sourceNumber}</a>{record.partyId && <a onClick={followFinanceLink} className={styles.secondary} href={`/dashboard/finance?section=parties&view=customer&customer=${encodeURIComponent(record.partyId)}`}>ملف العميل</a>}{canFinance(snapshot.role, "reports") && <a onClick={followFinanceLink} className={styles.secondary} href={`/dashboard/finance?section=reports&view=journal&entry=${encodeURIComponent(record.id)}`}>القيد المحاسبي</a>}</div>
        <p className={css.hint}>تمت تسوية المبلغ عند اعتماد المرتجع وحُفظ المستند في السجل المحاسبي</p>
        <nav className={css.tabs} aria-label="تفاصيل الفاتورة المرتجعة">{[["document", "فاتورة"], ["activity", "سجل النشاطات"], ["stock", "الأذون المخزنية"]].map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>
        {tab === "document" && <div className={css.documentStage}><SalesReturnDocument model={salesReturnPreview(record, snapshot)} /></div>}
        {tab === "activity" && <div className={css.timeline}>{record.events.length ? record.events.map(event => <article className={css.event} key={event.id}><h3>{activityLabels[event.action] || "تحديث المرتجع"}</h3><p>{event.actorName}</p>{event.note && <p>{event.note}</p>}<time dateTime={event.createdAt}>{financeDate(event.createdAt)}</time></article>) : <p className={css.hint}>لا توجد نشاطات إضافية مسجلة</p>}</div>}
        {tab === "stock" && (record.stockStatus === "none" ? <div className={css.empty}><strong>لا توجد أصناف مخزنية مرتبطة بهذا المرتجع</strong><p>الفاتورة تسجل التسوية المالية فقط</p></div> : <><div className={css.panelHead}><h3>الأصناف المخزنية</h3><span className={css.badge} data-status={record.stockStatus}>{returnStockLabels[record.stockStatus]}</span></div><div className={css.tableWrap} tabIndex={0} role="region" aria-label="بنود إذن استلام المرتجع"><table className={css.table}><thead><tr>{["البند", "تكلفة الوحدة", "الكمية المطلوبة", "الكمية المستلمة", "قيمة المخزون"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{record.stockLines.map(line => <tr key={line.id}><td>{line.itemName}</td><td>{returnCostKnown(line) ? <Numeric value={line.unitCost} /> : "غير مسجلة"}</td><td><Numeric value={line.quantity} /></td><td><Numeric value={line.receivedQuantity} /></td><td>{returnCostKnown(line) ? <><Numeric value={line.total} money />{line.costStatus === "estimated" && <small>تكلفة تقديرية</small>}</> : "غير مسجلة"}</td></tr>)}</tbody></table></div><div className={css.panelHead}><div><h3>{record.warehouseName}</h3><p className={css.hint}>{record.stockStatus === "received" ? "تمت إضافة الكميات إلى المخزون" : record.stockStatus === "rejected" ? "رُفض استلام البضاعة وتبقى التسوية المالية مسجلة" : "تُضاف الكميات إلى المخزون بعد تأكيد الاستلام"}</p></div>{record.stockStatus === "pending" && canReceive && <div className={css.actions}><button className={styles.primary} disabled={disabled} onClick={() => { setNote(""); setError(""); setConfirm("receive"); }}><Check size={16} aria-hidden="true" />تأكيد الاستلام</button><button className={styles.secondary} disabled={disabled} onClick={() => { setNote(""); setError(""); setConfirm("reject"); }}><X size={16} aria-hidden="true" />رفض الاستلام</button></div>}{record.stockDocumentId && canFinance(snapshot.role, "reports") && <a onClick={followFinanceLink} className={styles.secondary} href={`/dashboard/finance?section=reports&view=journal&entry=${encodeURIComponent(record.stockDocumentId)}`}>قيد استلام المخزون</a>}</div></>)}
      </section>
    </div>
    <Modal open={!!confirm} title={confirm === "receive" ? "تأكيد استلام المرتجع" : "رفض استلام المرتجع"} onClose={() => { if (!busy) setConfirm(null); }} panelClassName="w-full max-w-lg overflow-hidden rounded-2xl bg-white"><div className={css.confirm}><p>{confirm === "receive" ? "أكد استلام جميع الكميات الموضحة لإضافتها إلى المستودع مرة واحدة" : "لن تُضاف الكميات إلى المخزون وتبقى تسوية المبلغ المعتمدة كما هي"}</p><Field label={confirm === "reject" ? "سبب الرفض" : "ملاحظة الاستلام"}><textarea disabled={busy} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></Field>{error && <p className={styles.error} role="alert">{error}</p>}<div className={css.actions}><button className={styles.primary} disabled={busy || disabled} onClick={() => void transition()}>{busy ? "جار التنفيذ" : "تأكيد"}</button><button className={styles.secondary} disabled={busy} onClick={() => setConfirm(null)}>إلغاء</button></div></div></Modal>
  </div>;
}
