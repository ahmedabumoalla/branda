"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import { fetchFinanceCashHandoversAction, receiveFinanceShiftCashAction } from "@/app/actions/finance-cash-handovers";
import type { CashHandoverRow, CashHandoversPage, CashHandoverReceiptResult } from "@/lib/finance/cash-handovers";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { Numeric } from "./finance-ui";
import styles from "./finance-cash-handovers.module.css";

const pageSize = 50;
const labels = { next_shift: "الوردية التالية", accountant: "المحاسب", other: "مستلم آخر" };
export function cashHandoverTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

type Props = { snapshot: FinanceSnapshot; slug?: string; receiptOnly?: boolean; onClose?: () => void; onReceived?: (result: CashHandoverReceiptResult) => void };
export function FinanceCashHandovers({ snapshot, slug: explicitSlug, receiptOnly = false, onClose, onReceived }: Props) {
  const slug = explicitSlug ?? snapshot.cafe.slug;
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [response, setResponse] = useState<{ slug: string; offset: number; refresh: number; data?: CashHandoversPage; error?: string } | null>(null);
  const [selected, setSelected] = useState<CashHandoverRow | null>(null);
  const [selectedSlug, setSelectedSlug] = useState(slug);
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const busy = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const current = !!response && response.slug === slug && response.offset === offset && response.refresh === refresh;
  const data = current ? response.data : undefined;
  const canReceive = canFinance(snapshot.role, "treasury_write") && !!data?.canReceive;
  const error = current ? response.error : undefined;
  const accounts = snapshot.accounts.filter(account => account.active && !account.is_cashier_drawer && ["cash", "bank"].includes(account.kind));
  useEffect(() => {
    let active = true;
    const identity = { slug, offset, refresh };
    void fetchFinanceCashHandoversAction(offset, slug).then(result => {
      if (active) setResponse(result.ok ? { ...identity, data: result.data } : { ...identity, error: result.message });
    }).catch(() => { if (active) setResponse({ ...identity, error: "تعذر تحميل تسليمات النقدية أعد المحاولة" }); });
    return () => { active = false; };
  }, [slug, offset, refresh]);
  const open = (row: CashHandoverRow) => {
    if (!canReceive || row.status !== "pending" || row.handover_type === "next_shift") return;
    setSelected(row); setSelectedSlug(slug); setAccountId((accounts.find(account => account.kind === "cash" && account.is_primary) ?? accounts.find(account => account.is_primary) ?? accounts[0])?.id ?? ""); setNote(""); setFormError(""); request.current = null;
  };
  const close = () => { if (!busy.current) setSelected(null); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || !selected || selectedSlug !== slug || !canReceive || selected.status !== "pending" || selected.handover_type === "next_shift") return;
    if (!accounts.some(account => account.id === accountId)) { setFormError("اختر خزينة أو حسابًا بنكيًا لاستلام كامل المبلغ"); return; }
    const payload = { handoverId: selected.id, accountId, note: note.trim() };
    const fingerprint = JSON.stringify({ slug, ...payload });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    busy.current = true; setPending(true); setFormError("");
    try {
      const result = await receiveFinanceShiftCashAction({ ...payload, requestId: request.current.id }, slug);
      if (!result.ok) { setFormError(result.message); return; }
      setSelected(null); request.current = null; setRefresh(value => value + 1);
      setSuccess(result.data.number ? `تم استلام النقدية بسند قبض #${result.data.number}` : "تم تأكيد استلام التسليم");
      onReceived?.(result.data);
    } catch { setFormError("تعذر تأكيد الاستلام أعد المحاولة بنفس البيانات لتجنب التكرار"); }
    finally { busy.current = false; setPending(false); }
  };
  const content = <section className={styles.root} dir="rtl" aria-label="تسليمات نقدية الورديات">
    <header className={styles.header}><div><h2>تسليمات نقدية الورديات</h2><p>تتبّع النقد من إقفال الوردية حتى استلامه في الوردية التالية أو بسند قبض</p></div><button type="button" className={styles.secondary} disabled={!current || pending} onClick={() => setRefresh(value => value + 1)}>تحديث السجل</button></header>
    {success && <div className={styles.body}><p role="status" className={styles.success}>{success}</p></div>}
    {!current ? <p className={styles.empty} role="status">جارٍ تحميل التسليمات</p> : error ? <div className={styles.body}><p className={styles.error} role="alert">{error}</p><button type="button" className={styles.secondary} onClick={() => setRefresh(value => value + 1)}>إعادة المحاولة</button></div> : <>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="سجل تسليمات النقدية"><table className={styles.table}><thead><tr><th scope="col">الوردية والتسليم</th><th scope="col">الموظف والمستلم</th><th scope="col">الصندوق والمبلغ</th><th scope="col">حالة الاستلام</th><th scope="col">الإجراء</th></tr></thead><tbody>{data?.rows.map(row => <tr key={row.id}>
        <td><strong>{row.shift_number ? <bdi dir="ltr">#{row.shift_number}</bdi> : "وردية"}</strong><small><time dateTime={row.created_at}>{cashHandoverTime(row.created_at)}</time></small><small>{labels[row.handover_type]}</small>{row.document_number != null && <small>قيد التسليم <bdi dir="ltr">#{row.document_number}</bdi></small>}</td>
        <td><strong>{row.from_name || "موظف الوردية"}</strong><small>إلى {row.recipient_name || (row.handover_type === "next_shift" ? "موظف الوردية التالية" : "المستلم المسجل")}</small>{row.recipient_phone && <small><bdi dir="ltr">{row.recipient_phone}</bdi></small>}</td>
        <td>{row.drawer_name}<strong><Numeric value={row.amount} money /></strong>{row.receiving_drawer_name && <small>وجهة التسليم {row.receiving_drawer_name}</small>}</td>
        <td><span className={styles.badge}>{row.status === "received" ? "تم الاستلام" : "بانتظار الاستلام"}</span>{row.received_by_name && <small>{row.received_by_name}</small>}{row.received_at && <small><time dateTime={row.received_at}>{cashHandoverTime(row.received_at)}</time></small>}{row.received_counted_cash != null && <small>العد عند الاستلام <Numeric value={row.received_counted_cash} money /></small>}{row.receipt_document_number != null && <small>سند قبض <bdi dir="ltr">#{row.receipt_document_number}</bdi></small>}</td>
        <td>{row.status === "pending" && row.handover_type !== "next_shift" && canReceive ? <button type="button" className={styles.secondary} disabled={pending} onClick={() => open(row)}>استلام بسند قبض</button> : <small>{row.status === "received" ? "مكتمل" : row.handover_type === "next_shift" ? "يُستلم عند بدء الوردية التالية" : "بانتظار استلام الإدارة"}</small>}</td>
      </tr>)}</tbody></table>{!data?.rows.length && <p className={styles.empty}>لا توجد تسليمات نقدية مسجلة</p>}</div>
      <footer className={styles.pagination}><span>{data?.total ?? 0} تسليم مسجل · الأوقات بتوقيت الرياض</span><div className={styles.actions}><button type="button" className={styles.secondary} disabled={offset === 0 || pending} onClick={() => setOffset(value => Math.max(0, value - pageSize))}>السابق</button><button type="button" className={styles.secondary} disabled={!data?.hasMore || pending} onClick={() => setOffset(value => value + pageSize)}>التالي</button></div></footer>
    </>}
  </section>;
  return <>{receiptOnly ? <Modal open={!selected || !canReceive || selectedSlug !== slug} title="استلام نقدية وردية" onClose={() => { if (!busy.current) onClose?.(); }} panelClassName={styles.dialog}>{content}</Modal> : content}
    <Modal open={canReceive && !!selected && selectedSlug === slug} title="سند قبض نقدية وردية" onClose={close} panelClassName={styles.dialog}>{canReceive && selected && selectedSlug === slug && <form className={styles.form} onSubmit={submit}>
      {formError && <p className={styles.error} role="alert">{formError}</p>}
      <div className={styles.identity}><div><span>تسليم من</span><br /><strong>{selected.from_name}</strong><small> إلى {selected.recipient_name || "المستلم المسجل"}</small></div><strong>وردية <bdi dir="ltr">#{selected.shift_number}</bdi></strong></div>
      <label className={styles.field}>كامل المبلغ المستلم<input name="handoverAmount" readOnly dir="ltr" value={selected.amount.toFixed(2)} /><small>المبلغ مرتبط بتسليم الوردية ويُستلم كاملًا دون تعديل</small></label>
      <label className={styles.field}>حساب استلام النقدية<select name="accountId" required disabled={pending} value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">اختر الخزينة أو البنك</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>{accounts.length === 0 && <small>أضف خزينة أو حسابًا بنكيًا نشطًا لاستلام النقدية</small>}</label>
      <label className={styles.field}>ملاحظة اختيارية<textarea name="note" maxLength={1000} disabled={pending} rows={2} value={note} onChange={event => setNote(event.target.value)} /></label>
      <p className={styles.note}>{selected.amount === 0 ? "التسليم بقيمة صفر يؤكد الاستلام دون إنشاء قيد مالي" : "هذا السند يؤكد استلام النقدية المسلّمة من الوردية ولا يسجل إيراد مبيعات جديدًا"}</p>
      <div className={styles.footer}><button type="submit" className={styles.primary} disabled={pending || !canReceive || !accountId}>{pending ? "جارٍ تأكيد الاستلام" : selected.amount === 0 ? "تأكيد استلام التسليم" : "تأكيد الاستلام وإصدار سند قبض"}</button><button type="button" className={styles.secondary} disabled={pending} onClick={close}>إلغاء</button></div>
    </form>}</Modal>
  </>;
}
