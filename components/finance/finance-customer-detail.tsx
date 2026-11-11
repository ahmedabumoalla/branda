"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, FilePlus2, FileText, Pencil, Plus, RefreshCw, UserRound } from "lucide-react";
import { fetchCustomerDetailAction } from "@/app/actions/finance-customer-detail";
import type { CustomerDetail, CustomerDetailTab } from "@/lib/finance/customer-detail";
import type { FinanceParty, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { quoteStatus, quoteStatusLabels } from "@/lib/finance/quotation";
import { documentKindNames, financeDate, financeDocumentStatus, Numeric } from "./finance-ui";
import styles from "./finance-customer-detail.module.css";
import { CustomerCreditPanel } from "./customer-credit-panel";

const tabs = [["details", "التفاصيل"], ["invoices", "الفواتير"], ["payments", "المدفوعات"], ["quotes", "عروض الأسعار"], ["messages", "الرسائل المرسلة"], ["balance", "ملخص الرصيد"], ["timeline", "الخط الزمني"]] as const;
const paymentLabels = { completed: "مكتمل", pending: "معلق", deleted: "محذوف" };
const messageLabels: Record<string, string> = { pending: "بانتظار الإرسال", queued: "تم قبول الإرسال", processing: "قيد الإرسال", sending: "قيد الإرسال", sent: "مرسلة", delivered: "تم التسليم", read: "تمت القراءة", failed: "تعذر الإرسال", cancelled: "ملغاة", skipped: "لم ترسل" };
const deliveryLabels: Record<string, string> = { pending: "بانتظار التسليم", sent: "مرسلة", delivered: "تم التسليم", read: "تمت القراءة", failed: "تعذر التسليم", yellowCard: "تحذير في التسليم" };
const number = (value: number) => String(value).padStart(6, "0");
function Fact({ label, children }: { label: string; children: ReactNode }) { return <div><dt>{label}</dt><dd>{children || "غير مسجل"}</dd></div>; }

type Props = {
  id: string; snapshot: FinanceSnapshot; disabled: boolean; onBack: () => void;
  onInvoice: (id: string) => void; onPayment: (invoiceId: string, paymentId: string) => void;
  onEdit?: (customer: FinanceParty) => void; onCreateInvoice?: (customer: FinanceParty) => void; onCreateQuote?: (customer: FinanceParty) => void;
  onQuote?: (id: string) => void; onJournal?: (documentId: string) => void;
};

export function FinanceCustomerDetail({ id, snapshot, disabled, onBack, onInvoice, onPayment, onEdit, onCreateInvoice, onCreateQuote, onQuote, onJournal }: Props) {
  const [selection, setSelection] = useState<{ tab: CustomerDetailTab; page: number }>({ tab: "details", page: 1 });
  const [revision, setRevision] = useState(0);
  const [creditOpen, setCreditOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ id: string; selection: typeof selection; revision: number; snapshot: FinanceSnapshot; data?: CustomerDetail; error?: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  useEffect(() => { heading.current?.focus(); }, [id]);
  useEffect(() => {
    let active = true;
    fetchCustomerDetailAction(id, selection.tab, selection.page, snapshot.cafe.slug).then(result => {
      if (active) setLoaded({ id, selection, revision, snapshot, ...(result.ok ? { data: result.data } : { error: result.message }) });
    }).catch(() => { if (active) setLoaded({ id, selection, revision, snapshot, error: "تعذر تحميل بيانات العميل أعد المحاولة" }); });
    return () => { active = false; };
  }, [id, selection, revision, snapshot]);
  const current = loaded?.id === id ? loaded : null;
  const loading = !current || current.selection !== selection || current.revision !== revision || current.snapshot !== snapshot;
  const data = current?.data;
  const customer = data?.customer;
  const blocked = disabled || loading || !!current?.error;
  const write = canFinance(snapshot.role, "accounting_write");
  const active = customer?.active ?? false;
  const changeTab = (tab: CustomerDetailTab) => setSelection({ tab, page: 1 });
  const openInvoice = (invoiceId: string) => { if (!blocked) onInvoice(invoiceId); };
  const openPayment = (invoiceId: string, paymentId: string) => { if (!blocked) onPayment(invoiceId, paymentId); };
  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex(([tab]) => tab === selection.tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowLeft" ? (index + 1) % tabs.length : event.key === "ArrowRight" ? (index + tabs.length - 1) % tabs.length : -1;
    if (next < 0) return;
    event.preventDefault(); changeTab(tabs[next][0]);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }
  const link = (label: ReactNode, action: () => void) => <button type="button" className={styles.link} disabled={blocked} onClick={() => { if (!blocked) action(); }}>{label}</button>;
  const empty = (label: string) => <p className={styles.empty}>{label}</p>;

  return <section className={styles.page} dir="rtl" aria-label="تفاصيل العميل" aria-busy={loading}>
    <header className={styles.header}><div className={styles.identity}><span className={styles.avatar} aria-hidden="true"><UserRound size={25} /></span><div><h2 ref={heading} tabIndex={-1}>{customer?.name || "بيانات العميل"}</h2>{customer && <span className={styles.badge} data-active={active}>{active ? "نشط" : "غير نشط"}</span>}</div></div><div className={styles.balanceHeading}><span>الرصيد الحالي</span>{data ? <strong><Numeric value={data.summary.balance} money /></strong> : <strong>—</strong>}</div></header>
    <div className={styles.namePanel}><strong>{customer?.name || "جار تحميل بيانات العميل"}</strong><button type="button" onClick={onBack}><ArrowRight size={16} aria-hidden="true" />العودة</button></div>
    <div className={styles.actionbar}>
      {write && onEdit && <button type="button" className={styles.primary} disabled={blocked || !customer} onClick={() => { if (!blocked && customer) onEdit(customer); }}><Pencil size={15} aria-hidden="true" />تعديل</button>}
      {write && onCreateInvoice && <button type="button" disabled={blocked || !active} onClick={() => { if (!blocked && active && customer) onCreateInvoice(customer); }}><FilePlus2 size={15} aria-hidden="true" />إنشاء فاتورة</button>}
      {write && onCreateQuote && <button type="button" disabled={blocked || !active} onClick={() => { if (!blocked && active && customer) onCreateQuote(customer); }}><Plus size={15} aria-hidden="true" />إنشاء عرض سعر</button>}
      <button type="button" disabled={blocked} onClick={() => { if (!blocked) changeTab("balance"); }}><FileText size={15} aria-hidden="true" />كشف حساب</button>
      <button type="button" disabled={blocked} onClick={() => { if (!blocked) setCreditOpen(true); }}><Plus size={15} aria-hidden="true" />الرصيد المقدم</button>
      <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} aria-hidden="true" />تحديث</button>
    </div>
    {creditOpen && <CustomerCreditPanel key={id} partyId={id} snapshot={snapshot} disabled={disabled} onClose={() => setCreditOpen(false)} onChanged={() => setRevision(value => value + 1)} onInvoice={onInvoice} />}
    <div className={styles.tabs} role="tablist" aria-label="سجل العميل">{tabs.map(([tab, label]) => <button type="button" key={tab} id={`${uid}-${tab}`} role="tab" aria-selected={selection.tab === tab} aria-controls={`${uid}-panel`} tabIndex={selection.tab === tab ? 0 : -1} onClick={() => changeTab(tab)} onKeyDown={moveTab}>{label}{data && ["invoices", "payments", "quotes", "messages"].includes(tab) && <span>{data.counts[tab as keyof CustomerDetail["counts"]]}</span>}</button>)}</div>
    <div className={styles.content} id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${selection.tab}`} tabIndex={0}>
      {loading ? <p className={styles.empty} role="status">جار تحميل سجل العميل</p> : current?.error ? <div className={styles.error} role="alert"><p>{current.error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>إعادة المحاولة</button></div> : !data || !customer ? empty("العميل غير متاح") : <>
        {selection.tab === "details" && <div className={styles.overview}><section className={styles.panel}><h3>معلومات مختصرة</h3><dl className={styles.facts}>
          <Fact label="عدد الفواتير"><Numeric value={data.counts.invoices} /></Fact><Fact label="فواتير غير مسددة"><Numeric value={data.summary.unpaidCount} /></Fact>
          <Fact label="آخر فاتورة">{data.summary.lastInvoice ? <>{link(<bdi>#{number(data.summary.lastInvoice.number)}</bdi>, () => openInvoice(data.summary.lastInvoice!.id))}<Numeric value={data.summary.lastInvoice.total} money /><small>{financeDate(data.summary.lastInvoice.date)}</small></> : "لا توجد فواتير"}</Fact>
          <Fact label="آخر دفعة">{data.summary.lastPayment ? <>{link(data.summary.lastPayment.initial ? "دفعة عند إصدار الفاتورة" : <bdi>#{number(data.summary.lastPayment.number)}</bdi>, () => openPayment(data.summary.lastPayment!.invoiceId, data.summary.lastPayment!.id))}<Numeric value={data.summary.lastPayment.amount} money /><small>{financeDate(data.summary.lastPayment.date)}</small></> : "لا توجد دفعات"}</Fact>
          <Fact label="آخر رسالة مرسلة">{data.summary.lastMessage ? financeDate(data.summary.lastMessage.finishedAt || data.summary.lastMessage.createdAt) : "لا توجد رسائل مرسلة"}</Fact>
        </dl></section><section className={styles.panel}><h3>بيانات العميل</h3><dl className={styles.facts}><Fact label="الاسم">{customer.name}</Fact><Fact label="الجوال"><bdi>{customer.phone || "غير مسجل"}</bdi></Fact><Fact label="البريد الإلكتروني"><bdi>{customer.email || "غير مسجل"}</bdi></Fact><Fact label="الرقم الضريبي"><bdi>{customer.tax_number || "غير مسجل"}</bdi></Fact><Fact label="المدينة">{customer.details?.city}</Fact><Fact label="المنطقة">{customer.details?.region}</Fact><Fact label="البلد">{customer.details?.country}</Fact></dl></section>
          <div className={styles.metrics}><div><span>إجمالي الفواتير</span><strong><Numeric value={data.summary.invoiceTotal} money /></strong></div><div><span>المرتجعات</span><strong><Numeric value={data.summary.refundedTotal} money /></strong></div><div><span>المبلغ المحصل</span><strong><Numeric value={data.summary.collected} money /></strong></div><div><span>المستحق على الفواتير</span><strong><Numeric value={data.summary.outstanding} money /></strong></div></div>
        </div>}
        {selection.tab === "invoices" && (data.invoices.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="فواتير العميل"><table><caption>فواتير العميل</caption><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{data.invoices.map(invoice => <tr key={invoice.id}><td>{link(<bdi>#{number(invoice.number)}</bdi>, () => openInvoice(invoice.id))}</td><td>{financeDate(invoice.created_at)}</td><td><Numeric value={invoice.total} money /></td><td><Numeric value={invoice.outstanding} money /></td><td>{financeDocumentStatus(invoice)}</td></tr>)}</tbody></table></div> : empty("لا توجد فواتير مرتبطة بهذا العميل"))}
        {selection.tab === "payments" && (data.payments.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="دفعات العميل"><table><caption>دفعات العميل</caption><thead><tr><th>عملية الدفع</th><th>الفاتورة</th><th>التاريخ</th><th>الحساب</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>{data.payments.map(payment => <tr key={payment.id}><td>{link(payment.initial ? "دفعة عند إصدار الفاتورة" : <bdi>#{number(payment.number)}</bdi>, () => openPayment(payment.invoiceId, payment.id))}</td><td>{link(<bdi>#{number(payment.invoiceNumber)}</bdi>, () => openInvoice(payment.invoiceId))}</td><td>{financeDate(payment.date)}</td><td>{payment.accountName || "غير مسجل"}</td><td><Numeric value={payment.amount} money /></td><td>{paymentLabels[payment.status]}</td></tr>)}</tbody></table></div> : empty("لا توجد دفعات مرتبطة بهذا العميل"))}
        {selection.tab === "quotes" && (data.quotes.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="عروض أسعار العميل"><table><caption>عروض أسعار العميل</caption><thead><tr><th>عرض السعر</th><th>التاريخ</th><th>صالح حتى</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>{data.quotes.map(quote => <tr key={quote.id}><td>{onQuote ? link(<bdi>#{number(quote.number)}</bdi>, () => onQuote(quote.id)) : <bdi>#{number(quote.number)}</bdi>}</td><td>{financeDate(quote.payload.date)}</td><td>{quote.payload.validUntil ? financeDate(quote.payload.validUntil) : "غير محدد"}</td><td><Numeric value={quote.total} money /></td><td>{quoteStatusLabels[quoteStatus(quote)]}</td></tr>)}</tbody></table></div> : empty("لا توجد عروض أسعار مرتبطة بهذا العميل"))}
        {selection.tab === "messages" && (data.messages.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="سجل الرسائل المرتبطة بفواتير العميل"><table><caption>سجل الرسائل المرتبطة بفواتير العميل</caption><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>حالة الإرسال</th><th>حالة التسليم</th></tr></thead><tbody>{data.messages.map(message => <tr key={message.id}><td>{link(<bdi>#{number(message.invoiceNumber)}</bdi>, () => openInvoice(message.invoiceId))}</td><td>{financeDate(message.finishedAt || message.createdAt)}</td><td>{messageLabels[message.status] || "حالة غير معروفة"}</td><td>{message.deliveryStatus ? deliveryLabels[message.deliveryStatus] || "حالة غير معروفة" : "غير مسجل"}</td></tr>)}</tbody></table></div> : empty("لا توجد رسائل مسجلة لهذا العميل"))}
        {selection.tab === "balance" && <><div className={styles.statement}><span>رصيد حساب العميل</span><strong><Numeric value={data.summary.balance} money /></strong></div>{data.balance.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="كشف حساب العميل"><table><caption>كشف حساب العميل</caption><thead><tr><th>المستند</th><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>{data.balance.map(entry => <tr key={entry.id}><td>{onJournal ? link(<>{documentKindNames[entry.kind] || "مستند"} <bdi>#{number(entry.number)}</bdi></>, () => onJournal(entry.documentId)) : <>{documentKindNames[entry.kind] || "مستند"} <bdi>#{number(entry.number)}</bdi></>}</td><td>{financeDate(entry.date)}</td><td>{entry.memo || "—"}</td><td><Numeric value={entry.debit} money /></td><td><Numeric value={entry.credit} money /></td><td><Numeric value={entry.runningBalance} money /></td></tr>)}</tbody></table></div> : empty("لا توجد حركات على حساب العميل")}</>}
        {selection.tab === "timeline" && (data.timeline.length ? <ol className={styles.timeline}>{data.timeline.map(entry => <li key={entry.id}><span className={styles.timelineMark} aria-hidden="true" /><div><strong>{entry.action}</strong><p>{entry.actor || "غير مسجل"}</p><time dateTime={entry.date}>{financeDate(entry.date)}</time>{entry.quoteId && onQuote ? link("عرض السعر", () => onQuote(entry.quoteId!)) : entry.documentId && ["sale", "activity", "message"].includes(entry.kind) ? link("عرض الفاتورة", () => openInvoice(entry.documentId!)) : entry.documentId && onJournal ? link("عرض القيد", () => onJournal(entry.documentId!)) : null}</div></li>)}</ol> : empty("لا توجد نشاطات مسجلة لهذا العميل"))}
        {selection.tab !== "details" && <nav className={styles.pagination} aria-label="صفحات سجل العميل"><button type="button" disabled={blocked || selection.page <= 1} onClick={() => { if (!blocked && selection.page > 1) setSelection(value => ({ ...value, page: value.page - 1 })); }}>السابق</button><span>صفحة <Numeric value={selection.page} /> من <Numeric value={Math.max(1, Math.ceil(data.total / data.pageSize))} /><small><Numeric value={data.total} /> سجل</small></span><button type="button" disabled={blocked || !data.hasMore} onClick={() => { if (!blocked && data.hasMore) setSelection(value => ({ ...value, page: value.page + 1 })); }}>التالي</button></nav>}
      </>}
    </div>
  </section>;
}
