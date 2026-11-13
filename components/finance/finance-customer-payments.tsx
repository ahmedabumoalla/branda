"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { readCustomerPaymentAction, readCustomerPaymentsAction } from "@/app/actions/finance-customer-payments";
import { customerPaymentFiltersSchema, normalizeCustomerPaymentNumber, type CustomerPaymentDetail, type CustomerPaymentFilters, type CustomerPaymentRow } from "@/lib/finance/customer-payment";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { paymentReceiptData, type PaymentReceiptData } from "@/lib/finance/payment-receipt";
import { FinancePaymentDetail } from "./finance-payment-detail";
import { FinancePaymentEditor } from "./finance-payment-editor";
import { PaymentReceiptDialog } from "./payment-receipt-dialog";
import { Field, Numeric, financeDate } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";

const methods = { cash: "نقدي", bank: "تحويل بنكي", pos: "نقاط البيع", credit: "رصيد مقدم" };
const statuses = { completed: "مكتمل", pending: "معلق", deleted: "محذوف" };
const invoiceStatuses = { paid: "مدفوعة", partial: "مدفوعة جزئيًا", unpaid: "غير مدفوعة", returned: "مرتجعة" };
const emptyFilters: CustomerPaymentFilters = { offset: 0, limit: 30, sort: "newest" };

export function navigateCustomerPayments(id?: string, view = id ? "payment-detail" : "payments") {
  const params = new URLSearchParams({ section: "sales", view });
  if (id) params.set("payment", id);
  window.history.pushState(null, "", `/dashboard/finance?${params}`);
}

export function FinanceCustomerPayments({ snapshot, view, paymentId, disabled, onChanged, onInvoice, onCustomer, onJournal }: {
  snapshot: FinanceSnapshot; view: string; paymentId: string | null; disabled: boolean; onChanged: () => void;
  onInvoice: (id: string) => void; onCustomer: (id: string, paymentId: string) => void; onJournal: (id: string, paymentId: string) => void;
}) {
  const [draft, setDraft] = useState({ query: "", invoiceNumber: "", paymentNumber: "", partyId: "", method: "", status: "", from: "", to: "", sort: "newest" });
  const [advanced, setAdvanced] = useState(false);
  const [filters, setFilters] = useState<CustomerPaymentFilters>(emptyFilters);
  const [filterError, setFilterError] = useState("");
  const [revision, setRevision] = useState(0);
  const list = view === "payments";
  const requestKey = JSON.stringify([snapshot.cafe.id, snapshot.userId, snapshot.role, view, paymentId, filters, revision]);
  const [result, setResult] = useState<{ key: string; items: CustomerPaymentRow[]; total: number; detail?: CustomerPaymentDetail; error: string }>({ key: "", items: [], total: 0, error: "" });
  const [receipt, setReceipt] = useState<{ key: string; data: PaymentReceiptData; mode: "standard" | "thermal" } | null>(null);
  const allowed = canFinance(snapshot.role, "reports");
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    async function read() {
      if (!list) {
        const response = await readCustomerPaymentAction(paymentId ?? "", snapshot.cafe.slug);
        if (active) setResult(response.ok ? { key: requestKey, items: [], total: 0, detail: response.data, error: "" } : { key: requestKey, items: [], total: 0, error: response.message });
      } else {
        const response = await readCustomerPaymentsAction(snapshot.cafe.slug, filters);
        if (active) setResult(response.ok ? { key: requestKey, items: response.data.items, total: response.data.total, error: "" } : { key: requestKey, items: [], total: 0, error: response.message });
      }
    }
    void read().catch(() => { if (active) setResult({ key: requestKey, items: [], total: 0, error: "تعذر تحميل مدفوعات العملاء أعد المحاولة" }); });
    return () => { active = false; };
  }, [allowed, snapshot.cafe.slug, list, paymentId, filters, requestKey]);
  const loading = result.key !== requestKey;
  const record = !loading ? result.detail : undefined;
  const editing = view === "payment-edit" || view === "payment-delete";
  const preview = receipt?.key === requestKey ? receipt : null;
  const mayEdit = !disabled && canFinance(snapshot.role, "accounting_write");
  const offset = filters.offset ?? 0;
  const applyFilters = () => {
    const input = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value ? ["query", "invoiceNumber", "paymentNumber"].includes(key) ? normalizeCustomerPaymentNumber(value) : value : undefined]));
    const parsed = customerPaymentFiltersSchema.safeParse({ ...input, offset: 0, limit: 30 });
    if (!parsed.success) { setFilterError("راجع أرقام البحث وتأكد أن تاريخ البداية لا يتجاوز تاريخ النهاية"); return; }
    setFilterError(""); setFilters(parsed.data);
  };
  const reset = () => { setDraft({ query: "", invoiceNumber: "", paymentNumber: "", partyId: "", method: "", status: "", from: "", to: "", sort: "newest" }); setFilterError(""); setFilters({ ...emptyFilters }); };
  const field = (name: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [name]: value }));
  if (!allowed) return <p className={styles.notice}>لا تملك صلاحية عرض مدفوعات العملاء</p>;
  return <div className={css.page}>
    <div className={css.page} inert={!!preview}>
      {list && <>
        <div className={css.bar}><div><h2>مدفوعات العملاء</h2><p>كل دفعة مرتبطة بفاتورتها مع المبلغ وطريقة التحصيل والحالة</p></div><button type="button" className={styles.secondary} disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />تحديث</button></div>
        <form className={css.panel} onSubmit={event => { event.preventDefault(); applyFilters(); }}>
          <div className={css.panelHead}><h2>بحث</h2><button type="button" className={styles.secondary} aria-expanded={advanced} aria-controls="payment-advanced-search" onClick={() => setAdvanced(value => !value)}>بحث متقدم</button></div>
          <div className={css.fields}>
            <Field label="العميل أو مرجع الدفع"><input type="search" maxLength={100} value={draft.query} onChange={event => field("query", event.target.value)} /></Field>
            <Field label="حالة الدفع"><select value={draft.status} onChange={event => field("status", event.target.value)}><option value="">المكتملة والمعلقة</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          </div>
          <div id="payment-advanced-search" className={css.fields} hidden={!advanced} style={advanced ? undefined : { display: "none" }}>
            <Field label="العميل"><select value={draft.partyId} onChange={event => field("partyId", event.target.value)}><option value="">كل العملاء</option>{snapshot.parties.filter(party => party.kind === "customer").map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
            <Field label="رقم الفاتورة"><input maxLength={40} value={draft.invoiceNumber} onChange={event => field("invoiceNumber", event.target.value)} /></Field>
            <Field label="رقم عملية الدفع"><input inputMode="numeric" maxLength={24} value={draft.paymentNumber} onChange={event => field("paymentNumber", event.target.value)} /></Field>
            <Field label="طريقة الدفع"><select value={draft.method} onChange={event => field("method", event.target.value)}><option value="">كل الطرق</option>{Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="من تاريخ"><input type="date" value={draft.from} onChange={event => field("from", event.target.value)} /></Field>
            <Field label="إلى تاريخ"><input type="date" min={draft.from || undefined} value={draft.to} onChange={event => field("to", event.target.value)} /></Field>
            <Field label="الترتيب"><select value={draft.sort} onChange={event => field("sort", event.target.value)}><option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option><option value="amount_desc">المبلغ الأعلى</option><option value="amount_asc">المبلغ الأقل</option></select></Field>
          </div>
          {filterError && <p className={styles.error} role="alert">{filterError}</p>}
          <div className={css.footer}><div className={css.actions}><button type="submit" className={styles.primary} disabled={loading}><Search size={16} aria-hidden="true" />بحث</button><button type="button" className={styles.secondary} onClick={reset}>إلغاء الفلتر</button></div></div>
        </form>
      </>}
      {loading ? <p className={styles.notice} role="status">جار تحميل مدفوعات العملاء</p> : result.error ? <section className={css.panel}><p className={styles.error} role="alert">{result.error}</p><div className={css.toolbar}><button type="button" className={styles.secondary} onClick={() => setRevision(value => value + 1)}>إعادة المحاولة</button>{!list && <button type="button" className={styles.secondary} onClick={() => navigateCustomerPayments()}>المدفوعات</button>}</div></section> : record ? editing ?
        <FinancePaymentEditor key={`${record.payment.id}:${record.payment.revision}:${(view === "payment-delete")}`} payment={record.payment} invoiceNumber={record.detail.document.number} snapshot={snapshot} collectors={record.detail.paymentCollectors} deleting={(view === "payment-delete")} disabled={!mayEdit} onCancel={() => navigateCustomerPayments(record.payment.id)} onSaved={() => { setReceipt(null); setRevision(value => value + 1); navigateCustomerPayments(record.payment.id); onChanged(); }} /> :
        <FinancePaymentDetail document={record.document} detail={record.detail} snapshot={snapshot} disabled={disabled} onBack={() => navigateCustomerPayments()} onInvoice={() => onInvoice(record.detail.document.id)} onCustomer={id => onCustomer(id, record.payment.id)} onJournal={id => onJournal(id, record.payment.id)} onEdit={mayEdit ? payment => { if (payment.canEdit) navigateCustomerPayments(payment.id, "payment-edit"); } : undefined} onDelete={mayEdit ? payment => { if (payment.canDelete) navigateCustomerPayments(payment.id, "payment-delete"); } : undefined} onReceipt={mode => { if (!disabled && record.payment.status === "completed" && record.payment.amount > 0) setReceipt({ key: requestKey, data: paymentReceiptData(record.document, record.detail, snapshot), mode }); }} /> :
        <section className={css.panel}>
          <div className={css.panelHead}><h2>سجل المدفوعات</h2><span role="status">{result.total} دفعة</span></div>
          <p className={css.hint}>المبالغ تخص الدفعات الفردية وحالة الفاتورة تشمل جميع دفعاتها والمرتجعات</p>
          {!result.items.length ? <div className={css.empty}><strong>لا توجد دفعات مطابقة</strong><p>تظهر الدفعات هنا عند تسجيل تحصيل على فواتير المبيعات</p><button type="button" className={styles.secondary} onClick={reset}>إلغاء الفلتر</button></div> : <div className={css.tableWrap} tabIndex={0} role="region" aria-label="سجل مدفوعات العملاء"><table className={css.table}><thead><tr>{["عملية الدفع", "العميل", "الفاتورة", "المبلغ", "الطريقة", "حالة الدفع", "حالة الفاتورة", "التاريخ", "الإجراء"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{result.items.map(row => <tr key={row.id}>
            <td><button type="button" className={css.number} onClick={() => navigateCustomerPayments(row.id)}>{row.initial ? "دفعة عند إصدار الفاتورة" : <bdi>#{String(row.number).padStart(6, "0")}</bdi>}</button>{row.reference && <small>{row.reference}</small>}</td>
            <td>{row.customerId ? <button type="button" className={css.number} onClick={() => onCustomer(row.customerId!, row.id)}>{row.customerName}</button> : row.customerName}</td>
            <td><button type="button" className={css.number} onClick={() => onInvoice(row.invoiceId)}><bdi>{row.invoiceDisplayNumber}</bdi></button></td>
            <td><Numeric value={row.amount} money />{row.status !== "completed" && <small>غير محتسب ضمن التحصيل</small>}</td><td>{methods[row.method] || "غير محددة"}<small>{row.accountName}</small></td>
            <td><span className={css.badge} data-status={row.status === "completed" ? "received" : row.status === "deleted" ? "rejected" : "pending"}>{statuses[row.status]}</span></td><td>{invoiceStatuses[row.invoiceStatus]}</td><td>{financeDate(row.date)}</td><td><button type="button" className={styles.secondary} onClick={() => navigateCustomerPayments(row.id)}>عرض</button></td>
          </tr>)}</tbody></table></div>}
          <div className={css.footer}><span>الصفحة {Math.floor(offset / 30) + 1} من {Math.max(1, Math.ceil(result.total / 30))}</span><nav className={css.pagination} aria-label="صفحات مدفوعات العملاء"><button type="button" className={styles.secondary} disabled={offset === 0} onClick={() => setFilters(previous => ({ ...previous, offset: Math.max(0, offset - 30) }))}>السابق</button><button type="button" className={styles.secondary} disabled={offset + 30 >= result.total || offset + 30 > 100000} onClick={() => setFilters(previous => ({ ...previous, offset: offset + 30 }))}>التالي</button></nav></div>
        </section>}
    </div>
    {preview && <PaymentReceiptDialog key={`${preview.data.id}:${preview.mode}`} data={preview.data} initialMode={preview.mode} onClose={() => setReceipt(null)} />}
  </div>;
}
