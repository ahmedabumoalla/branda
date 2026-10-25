"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import type { FinanceCommandResult, FinanceRefundRequest, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { Field, Numeric, Panel, financeDate } from "./finance-ui";
import styles from "./finance.module.css";

const statusNames = { pending: "بانتظار اعتماد المالك", approved: "معتمد ومُرحّل", rejected: "مرفوض" };

export function FinanceRefundRequests({ snapshot, pending, error, onExecute, onReceipt }: {
  snapshot: FinanceSnapshot; pending: boolean; error: string;
  onExecute: (operation: "refund_approve" | "refund_reject", payload: Record<string, unknown>) => Promise<FinanceCommandResult | null>;
  onReceipt: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState("");
  const busy = useRef(false);
  const requests = snapshot.refundRequests ?? [];
  const request = requests.find(item => item.id === selected);
  const owner = snapshot.canAdminister && snapshot.role === "owner";
  async function review(operation: "refund_approve" | "refund_reject") {
    if (!request || !owner || request.status !== "pending" || pending || busy.current) return;
    setLocalError("");
    if (operation === "refund_approve" && !confirmed) { setLocalError("أكد مراجعة الأصناف وطريقة إعادة المبلغ"); return; }
    if (operation === "refund_reject" && !note.trim()) { setLocalError("أدخل سبب رفض الطلب"); return; }
    busy.current = true;
    try {
      const result = await onExecute(operation, { requestId: request.id, ...(operation === "refund_reject" ? { note: note.trim() } : {}) });
      if (result) { setSelected(null); if (operation === "refund_approve") onReceipt(result.id); }
    } finally { busy.current = false; }
  }
  if (!requests.length) return null;
  return <>
    <Panel title="طلبات المرتجع واعتماد المالك">
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الفاتورة</th><th>تاريخ الطلب</th><th>قيمة المرتجع</th><th>إعادة المبلغ</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>
        {requests.map(item => <tr key={item.id}><td>#{item.document_number}</td><td>{financeDate(item.created_at)}</td><td><Numeric value={item.total} money /></td><td><Numeric value={item.paid} money /></td><td><span className={styles.badge}>{statusNames[item.status]}</span></td><td><button type="button" className={styles.secondary} onClick={() => { setSelected(item.id); setNote(""); setConfirmed(false); setLocalError(""); }}>{owner && item.status === "pending" ? "مراجعة واعتماد" : "تفاصيل الطلب"}</button></td></tr>)}
      </tbody></table></div>
    </Panel>
    <Modal open={!!request} title={request ? `طلب مرتجع الفاتورة #${request.document_number}` : "طلب مرتجع"} onClose={() => { if (!pending) setSelected(null); }} panelClassName={styles.invoicePanel}>
      {request && <div className={styles.form}>
        <p className={styles.notice}>{request.status === "pending" ? "لم يُصرف المبلغ ولم تتغير الأرصدة أو المخزون اعتماد المالك يرحّل المرتجع ويخصم المبلغ من مصدر الدفع المحدد" : statusNames[request.status]}</p>
        {(localError || error) && <p className={styles.error} role="alert">{localError || error}</p>}
        <RequestDetails request={request} snapshot={snapshot} />
        {owner && request.status === "pending" && <>
          <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={pending} onChange={event => setConfirmed(event.target.checked)} />راجعت الأصناف والكميات وأعتمد إعادة المبلغ بالطريقة المحددة</label>
          <Field label="سبب الرفض عند رفض الطلب"><textarea value={note} maxLength={500} disabled={pending} onChange={event => setNote(event.target.value)} /></Field>
          <div className={styles.formFooter}><button type="button" className={styles.primary} disabled={pending || !confirmed} onClick={() => review("refund_approve")}>{pending ? "جار تنفيذ القرار" : "اعتماد المرتجع وترحيل المبلغ"}</button><button type="button" className={styles.danger} disabled={pending || !note.trim()} onClick={() => review("refund_reject")}>رفض الطلب</button></div>
        </>}
        {request.status === "approved" && request.refund_document_id && <button type="button" className={styles.primary} onClick={() => { setSelected(null); onReceipt(request.refund_document_id!); }}>فاتورة المرتجع وطباعتها</button>}
      </div>}
    </Modal>
  </>;
}

function RequestDetails({ request, snapshot }: { request: FinanceRefundRequest; snapshot: FinanceSnapshot }) {
  const original = snapshot.documents.find(document => document.id === request.document_id);
  const account = snapshot.accounts.find(account => account.id === request.payload.accountId);
  return <>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الصنف</th><th>الكمية المرتجعة</th></tr></thead><tbody>{request.payload.lines.map(line => <tr key={line.lineId}><td>{line.name ?? original?.lines.find(item => item.id === line.lineId)?.name ?? "صنف من الفاتورة الأصلية"}</td><td><Numeric value={line.quantity} /></td></tr>)}</tbody></table></div>
    <div className={styles.fields}>
      <div className={styles.notice}><strong>طريقة إعادة المبلغ</strong><p>{request.paid > 0 ? `${request.payload.paymentMethod === "cash" ? "نقدًا" : "تحويل بنكي"} — ${account?.name ?? "الحساب المحدد في الطلب"}` : "تخفيض المبلغ الآجل دون صرف نقدية"}</p>{request.paid > 0 && request.payload.paymentMethod === "cash" && <p>{request.payload.shiftId ? "من عهدة الوردية المحددة" : "من خزينة الصندوق"}</p>}</div>
      <div><div className={styles.balanceLine}><span>قيمة المرتجع</span><Numeric value={request.total} money /></div><div className={styles.balanceLine}><span>تخفيض الآجل</span><Numeric value={Math.max(0, request.total - request.paid)} money /></div><div className={styles.balanceLine}><strong>المبلغ المعاد للعميل</strong><Numeric value={request.paid} money /></div></div>
    </div>
    <div className={styles.notice}><strong>سبب المرتجع</strong><p>{request.payload.note}</p>{request.rejection_reason && <><strong>سبب الرفض</strong><p>{request.rejection_reason}</p></>}</div>
  </>;
}
