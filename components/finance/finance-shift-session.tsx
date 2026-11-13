"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Pause, Play, Printer, RefreshCw, Square } from "lucide-react";
import { readShiftSessionSummaryAction, readShiftSessionRowsAction, readShiftSessionActivityAction } from "@/app/actions/finance-shift-sessions";
import { superviseFinanceShiftAction } from "@/app/actions/finance-shift-monitor";
import { fetchFinanceShiftDetailAction } from "@/app/actions/finance-shifts";
import { executeBrandFinanceAction } from "@/app/actions/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { FinanceShiftDetail } from "@/lib/finance/shift-operations";
import type { ShiftSessionSummary, ShiftSessionRows, ShiftSessionTab, ShiftSessionActivities, ShiftSessionDocument } from "@/lib/finance/shift-sessions";
import { FinanceCashHandoverForm } from "./finance-cash-handover-form";
import { FinanceShiftAnalytics } from "./finance-shift-analytics";
import { FinanceShiftReport } from "./finance-shift-report";
import { Empty, financeDate, Numeric } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-shift-monitor.module.css";

const tabs: [ShiftSessionTab, string][] = [["summary", "الملخص"], ["movements", "حركات المال"], ["invoices", "الفواتير"], ["refunds", "المردود"], ["payments", "مدفوعات العميل"], ["activity", "سجل النشاطات"]];
const methodNames: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي", pos: "شبكة", credit: "رصيد العميل", receivable: "آجل" };
const actionNames: Record<string, string> = { open: "فتح الوردية", closed: "إغلاق الوردية", pause: "إيقاف البيع مؤقتًا", resume: "استئناف البيع", close: "إقفال إداري" };
const kindNames: Record<string, string> = { purchase: "دفع لمورد", receipt: "قبض", expense: "مصروف", transfer: "تحويل" };
type Props = { id: string; snapshot: FinanceSnapshot; slug?: string; onBack: () => void; onChanged: () => void; onInvoice?: (id: string, paymentId?: string | null) => void };

export function ShiftSessionPagination({ total, offset, limit, loading, onChange }: { total: number; offset: number; limit: number; loading: boolean; onChange: (offset: number) => void }) {
  return <div className={css.pagination}><span>{total ? offset + 1 : 0} – {Math.min(offset + limit, total)} من {total}</span><button type="button" disabled={loading || offset === 0} aria-label="الصفحة السابقة" onClick={() => onChange(Math.max(0, offset - limit))}>‹</button><span>صفحة {Math.floor(offset / limit) + 1} من {Math.max(1, Math.ceil(total / limit))}</span><button type="button" disabled={loading || offset + limit >= total} aria-label="الصفحة التالية" onClick={() => onChange(offset + limit)}>›</button></div>;
}
function Table({ headings, children }: { headings: string[]; children: ReactNode }) { return <div className={css.tableWrap}><table className={css.table}><thead><tr>{headings.map((heading, index) => <th key={index}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Money({ value }: { value: number }) { return <Numeric value={value} money />; }

export function FinanceShiftSession(props: Props) {
  const [data, setData] = useState<ShiftSessionSummary | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const [reportOpen, setReportOpen] = useState(false), [analyticsOpen, setAnalyticsOpen] = useState(false), [saving, setSaving] = useState(false);
  const params = useSearchParams();
  const tab: ShiftSessionTab = tabs.find(([id]) => id === params.get("shiftTab"))?.[0] ?? "summary";
  function setTab(value: ShiftSessionTab) { const next = new URLSearchParams(params.toString()); next.set("shiftTab", value); window.history.replaceState(null, "", `${window.location.pathname}?${next}`); }
  useEffect(() => {
    let active = true, busy = false, closed = false;
    async function load() {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try { const result = await readShiftSessionSummaryAction(props.id, props.slug); if (!active) return; if (result.ok) { setData(result.data); setError(""); closed = result.data.shift.status === "closed"; } else setError(result.message); }
      catch { if (active) setError("تعذر تحميل تفاصيل الوردية أعد المحاولة"); }
      finally { busy = false; }
    }
    void load(); const timer = setInterval(() => { if (!closed) void load(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [props.id, props.slug, revision]);
  const refresh = () => { setRevision(value => value + 1); props.onChanged(); };
  return <section className={css.session} dir="rtl" aria-label="تفاصيل الوردية">
    <div className={css.topbar}><h2>الوردية #{data?.shift.shift_number ?? "…"}</h2><div className={styles.actions}><button className={styles.secondary} type="button" disabled={saving} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />تحديث</button><button className={styles.secondary} type="button" disabled={saving} onClick={props.onBack}><ArrowRight size={16} aria-hidden="true" />الورديات</button></div></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {!data ? <p className={css.empty} role="status">{error ? "تعذر عرض الوردية" : "جار تحميل تفاصيل الوردية"}</p> : <>
      <SessionControls {...props} data={data} saving={saving} onSaving={setSaving} onChanged={refresh} unavailable={!!error} />
      <div className={css.sessionBody}>
        <div className={css.tabs} role="group" aria-label="عرض تفاصيل الوردية">{tabs.map(([id, label]) => <button key={id} type="button" disabled={saving} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}{id !== "summary" && id !== "activity" ? ` (${data.counts[id]})` : ""}</button>)}</div>
        {tab === "summary" ? <div className={css.summary}>
          <div className={css.printbar}><button type="button" className={styles.secondary} onClick={() => setReportOpen(value => !value)}><Printer size={16} aria-hidden="true" />طباعة التقرير</button></div>
          {reportOpen && <SessionReport {...props} />}
          <h3>تفاصيل الوردية</h3>
          <Table headings={["الوردية", "رقم الوردية", "تاريخ الفتح"]}><tr><td>{data.shift.drawer_name}</td><td>#{data.shift.shift_number}</td><td>{financeDate(data.shift.opened_at)}</td></tr></Table>
          <Table headings={["الصندوق", "الموظف", "تاريخ الإغلاق", "ملاحظة"]}><tr><td>{data.shift.drawer_name}<small>{data.shift.device_count ? `${data.shift.device_count} جهاز متصل بهذه الوردية` : "لم يسجل جهاز"}</small></td><td>{data.shift.employee_name}</td><td>{data.shift.closed_at ? financeDate(data.shift.closed_at) : "مفتوحة"}</td><td>{data.shift.note || "—"}</td></tr></Table>
          <details className={css.accordion} open><summary>ملخص وسائل الدفع</summary><Table headings={["وسيلة الدفع", "المبلغ المتوقع"]}><tr><td>نقدي — {data.shift.drawer_name}</td><td><Money value={data.shift.current_expected} /></td></tr>{data.analytics.payments.filter(row => row.kind !== "cash" && row.kind !== "receivable").map((row, index) => <tr key={index}><td>{methodNames[row.kind] || row.kind} — {row.accountName}</td><td><Money value={row.netPaid} /></td></tr>)}<tr className={css.total}><td>الإجمالي</td><td><Money value={data.shift.current_expected + data.analytics.payments.filter(row => row.kind !== "cash" && row.kind !== "receivable").reduce((sum, row) => sum + row.netPaid, 0)} /></td></tr></Table></details>
          <details className={css.accordion} open><summary>حركات المال</summary><SessionRows {...props} view="movements" refreshKey={revision} compact /></details>
          <details className={css.accordion} open><summary>تفاصيل وسائل الدفع للمبيعات</summary><Table headings={["وسيلة الدفع", "مدفوع", "المردود", "الصافي"]}>{data.analytics.payments.map((row, index) => <tr key={index}><td>{methodNames[row.kind] || row.kind}<small>{row.accountName}</small></td><td><Money value={row.paid} /></td><td><Money value={row.returnedPaid} /></td><td><Money value={row.netPaid} /></td></tr>)}<tr className={css.total}><td>الإجمالي</td><td><Money value={data.analytics.payments.reduce((sum, row) => sum + row.paid, 0)} /></td><td><Money value={data.analytics.payments.reduce((sum, row) => sum + row.returnedPaid, 0)} /></td><td><Money value={data.analytics.payments.reduce((sum, row) => sum + row.netPaid, 0)} /></td></tr></Table><p className={css.hint}>{data.analytics.notes.paymentBasis === "linked_sales_as_of_report" ? "حسب مبيعات الوردية والمرتجعات المرتبطة بها حتى وقت عرض التقرير" : "حسب وسائل الدفع المسجلة للفواتير والمرتجعات"}</p></details>
          <details className={css.accordion} onToggle={event => setAnalyticsOpen(event.currentTarget.open)}><summary>تحليل الوردية والمخزون</summary>{analyticsOpen && <FinanceShiftAnalytics shiftId={props.id} slug={props.slug} refreshKey={revision} />}</details>
        </div> : tab === "activity" ? <SessionActivity key={`${props.id}:${revision}`} {...props} /> : <SessionRows key={`${props.id}:${tab}`} {...props} view={tab} refreshKey={revision} />}
      </div>
    </>}
  </section>;
}

function SessionRows({ id, slug, view, refreshKey, onInvoice, compact = false }: Props & { view: "movements" | "invoices" | "refunds" | "payments"; refreshKey: number; compact?: boolean }) {
  const [offset, setOffset] = useState(0), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data?: ShiftSessionRows; error?: string } | null>(null);
  const key = `${id}:${slug}:${view}:${offset}:${refreshKey}:${attempt}`;
  useEffect(() => { let active = true; readShiftSessionRowsAction(id, view, offset, slug).then(result => { if (active) setState({ key, ...(result.ok ? { data: result.data } : { error: result.message }) }); }).catch(() => { if (active) setState({ key, error: "تعذر تحميل البيانات أعد المحاولة" }); }); return () => { active = false; }; }, [id, slug, view, offset, refreshKey, attempt, key]);
  const current = state?.key === key ? state : null, page = current?.data;
  const openInvoice = (row: ShiftSessionDocument, payment = false) => { if (row.invoiceId) onInvoice?.(row.invoiceId, payment ? row.payment?.id : undefined); };
  const invoiceLink = (row: ShiftSessionDocument, payment = false) => onInvoice ? <button type="button" className={css.documentLink} onClick={() => openInvoice(row, payment)}>#{row.invoiceNumber || row.number}</button> : <a href={`/dashboard/finance?section=sales&view=invoice&invoice=${encodeURIComponent(row.invoiceId || row.id)}${payment && row.payment ? `&payment=${encodeURIComponent(row.payment.id)}` : ""}`}>#{row.invoiceNumber || row.number}</a>;
  return <section className={compact ? undefined : css.tabContent} aria-busy={!current}>
    {!compact && <h3>{tabs.find(item => item[0] === view)?.[1]}</h3>}
    {current?.error ? <div className={styles.error} role="alert">{current.error}<button type="button" className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : !page ? <p className={css.empty} role="status">جار تحميل البيانات</p> : <>
      {!page.rows.length ? <Empty title="لا توجد حركات مسجلة في هذا القسم" /> : view === "movements" ? <Table headings={["الوقت", "من / إلى", "النوع", "المبلغ", "ملاحظة"]}>{page.rows.map(row => <tr key={row.id}><td>{financeDate(row.createdAt)}</td><td>{row.accountName}</td><td>{kindNames[row.kind] || row.kind}<small>#{row.number}</small></td><td><Money value={row.paid} /></td><td>{row.note || "—"}</td></tr>)}</Table> : view === "payments" ? <Table headings={["رقم عملية الدفع", "رقم الفاتورة", "الطريقة", "المبلغ", ""]}>{page.rows.map(row => row.payment && <tr key={row.id}><td><strong>{row.customerName}</strong><small>{row.payment.initial ? "دفعة إصدار الفاتورة" : `#${row.payment.number}`} — {row.payment.date}</small></td><td>{invoiceLink(row)}</td><td>{methodNames[row.payment.method]}<small>{row.payment.collectorName} — {row.payment.accountName}</small></td><td><Money value={row.payment.effectiveAmount} /><small>{row.payment.status === "completed" ? "مكتملة" : row.payment.status === "deleted" ? "ملغاة" : "معلقة"}</small></td><td>{row.invoiceId && (onInvoice ? <button type="button" className={styles.secondary} onClick={() => openInvoice(row, true)}>عرض الدفعة</button> : invoiceLink(row, true))}</td></tr>)}</Table> : <Table headings={[view === "invoices" ? "رقم الفاتورة" : "رقم المرتجع", "أنشئ بواسطة", "الحالة", "المبلغ", ""]}>{page.rows.map(row => <tr key={row.id}><td><strong>{row.customerName}</strong><small>#{row.number} — {financeDate(row.createdAt)}</small></td><td>{row.creatorName}</td><td>{view === "refunds" ? "مرتجع" : row.outstanding <= 0.009 ? "مدفوعة" : row.outstanding < row.total - row.refundedTotal - 0.009 ? "مدفوعة جزئيًا" : "غير مدفوعة"}{row.refundedTotal > 0 && <small>{row.refundedTotal >= row.total - 0.009 ? "مرتجع" : "مرتجع جزئيًا"}</small>}</td><td><Money value={row.total} />{view === "invoices" && row.outstanding > 0.009 && <small>المستحق <Money value={row.outstanding} /></small>}</td><td>{row.invoiceId && invoiceLink(row)}</td></tr>)}</Table>}
      {page.total > page.limit && <ShiftSessionPagination {...page} loading={false} onChange={setOffset} />}
      {view === "movements" && <p className={css.hint}>المبالغ المسجلة للقبض والصرف والتحويل ومدفوعات الموردين المرتبطة بهذه الوردية</p>}
      {view === "payments" && <p className={css.hint}>تُعرض الدفعات الفعلية في هذه الوردية بحالتها الحالية تشمل الدفعات المعلقة والملغاة دون إضافتها للتحصيل</p>}
    </>}
  </section>;
}

function SessionActivity({ id, slug }: Props) {
  const [offset, setOffset] = useState(0), [attempt, setAttempt] = useState(0), [state, setState] = useState<{ key: string; data?: ShiftSessionActivities; error?: string } | null>(null);
  const key = `${id}:${slug}:${offset}:${attempt}`;
  useEffect(() => { let active = true; readShiftSessionActivityAction(id, offset, slug).then(result => { if (active) setState({ key, ...(result.ok ? { data: result.data } : { error: result.message }) }); }).catch(() => { if (active) setState({ key, error: "تعذر تحميل سجل النشاطات" }); }); return () => { active = false; }; }, [id, slug, offset, attempt, key]);
  const current = state?.key === key ? state : null;
  return <section className={css.tabContent}><h3>سجل النشاطات</h3>{current?.error ? <div className={styles.error} role="alert">{current.error}<button type="button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : !current?.data ? <p role="status">جار تحميل سجل النشاطات</p> : <><ol className={css.timeline}>{current.data.rows.map(row => <li key={row.id}><strong>{actionNames[row.action] || row.action}</strong><p>{row.note}</p><small>{row.actor} — {financeDate(row.createdAt)}</small></li>)}</ol><ShiftSessionPagination {...current.data} loading={false} onChange={setOffset} /></>}</section>;
}

function SessionReport({ id, slug, snapshot }: Props) {
  const [data, setData] = useState<FinanceShiftDetail | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; fetchFinanceShiftDetailAction(id, slug).then(result => { if (!active) return; if (result.ok) { setData(result.data); setError(""); } else setError(result.message); }).catch(() => { if (active) setError("تعذر تحميل التقرير"); }); return () => { active = false; }; }, [id, slug, attempt]);
  return data ? <FinanceShiftReport detail={data} slug={snapshot.cafe.slug} brandName={snapshot.cafe.name} /> : error ? <div role="alert" className={styles.error}>{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : <p role="status">جار إعداد التقرير</p>;
}

function SessionControls({ data, snapshot, slug, saving, onSaving, onChanged, unavailable }: Props & { data: ShiftSessionSummary; saving: boolean; onSaving: (value: boolean) => void; unavailable: boolean }) {
  const shift = data.shift, canSupervise = canFinance(snapshot.role, "shifts_manage");
  const [action, setAction] = useState<"pause" | "resume" | "close" | null>(null), [reason, setReason] = useState(""), [acknowledged, setAcknowledged] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const lock = useRef(false), retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  async function execute(payload: Record<string, unknown> = {}) {
    if (lock.current || !canSupervise || !action || unavailable) return false;
    if (reason.trim().length < 3) { setError("اكتب سبب الإجراء بثلاثة أحرف على الأقل"); return false; }
    if (action === "close" && !acknowledged) { setError("أكد مراجعة حالة الجهاز والفواتير المحلية قبل الإقفال"); return false; }
    lock.current = true; onSaving(true); setError("");
    try {
      const payloadData = { ...payload, shiftId: shift.id, reason: reason.trim(), supervisorClose: true, acknowledgeOffline: acknowledged };
      const fingerprint = JSON.stringify({ action, data: payloadData });
      if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
      const result = action === "close" ? await executeBrandFinanceAction({ operation: "shift_close", payload: payloadData, requestId: retry.current.requestId }, slug) : await superviseFinanceShiftAction({ shiftId: shift.id, action, reason: reason.trim(), requestId: retry.current.requestId }, slug);
      if (!result.ok) { setError(result.message); return false; }
      retry.current = null; setAction(null); setSuccess("تم تنفيذ الإجراء وتسجيله في سجل الوردية"); onChanged(); return true;
    } catch { setError("تعذر تأكيد نتيجة الإجراء أعد المحاولة بنفس البيانات لمنع التكرار"); return false; }
    finally { lock.current = false; onSaving(false); }
  }
  return <div className={css.controls}>
    {success && <p className={styles.success} role="status">{success}</p>}
    {canSupervise && shift.status !== "closed" && !action && <div className={styles.actions}>{shift.status === "open" && <button type="button" className={styles.secondary} disabled={unavailable} onClick={() => { setAction(shift.supervisor_paused ? "resume" : "pause"); setError(""); }}>{shift.supervisor_paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{shift.supervisor_paused ? "استئناف البيع" : "إيقاف البيع مؤقتًا"}</button>}<button type="button" className={styles.danger} disabled={unavailable} onClick={() => { setAction("close"); setError(""); }}><Square size={16} aria-hidden="true" />إقفال إداري</button></div>}
    {canSupervise && action && <section className={css.procedure}><h3>{actionNames[action]}</h3><p className={styles.notice}>{action === "close" ? "الإقفال نهائي ويتطلب عد النقدية وتحديد جهة تسليمها الفواتير غير المتزامنة تبقى على جهاز الموظف للمراجعة ولا تدخل تلقائيًا في وردية مقفلة" : "يصل الإجراء إلى جهاز الكاشير عند اتصاله الجهاز المنقطع لا يستقبل التغيير فورًا والفواتير المحفوظة تبقى على الجهاز"}</p><label className={styles.field}>سبب الإجراء<textarea required minLength={3} maxLength={1000} value={reason} disabled={saving} onChange={event => setReason(event.target.value)} /></label>{error && <p role="alert" className={styles.error}>{error}</p>}{action === "close" ? <><label className={css.confirm}><input type="checkbox" checked={acknowledged} disabled={saving} onChange={event => setAcknowledged(event.target.checked)} />راجعت حالة الجهاز والفواتير المحلية وأتحمل مسؤولية الإقفال الإداري</label><FinanceCashHandoverForm form={{ operation: "shift_close", title: "إقفال إداري", values: { shiftId: shift.id } }} snapshot={{ ...snapshot, shifts: [shift] }} pending={saving || unavailable} error="" onCancel={() => setAction(null)} onSubmit={(_operation, payload) => execute(payload)} /></> : <div className={styles.actions}><button type="button" className={styles.primary} disabled={saving || unavailable || reason.trim().length < 3} onClick={() => void execute()}>{saving ? "جار الحفظ" : "تأكيد الإجراء"}</button><button type="button" className={styles.secondary} disabled={saving} onClick={() => setAction(null)}>إلغاء</button></div>}</section>}
    <details className={css.diagnostics}><summary>حالة الصندوق والمزامنة</summary><div className={css.facts}><div>النقدية المتوقعة<strong><Money value={shift.current_expected} /></strong></div><div>النقدية المعدودة<strong>{shift.counted_cash == null ? "لم تسجل" : <Money value={shift.counted_cash} />}</strong></div><div>فرق الإقفال<strong>{shift.variance == null ? "—" : <Money value={shift.variance} />}</strong></div><div>آخر اتصال<strong>{shift.last_seen_at ? financeDate(shift.last_seen_at) : "لم يصل تحديث"}</strong></div><div>الفواتير المعلقة<strong>{shift.pending_count}</strong></div><div>تحتاج مراجعة<strong>{shift.conflict_count}</strong></div></div></details>
  </div>;
}
