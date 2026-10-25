"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { FinanceCustomerForm } from "./finance-customer-form";
import { getPrimaryFinanceAccount, previewFinanceTotals, type FinanceSnapshot } from "@/lib/finance/brand-finance";
import { FinanceOperationForm, type FinanceForm, type FinanceFormOperation } from "./finance-operation-form";
import { Field, Numeric } from "./finance-ui";
import styles from "./finance.module.css";

type Line = { key: number; productId: string; quantity: number };
type Invoice = { lines: Line[]; warehouseId: string; partyId: string; paymentKind: string; accountId: string; discountValue: number; discountKind: "amount" | "percent"; discountEnabled?: boolean; vatRate?: number; taxInclusive?: boolean; note: string };

export function invoicePreview(data: FinanceSnapshot, invoice: Invoice) {
  const lines = invoice.lines.map(line => ({ quantity: line.quantity, price: data.products.find(product => product.id === line.productId)?.price ?? 0 }));
  const subtotal = previewFinanceTotals(lines, 0, 0, false).subtotal;
  const discount = invoice.discountEnabled === false ? 0 : Math.round((invoice.discountKind === "percent" ? subtotal * invoice.discountValue / 100 : invoice.discountValue) * 100) / 100;
  return previewFinanceTotals(lines, discount, invoice.vatRate ?? data.settings.vat_rate, invoice.taxInclusive ?? data.settings.tax_inclusive);
}

/** Same proportional allocation and last-line rounding remainder as the posting transaction. */
export function invoiceLinePreview(data: FinanceSnapshot, invoice: Invoice) {
  const totals = invoicePreview(data, invoice);
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const net = round(totals.total - totals.tax);
  let remaining = net, taxLeft = totals.tax, discountLeft = totals.discount;
  return invoice.lines.map((line, index) => {
    const price = data.products.find(product => product.id === line.productId)?.price ?? 0;
    const gross = round(line.quantity * price);
    const weight = totals.subtotal > 0 ? line.quantity * price / totals.subtotal : 0;
    const last = index === invoice.lines.length - 1;
    const lineNet = last ? remaining : Math.min(remaining, round(net * weight));
    const tax = last ? taxLeft : Math.min(taxLeft, round(totals.tax * weight));
    const discount = last ? discountLeft : Math.min(discountLeft, round(totals.discount * (totals.subtotal > 0 ? gross / totals.subtotal : 0)));
    remaining = round(remaining - lineNet); taxLeft = round(taxLeft - tax);
    discountLeft = round(discountLeft - discount);
    return { price, tax, total: round(lineNet + tax), discount };
  });
}

export function invoicePayload(data: FinanceSnapshot, invoice: Invoice) {
  if (!data.canManage) throw new Error("لا تملك صلاحية إضافة فاتورة من الإدارة المالية");
  const shift = data.shifts.find(item => item.user_id === data.userId && item.status === "open");
  if (!shift) throw new Error("ابدأ وردية مالية قبل حفظ الفاتورة");
  if (!data.warehouses.some(item => item.id === invoice.warehouseId && item.active)) throw new Error("اختر مستودع البيع");
  if (!invoice.lines.length || invoice.lines.length > 100 || new Set(invoice.lines.map(line => line.productId)).size !== invoice.lines.length) throw new Error("أضف أصنافًا مختلفة للفاتورة");
  const lines = invoice.lines.map(line => {
    const product = data.products.find(item => item.id === line.productId && item.available);
    if (!product || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 9999) throw new Error("راجع الأصناف والكميات قبل الحفظ");
    if (product.stockTracked && line.quantity > (data.stock.find(item => item.item_id === product.itemId && item.warehouse_id === invoice.warehouseId)?.quantity ?? 0)) throw new Error(`الكمية المتاحة من ${product.name} أقل من المطلوب`);
    return { productId: product.id, quantity: line.quantity, expectedUnitPrice: product.price };
  });
  const totals = invoicePreview(data, invoice);
  if (invoice.discountEnabled !== false && (!Number.isFinite(invoice.discountValue) || invoice.discountValue < 0 || totals.discount > totals.subtotal || (invoice.discountKind === "percent" && invoice.discountValue > 100))) throw new Error("الخصم يجب ألا يتجاوز قيمة الفاتورة");
  const vatRate = invoice.vatRate ?? data.settings.vat_rate;
  const taxInclusive = invoice.taxInclusive ?? data.settings.tax_inclusive;
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || Math.abs(vatRate * 100 - Math.round(vatRate * 100)) > 0.000001 || typeof taxInclusive !== "boolean") throw new Error("أدخل نسبة ضريبة من ٠ إلى ١٠٠ بمنزلتين عشريتين كحد أقصى");
  if (invoice.partyId && !data.parties.some(party => party.id === invoice.partyId && party.kind === "customer" && party.active)) throw new Error("اختر عميلًا نشطًا");
  if (!["cash", "bank", "pos", "credit"].includes(invoice.paymentKind)) throw new Error("اختر طريقة السداد");
  if (invoice.paymentKind === "credit" && !invoice.partyId) throw new Error("اختر العميل لحفظ الفاتورة الآجلة");
  if (invoice.paymentKind !== "credit" && !data.accounts.some(account => account.id === invoice.accountId && account.active && account.kind === invoice.paymentKind && (account.kind !== "cash" || account.id === shift.account_id))) throw new Error("اختر حساب تحصيل صالحًا لطريقة السداد");
  return { lines, warehouseId: invoice.warehouseId, shiftId: shift.id, ...(invoice.partyId ? { partyId: invoice.partyId } : {}), ...(invoice.paymentKind !== "credit" ? { accountId: invoice.accountId } : {}), discount: totals.discount, vatRate, taxInclusive, expectedTotal: totals.total, note: invoice.note.trim() };
}

export function FinanceSaleForm({ snapshot: data, pending, stale, error, onCancel, onSubmit }: {
  snapshot: FinanceSnapshot; pending: boolean; stale: boolean; error: string; onCancel: () => void;
  onSubmit: (operation: FinanceFormOperation, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [invoice, setInvoice] = useState<Invoice>({ lines: [{ key: 1, productId: "", quantity: 1 }], warehouseId: data.warehouses.find(item => item.active)?.id ?? "", partyId: "", paymentKind: "cash", accountId: "", discountKind: "amount", discountValue: 0, discountEnabled: false, vatRate: data.settings.vat_rate, taxInclusive: data.settings.tax_inclusive, note: "" });
  const [localError, setLocalError] = useState("");
  const [shiftForm, setShiftForm] = useState<FinanceForm | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const submitting = useRef(false);
  const disabled = pending || stale;
  const shift = data.shifts.find(item => item.user_id === data.userId && item.status === "open");
  const outgoing = data.shifts.some(item => item.user_id === data.userId && item.status === "handover");
  const incoming = data.shifts.filter(item => item.handover_to === data.userId && item.status === "handover");
  const accounts = data.accounts.filter(account => account.active && account.kind === invoice.paymentKind && (account.kind !== "cash" || account.id === shift?.account_id));
  const accountId = accounts.some(account => account.id === invoice.accountId) ? invoice.accountId : getPrimaryFinanceAccount(accounts)?.id ?? "";
  const totals = invoicePreview(data, invoice);
  const lineTotals = invoiceLinePreview(data, invoice);
  const patch = (values: Partial<Invoice>) => { setLocalError(""); setInvoice(current => ({ ...current, ...values })); };
  const patchLine = (key: number, values: Partial<Line>) => patch({ lines: invoice.lines.map(line => line.key === key ? { ...line, ...values } : line) });

  if (!data.canManage) return <p role="alert" className={styles.error}>لا تملك صلاحية إضافة فاتورة من الإدارة المالية</p>;
  if (shiftForm) return <FinanceOperationForm form={shiftForm} snapshot={data} pending={disabled} error={error} onCancel={() => setShiftForm(null)} onSubmit={async (operation, payload) => { if (disabled) return false; const saved = await onSubmit(operation, payload); if (saved) setShiftForm(null); return saved; }} />;

  return <><form inert={customerOpen} className={`${styles.form} ${styles.invoiceForm}`} onSubmit={async event => {
    event.preventDefault(); if (disabled || submitting.current) return;
    setLocalError("");
    let payload: Record<string, unknown>;
    try { payload = invoicePayload(data, { ...invoice, accountId }); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : "راجع بيانات الفاتورة"); return; }
    submitting.current = true;
    try { await onSubmit("sale", payload); }
    finally { submitting.current = false; }
  }}>
    {(localError || error) && <p className={styles.error} role="alert">{localError || error}</p>}
    {stale && <p className={styles.notice}>حدّث الأرصدة قبل حفظ فاتورة جديدة</p>}
    {!shift && <div className={styles.notice}><p>{outgoing ? "وردية سابقة بانتظار الاستلام أكمل تسليمها قبل إضافة فاتورة" : "تحتاج الفاتورة إلى وردية مفتوحة لربط التحصيل بالصندوق"}</p><div className={styles.actions}>
      {!outgoing && !incoming.length && <button type="button" className={styles.secondary} disabled={disabled} onClick={() => setShiftForm({ operation: "shift_open", title: "بداية وردية مالية" })}>بدء وردية من هنا</button>}
      {!outgoing && incoming.map(item => <button key={item.id} type="button" className={styles.secondary} disabled={disabled} onClick={() => setShiftForm({ operation: "shift_accept", title: "استلام الوردية", values: { shiftId: item.id, expectedCash: item.counted_cash ?? item.expected_cash } })}>استلام وردية {data.accounts.find(account => account.id === item.account_id)?.name}</button>)}
    </div></div>}
    <fieldset disabled={disabled} className={styles.invoiceLayout}>
      <div className={styles.invoiceMain}>
      <section className={styles.invoiceSection} aria-label="بيانات الفاتورة">
      <h3 className={styles.invoiceHeading}>بيانات الفاتورة</h3>
      <div className={styles.fields}>
        <div className={styles.invoiceCustomer}><Field label="العميل"><select value={invoice.partyId} required={invoice.paymentKind === "credit"} onChange={event => patch({ partyId: event.target.value })}><option value="">عميل نقدي</option>{data.parties.filter(party => party.active && party.kind === "customer").map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field><button type="button" className={styles.secondary} onClick={() => setCustomerOpen(true)}><Plus size={16} aria-hidden="true" />إضافة عميل</button></div>
        <Field label="مستودع البيع"><select value={invoice.warehouseId} required onChange={event => patch({ warehouseId: event.target.value })}><option value="">اختر المستودع</option>{data.warehouses.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      </div>
      </section>
      <section className={`${styles.invoiceSection} ${styles.invoiceItems}`} aria-label="أصناف الفاتورة">
      <div className={styles.invoiceSectionHeader}><h3 className={styles.invoiceHeading}>أصناف الفاتورة <span className={styles.badge}>{invoice.lines.length}</span></h3><span className={styles.muted}>المبالغ بالريال</span></div>
      <div className={styles.invoiceTableWrap} role="region" aria-label="جدول أصناف الفاتورة قابل للتمرير أفقيًا" tabIndex={0}>
      <table className={styles.invoiceTable}>
      <caption className={styles.srOnly}>تفاصيل الأصناف والخصم والضريبة بالريال</caption>
      <thead><tr><th scope="col">الصنف</th><th scope="col">الكمية</th><th scope="col">سعر الوحدة</th><th scope="col">الخصم</th><th scope="col">الضريبة %</th><th scope="col">مبلغ الضريبة</th><th scope="col">الإجمالي</th><th scope="col"><span className={styles.srOnly}>حذف</span></th></tr></thead>
      <tbody>
      {invoice.lines.map((line, index) => {
        const amounts = lineTotals[index];
        return <tr key={line.key}>
          <td><Field label={`الصنف ${index + 1}`}><select required value={line.productId} onChange={event => patchLine(line.key, { productId: event.target.value })}><option value="">اختر الصنف</option>{data.products.filter(item => item.available).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></td>
          <td><Field label={`الكمية ${index + 1}`}><input type="number" inputMode="decimal" min="0.001" max="9999" step="0.001" required value={line.quantity} onChange={event => patchLine(line.key, { quantity: Number(event.target.value) })} /></Field></td>
          <td><span className={styles.invoiceCellLabel}>سعر الوحدة</span><Numeric value={amounts.price} /></td>
          <td><span className={styles.invoiceCellLabel}>الخصم</span><Numeric value={amounts.discount} /></td>
          <td><span className={styles.invoiceCellLabel}>الضريبة %</span><Numeric value={invoice.vatRate ?? 0} />%</td>
          <td><span className={styles.invoiceCellLabel}>مبلغ الضريبة</span><Numeric value={amounts.tax} /></td>
          <td><span className={styles.invoiceCellLabel}>الإجمالي</span><strong><Numeric value={amounts.total} /></strong></td>
          <td><button type="button" className={styles.iconButton} disabled={invoice.lines.length === 1} aria-label={`حذف الصنف ${index + 1}`} onClick={() => patch({ lines: invoice.lines.filter(item => item.key !== line.key) })}><Trash2 size={16} aria-hidden="true" /></button></td>
        </tr>;
      })}
      </tbody></table></div>
      <p className={styles.invoiceScrollHint}>اسحب الجدول لعرض بقية الأعمدة</p>
      <button type="button" className={styles.secondary} disabled={invoice.lines.length >= 100} onClick={() => patch({ lines: [...invoice.lines, { key: Math.max(...invoice.lines.map(line => line.key)) + 1, productId: "", quantity: 1 }] })}><Plus size={16} aria-hidden="true" />إضافة صنف</button>
      <p className={styles.muted}>الخصم والضريبة يطبّقان على الفاتورة ويظهر نصيب كل صنف في الجدول</p>
      </section>
      <section className={styles.invoiceSection} aria-label="ملاحظات الفاتورة">
      <Field label="ملاحظة الفاتورة" hint="اختياري"><textarea maxLength={500} placeholder="أضف تفاصيل تساعدك عند مراجعة الفاتورة" value={invoice.note} onChange={event => patch({ note: event.target.value })} /></Field>
      </section>
      </div>
      <section className={`${styles.invoiceSection} ${styles.invoiceSummary}`} aria-label="السداد وملخص الفاتورة">
      <div className={styles.invoicePaymentFields}>
      <h3 className={styles.invoiceHeading}>السداد وملخص الفاتورة</h3>
      <div className={styles.invoiceTaxFields}>
        <Field label="نسبة الضريبة %"><input type="number" inputMode="decimal" min="0" max="100" step="0.01" required value={invoice.vatRate} onChange={event => patch({ vatRate: Number(event.target.value) })} /></Field>
        <Field label="مبلغ الضريبة"><output className={styles.invoiceTaxAmount}><Numeric value={totals.tax} money /></output></Field>
      </div>
      <label className={styles.check}><input type="checkbox" checked={invoice.taxInclusive} onChange={event => patch({ taxInclusive: event.target.checked })} />السعر شامل الضريبة</label>
      <label className={styles.check}><input type="checkbox" checked={invoice.discountEnabled} onChange={event => patch({ discountEnabled: event.target.checked })} />يوجد خصم على الفاتورة</label>
      {invoice.discountEnabled && <div className={styles.fields}>
        <Field label="الخصم"><input type="number" inputMode="decimal" min="0" max={invoice.discountKind === "percent" ? 100 : totals.subtotal} step="0.01" required value={invoice.discountValue} onChange={event => patch({ discountValue: Number(event.target.value) })} /></Field>
        <Field label="نوع الخصم"><select value={invoice.discountKind} onChange={event => patch({ discountKind: event.target.value === "percent" ? "percent" : "amount" })}><option value="amount">مبلغ بالريال</option><option value="percent">نسبة مئوية</option></select></Field>
      </div>}
      <div className={styles.fields}>
        <Field label="طريقة السداد"><select value={invoice.paymentKind} onChange={event => patch({ paymentKind: event.target.value, accountId: "" })}><option value="cash">نقدي</option><option value="pos">نقطة بيع</option><option value="bank">تحويل بنكي</option><option value="credit">آجل على العميل</option></select></Field>
        {invoice.paymentKind !== "credit" && <Field label="حساب التحصيل"><select required value={accountId} onChange={event => patch({ accountId: event.target.value })}><option value="">اختر الحساب</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>}
      </div>
      </div>
      <div className={styles.invoicePaymentFields}>
      <div><div className={styles.balanceLine}><span>قبل الخصم</span><Numeric value={totals.subtotal} money /></div><div className={styles.balanceLine}><span>الخصم</span><Numeric value={totals.discount} money /></div><div className={styles.balanceLine}><span>الضريبة {invoice.vatRate}% {invoice.taxInclusive ? "ضمن السعر" : "تضاف للسعر"}</span><Numeric value={totals.tax} money /></div><div className={styles.balanceLine}><strong>إجمالي الفاتورة</strong><strong><Numeric value={totals.total} money /></strong></div></div>
      <div className={styles.invoiceFooter}><button type="submit" className={styles.primary} disabled={!shift}>{pending ? "جار حفظ الفاتورة" : "حفظ الفاتورة"}</button><button type="button" className={styles.secondary} onClick={onCancel}>إلغاء</button></div>
      </div>
      </section>
    </fieldset>
  </form><div onKeyDown={event => event.stopPropagation()}><Modal open={customerOpen} title="إضافة عميل" onClose={() => { if (!pending) setCustomerOpen(false); }} panelClassName="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
    {customerOpen && <FinanceCustomerForm pending={disabled} error={error} onCancel={() => { if (!pending) setCustomerOpen(false); }} onSubmit={onSubmit} onSaved={id => { patch({ partyId: id }); setCustomerOpen(false); }} />}
  </Modal></div></>;
}
