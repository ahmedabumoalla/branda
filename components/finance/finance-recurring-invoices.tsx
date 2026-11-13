"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, CalendarClock, Plus, Printer, RefreshCw, Search } from "lucide-react";
import { readRecurringInvoiceAction, readRecurringInvoicesAction, transitionRecurringInvoiceAction } from "@/app/actions/finance-recurring-invoices";
import type { RecurringInvoiceFilters, RecurringInvoiceRecord, RecurringInvoiceSummary } from "@/lib/finance/recurring-invoice";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { riyadhDate } from "@/lib/finance/quotation";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { Modal } from "@/components/dashboard/ui/modal";
import { RecurringInvoiceEditor } from "./recurring-invoice-editor";
import { RecurringInvoiceDocument, recurringInvoicePreview } from "./recurring-invoice-document";
import { Field, Numeric, financeDate } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";

export const recurringStatusLabels = { active: "نشط", paused: "متوقف", completed: "مكتمل" };
const unitLabels = { day: "يوم", week: "أسبوع", month: "شهر", year: "سنة" };
export function navigateRecurringInvoices(view = "recurring", id?: string) {
  const params = new URLSearchParams({ section: "sales", view });
  if (id) params.set("recurring", id);
  window.history.pushState(null, "", `/dashboard/finance?${params}`);
}
function followFinanceLink(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); window.history.pushState(null, "", event.currentTarget.getAttribute("href"));
}

export function FinanceRecurringInvoices({ snapshot, view, recurringId, stale, pending, onChanged, onCreateCustomer }: {
  snapshot: FinanceSnapshot; view: string; recurringId: string | null; stale: boolean; pending: boolean;
  onChanged: () => void; onCreateCustomer: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [revision, setRevision] = useState(0), [query, setQuery] = useState(""), [partyId, setPartyId] = useState("");
  const [status, setStatus] = useState(""), [advanced, setAdvanced] = useState(false);
  const [filters, setFilters] = useState<RecurringInvoiceFilters>({ offset: 0, limit: 30 });
  const [history, setHistory] = useState({ id: "", offset: 0 }), [tab, setTab] = useState("general");
  const historyOffset = history.id === recurringId ? history.offset : 0;
  const list = view === "recurring", create = view === "recurring-create";
  const canWrite = canFinance(snapshot.role, "accounting_write"), disabled = stale || pending || !canWrite;
  const requestKey = JSON.stringify([snapshot.cafe.id, snapshot.userId, snapshot.role, view, recurringId, filters, historyOffset, revision]);
  const [result, setResult] = useState<{ key: string; items: RecurringInvoiceSummary[]; detail?: RecurringInvoiceRecord; total: number; error: string }>({ key: "", items: [], total: 0, error: "" });
  const [preview, setPreview] = useState<CompanyInvoicePreview | null>(null), [pdf, setPdf] = useState(""), [pdfError, setPdfError] = useState(""), [printing, setPrinting] = useState(false);
  const pdfAttempt = useRef(0);
  useEffect(() => {
    let active = true;
    const read = async () => {
      if (list) {
        const response = await readRecurringInvoicesAction(snapshot.cafe.slug, filters);
        if (active) setResult(response.ok ? { key: requestKey, items: response.data.items, total: response.data.total, error: "" } : { key: requestKey, items: [], total: 0, error: response.message });
      } else if (recurringId) {
        const response = await readRecurringInvoiceAction(recurringId, snapshot.cafe.slug, historyOffset);
        if (active) setResult(response.ok ? { key: requestKey, items: [], detail: response.data, total: 1, error: "" } : { key: requestKey, items: [], total: 0, error: response.message });
      } else if (active) setResult({ key: requestKey, items: [], total: 0, error: create ? "" : "لم يُحدد الاشتراك المطلوب" });
    };
    void read().catch(() => { if (active) setResult({ key: requestKey, items: [], total: 0, error: "تعذر الاتصال أعد تحميل الاشتراكات" }); });
    return () => { active = false; };
  }, [snapshot.cafe.slug, list, create, recurringId, filters, historyOffset, requestKey]);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  useEffect(() => () => { pdfAttempt.current++; }, []);
  const changed = () => { setRevision(v => v + 1); onChanged(); };
  const showPdf = async (record: RecurringInvoiceRecord) => {
    const model = recurringInvoicePreview(record.payload, snapshot, record), attempt = ++pdfAttempt.current;
    setPreview(model); setPdf(""); setPdfError(""); setPrinting(true);
    try {
      const { createCompanyInvoicePreviewPdf } = await import("@/lib/export/company-invoice-preview-pdf");
      const blob = await createCompanyInvoicePreviewPdf(model);
      if (pdfAttempt.current === attempt) setPdf(URL.createObjectURL(blob));
    } catch { if (pdfAttempt.current === attempt) setPdfError("تعذر إعداد المعاينة للطباعة أعد المحاولة"); }
    finally { if (pdfAttempt.current === attempt) setPrinting(false); }
  };
  const loading = result.key !== requestKey && !(create && !recurringId);
  const detail = !loading && !list ? result.detail : undefined;
  return <div className={css.page}>
    <div className={css.page} inert={!!preview}>
      {list && <><div className={css.bar}><div><h2>الفواتير الدورية</h2><p>اشتراكات تصدر فواتير آجلة في مواعيدها مع متابعة كل فاتورة</p></div><div className={css.actions}><button className={styles.secondary} disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} aria-hidden="true" />تحديث</button>{canWrite && <button className={styles.primary} disabled={disabled} onClick={() => navigateRecurringInvoices("recurring-create")}><Plus size={16} aria-hidden="true" />اشتراك جديد</button>}</div></div>
        <form className={css.panel} onSubmit={e => { e.preventDefault(); setFilters({ query: query.trim() || undefined, partyId: partyId || undefined, status: status === "active" || status === "paused" || status === "completed" ? status : undefined, offset: 0, limit: 30 }); }}><div className={css.panelHead}><h2>بحث</h2><button type="button" className={styles.secondary} aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>بحث متقدم</button></div><div className={css.fields}>
          <Field label="اسم الاشتراك"><input type="search" maxLength={100} value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم الاشتراك أو العميل" /></Field><Field label="العميل"><select value={partyId} onChange={e => setPartyId(e.target.value)}><option value="">كل العملاء</option>{snapshot.parties.filter(p => p.kind === "customer").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          {advanced && <Field label="الحالة"><select value={status} onChange={e => setStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(recurringStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
        </div><div className={css.footer}><div className={css.actions}><button className={styles.primary} type="submit" disabled={loading}><Search size={16} aria-hidden="true" />بحث</button><button type="button" className={styles.secondary} onClick={() => { setQuery(""); setPartyId(""); setStatus(""); setFilters({ offset: 0, limit: 30 }); }}>إلغاء الفلتر</button></div></div></form></>}
      {loading ? <p className={styles.notice} role="status">جار تحميل الفواتير الدورية</p> : result.key === requestKey && result.error ? <section className={css.panel}><p className={styles.error} role="alert">{result.error}</p><div className={css.toolbar}><button className={styles.secondary} onClick={() => setRevision(v => v + 1)}>إعادة المحاولة</button><button className={styles.secondary} onClick={() => navigateRecurringInvoices()}>قائمة الاشتراكات</button></div></section> : create ? canWrite ? <RecurringInvoiceEditor key={`${snapshot.cafe.id}:${recurringId ?? "new"}:${detail?.revision ?? 0}`} snapshot={snapshot} saved={detail} disabled={disabled} onSaved={record => { setTab("general"); changed(); navigateRecurringInvoices("recurring-detail", record.id); }} onCancel={() => navigateRecurringInvoices(recurringId ? "recurring-detail" : "recurring", recurringId ?? undefined)} onCreateCustomer={onCreateCustomer} /> : <p className={styles.notice}>لا تملك صلاحية إدارة الفواتير الدورية</p> : detail ?
        <RecurringInvoiceDetails key={detail.id} record={detail} snapshot={snapshot} disabled={disabled} onChanged={changed} onPrint={() => void showPdf(detail)} tab={tab} onTab={setTab} onHistoryPage={offset => { setTab("history"); setHistory({ id: detail.id, offset }); }} /> : list ?
        <section className={css.panel} aria-label="قائمة الاشتراكات"><div className={css.footer}><span className={css.hint}>{result.total} اشتراك</span><div className={css.pagination}><span>صفحة {Math.floor((filters.offset ?? 0) / 30) + 1} من {Math.max(1, Math.ceil(result.total / 30))}</span><button className={styles.secondary} disabled={!filters.offset} onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - 30) }))}>السابق</button><button className={styles.secondary} disabled={(filters.offset ?? 0) + 30 >= result.total} onClick={() => setFilters(f => ({ ...f, offset: (f.offset ?? 0) + 30 }))}>التالي</button></div></div>
          {!result.items.length ? <div className={css.empty}><CalendarClock size={32} aria-hidden="true" /><strong>{filters.query || filters.partyId || filters.status ? "لا توجد اشتراكات تطابق البحث" : "لا توجد فواتير دورية بعد"}</strong><p>أنشئ اشتراكًا وحدد العميل والبنود ومواعيد إصدار الفواتير</p></div> : <div className={css.tableWrap} role="region" tabIndex={0} aria-label="نتائج الاشتراكات"><table className={css.table}><thead><tr>{["الاشتراك", "العميل", "يتكرر كل", "الفاتورة التالية", "التقدم", "الحالة", "مبلغ الفاتورة", "الإجراءات"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{result.items.map(r => <tr key={r.id}><td><button className={css.number} onClick={() => { setTab("general"); navigateRecurringInvoices("recurring-detail", r.id); }}>{r.name}</button><small>#{String(r.number).padStart(6, "0")}</small></td><td>{r.customerName}</td><td>{r.interval} {unitLabels[r.unit]}</td><td>{r.nextDate || "اكتمل الاشتراك"}{r.nextIssueDate && <small>موعد الإنشاء {r.nextIssueDate}</small>}</td><td>{r.generatedCount} / {r.count || "غير محدود"}{r.count > 0 && <div><progress aria-label="الفواتير المنشأة من العدد المحدد" value={r.generatedCount} max={r.count} /></div>}</td><td><span className={css.badge}>{recurringStatusLabels[r.status]}</span>{r.lastError && <small>يحتاج مراجعة</small>}</td><td><Numeric value={r.total} money /></td><td><button className={styles.secondary} onClick={() => { setTab("general"); navigateRecurringInvoices("recurring-detail", r.id); }}>عرض</button></td></tr>)}</tbody></table></div>}
        </section> : <p className={styles.notice}>الاشتراك غير موجود أو لم يعد متاحًا</p>}
    </div>
    <Modal open={!!preview} title="طباعة معاينة الفاتورة القادمة" onClose={() => { pdfAttempt.current++; setPreview(null); setPdf(""); setPrinting(false); }} footer={pdf ? <a className={styles.primary} href={pdf} target="_blank" rel="noopener noreferrer">فتح ملف الطباعة أو حفظه</a> : undefined}><div className={css.previewBody}>{printing && <p role="status">جار إعداد ملف الطباعة</p>}{pdfError && <p className={styles.error} role="alert">{pdfError}</p>}{pdf ? <iframe className={css.pdf} title="معاينة الفاتورة القادمة للطباعة" src={pdf} /> : preview && <RecurringInvoiceDocument model={preview} />}</div></Modal>
  </div>;
}

type Transition = "pause" | "resume" | "delete" | "run";
const transitionLabels = { pause: "إيقاف الاشتراك", resume: "تفعيل الاشتراك", delete: "حذف الاشتراك", run: "إصدار الفاتورة المستحقة الآن" };
const transitionHints = { pause: "يتوقف إنشاء الفواتير الجديدة وتبقى الفواتير السابقة محفوظة", resume: "سيُستأنف إنشاء الفواتير الآجلة المستحقة ويُسجل أثرها المالي والمخزني عند الإصدار", delete: "سيُحذف هذا الاشتراك الذي لم يصدر فواتير من القائمة", run: "ستصدر فاتورة آجلة واحدة حسب الموعد الحالي وتُرحل قيمتها ومخزونها دون تحصيل تلقائي من العميل" };
export function RecurringInvoiceDetails({ record, snapshot, disabled, onChanged, onPrint, tab = "general", onTab = () => {}, onHistoryPage = () => {} }: {
  record: RecurringInvoiceRecord; snapshot: FinanceSnapshot; disabled: boolean; onChanged: () => void; onPrint: () => void;
  tab?: string; onTab?: (tab: string) => void; onHistoryPage?: (offset: number) => void;
}) {
  const [confirm, setConfirm] = useState<Transition | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), request = useRef({ fingerprint: "", id: "" });
  const canWrite = canFinance(snapshot.role, "accounting_write"), blocked = disabled || busy || !canWrite;
  const due = record.status === "active" && !!record.nextIssueDate && record.nextIssueDate <= riyadhDate();
  const transition = async () => {
    if (!confirm || blocked || lock.current || (confirm === "run" && !due) || (confirm === "delete" && record.generatedCount > 0)) return;
    const fingerprint = JSON.stringify([record.id, record.revision, confirm]);
    if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await transitionRecurringInvoiceAction({ id: record.id, revision: record.revision, operation: confirm, requestId: request.current.id }, snapshot.cafe.slug);
      if (!result.ok) { setError(result.message); return; }
      if (result.data.status === "failed") { setError(result.data.message || "تعذر إصدار الفاتورة راجع الاشتراك"); return; }
      if (result.data.status === "not_due" || result.data.status === "busy") { setError(result.data.status === "busy" ? "الإصدار قيد التنفيذ حاول بعد قليل" : "لم يحن موعد الإصدار أو إعادة المحاولة التلقائية بعد"); return; }
      const deleted = confirm === "delete"; setConfirm(null); onChanged(); if (deleted) navigateRecurringInvoices();
    } catch { setError("تعذر تأكيد العملية أعد المحاولة بنفس الطلب"); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className={css.page}>
    <div className={css.page} inert={!!confirm}>
      <div className={css.bar}><div><h2>{record.name}</h2><p>اشتراك #{String(record.number).padStart(6, "0")} / {record.customerName}</p></div><button className={styles.secondary} disabled={busy} onClick={() => navigateRecurringInvoices()}><ArrowRight size={16} aria-hidden="true" />قائمة الاشتراكات</button></div>
      <section className={css.panel}><div className={css.toolbar}>{canWrite && <><button className={styles.secondary} disabled={blocked} onClick={() => navigateRecurringInvoices("recurring-create", record.id)}>تعديل</button>{record.status !== "completed" && <button className={styles.secondary} disabled={blocked} onClick={() => { setError(""); setConfirm(record.status === "active" ? "pause" : "resume"); }}>{record.status === "active" ? "إيقاف الاشتراك" : "تفعيل الاشتراك"}</button>}<button className={styles.secondary} disabled={blocked || record.generatedCount > 0} title={record.generatedCount > 0 ? "يمكن إيقاف الاشتراك بعد إصدار الفواتير ولا يمكن حذفه" : undefined} onClick={() => { setError(""); setConfirm("delete"); }}>حذف الاشتراك</button>{due && <button className={styles.primary} disabled={blocked} onClick={() => { setError(""); setConfirm("run"); }}>إصدار المستحق الآن</button>}</>}{record.upcoming.length > 0 && <button className={styles.secondary} onClick={onPrint}><Printer size={16} aria-hidden="true" />طباعة المعاينة</button>}</div>
        {record.lastError && <p className={styles.error} role="alert">تعذر الإصدار الأخير: {record.lastError}</p>}
        <div className={css.tabs} role="group" aria-label="تفاصيل الاشتراك">{[["general", "معلومات عامة"], ["upcoming", "الفاتورة القادمة"], ["history", `الفواتير السابقة (${record.historyTotal})`]].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => onTab(key)}>{label}</button>)}</div>
        {tab === "general" && <div className={css.fields}><dl className={`${css.metadata} ${css.wide}`}>
          <div><dt>الحالة</dt><dd>{recurringStatusLabels[record.status]}</dd></div><div><dt>يتكرر كل</dt><dd>{record.payload.interval} {unitLabels[record.payload.unit]}</dd></div><div><dt>تاريخ أول فاتورة</dt><dd>{record.payload.firstDate}</dd></div><div><dt>تاريخ الفاتورة المقبلة</dt><dd>{record.nextDate || "اكتمل الاشتراك"}</dd></div><div><dt>الفواتير المنشأة</dt><dd>{record.generatedCount}</dd></div><div><dt>الفواتير المتبقية</dt><dd>{record.count ? Math.max(0, record.count - record.generatedCount) : "غير محدودة"}</dd></div><div><dt>آخر إصدار</dt><dd>{record.lastIssuedAt ? financeDate(record.lastIssuedAt) : "لم تصدر فاتورة بعد"}</dd></div><div><dt>مبلغ كل فاتورة</dt><dd><Numeric value={record.total} money /></dd></div><div><dt>المخزن</dt><dd>{record.warehouseName}</dd></div><div><dt>شروط الدفع</dt><dd>{record.payload.paymentTermsDays} يوم</dd></div>
        </dl><p className={`${css.hint} ${css.wide}`}>الفواتير تصدر آجلة دون تحصيل تلقائي وتظهر تفاصيل السداد في صفحة كل فاتورة تُراجع المواعيد تلقائيًا كل دقيقة وقد يتأخر الإصدار عند وجود خطأ يحتاج معالجة</p></div>}
        {tab === "upcoming" && (record.upcoming.length ? <div className={css.documentStage}><RecurringInvoiceDocument model={recurringInvoicePreview(record.payload, snapshot, record)} /></div> : <div className={css.empty}><strong>اكتمل عدد الفواتير المحدد</strong><p>يمكنك مراجعة الفواتير الصادرة من سجل الفواتير السابقة</p></div>)}
        {tab === "history" && <><div className={css.footer}><p className={css.hint}>الفواتير الفعلية التي أصدرها هذا الاشتراك افتح الفاتورة لعرض السداد أو طباعتها</p><div className={css.pagination}><button className={styles.secondary} disabled={!record.historyOffset} onClick={() => onHistoryPage(Math.max(0, record.historyOffset - 30))}>السابق</button><button className={styles.secondary} disabled={record.historyOffset + 30 >= record.historyTotal} onClick={() => onHistoryPage(record.historyOffset + 30)}>التالي</button></div></div>{record.invoices.length ? <div className={css.tableWrap} role="region" tabIndex={0} aria-label="الفواتير السابقة"><table className={css.table}><thead><tr>{["رقم الفاتورة", "تاريخ الفاتورة", "تاريخ الإنشاء", "تاريخ الاستحقاق", "الإجمالي", "الإجراءات"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{record.invoices.map(invoice => <tr key={invoice.id}><td>{invoice.displayNumber || invoice.invoiceNumber}</td><td>{invoice.scheduledDate}</td><td>{financeDate(invoice.issuedAt)}</td><td>{invoice.dueDate}</td><td><Numeric value={invoice.total} money /></td><td><a className={styles.secondary} onClick={followFinanceLink} href={`/dashboard/finance?section=sales&view=invoice&invoice=${encodeURIComponent(invoice.invoiceId)}`}>عرض وطباعة</a></td></tr>)}</tbody></table></div> : <div className={css.empty}><strong>لم تصدر فواتير من هذا الاشتراك بعد</strong></div>}</>}
      </section>
    </div>
    <Modal open={!!confirm} title={confirm ? transitionLabels[confirm] : "تأكيد العملية"} onClose={() => { if (!busy) setConfirm(null); }} panelClassName="w-full max-w-lg overflow-hidden rounded-2xl bg-white"><div className={css.confirm}><p>{confirm && transitionHints[confirm]}</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={css.actions}><button className={styles.primary} disabled={blocked} onClick={() => void transition()}>{busy ? "جار التنفيذ" : "تأكيد"}</button><button className={styles.secondary} disabled={busy} onClick={() => setConfirm(null)}>إلغاء</button></div></div></Modal>
  </div>;
}
