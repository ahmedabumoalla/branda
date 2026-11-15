"use client";
import { PosNumeric as Numeric, useFinancePosLocale } from "./finance-pos-locale";

import { useRef, useState } from "react";
import { FinancePosModal as Modal } from "./finance-pos-locale";
import type { FinanceCommandResult, FinanceRefundRequest, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { Field, Panel } from "./finance-ui";
import styles from "./finance.module.css";

const statusNames = { pending: "بانتظار اعتماد المالك", approved: "معتمد ومُرحّل", rejected: "مرفوض" };

export function FinanceRefundRequests({ snapshot, pending, error, onExecute, onReceipt, title = "طلبات المرتجع واعتماد المالك" }: {
  snapshot: FinanceSnapshot; pending: boolean; error: string; title?: string;
  onExecute: (operation: "refund_approve" | "refund_reject", payload: Record<string, unknown>) => Promise<FinanceCommandResult | null>;
  onReceipt: (id: string) => void;
}) {
  const { t, date } = useFinancePosLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState("");
  const busy = useRef(false);
  const requests = snapshot.refundRequests ?? [];
  const request = requests.find(item => item.id === selected);
  const actingForOwner = !!snapshot.ownerUserId && snapshot.ownerUserId !== snapshot.userId;
  const owner = snapshot.canAdminister && snapshot.role === "owner";
  async function review(operation: "refund_approve" | "refund_reject") {
    if (!request || !owner || request.status !== "pending" || pending || busy.current) return;
    setLocalError("");
    if (operation === "refund_approve" && !confirmed) { setLocalError(t("أكد مراجعة الأصناف وطريقة إعادة المبلغ")); return; }
    if (operation === "refund_reject" && !note.trim()) { setLocalError(t("أدخل سبب رفض الطلب")); return; }
    busy.current = true;
    try {
      const result = await onExecute(operation, { requestId: request.id, ...(operation === "refund_reject" ? { note: note.trim() } : {}) });
      if (result) { setSelected(null); if (operation === "refund_approve") onReceipt(result.id); }
    } finally { busy.current = false; }
  }
  if (!requests.length) return null;
  return <>
    <Panel title={t(title)}>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{t("الفاتورة")}</th><th>{t("تاريخ الطلب")}</th><th>{t("قيمة المرتجع")}</th><th>{t("إعادة المبلغ")}</th><th>{t("الحالة")}</th><th>{t("الإجراء")}</th></tr></thead><tbody>
        {requests.map(item => <tr key={item.id}><td>#{item.document_number}</td><td>{date(item.created_at)}</td><td><Numeric value={item.total} money /></td><td><Numeric value={item.paid} money /></td><td><span className={styles.badge}>{t(statusNames[item.status])}</span></td><td><button type="button" className={styles.secondary} onClick={() => { setSelected(item.id); setNote(""); setConfirmed(false); setLocalError(""); }}>{owner && item.status === "pending" ? t("مراجعة واعتماد") : t("تفاصيل الطلب")}</button></td></tr>)}
      </tbody></table></div>
    </Panel>
    <Modal open={!!request} title={request ? t("طلب مرتجع الفاتورة #") + (request.document_number) : t("طلب مرتجع")} onClose={() => { if (!pending) setSelected(null); }} panelClassName={styles.invoicePanel}>
      {request && <div className={styles.form}>
        <p className={styles.notice}>{request.status === "pending" ? t("لم يُصرف المبلغ ولم تتغير الأرصدة أو المخزون اعتماد المالك يرحّل المرتجع ويخصم المبلغ من مصدر الدفع المحدد") : t(statusNames[request.status])}</p>
        {(localError || error) && <p className={styles.error} role="alert">{t(localError || error)}</p>}
        <RequestDetails request={request} snapshot={snapshot} />
        {actingForOwner && request.status === "pending" && <p className={styles.notice}>سيُسجل اعتماد المرتجع أو رفضه باسمك كمدير منصة ضمن جلسة الدخول بالنيابة</p>}
        {owner && request.status === "pending" && <>
          <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={pending} onChange={event => setConfirmed(event.target.checked)} />{t("راجعت الأصناف والكميات وأعتمد إعادة المبلغ بالطريقة المحددة")}</label>
          <Field label={t("سبب الرفض عند رفض الطلب")}><textarea value={note} maxLength={500} disabled={pending} onChange={event => setNote(event.target.value)} /></Field>
          <div className={styles.formFooter}><button type="button" className={styles.primary} disabled={pending || !confirmed} onClick={() => review("refund_approve")}>{pending ? t("جار تنفيذ القرار") : t("اعتماد المرتجع وترحيل المبلغ")}</button><button type="button" className={styles.danger} disabled={pending || !note.trim()} onClick={() => review("refund_reject")}>{t("رفض الطلب")}</button></div>
        </>}
        {request.status === "approved" && request.refund_document_id && <button type="button" className={styles.primary} onClick={() => { setSelected(null); onReceipt(request.refund_document_id!); }}>{t("فاتورة المرتجع وطباعتها")}</button>}
      </div>}
    </Modal>
  </>;
}

function RequestDetails({ request, snapshot }: { request: FinanceRefundRequest; snapshot: FinanceSnapshot }) {
  const { t } = useFinancePosLocale();
  const original = snapshot.documents.find(document => document.id === request.document_id);
  const account = snapshot.accounts.find(account => account.id === request.payload.accountId);
  return <>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{t("الصنف")}</th><th>{t("الكمية المرتجعة")}</th></tr></thead><tbody>{request.payload.lines.map(line => <tr key={line.lineId}><td>{t(line.name ?? original?.lines.find(item => item.id === line.lineId)?.name ?? t("صنف من الفاتورة الأصلية"))}</td><td><Numeric value={line.quantity} /></td></tr>)}</tbody></table></div>
    <div className={styles.fields}>
      <div className={styles.notice}><strong>{t("طريقة إعادة المبلغ")}</strong><p>{request.paid > 0 ? (request.payload.paymentMethod === "cash" ? t("نقدًا") : t("تحويل بنكي")) + " — " + (account?.name ?? t("الحساب المحدد في الطلب")) : t("تخفيض المبلغ الآجل دون صرف نقدية")}</p>{request.paid > 0 && request.payload.paymentMethod === "cash" && <p>{request.payload.shiftId ? t("من عهدة الوردية المحددة") : t("من خزينة الصندوق")}</p>}</div>
      <div><div className={styles.balanceLine}><span>{t("قيمة المرتجع")}</span><Numeric value={request.total} money /></div><div className={styles.balanceLine}><span>{t("تخفيض الآجل")}</span><Numeric value={Math.max(0, request.total - request.paid)} money /></div><div className={styles.balanceLine}><strong>{t("المبلغ المعاد للعميل")}</strong><Numeric value={request.paid} money /></div></div>
    </div>
    <div className={styles.notice}><strong>{t("سبب المرتجع")}</strong><p>{t(request.payload.note)}</p>{request.rejection_reason && <><strong>{t("سبب الرفض")}</strong><p>{t(request.rejection_reason)}</p></>}</div>
    {request.payload.deferStock && <p className={styles.notice}>{t("هذا الطلب يفصل استلام البضاعة عن تسوية المبلغ بعد الاعتماد أكّد الاستلام من تبويب الأذون المخزنية في الفاتورة المرتجعة")}</p>}
  </>;
}
