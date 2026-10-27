"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { fetchFinanceCashDifferencesAction, settleFinanceCashDifferenceAction } from "@/app/actions/finance-cash-differences";
import type { CashDifferenceRow, CashDifferencesPage } from "@/lib/finance/cash-differences";
import { canFinance, type FinanceRole } from "@/lib/finance/permissions";
import { Numeric } from "./finance-ui";
import styles from "./finance-cash-differences.module.css";

const pageSize = 50;
const notificationLabels: Record<CashDifferenceRow["notification_status"], string> = {
  pending: "بانتظار إرسال إشعار واتساب",
  processing: "جارٍ إرسال إشعار واتساب",
  queued: "قُبل للإرسال عبر واتساب",
  rejected: "رُفض إرسال إشعار واتساب",
  unknown: "حالة إرسال واتساب غير مؤكدة",
  missing_owner: "رقم مالك العلامة غير متاح",
};
export function cashDifferenceTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}
const differenceLabel = (value: number) => value < 0 ? "عجز" : value > 0 ? "زيادة" : "مطابق";

export function FinanceCashDifferences({ role, slug, onSettled }: { role: FinanceRole; slug?: string; onSettled?: () => void }) {
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [response, setResponse] = useState<{ slug?: string; offset: number; refresh: number; data?: CashDifferencesPage; error?: string } | null>(null);
  const [selected, setSelected] = useState<CashDifferenceRow | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(slug);
  const [resolution, setResolution] = useState<"" | "charge_employee" | "waive">("");
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const busy = useRef(false);
  const current = !!response && response.slug === slug && response.offset === offset && response.refresh === refresh;
  const loading = !current;
  const data = current ? response.data : undefined;
  const canSettle = canFinance(role, "accounting_write") && !!data?.canSettle;
  const error = current ? response.error : undefined;
  const rows = data?.rows ?? [];
  useEffect(() => {
    let active = true;
    const identity = { slug, offset, refresh };
    void fetchFinanceCashDifferencesAction(offset, slug).then(result => {
      if (active) setResponse(result.ok ? { ...identity, data: result.data } : { ...identity, error: result.message });
    }).catch(() => { if (active) setResponse({ ...identity, error: "تعذر تحميل فروقات النقدية أعد المحاولة" }); });
    return () => { active = false; };
  }, [slug, offset, refresh]);
  const open = (row: CashDifferenceRow) => {
    if (!canSettle || row.status !== "pending") return;
    setSelected(row); setSelectedSlug(slug); setResolution(""); setEmployeeId(""); setNote(""); setFormError(""); setSuccess(""); request.current = null;
  };
  const close = () => { if (!busy.current) { setSelected(null); setFormError(""); } };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || !selected || selectedSlug !== slug || !canSettle || !data || selected.status !== "pending") return;
    if (!resolution || !note.trim()) { setFormError("اختر طريقة المعالجة واكتب سببها"); return; }
    if (resolution === "charge_employee" && selected.difference >= 0) { setFormError("تحميل الفرق على الموظف متاح للعجز النقدي فقط"); return; }
    if (resolution === "charge_employee" && !data.employees.some(employee => employee.user_id === employeeId)) { setFormError("اختر الموظف المسؤول عن الفرق بعد المراجعة"); return; }
    const payload = { varianceId: selected.id, resolution, ...(resolution === "charge_employee" ? { employeeId } : {}), note: note.trim() };
    const fingerprint = JSON.stringify({ slug, ...payload });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    busy.current = true; setPending(true); setFormError("");
    try {
      const result = await settleFinanceCashDifferenceAction({ ...payload, requestId: request.current.id }, slug);
      if (!result.ok) { setFormError(result.message); return; }
      setSelected(null); request.current = null;
      setSuccess(resolution === "charge_employee" ? "سُجل تحميل الفرق على الموظف المحدد" : "تمت تسوية الفرق دون تحميله على موظف");
      setRefresh(value => value + 1); onSettled?.();
    } catch { setFormError("تعذر تأكيد المعالجة أعد المحاولة بنفس البيانات لتجنب التكرار"); }
    finally { busy.current = false; setPending(false); }
  };
  return <section className={styles.root} dir="rtl" aria-label="فروقات النقدية">
    <header className={styles.header}><div><h2>فروقات النقدية</h2><p>مراجعة فرق الجرد ومعالجته بقرار موثق من مالك العلامة</p></div><div className={styles.actions}><button type="button" className={styles.secondary} disabled={loading || pending} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />تحديث السجل والإشعارات</button></div></header>
    {success && <div className={styles.body}><div className={styles.success} role="status">{success}</div></div>}
    {loading ? <div className={styles.empty} role="status">جارٍ تحميل فروقات النقدية</div> : error ? <div className={styles.body}><div className={styles.error} role="alert">{error}</div><button type="button" className={styles.secondary} onClick={() => setRefresh(value => value + 1)}>إعادة المحاولة</button></div> : <>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="سجل فروقات الورديات"><table className={styles.table}><thead><tr><th scope="col">الوردية ووقت الجرد</th><th scope="col">الصندوق</th><th scope="col">الموظف السابق والحالي</th><th scope="col">المسجل والمعدود</th><th scope="col">فرق النقدية</th><th scope="col">إشعار المالك</th><th scope="col">المعالجة</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
        <td><strong>{row.shift_number ? <bdi dir="ltr">#{row.shift_number}</bdi> : "وردية"}</strong><small>{row.phase === "opening" ? "جرد بداية الوردية" : "جرد إقفال الوردية"}</small><small><time dateTime={row.occurred_at}>{cashDifferenceTime(row.occurred_at)}</time></small>{row.document_number != null && <small>قيد رصد الفرق <bdi dir="ltr">#{row.document_number}</bdi></small>}</td>
        <td>{row.drawer_name}</td>
        <td className={styles.staff}><small><span>السابق</span><b>{row.previous_employee_name || "لا توجد وردية سابقة"}</b></small><small><span>الحالي</span><b>{row.employee_name || "غير محدد"}</b></small></td>
        <td><small>المسجل <Numeric value={row.expected_cash} money /></small><small>المعدود <Numeric value={row.counted_cash} money /></small></td>
        <td><span className={`${styles.difference} ${row.difference < 0 ? styles.shortage : styles.excess}`}><Numeric value={Math.abs(row.difference)} money /></span><small>{differenceLabel(row.difference)}</small></td>
        <td className={styles.notification}><span className={styles.badge}>{notificationLabels[row.notification_status] ?? "حالة الإرسال غير متاحة"}</span>{row.notification_status === "queued" && <p>قبول الإرسال لا يؤكد وصول الرسالة</p>}</td>
        <td>{row.status === "pending" ? canSettle ? <button type="button" className={styles.secondary} disabled={pending} onClick={() => open(row)}>معالجة الفرق</button> : <span className={styles.badge}>بانتظار قرار المالك</span> : <><span className={styles.badge}>{row.status === "charge_employee" ? "محمّل على موظف" : "مسوّى دون تحميل"}</span>{row.resolution_employee_name && <small>{row.resolution_employee_name}</small>}{row.settled_at && <small><time dateTime={row.settled_at}>{cashDifferenceTime(row.settled_at)}</time></small>}{row.resolution_document_number != null && <small>قيد التسوية <bdi dir="ltr">#{row.resolution_document_number}</bdi></small>}{row.settlement_note && <small className={styles.resolutionNote}>{row.settlement_note}</small>}</>}</td>
      </tr>)}</tbody></table>{rows.length === 0 && <div className={styles.empty}>لا توجد فروقات نقدية مسجلة</div>}</div>
      <footer className={styles.pagination}><span>{data?.total ?? 0} فرق مسجل · الأوقات بتوقيت الرياض</span><div className={styles.actions}><button type="button" className={styles.secondary} disabled={offset === 0 || pending} onClick={() => setOffset(value => Math.max(0, value - pageSize))}>السابق</button><button type="button" className={styles.secondary} disabled={!data?.hasMore || pending} onClick={() => setOffset(value => value + pageSize)}>التالي<ArrowLeft size={15} aria-hidden="true" /></button></div></footer>
    </>}
    <Modal open={canSettle && !!selected && selectedSlug === slug} title="معالجة فرق النقدية" onClose={close} panelClassName={styles.dialog}>
      {canSettle && selected && selectedSlug === slug && <form className={styles.form} onSubmit={submit}>
        <div className={styles.summary}><div><span>الوردية</span><strong>{selected.shift_number ? <bdi dir="ltr">#{selected.shift_number}</bdi> : "—"}</strong></div><div><span>{differenceLabel(selected.difference)}</span><strong><Numeric value={Math.abs(selected.difference)} money /></strong></div></div>
        <div className={styles.note}>وجود الموظف في الوردية لا يحدد مسؤوليته عن الفرق اختر القرار بعد مراجعة الجرد والمستندات</div>
        {formError && <div className={styles.error} role="alert">{formError}</div>}
        <label className={styles.field}>طريقة المعالجة<select name="resolution" required disabled={pending} value={resolution} onChange={event => { setResolution(event.target.value as typeof resolution); setEmployeeId(""); }}><option value="">اختر طريقة المعالجة</option><option value="charge_employee" disabled={selected.difference >= 0}>تحميل العجز على موظف</option><option value="waive">تسوية الفرق دون تحميله على موظف</option></select></label>
        {resolution === "charge_employee" && <label className={styles.field}>الموظف المسؤول<select name="employeeId" required disabled={pending} value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">اختر الموظف بعد المراجعة</option>{data?.employees.map(employee => <option key={employee.user_id} value={employee.user_id}>{employee.name}</option>)}</select><small>لا يُختار الموظف السابق أو الحالي تلقائيًا</small></label>}
        <label className={styles.field}>سبب المعالجة<textarea name="note" required maxLength={1000} rows={3} disabled={pending} value={note} onChange={event => setNote(event.target.value)} /></label>
        <div className={styles.footer}><button type="submit" className={styles.primary} disabled={pending || !canSettle || !resolution || !note.trim() || (resolution === "charge_employee" && (!employeeId || selected.difference >= 0))}>{pending ? "جارٍ تسجيل المعالجة" : "تأكيد المعالجة"}</button><button type="button" className={styles.secondary} disabled={pending} onClick={close}>إلغاء</button></div>
      </form>}
    </Modal>
  </section>;
}
