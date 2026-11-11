"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Copy, ExternalLink, FileDown, FileText, Pencil, Printer, RotateCcw } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { fetchJournalDetailAction } from "@/app/actions/finance-journal-detail";
import type { JournalDetail } from "@/lib/finance/journal-detail";
import { createFinanceJournalPdf, journalPrintable } from "@/lib/export/finance-journal-pdf";
import { documentKindNames, financeDate, Numeric } from "./finance-ui";
import styles from "./finance-journal-detail.module.css";
import { FinanceJournalEditor } from "./finance-journal-editor";
import { FinanceJournalActivity } from "./finance-journal-activity";
import { FinanceJournalOperation, type JournalSourceOperation } from "./finance-journal-operation";

function useJournal(id: string, slug: string) {
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ id: string; slug: string; revision: number; data?: JournalDetail; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    fetchJournalDetailAction(id, slug).then(result => { if (active) setLoaded({ id, slug, revision, ...(result.ok ? { data: result.data } : { error: result.message }) }); }).catch(() => { if (active) setLoaded({ id, slug, revision, error: "تعذر تحميل تفاصيل القيد أعد المحاولة" }); });
    return () => { active = false; };
  }, [id, slug, revision]);
  const current = loaded?.id === id && loaded.slug === slug && loaded.revision === revision ? loaded : null;
  return { data: current?.data, error: current?.error, loading: !current, retry: () => setRevision(value => value + 1) };
}

function JournalTable({ data, compact = false }: { data: JournalDetail; compact?: boolean }) {
  return <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="سطور القيد المحاسبي"><table><caption className={styles.visuallyHidden}>الحسابات المدينة والدائنة للقيد</caption><thead><tr><th scope="col">الحساب</th>{!compact && <th scope="col">الوصف</th>}<th scope="col">مدين</th><th scope="col">دائن</th></tr></thead><tbody>{data.journal.map(line => <tr key={line.id}><td><div className={styles.account}><bdi>{line.accountCode}</bdi><span>{line.accountName}{line.partyName && <small>{line.partyName}</small>}</span></div></td>{!compact && <td>{line.memo || data.document.note || "—"}</td>}<td>{line.debit > 0 ? <Numeric value={line.debit} /> : "—"}</td><td>{line.credit > 0 ? <Numeric value={line.credit} /> : "—"}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={compact ? 1 : 2}>الإجمالي</th><td><Numeric value={data.totals.debit} money /></td><td><Numeric value={data.totals.credit} money /></td></tr></tfoot></table></div>;
}
function JournalStatus({ loading, error, retry }: { loading: boolean; error?: string; retry: () => void }) {
  return loading ? <p role="status" className={styles.empty}>جار تحميل تفاصيل القيد</p> : error ? <div role="alert" className={styles.error}><p>{error}</p><button type="button" onClick={retry}>إعادة المحاولة</button></div> : null;
}
function Incomplete({ data }: { data: JournalDetail }) {
  return data.journalTruncated ? <p className={styles.notice} role="status">يعرض القيد أول {data.journal.length} سطر من {data.journalCount} الطباعة غير متاحة حتى تتوفر جميع السطور</p> : !data.journal.length ? <p className={styles.empty}>لا توجد سطور محاسبية لهذا المستند</p> : !journalPrintable(data) ? <p role="alert" className={styles.error}>القيد غير متوازن أو بياناته غير مكتملة الطباعة غير متاحة</p> : null;
}

function JournalDetails({ data, disabled, onSource }: { data: JournalDetail; disabled: boolean; onSource: (invoiceId: string, paymentId: string | null) => void }) {
  return <div className={styles.body}>
    <div className={styles.accountSummary}>{(["debit", "credit"] as const).map(side => <section key={side}><h3>{side === "debit" ? "الحسابات المدينة" : "الحسابات الدائنة"}</h3><div className={styles.accountChips}>{data.journal.filter(line => line[side] > 0).map(line => <div key={line.id} className={styles.accountChip}><bdi>{line.accountCode}</bdi><span>{line.partyName || line.accountName}</span><Numeric value={line[side]} money /></div>)}</div></section>)}</div>
    <dl className={styles.detailMeta}><div><dt>العملة</dt><dd><bdi>SAR</bdi></dd></div><div><dt>التاريخ</dt><dd><time dateTime={data.document.createdAt}>{financeDate(data.document.createdAt)}</time></dd></div><div><dt>المصدر</dt><dd>{data.invoiceId ? <button type="button" className={styles.link} disabled={disabled} onClick={() => { if (!disabled && data.invoiceId) onSource(data.invoiceId, data.sourcePaymentId); }}>{documentKindNames[data.document.kind] || "المستند الأصلي"}<ExternalLink size={13} aria-hidden="true" /></button> : documentKindNames[data.document.kind] || "قيد محاسبي"}</dd></div><div><dt>أنشئ بواسطة</dt><dd>{data.document.creatorName || "غير مسجل"}</dd></div></dl>
    <div className={styles.description}><h3>الوصف</h3><p>{data.document.note || "غير مسجل"}</p></div>
    <Incomplete data={data} />{!!data.journal.length && <JournalTable data={data} />}
  </div>;
}

function JournalHistory({ data, disabled, onNavigate }: { data: JournalDetail; disabled: boolean; onNavigate: (id: string) => void }) {
  return <div className={styles.body}><div className={styles.tableWrap} role="region" tabIndex={0} aria-label="سجل سطور القيد"><table className={styles.logTable}><caption className={styles.visuallyHidden}>سجل ترحيل الحسابات المدينة والدائنة</caption><thead><tr>{["التاريخ", "الإجراء", "الموظف", "رقم القيد", "الحساب", "الوصف", "العملة", "مدين", "دائن", "مدين بالعملة المحلية", "دائن بالعملة المحلية", "تاريخ الترحيل"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.journal.map(line => <tr key={line.id}><td><time dateTime={line.createdAt || data.document.createdAt}>{financeDate(line.createdAt || data.document.createdAt)}</time></td><td>ترحيل</td><td>{line.actorName || data.document.creatorName || "غير مسجل"}</td><td><bdi>#{String(line.documentNumber ?? data.document.number).padStart(6, "0")}</bdi></td><td><div className={styles.account}><bdi>{line.accountCode}</bdi><span>{line.accountName}{line.partyName && <small>{line.partyName}</small>}</span></div></td><td>{(line.originalMemo ?? line.memo) || "—"}</td><td><bdi>{line.currency || "SAR"}</bdi></td><td><Numeric value={line.debit} /></td><td><Numeric value={line.credit} /></td><td><Numeric value={line.localDebit ?? line.debit} /></td><td><Numeric value={line.localCredit ?? line.credit} /></td><td><time dateTime={line.postingDate || data.document.createdAt}>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "short" }).format(new Date(line.postingDate || data.document.createdAt))}</time></td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={7}>الإجمالي</th><td><Numeric value={data.totals.debit} money /></td><td><Numeric value={data.totals.credit} money /></td><td><Numeric value={data.totals.debit} money /></td><td><Numeric value={data.totals.credit} money /></td><td /></tr></tfoot></table></div><Incomplete data={data} /><h3>القيود المرتبطة</h3>{data.related.length ? <ul className={styles.list}>{data.related.map(item => <li key={item.id}><button type="button" disabled={disabled} onClick={() => { if (!disabled) onNavigate(item.id); }}>قيد <bdi>#{String(item.number).padStart(6, "0")}</bdi></button><span>{item.note || documentKindNames[item.kind] || "قيد محاسبي"}</span><time dateTime={item.createdAt}>{financeDate(item.createdAt)}</time></li>)}</ul> : <p className={styles.empty}>لا توجد قيود أخرى مرتبطة</p>}{data.relatedTruncated && <p className={styles.notice}>يعرض أحدث {data.related.length} قيد من {data.relatedCount}</p>}</div>;
}

export function FinanceJournalPreview({ id, slug, onClose, onOpen }: { id: string; slug: string; onClose: () => void; onOpen: (id: string) => void }) {
  const { data, loading, error, retry } = useJournal(id, slug);
  return <Modal open title={data ? "قيد يومية #" + String(data.document.number).padStart(6, "0") : "قيد يومية"} onClose={onClose} panelClassName="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"><div className={styles.page} dir="rtl"><div className={styles.toolbar}><button type="button" disabled={!data || loading} onClick={() => { if (data) onOpen(data.document.id); }}><ExternalLink size={15} aria-hidden="true" />فتح القيد</button></div><JournalStatus loading={loading} error={error} retry={retry} />{data && <><div className={styles.meta}><p>التاريخ: <time dateTime={data.document.createdAt}>{financeDate(data.document.createdAt)}</time></p><p>الوصف: {data.document.note || documentKindNames[data.document.kind] || "قيد محاسبي"}</p></div><Incomplete data={data} />{!!data.journal.length && <JournalTable data={data} compact />}</>}</div></Modal>;
}

const tabs = [["journal", "قيد اليومية"], ["details", "التفاصيل"], ["history", "سجل القيد"], ["activity", "سجل النشاطات"]] as const;
type Tab = typeof tabs[number][0];
export function FinanceJournalDetail({ id, slug, brand, disabled = false, onBack, onSource, onNavigate, onOpenDraft, onCopySource, onReverseSource }: { id: string; slug: string; brand: string; disabled?: boolean; onBack: () => void; onSource: (invoiceId: string, paymentId: string | null) => void; onNavigate: (id: string) => void; onOpenDraft?: (id: string) => void; onCopySource?: JournalSourceOperation; onReverseSource?: JournalSourceOperation }) {
  const { data, loading, error, retry } = useJournal(id, slug);
  const [tab, setTab] = useState<Tab>("journal");
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [operation, setOperation] = useState<{ id: string; kind: "copy" | "reverse" } | null>(null);
  const [exportRequest, setExportRequest] = useState<{ id: string; serial: number } | null>(null);
  const [exported, setExported] = useState<{ data: JournalDetail; serial: number; url?: string; error?: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [id]);
  useEffect(() => {
    if (!data || !exportRequest || exportRequest.id !== id || !journalPrintable(data)) return;
    let active = true, url = "";
    createFinanceJournalPdf(data, brand).then(blob => { if (active) { url = URL.createObjectURL(blob); setExported({ data, serial: exportRequest.serial, url }); } }).catch(() => { if (active) setExported({ data, serial: exportRequest.serial, error: "تعذر تجهيز ملف القيد أعد المحاولة" }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [data, id, brand, exportRequest]);
  const ready = exported?.data === data && exported?.serial === exportRequest?.serial ? exported : null;
  const exporting = !!data && journalPrintable(data) && exportRequest?.id === id && !ready;
  const printable = !!data && journalPrintable(data) && !disabled && !loading;
  const canCopy = !!data?.capabilities?.canCopy && (data.capabilities.copyMode === "manual" ? !!data.manualDraft && !!onOpenDraft : ["invoice", "payment"].includes(data.capabilities.copyMode) && !!onCopySource);
  const canReverse = !!data?.capabilities?.canReverse && (data.capabilities.reverseMode === "manual" ? !!data.manualDraft : ["refund", "payment"].includes(data.capabilities.reverseMode) && !!onReverseSource);
  const startExport = () => { if (printable) setExportRequest(value => ({ id, serial: (value?.serial ?? 0) + 1 })); };
  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const current = tabs.findIndex(item => item[0] === tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowLeft" ? (current + 1) % tabs.length : event.key === "ArrowRight" ? (current + tabs.length - 1) % tabs.length : -1;
    if (next < 0) return;
    event.preventDefault(); setTab(tabs[next][0]); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }
  if (editing === id && data) return <FinanceJournalEditor key={data.document.id} data={data} slug={slug} disabled={disabled || loading} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage("تم حفظ وصف القيد وملاحظات السطور"); retry(); }} />;
  return <section className={styles.page} dir="rtl" aria-label="صفحة قيد اليومية" aria-busy={loading}>
    <header className={styles.header}><h2 ref={heading} tabIndex={-1}>قيد يومية {data && <bdi>#{String(data.document.number).padStart(6, "0")}</bdi>}</h2><div className={styles.toolbar}>{data?.invoiceId && <button type="button" className={styles.primary} disabled={disabled || loading} onClick={() => { if (data.invoiceId && !disabled) onSource(data.invoiceId, data.sourcePaymentId); }}><FileText size={16} aria-hidden="true" />عرض المصدر</button>}<button type="button" onClick={onBack}><ArrowRight size={16} aria-hidden="true" />رجوع</button></div></header>
    <JournalStatus loading={loading} error={error} retry={retry} />
    {message && <p role="status">{message}</p>}
    {data && <><div className={styles.toolbar}>{data.metadata?.canEdit && <button type="button" disabled={disabled || loading} onClick={() => { if (!disabled && data.metadata.canEdit) setEditing(id); }}><Pencil size={15} aria-hidden="true" />تعديل</button>}<button type="button" disabled={!printable || exporting} onClick={startExport}><Printer size={15} aria-hidden="true" />طباعة</button><button type="button" disabled={!printable || exporting} onClick={startExport}><FileDown size={15} aria-hidden="true" />PDF</button>{data.capabilities && <><button type="button" disabled={disabled || loading || !canCopy} title={data.capabilities.copyReason || undefined} onClick={() => { if (!disabled && canCopy) setOperation({ id, kind: "copy" }); }}><Copy size={15} aria-hidden="true" />نسخ</button><button type="button" disabled={disabled || loading || !canReverse} title={data.capabilities.reverseReason || undefined} onClick={() => { if (!disabled && canReverse) setOperation({ id, kind: "reverse" }); }}><RotateCcw size={15} aria-hidden="true" />قيد عكسي</button></>}</div>{exporting && <p role="status">جار تجهيز ملف القيد</p>}{ready?.error && <div role="alert" className={styles.error}>{ready.error}<button type="button" disabled={!printable} onClick={startExport}>إعادة المحاولة</button></div>}{ready?.url && !disabled && <div className={styles.toolbar}><a href={ready.url} target="_blank" rel="noreferrer">فتح القيد للطباعة</a><a href={ready.url} download={"journal-" + data.document.number + ".pdf"}>تنزيل PDF</a></div>}
      <div className={styles.content}><div className={styles.tabs} role="tablist" aria-label="تبويبات القيد">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" id={"journal-tab-" + key} aria-controls={"journal-panel-" + key} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onKeyDown={moveTab} onClick={() => setTab(key)}>{label}</button>)}</div><div role="tabpanel" id={"journal-panel-" + tab} aria-labelledby={"journal-tab-" + tab} tabIndex={0}>
        {tab === "journal" && <div className={styles.canvas}><article className={styles.paper}><h3>قيد يومية <bdi>#{String(data.document.number).padStart(6, "0")}</bdi></h3><div className={styles.meta}><p>التاريخ: <time dateTime={data.document.createdAt}>{financeDate(data.document.createdAt)}</time></p><p>الوصف: {data.document.note || documentKindNames[data.document.kind] || "قيد محاسبي"}</p></div><Incomplete data={data} />{!!data.journal.length && <JournalTable data={data} />}</article></div>}
        {tab === "details" && <JournalDetails data={data} disabled={disabled} onSource={onSource} />}
        {tab === "history" && <JournalHistory data={data} disabled={disabled} onNavigate={onNavigate} />}
        {tab === "activity" && <FinanceJournalActivity key={data.document.id + ":" + (data.metadata?.revision ?? 0)} id={data.document.id} slug={slug} disabled={disabled} />}
      </div></div></>}
    {data && operation?.id === id && <FinanceJournalOperation key={data.document.id + ":" + operation.kind} operation={operation.kind} data={data} slug={slug} disabled={disabled || loading} onCancel={() => setOperation(null)} onSaved={() => { setOperation(null); setMessage("تم إنشاء القيد العكسي"); retry(); }} onOpenDraft={onOpenDraft} onCopySource={onCopySource} onReverseSource={onReverseSource} />}
  </section>;
}
