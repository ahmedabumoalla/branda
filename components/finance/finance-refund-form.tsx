"use client";
import { PosNumeric as Numeric, useFinancePosLocale } from "./finance-pos-locale";

import { useRef, useState } from "react";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { Field } from "./finance-ui";
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

export function refundPayload(document: FinanceDocument, quantities: Record<string, number>, accountId: string, note: string, snapshot: FinanceSnapshot, shiftId = "", deferStock = false) {
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
  return { documentId: document.id, lines, expectedTotal: preview.total, expectedPaid: preview.paid, ...(document.kind === "sale" && deferStock ? { deferStock: true } : {}), ...(preview.paid > 0 ? { accountId, paymentMethod: account!.kind, ...(shiftId ? { shiftId } : {}) } : {}), note: note.trim() };
}

export function FinanceRefundForm({ directPosRefund = false, document, snapshot, pending, error, onCancel, onSubmit }: {
  directPosRefund?: boolean;
  document?: FinanceDocument; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void;
  onSubmit: (operation: "refund", payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t } = useFinancePosLocale();
  const directRefund = directPosRefund && snapshot.cafe.slug === "mind-hospital";
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [accountId, setAccountId] = useState(document?.account_id ?? "");
  const [shiftId, setShiftId] = useState(snapshot.shifts.find(shift => shift.account_id === document?.account_id && shift.status === "open")?.id ?? "");
  const [note, setNote] = useState("");
  const [deferStock, setDeferStock] = useState(false);
  const [localError, setLocalError] = useState("");
  const busy = useRef(false);
  if (!document || (!snapshot.canManage && document.kind !== "sale") || !["sale", "purchase"].includes(document.kind) || document.refunded) return <p className={styles.error} role="alert">{t("الفاتورة غير متاحة للإرجاع حدّث السجل ثم أعد المحاولة")}</p>;
  const preview = refundPreview(document, quantities);
  const accounts = snapshot.accounts.filter(account => account.active && (document.kind === "sale" ? ["cash", "bank"] : ["cash", "bank", "pos"]).includes(account.kind));
  const account = accounts.find(account => account.id === accountId);
  return <form className={`${styles.form} ${styles.invoiceForm}`} onSubmit={async event => {
    event.preventDefault(); if (pending || busy.current) return;
    setLocalError("");
    let payload;
    try { payload = refundPayload(document, quantities, accountId, note, snapshot, shiftId, deferStock); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : t("راجع بيانات المرتجع")); return; }
    busy.current = true;
    try { await onSubmit("refund", { ...payload, ...(directRefund ? { directPosRefund: true } : {}) }); } finally { busy.current = false; }
  }}>
    <p className={styles.muted}>{t("أدخل الكمية المراد إرجاعها فقط واترك بقية الأصناف على صفر")}</p>
    {document.kind === "sale" && <p className={styles.notice}>{directRefund ? t("يُسجل المرتجع وتُسوّى قيمته مباشرة عند الحفظ") : t("سيبقى الطلب معلقًا دون صرف أو تغيير الأرصدة والمخزون حتى يعتمد مالك العلامة المرتجع")}</p>}
    {(localError || error) && <p className={styles.error} role="alert">{t(localError || error)}</p>}
    <fieldset disabled={pending} className={styles.invoiceLayout}>
      <section className={`${styles.invoiceSection} ${styles.invoiceItems}`} aria-label={t("الأصناف المرتجعة")}>
        <div className={styles.invoiceSectionHeader}><h3 className={styles.invoiceHeading}>{t("الفاتورة الأصلية #")}{document.number}</h3><button type="button" className={styles.secondary} onClick={() => setQuantities(Object.fromEntries(preview.lines.map(row => [row.line.id, row.available])))}>{t("إرجاع جميع الكميات المتبقية")}</button></div>
        <div className={styles.invoiceTableWrap} role="region" aria-label={t("جدول الأصناف المرتجعة قابل للتمرير أفقيًا")} tabIndex={0}>
          <table className={`${styles.invoiceTable} ${styles.refundTable}`}><caption className={styles.srOnly}>{t("المبالغ المرتجعة بالريال بعد خصم وضريبة الفاتورة الأصلية")}</caption><thead><tr><th scope="col">{t("الصنف")}</th><th scope="col">{t("إرجاع")}</th><th scope="col">{t("المباعة")}</th><th scope="col">{t("أُرجعت")}</th><th scope="col">{t("المتبقية")}</th><th scope="col">{t("الضريبة")}</th><th scope="col">{t("قيمة المرتجع")}</th></tr></thead><tbody>
            {preview.lines.map(row => <tr key={row.line.id}><td>{t(t(row.line.name))}</td><td><Field label={t("الكمية المرتجعة من ") + (t(row.line.name))}><input type="number" inputMode="decimal" min="0" max={row.available} step="0.001" required disabled={row.available === 0} value={row.quantity} onChange={event => { setLocalError(""); setQuantities(current => ({ ...current, [row.line.id]: Number(event.target.value) })); }} /></Field></td><td><Numeric value={row.line.quantity} /></td><td><Numeric value={row.line.returned_quantity ?? 0} /></td><td><Numeric value={row.available} /></td><td><Numeric value={row.tax} /></td><td><strong><Numeric value={row.total} /></strong></td></tr>)}
          </tbody></table>
        </div>
        <p className={styles.invoiceScrollHint}>{t("اسحب الجدول لعرض بقية الأعمدة")}</p>
      </section>
      <section className={`${styles.invoiceSection} ${styles.invoiceSummary}`} aria-label={t("تسوية المرتجع")}>
        <div className={styles.invoicePaymentFields}>
          {preview.paid > 0 && <Field label={document.kind === "sale" ? t("طريقة إعادة المبلغ وحساب الدفع") : t("حساب استلام المبلغ من المورد")}><select required value={accountId} onChange={event => { setAccountId(event.target.value); setShiftId(snapshot.shifts.find(shift => shift.account_id === event.target.value && shift.status === "open")?.id ?? ""); }}><option value="">{t("اختر الحساب")}</option>{accounts.map(account => <option value={account.id} key={account.id}>{account.kind === "cash" ? t("نقدًا") : account.kind === "bank" ? t("تحويل بنكي") : t("نقاط البيع")} — {t(account.name)}</option>)}</select></Field>}
          {preview.paid > 0 && account?.kind === "cash" && document.kind === "sale" && <Field label={t("مصدر النقدية")} hint={directRefund ? t("يخصم المبلغ من الصندوق المحدد عند حفظ المرتجع") : t("يخصم من الصندوق المحدد بعد اعتماد المالك")}><select value={shiftId} onChange={event => setShiftId(event.target.value)}><option value="" disabled={snapshot.shifts.some(shift => shift.account_id === accountId && shift.status === "open")}>{t("رصيد خزينة الصندوق")}</option>{snapshot.shifts.filter(shift => shift.account_id === accountId && shift.status === "open").map(shift => <option key={shift.id} value={shift.id}>{t("عهدة وردية ")}{snapshot.staff.find(staff => staff.user_id === shift.user_id)?.name ?? t("الموظف الحالي")}</option>)}</select></Field>}
          <Field label={t("سبب المرتجع")}><textarea required maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder={t("اكتب سبب إرجاع الأصناف")} /></Field>
          {document.kind === "sale" && <div><label className={styles.check}><input type="checkbox" checked={deferStock} onChange={event => setDeferStock(event.target.checked)} />{t("تأكيد استلام البضاعة لاحقًا")}</label><p className={styles.muted}>{directRefund ? (deferStock ? t("تُسوّى القيمة عند الحفظ وتبقى البضاعة بانتظار تأكيد الاستلام") : t("تُسوّى القيمة وتعود الكميات إلى المخزون عند الحفظ")) : deferStock ? t("بعد اعتماد المالك يُرحّل المبلغ وتبقى البضاعة بانتظار تأكيد الاستلام من الفواتير المرتجعة") : t("اعتماد المالك يعيد المبلغ والكميات إلى المخزون معًا")}</p></div>}
        </div>
        <div className={styles.invoicePaymentFields}>
          <div><div className={styles.balanceLine}><span>{t("ضريبة الأصناف المرتجعة")}</span><Numeric value={preview.tax} money /></div><div className={styles.balanceLine}><span>{t("تخفيض المبلغ الآجل")}</span><Numeric value={preview.debt} money /></div><div className={styles.balanceLine}><span>{document.kind === "sale" ? t("المبلغ المعاد للعميل") : t("المبلغ المسترد من المورد")}</span><Numeric value={preview.paid} money /></div><div className={styles.balanceLine}><strong>{t("إجمالي المرتجع")}</strong><strong><Numeric value={preview.total} money /></strong></div></div>
          <div className={styles.invoiceFooter}><button type="submit" className={styles.primary} disabled={!preview.lines.some(row => row.quantity > 0)}>{pending ? t("جار حفظ الطلب") : document.kind === "sale" && !directRefund ? t("إرسال لاعتماد المالك") : t("حفظ فاتورة المرتجع")}</button><button type="button" className={styles.secondary} onClick={onCancel}>{t("إلغاء")}</button></div>
        </div>
      </section>
    </fieldset>
  </form>;
}
