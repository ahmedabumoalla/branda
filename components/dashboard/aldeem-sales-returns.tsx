"use client";
import { useAldeemAutoLoad } from "@/components/aldeem/use-auto-load";


import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Download, Plus, Printer, RefreshCw, RotateCcw, Search } from "lucide-react";
import { readSalesReturnsAction, readSalesReturnAction, readSalesReturnPrintAction, transitionSalesReturnStockAction } from "@/app/actions/finance-sales-returns";
import { readAldeemRefundRequests } from "@/app/actions/aldeem-sales-returns";
import { executeBrandFinanceAction } from "@/app/actions/brand-finance";
import type { AldeemRefundRequest } from "@/lib/finance/aldeem-sales-return";
import { salesReturnPaymentLabels, salesReturnStockLabels, type SalesReturnSummary, type SalesReturnDetail } from "@/lib/finance/sales-return";
import { AldeemReturnEditor } from "./aldeem-return-editor";
import { Modal } from "./ui/modal";
import css from "./aldeem-sales-quotes.module.css";

const slug = "khayal-aldeem";
const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", calendar: "gregory", timeZone: "Asia/Riyadh" }).format(new Date(value));

export function AldeemSalesReturns() {
  const [tab, setTab] = useState<"returns" | "requests">("returns");
  const [creating, setCreating] = useState(false);
  const [rows, setRows] = useState<SalesReturnSummary[]>([]);
  const [requests, setRequests] = useState<AldeemRefundRequest[]>([]);
  const [loaded, setLoaded] = useState(false), [requestsLoaded, setRequestsLoaded] = useState(false);
  const [total, setTotal] = useState(0), [offset, setOffset] = useState(0);
  const [query, setQuery] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<SalesReturnDetail | null>(null);
  const [selected, setSelected] = useState<AldeemRefundRequest | null>(null);
  const [confirmed, setConfirmed] = useState(false), [rejection, setRejection] = useState("");
  const [reviewError, setReviewError] = useState(""), [reviewBusy, setReviewBusy] = useState(false);
  const [approvedId, setApprovedId] = useState("");
  const lock = useRef(false), reviewLock = useRef(false);
  const historyFilter = useRef({ query: "", from: "", to: "" });
  const commandIds = useRef(new Map<string, string>());
  const cache = useRef(new Map<string, SalesReturnDetail>());
  const trigger = useRef<HTMLButtonElement | null>(null);

  useAldeemAutoLoad(() => tab === "returns" ? load() : loadRequests(), !creating && !detail, tab);
  async function load(pageOffset = 0, useDraftFilters = true) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const filters = useDraftFilters ? { query: query.trim(), from, to } : historyFilter.current;
    try {
      const result = await readSalesReturnsAction(slug, { query: filters.query || undefined, from: filters.from || undefined, to: filters.to || undefined, offset: pageOffset, limit: 30 });
      if (!result.ok) throw new Error(result.message);
      setRows(result.data.items); setTotal(result.data.total); setOffset(pageOffset); setLoaded(true); historyFilter.current = filters; cache.current.clear();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة المرتجعات"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function loadRequests() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await readAldeemRefundRequests();
      if (!result.ok) throw new Error(result.message);
      setRequests(result.data); setRequestsLoaded(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة طلبات الاعتماد"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function openDetail(id: string, button?: HTMLButtonElement | null) {
    if (lock.current) return;
    trigger.current = button ?? null;
    const cached = cache.current.get(id);
    if (cached) { setDetail(cached); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await readSalesReturnAction(id, slug);
      if (!result.ok) throw new Error(result.message);
      if (cache.current.size >= 20) cache.current.clear();
      cache.current.set(id, result.data); setDetail(result.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة تفاصيل المرتجع"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function review(operation: "refund_approve" | "refund_reject") {
    if (!selected || reviewLock.current) return;
    setReviewError("");
    if (operation === "refund_approve" && !confirmed) { setReviewError("أكد مراجعة الأصناف والمبالغ قبل الاعتماد"); return; }
    if (operation === "refund_reject" && !rejection.trim()) { setReviewError("أدخل سبب رفض الطلب"); return; }
    reviewLock.current = true; setReviewBusy(true);
    try {
      const payload = { requestId: selected.id, ...(operation === "refund_approve" ? { expectedTotal: selected.total, expectedPaid: selected.paid } : { note: rejection.trim() }) };
      const key = JSON.stringify([operation, payload]);
      if (!commandIds.current.has(key)) commandIds.current.set(key, crypto.randomUUID());
      const result = await executeBrandFinanceAction({ operation, requestId: commandIds.current.get(key), payload }, slug);
      if (!result.ok) throw new Error(result.message);
      setRequests(previous => previous.filter(request => request.id !== selected.id));
      setSelected(null); cache.current.clear();
      setNotice(operation === "refund_approve" ? "تم اعتماد المرتجع وترحيله إلى السجل" : "تم رفض طلب المرتجع");
      if (operation === "refund_approve") { setApprovedId(result.data.id); setLoaded(false); }
    } catch (cause) { setReviewError(cause instanceof Error ? cause.message : "تعذر تأكيد القرار أعد المحاولة بنفس الطلب"); }
    finally { reviewLock.current = false; setReviewBusy(false); }
  }
  return <div className={css.page}>
    {creating ? <AldeemReturnEditor onBack={() => setCreating(false)} onPending={() => { setCreating(false); setTab("requests"); setRequestsLoaded(false); setNotice("تم حفظ طلب المرتجع ويظهر في طلبات الاعتماد للمراجعة"); }} /> : detail ? <AldeemReturnDetail key={detail.id} initial={detail} onBack={() => { setDetail(null); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }} onChanged={record => { setDetail(record); cache.current.set(record.id, record); setRows(previous => previous.map(row => row.id === record.id ? record : row)); }} /> : <>
      <header className={css.toolbar}><div><h2>مرتجعات المبيعات</h2><p>راجع المرتجعات وطلبات اعتمادها المرتبطة بالفواتير الأصلية</p></div><div className={css.actions}><button type="button" disabled={busy} onClick={() => void (tab === "returns" ? load() : loadRequests())}><RefreshCw size={17} aria-hidden="true" />{busy ? "جار قراءة السجل" : tab === "requests" ? "تحديث طلبات الاعتماد" : error ? "إعادة المحاولة" : "تحديث السجل"}</button><button type="button" className={css.primary} disabled={busy} onClick={() => { setCreating(true); setError(""); }}><Plus size={18} aria-hidden="true" />إنشاء مرتجع مبيعات</button></div></header>
      <div className={css.tabs}><button type="button" disabled={busy} aria-pressed={tab === "returns"} onClick={() => setTab("returns")}>المرتجعات المعتمدة</button><button type="button" disabled={busy} aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>طلبات الاعتماد</button></div>
      {error && <p role="alert" className={css.error}>{error}</p>}{notice && <div role="status" className={css.notice}>{notice}{approvedId && <button type="button" disabled={busy} onClick={() => void openDetail(approvedId)}>استعراض المرتجع المعتمد</button>}</div>}
      {tab === "returns" ? <><form className={css.filters} onSubmit={event => { event.preventDefault(); void load(); }}><label>رقم المرتجع أو الفاتورة أو العميل<input type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} /></label><label>من تاريخ<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>إلى تاريخ<input type="date" min={from} value={to} onChange={event => setTo(event.target.value)} /></label><button type="submit" disabled={busy}><Search size={16} aria-hidden="true" />بحث</button></form>
      <section className={css.register} aria-busy={busy}>{rows.length ? <div className={css.tableScroll} role="region" tabIndex={0} aria-label="المرتجعات المعتمدة"><table><thead><tr>{["المرتجع", "الفاتورة الأصلية", "العميل", "التاريخ", "الإجمالي", "التسوية", "المخزون"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><button type="button" className={css.recordLink} disabled={busy} onClick={event => void openDetail(row.id, event.currentTarget)}>#{row.number}</button></td><td>#{row.sourceNumber}</td><td>{row.customerName || "عميل نقدي"}</td><td>{date(row.createdAt)}</td><td>{money(row.total)}</td><td>{salesReturnPaymentLabels[row.paymentStatus]}</td><td><span className={css.badge}>{salesReturnStockLabels[row.stockStatus]}</span></td></tr>)}</tbody></table></div> : <div className={css.empty}><RotateCcw size={32} aria-hidden="true" /><h3>{loaded ? "لا توجد مرتجعات مطابقة" : "سجل مرتجعات المبيعات"}</h3><p>{busy ? "جار تحميل المرتجعات" : "تظهر هنا المرتجعات المسجلة في الحساب"}</p></div>}<footer className={css.footer}><span>{loaded ? `${total} مرتجع` : ""}</span><div className={css.actions}><button type="button" disabled={busy || !offset} onClick={() => void load(Math.max(0, offset - 30), false)}>السابق</button><button type="button" disabled={busy || !loaded || offset + rows.length >= total} onClick={() => void load(offset + 30, false)}>التالي</button></div></footer></section></> : <section className={css.register} aria-busy={busy}>{requests.length ? <div className={css.tableScroll}><table><thead><tr>{["الفاتورة", "تاريخ الطلب", "قيمة المرتجع", "المبلغ المعاد", "الإجراء"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{requests.map(request => <tr key={request.id}><td>#{request.document_number}</td><td>{date(request.created_at)}</td><td>{money(request.total)}</td><td>{money(request.paid)}</td><td><button type="button" onClick={() => { setSelected(request); setConfirmed(false); setRejection(""); setReviewError(""); }}>مراجعة واعتماد</button></td></tr>)}</tbody></table></div> : <div className={css.empty}><h3>{requestsLoaded ? "لا توجد طلبات بانتظار الاعتماد" : "طلبات المرتجعات بانتظار المراجعة"}</h3><p>{busy ? "جار تحميل طلبات الاعتماد" : error ? "تعذر تحميل الطلبات يمكنك إعادة المحاولة" : "لا توجد طلبات حالية للمراجعة"}</p></div>}</section>}
    </>}
    <Modal open={!!selected} title={selected ? `مراجعة مرتجع الفاتورة #${selected.document_number}` : "مراجعة المرتجع"} onClose={() => { if (!reviewBusy) setSelected(null); }} panelClassName={css.dialog}>{selected && <div className={css.preview}>
      <p className={css.notice}>اعتماد الطلب يُرحّل المرتجع ويُسوّي المبلغ ويحدّث المخزون بحسب الأصناف المسجلة</p>{reviewError && <p role="alert" className={css.error}>{reviewError}</p>}
      <div className={css.tableScroll}><table><thead><tr><th>الصنف</th><th>الكمية المرتجعة</th></tr></thead><tbody>{selected.payload.lines.map((line, index) => <tr key={line.lineId}><td>{line.name || `الصنف ${index + 1}`}</td><td>{line.quantity}</td></tr>)}</tbody></table></div><p>سبب المرتجع: {selected.payload.note}</p><p>حساب إعادة المبلغ: {selected.paid > 0 ? selected.accountName || (selected.payload.paymentMethod === "bank" ? "الحساب البنكي المحدد" : "الصندوق المحدد") : "تخفيض المديونية فقط"}</p>{selected.payload.shiftId && <p>مصدر النقدية هو عهدة الوردية المحددة في الطلب</p>}{selected.payload.deferStock && <p className={css.notice}>استلام البضاعة مؤجل إلى تأكيد الاستلام بعد الاعتماد</p>}
      <div className={css.totals}>{[["قيمة المرتجع", selected.total], ["تخفيض المديونية", selected.total - selected.paid], ["المبلغ المعاد للعميل", selected.paid]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</div>
      <label className={css.check}><input type="checkbox" disabled={reviewBusy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />راجعت الأصناف والكميات وطريقة إعادة المبلغ وأعتمد المرتجع</label><label>سبب الرفض عند رفض الطلب<textarea maxLength={500} value={rejection} disabled={reviewBusy} onChange={event => setRejection(event.target.value)} /></label><div className={css.actions}><button type="button" className={css.primary} disabled={reviewBusy || !confirmed} onClick={() => void review("refund_approve")}><Check size={17} aria-hidden="true" />اعتماد المرتجع وترحيله</button><button type="button" disabled={reviewBusy || !rejection.trim()} onClick={() => void review("refund_reject")}>رفض الطلب</button></div>
    </div>}</Modal>
  </div>;
}

function AldeemReturnDetail({ initial, onBack, onChanged }: { initial: SalesReturnDetail; onBack: () => void; onChanged: (record: SalesReturnDetail) => void }) {
  const [record, setRecord] = useState(initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [printOpen, setPrintOpen] = useState(false), [pdf, setPdf] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const lock = useRef(false);
  const requestId = useRef("");
  const printRequest = useRef<Promise<void> | null>(null);
  const pdfUrl = useRef("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current); }; }, []);
  async function print() {
    setPrintOpen(true);
    if (printRequest.current) return printRequest.current;
    setBusy(true); setError("");
    printRequest.current = readSalesReturnPrintAction(record.id, slug).then(async result => {
      if (!result.ok) throw new Error(result.message);
      const { createCompanyInvoicePreviewPdf } = await import("@/lib/export/company-invoice-preview-pdf");
      const blob = await createCompanyInvoicePreviewPdf({ ...result.data, appearance: "aldeem" });
      if (mounted.current) { pdfUrl.current = URL.createObjectURL(blob); setPdf(pdfUrl.current); }
    }).catch(cause => { printRequest.current = null; if (mounted.current) setError(cause instanceof Error ? cause.message : "تعذر تجهيز ملف المرتجع"); }).finally(() => { if (mounted.current) setBusy(false); });
    return printRequest.current;
  }
  async function receive() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const result = await transitionSalesReturnStockAction({ id: record.id, revision: record.stockRevision, operation: "receive", requestId: requestId.current, note: "" }, slug);
      if (!result.ok) throw new Error(result.message);
      let next = { ...record, ...result.data };
      if (!("stockLines" in result.data)) {
        const refreshed = await readSalesReturnAction(record.id, slug);
        if (refreshed.ok) next = refreshed.data;
        else setError("تم تأكيد الاستلام وتعذر تحديث تفاصيله أعد فتح المرتجع");
      }
      setRecord(next); onChanged(next); setReceiveOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تأكيد الاستلام"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className={css.editor}>
    <header className={css.toolbar}><div><h2>مرتجع مبيعات #{record.number}</h2><p>مرتبط بالفاتورة #{record.sourceNumber} · {date(record.createdAt)}</p></div><div className={css.actions}><button type="button" disabled={busy} onClick={() => { if (pdf) URL.revokeObjectURL(pdf); onBack(); }}><ArrowRight size={17} aria-hidden="true" />سجل المرتجعات</button><button type="button" className={css.primary} onClick={() => void print()}><Printer size={17} aria-hidden="true" />استعراض وطباعة المرتجع</button></div></header>
    {error && <p role="alert" className={css.error}>{error}</p>}<div className={css.metadata}><section className={css.card}><h3>{record.customerName || "عميل نقدي"}</h3><p>المستودع: {record.warehouseName || "غير مرتبط بمخزون"}</p><p>{salesReturnPaymentLabels[record.paymentStatus]}</p><p>حساب التسوية: {record.accountName || "تخفيض المديونية"}</p><p>{record.note}</p></section><div className={css.totals}>{[["ضريبة المرتجع", record.tax], ["تخفيض المديونية", record.debtReduced], ["المبلغ المعاد", record.paid], ["إجمالي المرتجع", record.total]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</div></div>
    <section className={css.register}><div className={css.tableScroll}><table><thead><tr>{["الصنف", "الكمية", "سعر الوحدة", "الخصم", "الضريبة", "الإجمالي"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{record.lines.map(line => <tr key={line.id}><td>{line.name}{line.description && <p>{line.description}</p>}</td><td>{line.quantity}</td>{[line.price, line.discount, line.tax, line.total].map((value, index) => <td key={index}>{money(value)}</td>)}</tr>)}</tbody></table></div></section>
    <section className={css.card}><div className={css.toolbar}><h3>حالة استلام المخزون</h3><span className={css.badge}>{salesReturnStockLabels[record.stockStatus]}</span>{record.stockStatus === "pending" && <button type="button" disabled={busy} onClick={() => setReceiveOpen(true)}>تأكيد استلام البضاعة</button>}</div>{record.stockLines.length > 0 && <div className={css.tableScroll}><table><thead><tr><th>الصنف المخزني</th><th>الكمية</th><th>الكمية المستلمة</th></tr></thead><tbody>{record.stockLines.map(line => <tr key={line.id}><td>{line.itemName}</td><td>{line.quantity}</td><td>{line.receivedQuantity}</td></tr>)}</tbody></table></div>}</section>
    <Modal open={receiveOpen} title="تأكيد استلام البضاعة" onClose={() => { if (!busy) setReceiveOpen(false); }} panelClassName={css.dialog}><p>سيُسجل استلام الكميات المرتجعة في المستودع المحدد</p>{error && <p role="alert" className={css.error}>{error}</p>}<div className={css.actions}><button type="button" className={css.primary} disabled={busy} onClick={() => void receive()}>تأكيد الاستلام</button><button type="button" disabled={busy} onClick={() => setReceiveOpen(false)}>رجوع</button></div></Modal>
    <Modal open={printOpen} title={`مستند المرتجع #${record.number}`} onClose={() => setPrintOpen(false)} panelClassName={css.previewDialog}>{error && <p role="alert" className={css.error}>{error}</p>}{pdf ? <div className={css.preview}><div className={css.actions}><a href={pdf} target="_blank" rel="noopener">فتح للطباعة</a><a href={pdf} download={`sales-return-${record.number}.pdf`}><Download size={17} aria-hidden="true" />تنزيل المرتجع</a></div><iframe className={css.pdf} src={pdf} title="مستند المرتجع للطباعة" /></div> : <div className={css.preview}><p role="status">{busy ? "جار تجهيز المستند" : "تعذر تجهيز المستند"}</p>{!busy && <button type="button" onClick={() => void print()}>إعادة المحاولة</button>}</div>}</Modal>
  </div>;
}
