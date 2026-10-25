"use client";

import { useRef, useState } from "react";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { Field, Numeric } from "./finance-ui";
import styles from "./finance.module.css";

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function refundPreview(document: FinanceDocument, quantities: Record<string, number>) {
  const lines = document.lines.map(line => {
    const quantity = quantities[line.id] ?? 0, returned = line.returned_quantity ?? 0;
    const net = quantity > 0 ? round(line.net * (returned + quantity) / line.quantity) - (line.returned_net ?? 0) : 0;
    const tax = quantity > 0 ? round(line.tax * (returned + quantity) / line.quantity) - (line.returned_tax ?? 0) : 0;
    return { line, quantity, available: Math.max(0, line.quantity - returned), net: round(net), tax: round(tax), total: round(net + tax) };
  });
  const total = round(lines.reduce((sum, line) => sum + line.total, 0));
  const debt = Math.min(total, document.outstanding);
  return { lines, total, tax: round(lines.reduce((sum, line) => sum + line.tax, 0)), debt, paid: round(total - debt) };
}

export function refundPayload(document: FinanceDocument, quantities: Record<string, number>, accountId: string, note: string, snapshot: FinanceSnapshot, shiftId = "") {
  if ((!snapshot.canManage && document.kind !== "sale") || !["sale", "purchase"].includes(document.kind) || document.refunded) throw new Error("الفاتورة غير متاحة للإرجاع");
  const preview = refundPreview(document, quantities);
  for (const row of preview.lines) if (!Number.isFinite(row.quantity) || row.quantity < 0 || row.quantity > row.available || Math.abs(row.quantity * 1000 - Math.round(row.quantity * 1000)) > .000001) throw new Error("راجع الكمية المرتجعة لكل صنف");
  const lines = preview.lines.filter(row => row.quantity > 0).map(row => ({ lineId: row.line.id, quantity: row.quantity, expectedReturnedQuantity: row.line.returned_quantity ?? 0 }));
  if (!lines.length) throw new Error("حدد كمية صنف واحد على الأقل للإرجاع");
  if (!note.trim()) throw new Error("أدخل سبب المرتجع");
  const account = snapshot.accounts.find(account => account.id === accountId && account.active && (document.kind === "sale" ? ["cash", "bank"] : ["cash", "bank", "pos"]).includes(account.kind));
  if (preview.paid > 0 && !account) throw new Error("اختر حساب تسوية المبلغ المرتجع");
  if (preview.paid > 0 && shiftId && !snapshot.shifts.some(shift => shift.id === shiftId && shift.status === "open" && shift.account_id === accountId)) throw new Error("اختر وردية مفتوحة مرتبطة بالصندوق المحدد");
  if (document.kind === "sale" && preview.paid > 0 && account?.kind === "cash" && snapshot.shifts.some(shift => shift.account_id === accountId && shift.status === "open") && !shiftId) throw new Error("اختر عهدة الوردية المفتوحة لهذا الصندوق");
  return { documentId: document.id, lines, expectedTotal: preview.total, expectedPaid: preview.paid, ...(preview.paid > 0 ? { accountId, paymentMethod: account!.kind, ...(shiftId ? { shiftId } : {}) } : {}), note: note.trim() };
}

export function FinanceRefundForm({ document, snapshot, pending, error, onCancel, onSubmit }: {
  document?: FinanceDocument; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void;
  onSubmit: (operation: "refund", payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [accountId, setAccountId] = useState(document?.account_id ?? "");
  const [shiftId, setShiftId] = useState(snapshot.shifts.find(shift => shift.account_id === document?.account_id && shift.status === "open")?.id ?? "");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");
  const busy = useRef(false);
  if (!document || (!snapshot.canManage && document.kind !== "sale") || !["sale", "purchase"].includes(document.kind) || document.refunded) return <p className={styles.error} role="alert">الفاتورة غير متاحة للإرجاع حدّث السجل ثم أعد المحاولة</p>;
  const preview = refundPreview(document, quantities);
  const accounts = snapshot.accounts.filter(account => account.active && (document.kind === "sale" ? ["cash", "bank"] : ["cash", "bank", "pos"]).includes(account.kind));
  const account = accounts.find(account => account.id === accountId);
  return <form className={`${styles.form} ${styles.invoiceForm}`} onSubmit={async event => {
    event.preventDefault(); if (pending || busy.current) return;
    setLocalError("");
    let payload;
    try { payload = refundPayload(document, quantities, accountId, note, snapshot, shiftId); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : "راجع بيانات المرتجع"); return; }
    busy.current = true;
    try { await onSubmit("refund", payload); } finally { busy.current = false; }
  }}>
    <p className={styles.muted}>أدخل الكمية المراد إرجاعها فقط واترك بقية الأصناف على صفر</p>
    {document.kind === "sale" && <p className={styles.notice}>سيبقى الطلب معلقًا دون صرف أو تغيير الأرصدة والمخزون حتى يعتمد مالك العلامة المرتجع</p>}
    {(localError || error) && <p className={styles.error} role="alert">{localError || error}</p>}
    <fieldset disabled={pending} className={styles.invoiceLayout}>
      <section className={`${styles.invoiceSection} ${styles.invoiceItems}`} aria-label="الأصناف المرتجعة">
        <div className={styles.invoiceSectionHeader}><h3 className={styles.invoiceHeading}>الفاتورة الأصلية #{document.number}</h3><button type="button" className={styles.secondary} onClick={() => setQuantities(Object.fromEntries(preview.lines.map(row => [row.line.id, row.available])))}>إرجاع جميع الكميات المتبقية</button></div>
        <div className={styles.invoiceTableWrap} role="region" aria-label="جدول الأصناف المرتجعة قابل للتمرير أفقيًا" tabIndex={0}>
          <table className={`${styles.invoiceTable} ${styles.refundTable}`}><caption className={styles.srOnly}>المبالغ المرتجعة بالريال بعد خصم وضريبة الفاتورة الأصلية</caption><thead><tr><th scope="col">الصنف</th><th scope="col">إرجاع</th><th scope="col">المباعة</th><th scope="col">أُرجعت</th><th scope="col">المتبقية</th><th scope="col">الضريبة</th><th scope="col">قيمة المرتجع</th></tr></thead><tbody>
            {preview.lines.map(row => <tr key={row.line.id}><td>{row.line.name}</td><td><Field label={`الكمية المرتجعة من ${row.line.name}`}><input type="number" inputMode="decimal" min="0" max={row.available} step="0.001" required disabled={row.available === 0} value={row.quantity} onChange={event => { setLocalError(""); setQuantities(current => ({ ...current, [row.line.id]: Number(event.target.value) })); }} /></Field></td><td><Numeric value={row.line.quantity} /></td><td><Numeric value={row.line.returned_quantity ?? 0} /></td><td><Numeric value={row.available} /></td><td><Numeric value={row.tax} /></td><td><strong><Numeric value={row.total} /></strong></td></tr>)}
          </tbody></table>
        </div>
        <p className={styles.invoiceScrollHint}>اسحب الجدول لعرض بقية الأعمدة</p>
      </section>
      <section className={`${styles.invoiceSection} ${styles.invoiceSummary}`} aria-label="تسوية المرتجع">
        <div className={styles.invoicePaymentFields}>
          {preview.paid > 0 && <Field label={document.kind === "sale" ? "طريقة إعادة المبلغ وحساب الدفع" : "حساب استلام المبلغ من المورد"}><select required value={accountId} onChange={event => { setAccountId(event.target.value); setShiftId(snapshot.shifts.find(shift => shift.account_id === event.target.value && shift.status === "open")?.id ?? ""); }}><option value="">اختر الحساب</option>{accounts.map(account => <option value={account.id} key={account.id}>{account.kind === "cash" ? "نقدًا" : account.kind === "bank" ? "تحويل بنكي" : "نقاط البيع"} — {account.name}</option>)}</select></Field>}
          {preview.paid > 0 && account?.kind === "cash" && document.kind === "sale" && <Field label="مصدر النقدية" hint="يخصم من الصندوق المحدد بعد اعتماد المالك"><select value={shiftId} onChange={event => setShiftId(event.target.value)}><option value="" disabled={snapshot.shifts.some(shift => shift.account_id === accountId && shift.status === "open")}>رصيد خزينة الصندوق</option>{snapshot.shifts.filter(shift => shift.account_id === accountId && shift.status === "open").map(shift => <option key={shift.id} value={shift.id}>عهدة وردية {snapshot.staff.find(staff => staff.user_id === shift.user_id)?.name ?? "الموظف الحالي"}</option>)}</select></Field>}
          <Field label="سبب المرتجع"><textarea required maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="اكتب سبب إرجاع الأصناف" /></Field>
        </div>
        <div className={styles.invoicePaymentFields}>
          <div><div className={styles.balanceLine}><span>ضريبة الأصناف المرتجعة</span><Numeric value={preview.tax} money /></div><div className={styles.balanceLine}><span>تخفيض المبلغ الآجل</span><Numeric value={preview.debt} money /></div><div className={styles.balanceLine}><span>{document.kind === "sale" ? "المبلغ المعاد للعميل" : "المبلغ المسترد من المورد"}</span><Numeric value={preview.paid} money /></div><div className={styles.balanceLine}><strong>إجمالي المرتجع</strong><strong><Numeric value={preview.total} money /></strong></div></div>
          <div className={styles.invoiceFooter}><button type="submit" className={styles.primary} disabled={!preview.lines.some(row => row.quantity > 0)}>{pending ? "جار حفظ الطلب" : document.kind === "sale" ? "إرسال لاعتماد المالك" : "حفظ فاتورة المرتجع"}</button><button type="button" className={styles.secondary} onClick={onCancel}>إلغاء</button></div>
        </div>
      </section>
    </fieldset>
  </form>;
}
