"use client";

import { useEffect, useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { getInvoiceExtensions, changeInvoiceExtensions } from "@/app/actions/finance-invoice-extensions";
import { getFinanceInvoiceSettings } from "@/app/actions/finance-invoice-settings";
import type { InvoiceExtensionsState } from "@/lib/finance/invoice-extensions";
import type { InvoiceSettings } from "@/lib/finance/invoice-settings";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import { moneyRound } from "@/lib/finance/company-invoice";
import { Numeric } from "./finance-ui";
import styles from "./finance-invoice-detail.module.css";

export function useInvoiceAdvanced(id: string, slug: string, enabled: boolean, revision: number, context: unknown) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ id: string; slug: string; revision: number; context: unknown; attempt: number; data?: InvoiceExtensionsState; settings?: InvoiceSettings; error?: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([getInvoiceExtensions(slug, id), getFinanceInvoiceSettings(slug)]).then(([extensions, settings]) => {
      if (!active) return;
      setLoaded({ id, slug, revision, context, attempt, ...(extensions.ok && settings.ok ? { data: extensions.data, settings: settings.data.settings } : { error: !extensions.ok ? extensions.message : !settings.ok ? settings.message : "تعذر تحميل خيارات الفاتورة" }) });
    }).catch(() => { if (active) setLoaded({ id, slug, revision, context, attempt, error: "تعذر تحميل خيارات الفاتورة أعد المحاولة" }); });
    return () => { active = false; };
  }, [id, slug, enabled, revision, context, attempt]);
  const current = enabled && loaded?.id === id && loaded.slug === slug && loaded.revision === revision && loaded.context === context && loaded.attempt === attempt ? loaded : null;
  return { loading: enabled && !current, data: current?.data, settings: current?.settings, error: current?.error, reload: () => setAttempt(value => value + 1) };
}
type Resource = ReturnType<typeof useInvoiceAdvanced>;

export function InvoiceAdvancedTools(props: { detail: InvoiceDetail; slug: string; resource: Resource; disabled: boolean; canWrite: boolean; onChanged: () => Promise<void>; onNavigate: (id: string) => void; onBusyChange: (busy: boolean) => void }) {
  const { detail, slug, resource, disabled, canWrite, onChanged, onNavigate, onBusyChange } = props;
  if (resource.loading) return <p role="status" className={styles.hint}>جار تحميل خيارات الفاتورة</p>;
  if (resource.error) return <div className={styles.error} role="alert"><span>{resource.error}</span><button type="button" disabled={disabled} onClick={() => { if (!disabled) resource.reload(); }}>إعادة تحميل الخيارات</button></div>;
  if (!resource.data || !resource.settings) return null;
  return <InvoiceAdvancedControls key={detail.document.id + ":" + resource.data.revision} detail={detail} slug={slug} data={resource.data} settings={resource.settings} disabled={disabled} canWrite={canWrite} onChanged={onChanged} onNavigate={onNavigate} onBusyChange={onBusyChange} onReload={resource.reload} />;
}

export function InvoiceAdvancedControls({ detail, slug, data, settings, disabled, canWrite, onChanged, onNavigate, onBusyChange, onReload }: {
  detail: InvoiceDetail; slug: string; data: InvoiceExtensionsState; settings: InvoiceSettings; disabled: boolean; canWrite: boolean; onChanged: () => Promise<void>; onNavigate: (id: string) => void; onBusyChange: (busy: boolean) => void; onReload: () => void;
}) {
  const [statusId, setStatusId] = useState(data.statusId ?? "");
  const [opening, setOpening] = useState(false), [review, setReview] = useState(false), [pending, setPending] = useState(false);
  const [amount, setAmount] = useState(""), [description, setDescription] = useState(""), [vatRate, setVatRate] = useState<0 | 15>(15), [reason, setReason] = useState("");
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [createdId, setCreatedId] = useState<string | null>(null);
  const lock = useRef(false), alive = useRef(true), request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const blocked = disabled || pending || !canWrite;
  const advanced = settings.advanced;
  const isDebit = detail.invoice?.documentType === "debit" || !!data.sourceId;
  const debitAllowed = advanced.debitNotesEnabled && !!detail.invoice && !!detail.document.party_id && !isDebit && !detail.document.refunded;
  const debitReason = !detail.invoice ? "يتطلب الإشعار المدين فاتورة شركة محفوظة" : !detail.document.party_id ? "يتطلب الإشعار المدين عميلًا مسجلًا" : isDebit ? "الإشعار المدين مرتبط بفاتورته الأصلية ولا يُصدر إشعارًا مدينًا آخر" : detail.document.refunded ? "لا يمكن إصدار إشعار مدين لفاتورة مرتجعة بالكامل" : "";
  const missingStatus = !!data.statusId && !advanced.statuses.some(row => row.id === data.statusId);
  const currentStatus = advanced.statuses.find(row => row.id === data.statusId);
  const net = Number(amount), tax = moneyRound(net * vatRate / 100), total = moneyRound(net + tax);
  const debitValid = Number.isFinite(net) && net > 0 && net <= 1e9 && Math.abs(net * 100 - Math.round(net * 100)) < .00001 && description.trim().length >= 3 && description.trim().length <= 500 && reason.trim().length >= 1 && reason.trim().length <= 250;
  function changeField(change: () => void) { if (!blocked && !createdId) { change(); setReview(false); setError(""); } }
  async function saveStatus() {
    if (lock.current || blocked || !advanced.customStatusesEnabled || statusId === (data.statusId ?? "")) return;
    lock.current = true; setPending(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const result = await changeInvoiceExtensions(slug, detail.document.id, { action: "status", statusId, revision: data.revision });
      if (!alive.current) return;
      if (!result.ok) { setError(result.message); return; }
      setMessage("تم تحديث الحالة المخصصة");
      await onChanged();
      if (alive.current) onReload();
    } catch { if (alive.current) setError("تعذر تأكيد تحديث الحالة أعد تحميل الخيارات قبل المحاولة مجددًا"); }
    finally { lock.current = false; onBusyChange(false); if (alive.current) setPending(false); }
  }
  async function issueDebit() {
    if (lock.current || blocked || !debitAllowed || !debitValid || !review || createdId) return;
    const payload = { action: "debit" as const, amount: net, description: description.trim(), vatRate, reason: reason.trim() };
    const key = JSON.stringify(payload);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    lock.current = true; setPending(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const result = await changeInvoiceExtensions(slug, detail.document.id, { ...payload, requestId: request.current.id });
      if (!alive.current) return;
      if (!result.ok) { setError(result.message); return; }
      if (!result.data.id) { setError("تعذر تأكيد رقم الإشعار المدين أعد المحاولة بنفس البيانات"); return; }
      setCreatedId(result.data.id); setMessage("تم إصدار الإشعار المدين");
      try { await onChanged(); } catch { if (alive.current) setError("تم إصدار الإشعار المدين وتعذر تحديث العرض يمكنك فتح الإشعار الصادر"); return; }
      onNavigate(result.data.id);
    } catch { if (alive.current) setError("تعذر تأكيد إصدار الإشعار المدين أعد المحاولة بنفس البيانات"); }
    finally { lock.current = false; onBusyChange(false); if (alive.current) setPending(false); }
  }
  return <section className={styles.advancedTools} aria-label="خيارات الفاتورة الإضافية" aria-busy={pending}>
    {currentStatus && <span className={styles.customStatusBadge}><span aria-hidden="true" style={{ backgroundColor: currentStatus.color }} />{currentStatus.name}</span>}
    {!advanced.customStatusesEnabled && data.statusId && <p className={styles.hint}>الحالة المخصصة المحفوظة: {advanced.statuses.find(row => row.id === data.statusId)?.name || "الحالة السابقة غير متاحة في الإعدادات"}</p>}
    {advanced.customStatusesEnabled && <form className={styles.customStatus} onSubmit={event => { event.preventDefault(); void saveStatus(); }}><label>الحالة المخصصة<select value={statusId} disabled={blocked} onChange={event => { if (!blocked) { setStatusId(event.target.value); setError(""); } }}><option value="">بدون حالة مخصصة</option>{missingStatus && <option value={data.statusId!}>الحالة السابقة غير متاحة في الإعدادات</option>}{advanced.statuses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{canWrite && <button type="submit" disabled={blocked || statusId === (data.statusId ?? "")}>حفظ الحالة</button>}</form>}
    {data.sourceId && <button type="button" disabled={disabled || pending} onClick={() => { if (!disabled && !pending) onNavigate(data.sourceId!); }}>فتح الفاتورة الأصلية</button>}
    {!!data.debitNotes.length && <div className={styles.linkedNotes}><strong>الإشعارات المدينة المرتبطة</strong>{data.debitNotes.map(note => <button type="button" key={note.id} disabled={disabled || pending} onClick={() => { if (!disabled && !pending) onNavigate(note.id); }}>إشعار مدين <bdi>#{note.displayNumber || note.number}</bdi><Numeric value={note.total} money /></button>)}</div>}
    {advanced.debitNotesEnabled && canWrite && <div><button type="button" disabled={blocked || !debitAllowed || !!createdId} title={debitReason || undefined} onClick={() => { if (!blocked && debitAllowed && !createdId) { setOpening(true); setReview(false); setError(""); } }}><FilePlus2 size={16} aria-hidden="true" />إصدار إشعار مدين</button>{!debitAllowed && <p className={styles.hint}>{debitReason}</p>}</div>}
    {opening && !createdId && <form className={styles.editor} aria-label="إصدار إشعار مدين" onSubmit={event => { event.preventDefault(); if (blocked || !debitAllowed) return; if (!debitValid) { setError("راجع مبلغ الإشعار ووصفه وسبب إصداره"); return; } if (!review) { setReview(true); setError(""); } else void issueDebit(); }}>
      <h3>{review ? "مراجعة الإشعار المدين" : "بيانات الإشعار المدين"}</h3><p>يُضاف مبلغ الإشعار إلى مستحقات العميل بالريال السعودي دون حركة مخزون وتبقى الفاتورة الأصلية محفوظة</p>
      {!review ? <fieldset className={styles.debitFields} disabled={blocked}><label>المبلغ قبل الضريبة بالريال السعودي<input type="number" min="0.01" max={1e9} step="0.01" value={amount} onChange={event => changeField(() => setAmount(event.target.value))} required /></label><label>وصف الإشعار<input value={description} minLength={3} maxLength={500} onChange={event => changeField(() => setDescription(event.target.value))} required /></label><label>القيمة المضافة<select value={vatRate} onChange={event => changeField(() => setVatRate(Number(event.target.value) as 0 | 15))}><option value={15}>15%</option><option value={0}>0%</option></select></label><label>سبب الإشعار<textarea rows={2} value={reason} minLength={1} maxLength={250} required onChange={event => changeField(() => setReason(event.target.value))} />{vatRate === 0 && <small className={styles.hint}>وضّح أيضًا سبب تطبيق نسبة الصفر</small>}</label></fieldset> : <dl className={styles.facts}><dt>الفاتورة الأصلية</dt><dd>{detail.invoice?.displayNumber || detail.document.number}</dd><dt>العميل</dt><dd>{detail.invoice?.customer.name || detail.customer?.name}</dd><dt>الوصف</dt><dd>{description.trim()}</dd><dt>المبلغ قبل الضريبة</dt><dd><Numeric value={net} money /></dd><dt>القيمة المضافة {vatRate}%</dt><dd><Numeric value={tax} money /></dd><dt>الإجمالي المستحق</dt><dd><Numeric value={total} money /></dd>{reason && <><dt>السبب</dt><dd>{reason}</dd></>}</dl>}
      <div className={styles.toolbar}><button type="submit" className={styles.primary} disabled={blocked || !debitValid}>{pending ? "جار الإصدار" : review ? "تأكيد إصدار الإشعار المدين" : "مراجعة الإشعار"}</button>{review && <button type="button" disabled={blocked} onClick={() => { if (!blocked) setReview(false); }}>تعديل البيانات</button>}<button type="button" disabled={pending} onClick={() => { if (!pending) { setOpening(false); setReview(false); setError(""); } }}>إلغاء</button></div>
    </form>}
    {message && <p role="status">{message}</p>}{error && <div className={styles.error} role="alert"><span>{error}</span>{createdId ? <button type="button" disabled={pending} onClick={() => { if (!pending) onNavigate(createdId); }}>فتح الإشعار الصادر</button> : !opening && <button type="button" disabled={pending} onClick={() => { if (!pending) onReload(); }}>إعادة تحميل الخيارات</button>}</div>}
  </section>;
}

export function InvoiceProfitPanel({ profit }: { profit: NonNullable<InvoiceExtensionsState["profit"]> }) {
  return <div className={styles.body}><h3>ربح الفاتورة</h3><p className={styles.hint}>بيانات داخلية بالريال السعودي لا تظهر في نسخة العميل</p><dl className={styles.summary}><div><dt>صافي الإيراد</dt><dd><Numeric value={profit.revenue} money /></dd></div><div><dt>التكلفة</dt><dd>{profit.costKnown && profit.cost !== null ? <Numeric value={profit.cost} money /> : "غير مكتملة"}</dd></div><div><dt>الربح</dt><dd>{profit.costKnown && profit.profit !== null ? <Numeric value={profit.profit} money /> : "غير متاح"}</dd></div></dl>{!profit.costKnown && <p className={styles.hint}>يلزم توفر تكلفة فعلية لجميع البنود لحساب ربح موثوق</p>}</div>;
}
