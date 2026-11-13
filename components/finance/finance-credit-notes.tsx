"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, FileText, Plus, Printer, RefreshCw, Search, Trash2, X } from "lucide-react";
import { readCreditNotesAction, readCreditNoteAction, transitionCreditNoteAction } from "@/app/actions/finance-credit-notes";
import { creditNoteStatusLabels, creditNoteStockLabels, type CreditNoteFilters, type CreditNoteRecord } from "@/lib/finance/credit-note";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { Modal } from "@/components/dashboard/ui/modal";
import { CreditNoteEditor } from "./credit-note-editor";
import { CreditNoteDocument, creditNotePreview } from "./credit-note-document";
import { Field, Numeric, financeDate } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";

export function navigateCreditNotes(view: "credit-notes" | "credit-create" | "credit-note", id?: string, copy = false) {
  const params = new URLSearchParams({ section: "sales", view });
  if (id) params.set("creditNote", id);
  if (copy) params.set("copy", "1");
  window.history.pushState(null, "", `/dashboard/finance?${params}`);
}

export function FinanceCreditNotes({ snapshot, view, noteId, copy, stale, pending, onChanged, onCreateCustomer }: {
  snapshot: FinanceSnapshot; view: string; noteId: string | null; copy: boolean; stale: boolean; pending: boolean;
  onChanged: () => void; onCreateCustomer: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [partyId, setPartyId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [filters, setFilters] = useState<CreditNoteFilters>({ offset: 0, limit: 30 });
  const list = view === "credit-notes";
  const fresh = view === "credit-create" && !noteId;
  const requestKey = JSON.stringify([snapshot.cafe.id, view, noteId, filters, revision]);
  const [result, setResult] = useState<{ key: string; items: CreditNoteRecord[]; total: number; error: string }>({ key: "", items: [], total: 0, error: "" });
  const [preview, setPreview] = useState<CompanyInvoicePreview | null>(null);
  const [pdf, setPdf] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [printing, setPrinting] = useState(false);
  const pdfAttempt = useRef(0);
  const canWrite = canFinance(snapshot.role, "accounting_write");
  const disabled = stale || pending;
  useEffect(() => {
    if (fresh) return;
    let active = true;
    const read = list ? readCreditNotesAction(snapshot.cafe.slug, filters) : noteId ? readCreditNoteAction(noteId, snapshot.cafe.slug).then(r => r.ok ? { ok: true as const, data: { items: [r.data], total: 1 } } : r) : Promise.resolve({ ok: false as const, message: "لم يُحدد الإشعار المطلوب" });
    void read.then(r => {
      if (active) setResult(r.ok ? { key: requestKey, items: r.data.items, total: r.data.total, error: "" } : { key: requestKey, items: [], total: 0, error: r.message });
    }).catch(() => { if (active) setResult({ key: requestKey, items: [], total: 0, error: "تعذر الاتصال أعد تحميل الإشعارات الدائنة" }); });
    return () => { active = false; };
  }, [snapshot.cafe.slug, filters, list, noteId, fresh, requestKey]);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  const showPdf = async (record: CreditNoteRecord) => {
    const model = creditNotePreview(record.payload, snapshot, record), attempt = ++pdfAttempt.current;
    setPreview(model); setPdf(""); setPdfError(""); setPrinting(true);
    try {
      const { createCompanyInvoicePreviewPdf } = await import("@/lib/export/company-invoice-preview-pdf");
      const blob = await createCompanyInvoicePreviewPdf(model);
      if (pdfAttempt.current === attempt) setPdf(URL.createObjectURL(blob));
    } catch { if (pdfAttempt.current === attempt) setPdfError("تعذر إعداد نسخة الطباعة أعد المحاولة من صفحة الإشعار"); }
    finally { if (pdfAttempt.current === attempt) setPrinting(false); }
  };
  const changed = () => { setRevision(v => v + 1); onChanged(); };
  const onSaved = (record: CreditNoteRecord, print: boolean) => { changed(); navigateCreditNotes("credit-note", record.id); if (print) void showPdf(record); };
  const loading = !fresh && result.key !== requestKey;
  const record = !loading && !list ? result.items[0] : undefined;
  let content;
  if (view === "credit-create" && !canWrite) content = <p className={styles.notice}>لا تملك صلاحية إنشاء الإشعارات الدائنة</p>;
  else if (loading) content = <p className={styles.notice} role="status">جار تحميل الإشعارات الدائنة</p>;
  else if (!fresh && result.error) content = <div className={css.panel}><p className={styles.error} role="alert">{result.error}</p><div className={css.toolbar}><button className={styles.secondary} onClick={() => setRevision(v => v + 1)}>إعادة المحاولة</button><button className={styles.secondary} onClick={() => navigateCreditNotes("credit-notes")}>قائمة الإشعارات</button></div></div>;
  else if (view === "credit-create" && (fresh || record?.status === "draft" || copy)) content = <CreditNoteEditor key={`${snapshot.cafe.id}:${noteId ?? "new"}:${copy}`} snapshot={snapshot} saved={record} copy={copy} disabled={disabled} onSaved={onSaved} onCancel={() => navigateCreditNotes("credit-notes")} onCreateCustomer={onCreateCustomer} />;
  else if (!list && record) content = <CreditNoteDetails key={`${record.id}:${record.revision}`} record={record} snapshot={snapshot} disabled={disabled} onChanged={changed} onPrint={() => void showPdf(record)} />;
  else if (!list) content = <p className={styles.notice}>الإشعار غير موجود أو لم يعد متاحًا</p>;
  else content = <>
    <div className={css.bar}><div><h2>الإشعارات الدائنة</h2><p>تابع رصيد العميل واستلام البضاعة المرتجعة</p></div><div className={css.actions}><button className={styles.secondary} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} aria-hidden="true" />تحديث</button>{canWrite && <button className={styles.primary} disabled={disabled} onClick={() => navigateCreditNotes("credit-create")}><Plus size={17} aria-hidden="true" />إضافة إشعار دائن</button>}</div></div>
    <form className={css.panel} onSubmit={e => { e.preventDefault(); setFilters({ query: query.trim() || undefined, partyId: partyId || undefined, status: status === "draft" || status === "issued" ? status : undefined, from: from || undefined, to: to || undefined, offset: 0, limit: 30 }); }}>
      <div className={css.panelHead}><h2>بحث</h2><button type="button" className={styles.secondary} aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>بحث متقدم</button></div>
      <div className={css.fields}><Field label="العميل"><select value={partyId} onChange={e => setPartyId(e.target.value)}><option value="">كل العملاء</option>{snapshot.parties.filter(p => p.kind === "customer").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="رقم الإشعار أو اسم العميل"><input type="search" maxLength={100} value={query} onChange={e => setQuery(e.target.value)} /></Field>
      {advanced && <><Field label="من تاريخ"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="إلى تاريخ"><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></Field><Field label="الحالة"><select value={status} onChange={e => setStatus(e.target.value)}><option value="">كل الحالات</option><option value="draft">مسودة</option><option value="issued">صادر</option></select></Field></>}</div>
      <div className={css.footer}><div className={css.actions}><button type="submit" className={styles.primary}><Search size={16} aria-hidden="true" />بحث</button><button type="button" className={styles.secondary} onClick={() => { setQuery(""); setPartyId(""); setStatus(""); setFrom(""); setTo(""); setFilters({ offset: 0, limit: 30 }); }}>إلغاء الفلتر</button></div><span className={css.hint}>{result.total} إشعار</span></div>
    </form>
    <section className={css.panel} aria-label="قائمة الإشعارات الدائنة">{!result.items.length ? <div className={css.empty}><FileText size={32} aria-hidden="true" /><strong>{Object.values(filters).some(v => typeof v === "string" && v) ? "لا توجد إشعارات تطابق البحث" : "لا توجد إشعارات دائنة بعد"}</strong><p>أنشئ إشعارًا دائنًا وحدد العميل والبنود ثم احفظه كمسودة أو أصدره</p></div> : <div className={css.tableWrap} role="region" tabIndex={0} aria-label="نتائج الإشعارات"><table className={css.table}><thead><tr>{["رقم الإشعار", "العميل", "أنشئ بواسطة", "حالة الإشعار", "حالة الاستلام", "المبلغ", "الإجراءات"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{result.items.map(n => <tr key={n.id}><td><button className={css.number} onClick={() => navigateCreditNotes("credit-note", n.id)}>#{n.displayNumber || String(n.number).padStart(6, "0")}</button><small>{n.payload.date}</small></td><td>{n.customerName || "لم يُحدد العميل"}</td><td>{n.createdByName}</td><td><span className={css.badge} data-status={n.status}>{creditNoteStatusLabels[n.status]}</span></td><td><span className={css.badge} data-status={n.stockStatus}>{creditNoteStockLabels[n.stockStatus]}</span></td><td><Numeric value={n.total} money /></td><td><button className={styles.secondary} onClick={() => navigateCreditNotes("credit-note", n.id)}>عرض</button></td></tr>)}</tbody></table></div>}
      <div className={css.footer}><span className={css.hint}>صفحة {Math.floor((filters.offset ?? 0) / 30) + 1} من {Math.max(1, Math.ceil(result.total / 30))}</span><div className={css.pagination}><button className={styles.secondary} disabled={!filters.offset} onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - 30) }))}>السابق</button><button className={styles.secondary} disabled={(filters.offset ?? 0) + 30 >= result.total} onClick={() => setFilters(f => ({ ...f, offset: (f.offset ?? 0) + 30 }))}>التالي</button></div></div>
    </section>
  </>;
  return <div className={css.page}>
    {stale && <p className={styles.notice}>البيانات غير محدثة انتظر عودة الاتصال قبل الحفظ أو الاعتماد</p>}
    <div inert={!!preview}>{content}</div>
    <Modal open={!!preview} title="طباعة الإشعار الدائن" onClose={() => { pdfAttempt.current++; setPreview(null); setPdf(""); setPrinting(false); }} footer={pdf ? <a className={styles.primary} href={pdf} target="_blank" rel="noopener noreferrer">فتح ملف الطباعة أو حفظه</a> : undefined}><div className={`${css.page} ${css.previewBody}`}>{printing && <p role="status">جار إعداد ملف الطباعة</p>}{pdfError && <p className={styles.error} role="alert">{pdfError}</p>}{pdf ? <iframe title="ملف الإشعار الدائن للطباعة" src={pdf} className={css.pdf} /> : preview && <CreditNoteDocument model={preview} />}</div></Modal>
  </div>;
}

const activityLabels: Record<string, string> = { create: "إنشاء مسودة", created: "إنشاء مسودة", save: "حفظ التعديلات", edit: "تعديل المسودة", update: "تعديل المسودة", issue: "إصدار الإشعار", receive: "تأكيد استلام البضاعة", reject: "رفض الاستلام", delete: "حذف المسودة" };

export function CreditNoteDetails({ record, snapshot, disabled, onChanged, onPrint }: { record: CreditNoteRecord; snapshot: FinanceSnapshot; disabled: boolean; onChanged: () => void; onPrint: () => void }) {
  const [tab, setTab] = useState("document");
  const [confirm, setConfirm] = useState<"issue" | "receive" | "reject" | "delete" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false), request = useRef({ operation: "", id: "" });
  const canEdit = canFinance(snapshot.role, "accounting_write"), canReceive = canFinance(snapshot.role, "inventory_write");
  const draft = record.status === "draft";
  const actions = { issue: "إصدار الإشعار", receive: "تأكيد الاستلام", reject: "رفض الاستلام", delete: "حذف المسودة" };
  const transition = async () => {
    if (!confirm || lock.current || disabled || (confirm === "receive" || confirm === "reject" ? !canReceive : !canEdit)) return;
    if (confirm === "reject" && !note.trim()) { setError("اكتب سبب رفض الاستلام"); return; }
    if (request.current.operation !== confirm) request.current = { operation: confirm, id: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await transitionCreditNoteAction({ id: record.id, revision: record.revision, operation: confirm, requestId: request.current.id, note }, snapshot.cafe.slug);
      if (!result.ok) { setError(result.message); return; }
      setConfirm(null); onChanged(); if (confirm === "delete") navigateCreditNotes("credit-notes");
    } catch { setError("تعذر تأكيد العملية أعد المحاولة بنفس الإشعار"); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className={css.page}>
    <div inert={!!confirm} className={css.page}>
      <div className={css.bar}><div><h2>إشعار دائن #{record.displayNumber || String(record.number).padStart(6, "0")}</h2><p>{record.customerName} <span className={css.badge} data-status={record.status}>{creditNoteStatusLabels[record.status]}</span> <span className={css.badge} data-status={record.stockStatus}>{creditNoteStockLabels[record.stockStatus]}</span></p></div><button className={styles.secondary} onClick={() => navigateCreditNotes("credit-notes")}><ArrowRight size={16} aria-hidden="true" />قائمة الإشعارات</button></div>
      <section className={css.panel}>
        <div className={css.toolbar}>
          <button className={styles.primary} onClick={onPrint}><Printer size={16} aria-hidden="true" />طباعة / PDF</button>
          {canEdit && draft && <><button className={styles.secondary} disabled={disabled} onClick={() => navigateCreditNotes("credit-create", record.id)}>تعديل المسودة</button><button className={styles.secondary} disabled={disabled} onClick={() => setConfirm("issue")}>إصدار الإشعار</button><button className={styles.secondary} disabled={disabled} onClick={() => setConfirm("delete")}><Trash2 size={15} aria-hidden="true" />حذف المسودة</button></>}
          {canEdit && <button className={styles.secondary} disabled={disabled} onClick={() => navigateCreditNotes("credit-create", record.id, true)}><Copy size={15} aria-hidden="true" />نسخ كمسودة جديدة</button>}
          {record.payload.sourceInvoiceId && <a className={styles.secondary} href={`/dashboard/finance?section=sales&view=invoice&invoice=${encodeURIComponent(record.payload.sourceInvoiceId)}`}>الفاتورة الأصلية #{record.sourceNumber}</a>}
          {record.payload.partyId && <a className={styles.secondary} href={`/dashboard/finance?section=parties&view=customer&customer=${encodeURIComponent(record.payload.partyId)}`}>ملف العميل</a>}
          {record.journalId && canFinance(snapshot.role, "reports") && <a className={styles.secondary} href={`/dashboard/finance?section=reports&view=journal&entry=${encodeURIComponent(record.journalId)}`}>القيد المحاسبي</a>}
        </div>
        {!draft && <p className={css.hint}>الإشعار الصادر محفوظ في السجل المحاسبي ولا يمكن تعديله أو حذفه</p>}
        <nav className={css.tabs} aria-label="تفاصيل الإشعار">{[["document", "إشعار دائن"], ["activity", "سجل النشاطات"], ["stock", "الأذون المخزنية"]].map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>
        {tab === "document" && <div className={css.documentStage}><CreditNoteDocument model={creditNotePreview(record.payload, snapshot, record)} /></div>}
        {tab === "activity" && <div className={css.timeline}>{record.events.length ? record.events.map(event => <article className={css.event} key={event.id}><h3>{activityLabels[event.action] || "تحديث الإشعار"}</h3><p>{event.actorName}</p>{event.note && <p>{event.note}</p>}<time dateTime={event.createdAt}>{financeDate(event.createdAt)}</time></article>) : <p className={css.hint}>لا توجد نشاطات مسجلة</p>}</div>}
        {tab === "stock" && <>
          {!record.payload.stockRequired ? <div className={css.empty}><strong>هذا الإشعار لا يتطلب استلام بضاعة</strong><p>التسوية المالية مستقلة عن حركة المخزون</p></div> : <><div className={css.panelHead}><h3>قائمة المنتجات</h3><span className={css.badge} data-status={record.stockStatus}>{creditNoteStockLabels[record.stockStatus]}</span></div><div className={css.tableWrap} tabIndex={0} role="region" aria-label="بنود الاستلام"><table className={css.table}><thead><tr>{["البند", "سعر الوحدة", "الكمية المطلوبة", "الكمية المستلمة", "الإجمالي"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{record.lines.map((line, index) => <tr key={index}><td>{line.name}</td><td><Numeric value={line.price} /></td><td>{line.quantity}</td><td>{record.stockStatus === "received" ? line.quantity : 0}</td><td><Numeric value={line.total} money /></td></tr>)}</tbody></table></div><div className={css.panelHead}><div><h3>{record.warehouseName}</h3><p className={css.hint}>{draft ? "يُنشأ إذن الاستلام بعد إصدار الإشعار" : record.stockStatus === "received" ? "تمت إضافة الكميات إلى المخزون" : "لا تُضاف الكميات للمخزون إلا بعد تأكيد الاستلام"}</p></div>{record.stockStatus === "pending" && canReceive && <div className={css.actions}><button className={styles.primary} disabled={disabled} onClick={() => setConfirm("receive")}><Check size={16} aria-hidden="true" />تأكيد الاستلام</button><button className={styles.secondary} disabled={disabled} onClick={() => setConfirm("reject")}><X size={16} aria-hidden="true" />رفض الاستلام</button></div>}</div></>}
        </>}
      </section>
    </div>
    <Modal open={!!confirm} title={confirm ? actions[confirm] : "تأكيد العملية"} onClose={() => { if (!busy) { setConfirm(null); setError(""); } }} panelClassName="w-full max-w-lg overflow-hidden rounded-2xl bg-white"><div className={css.confirm}><p>{confirm === "issue" ? "سيُسجل المبلغ في رصيد العميل والقيد المحاسبي ولن يمكن تعديل الإشعار بعد الإصدار" : confirm === "receive" ? "أكد استلام جميع الكميات الموضحة لإضافتها إلى المستودع مرة واحدة" : confirm === "reject" ? "سيُرفض إذن الاستلام ولن تُضاف البضاعة إلى المخزون ويبقى رصيد العميل كما هو" : "ستُحذف المسودة من القائمة مع الاحتفاظ بسجل نشاطها"}</p>{(confirm === "receive" || confirm === "reject") && <Field label={confirm === "reject" ? "سبب الرفض" : "ملاحظة الاستلام"}><textarea disabled={busy} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></Field>}{error && <p className={styles.error} role="alert">{error}</p>}<div className={css.actions}><button className={styles.primary} disabled={busy || disabled} onClick={() => void transition()}>{busy ? "جار التنفيذ" : "تأكيد"}</button><button className={styles.secondary} disabled={busy} onClick={() => { setConfirm(null); setError(""); }}>إلغاء</button></div></div></Modal>
  </div>;
}
