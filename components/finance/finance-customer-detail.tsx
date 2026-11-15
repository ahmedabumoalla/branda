"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, FilePlus2, Pencil, Plus, RefreshCw, UserRound } from "lucide-react";
import { createCustomerDetailLoader } from "@/lib/finance/customer-detail-loader";
import { isMindSalesSimplified } from "@/lib/finance/sales-features";
import type { CustomerDetail, CustomerDetailTab } from "@/lib/finance/customer-detail";
import type { FinanceParty, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { quoteStatus, quoteStatusLabels } from "@/lib/finance/quotation";
import { documentKindNames, financeDate, financeDocumentStatus, Numeric } from "./finance-ui";
import styles from "./finance-customer-detail.module.css";
import { PartyAccountStatement } from "./party-account-statement";

const tabs = [["details", "الملخص"], ["invoices", "الفواتير"], ["payments", "المدفوعات"], ["quotes", "عروض الأسعار"], ["balance", "كشف الحساب"], ["messages", "الرسائل"], ["timeline", "النشاطات"]] as const;
const paymentLabels = { completed: "مكتمل", pending: "معلق", deleted: "محذوف" };
const messageLabels: Record<string, string> = { pending: "بانتظار الإرسال", queued: "تم قبول الإرسال", processing: "قيد الإرسال", sending: "قيد الإرسال", sent: "مرسلة", delivered: "تم التسليم", read: "تمت القراءة", failed: "تعذر الإرسال", cancelled: "ملغاة", skipped: "لم ترسل" };
const deliveryLabels: Record<string, string> = { pending: "بانتظار التسليم", sent: "مرسلة", delivered: "تم التسليم", read: "تمت القراءة", failed: "تعذر التسليم", yellowCard: "تحذير في التسليم" };
const number = (value: number) => String(value).padStart(6, "0");
function Fact({ label, children }: { label: string; children: ReactNode }) { return <div><dt>{label}</dt><dd>{children || "غير مسجل"}</dd></div>; }

type Props = {
  id: string; snapshot: Pick<FinanceSnapshot, "cafe" | "role" | "accounts" | "documents" | "userId" | "canAdminister">; disabled: boolean; onBack: () => void;
  onInvoice: (id: string) => void; onPayment: (invoiceId: string, paymentId: string) => void;
  onEdit?: (customer: FinanceParty) => void; onCreateInvoice?: (customer: FinanceParty) => void; onCreateQuote?: (customer: FinanceParty) => void;
  onQuote?: (id: string) => void; onJournal?: (documentId: string) => void;
  initialTab?: "details" | "balance";
  profile?: {
    customer: FinanceParty;
    actions: ReactNode;
    sections: { id: string; label: string; content: ReactNode }[];
  };
};

export function FinanceCustomerDetail({ id, snapshot, disabled, onBack, onInvoice, onPayment, onEdit, onCreateInvoice, onCreateQuote, onQuote, onJournal, profile, initialTab = "details" }: Props) {
  const [selection, setSelection] = useState<{ tab: CustomerDetailTab; page: number }>({ tab: initialTab, page: 1 });
  const [revision, setRevision] = useState(0);
  const [statementVisited, setStatementVisited] = useState(initialTab === "balance");
  const [profileSection, setProfileSection] = useState("");
  const [visitedSections, setVisitedSections] = useState<string[]>([]);
  // RSC can deliver an equal snapshot as a new object after a read action.
  // Compare the authorized data, not object identity, to avoid a read/render loop.
  const contextKey = JSON.stringify({ cafe: snapshot.cafe, userId: snapshot.userId, role: snapshot.role, canAdminister: snapshot.canAdminister, accounts: snapshot.accounts, documents: snapshot.documents, customer: profile?.customer });
  const slug = snapshot.cafe.slug;
  const loader = useMemo(() => createCustomerDetailLoader({ id, slug, revision, context: contextKey }), [id, slug, revision, contextKey]);
  const [loaded, setLoaded] = useState<{ loader: typeof loader; tab: CustomerDetailTab; page: number; data?: CustomerDetail; error?: string } | null>(null);
  const readSelection = useMemo(() => selection.tab === "balance" ? { tab: "details" as const, page: 1 } : selection, [selection]);
  const heading = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  useEffect(() => { heading.current?.focus(); }, [id]);
  useEffect(() => {
    let active = true;
    if (loader.peek(readSelection.tab, readSelection.page)) return;
    loader.load(readSelection.tab, readSelection.page).then(result => {
      if (active) setLoaded({ loader, ...readSelection, ...(result.ok ? { data: result.data } : { error: result.message }) });
    }).catch(() => { if (active) setLoaded({ loader, ...readSelection, error: "تعذر تحميل بيانات العميل أعد المحاولة" }); });
    return () => { active = false; };
  }, [loader, readSelection]);
  const cached = loader.peek(readSelection.tab, readSelection.page);
  const current = cached?.ok ? { data: cached.data } : loaded?.loader === loader && loaded.tab === readSelection.tab && loaded.page === readSelection.page ? loaded : null;
  const loading = !current;
  const data = current?.data;
  const error = current && "error" in current ? current.error : undefined;
  const summaryData = data ?? (loaded?.loader === loader ? loaded.data : undefined);
  const customer = summaryData?.customer ?? profile?.customer;
  const blocked = disabled || loading || !!error;
  const write = canFinance(snapshot.role, "accounting_write");
  const active = customer?.active ?? false;
  const visibleTabs = tabs.filter(([tab]) => tab !== "quotes" || !isMindSalesSimplified(snapshot.cafe.slug));
  const changeTab = (tab: CustomerDetailTab) => {
    setProfileSection("");
    if (tab === "balance") setStatementVisited(true);
    setSelection(value => value.tab === tab ? value : { tab, page: 1 });
  };
  const openInvoice = (invoiceId: string) => { if (!blocked) onInvoice(invoiceId); };
  const openPayment = (invoiceId: string, paymentId: string) => { if (!blocked) onPayment(invoiceId, paymentId); };
  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const index = visibleTabs.findIndex(([tab]) => tab === selection.tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? visibleTabs.length - 1 : event.key === "ArrowLeft" ? (index + 1) % visibleTabs.length : event.key === "ArrowRight" ? (index + visibleTabs.length - 1) % visibleTabs.length : -1;
    if (next < 0) return;
    event.preventDefault(); changeTab(visibleTabs[next][0]);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }
  const link = (label: ReactNode, action: () => void) => <button type="button" className={styles.link} disabled={blocked} onClick={() => { if (!blocked) action(); }}>{label}</button>;
  const empty = (label: string) => <p className={styles.empty}>{label}</p>;

  return <section className={styles.page} dir="rtl" aria-label="تفاصيل العميل" aria-busy={loading}>
    <header className={styles.header}>
      <div className={styles.identity}><span className={styles.avatar} aria-hidden="true"><UserRound size={25} /></span><div><span className={styles.eyebrow}>ملف العميل</span><h2 ref={heading} tabIndex={-1}>{customer?.name || "بيانات العميل"}</h2><div className={styles.identityMeta}>{customer && <span className={styles.badge} data-active={active}>{active ? "نشط" : "غير نشط"}</span>}{customer?.phone && <bdi>{customer.phone}</bdi>}</div></div></div>
      <div className={styles.headerEnd}><div className={styles.balanceHeading}><span>الرصيد الحالي</span>{summaryData || profile ? <strong><Numeric value={summaryData?.summary.balance ?? profile!.customer.balance} money /></strong> : <strong>—</strong>}</div><button type="button" onClick={onBack}><ArrowRight size={16} aria-hidden="true" />العملاء</button></div>
    </header>
    <div className={styles.actionbar}>
      {(write || profile) && onEdit && <button type="button" className={styles.primary} disabled={disabled || !customer || (!profile && blocked)} onClick={() => { if (!disabled && customer && (profile || !blocked)) onEdit(customer); }}><Pencil size={15} aria-hidden="true" />تعديل</button>}
      {write && !isMindSalesSimplified(snapshot.cafe.slug) && onCreateInvoice && <button type="button" disabled={blocked || !active} onClick={() => { if (!blocked && active && customer) onCreateInvoice(customer); }}><FilePlus2 size={15} aria-hidden="true" />إنشاء فاتورة</button>}
      {write && !isMindSalesSimplified(snapshot.cafe.slug) && onCreateQuote && <button type="button" disabled={blocked || !active} onClick={() => { if (!blocked && active && customer) onCreateQuote(customer); }}><Plus size={15} aria-hidden="true" />إنشاء عرض سعر</button>}
      {profile?.actions}
      <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} aria-hidden="true" />تحديث</button>
    </div>
    {summaryData && <div className={styles.metrics}><div><span>إجمالي الفواتير</span><strong><Numeric value={summaryData.summary.invoiceTotal} money /></strong></div><div><span>المرتجعات</span><strong><Numeric value={summaryData.summary.refundedTotal} money /></strong></div><div><span>المبلغ المحصل</span><strong><Numeric value={summaryData.summary.collected} money /></strong></div><div><span>المستحق على الفواتير</span><strong><Numeric value={summaryData.summary.outstanding} money /></strong></div></div>}
    <div className={styles.navigation}>
      <div className={styles.tabs} role="tablist" aria-label="سجل العميل">{visibleTabs.map(([tab, label]) => <button type="button" key={tab} id={`${uid}-${tab}`} role="tab" aria-selected={!profileSection && selection.tab === tab} aria-controls={tab === "balance" ? `${uid}-statement-panel` : `${uid}-panel`} tabIndex={selection.tab === tab ? 0 : -1} onClick={() => changeTab(tab)} onKeyDown={moveTab}>{label}{summaryData && ["invoices", "payments", "quotes", "messages"].includes(tab) && <span>{summaryData.counts[tab as keyof CustomerDetail["counts"]]}</span>}</button>)}</div>
      {profile && <select className={styles.moreSections} aria-label="المزيد من أقسام العميل" value={profileSection} onChange={event => { const value = event.target.value; setProfileSection(value); setVisitedSections(current => current.includes(value) ? current : [...current, value]); }}><option value="">المزيد</option>{profile.sections.filter(section => section.id !== "statement").map(section => <option key={section.id} value={section.id}>{section.label}</option>)}</select>}
    </div>
    <div className={styles.content} hidden={!!profileSection || selection.tab === "balance"} id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${selection.tab}`} tabIndex={0}>
      {loading ? <p className={styles.empty} role="status">جار تحميل سجل العميل</p> : error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>إعادة المحاولة</button></div> : !data || !customer ? empty("العميل غير متاح") : <>
        {selection.tab === "details" && <div className={styles.overview}><section className={styles.panel}><h3>معلومات مختصرة</h3><dl className={styles.facts}>
          <Fact label="عدد الفواتير"><Numeric value={data.counts.invoices} /></Fact><Fact label="فواتير غير مسددة"><Numeric value={data.summary.unpaidCount} /></Fact>
          <Fact label="آخر فاتورة">{data.summary.lastInvoice ? <>{link(<bdi>#{number(data.summary.lastInvoice.number)}</bdi>, () => openInvoice(data.summary.lastInvoice!.id))}<Numeric value={data.summary.lastInvoice.total} money /><small>{financeDate(data.summary.lastInvoice.date)}</small></> : "لا توجد فواتير"}</Fact>
          <Fact label="آخر دفعة">{data.summary.lastPayment ? <>{link(data.summary.lastPayment.initial ? "دفعة عند إصدار الفاتورة" : <bdi>#{number(data.summary.lastPayment.number)}</bdi>, () => openPayment(data.summary.lastPayment!.invoiceId, data.summary.lastPayment!.id))}<Numeric value={data.summary.lastPayment.amount} money /><small>{financeDate(data.summary.lastPayment.date)}</small></> : "لا توجد دفعات"}</Fact>
          <Fact label="آخر رسالة مرسلة">{data.summary.lastMessage ? financeDate(data.summary.lastMessage.finishedAt || data.summary.lastMessage.createdAt) : "لا توجد رسائل مرسلة"}</Fact>
        </dl></section><section className={styles.panel}><h3>بيانات العميل</h3><dl className={styles.facts}><Fact label="الاسم">{customer.name}</Fact><Fact label="الجوال"><bdi>{customer.phone || "غير مسجل"}</bdi></Fact><Fact label="البريد الإلكتروني"><bdi>{customer.email || "غير مسجل"}</bdi></Fact><Fact label="الرقم الضريبي"><bdi>{customer.tax_number || "غير مسجل"}</bdi></Fact><Fact label="المدينة">{customer.details?.city}</Fact><Fact label="المنطقة">{customer.details?.region}</Fact><Fact label="البلد">{customer.details?.country}</Fact></dl></section>

        </div>}
        {selection.tab === "invoices" && (data.invoices.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="فواتير العميل"><table><caption>فواتير العميل</caption><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{data.invoices.map(invoice => <tr key={invoice.id}><td>{link(<bdi>#{number(invoice.number)}</bdi>, () => openInvoice(invoice.id))}</td><td>{financeDate(invoice.created_at)}</td><td><Numeric value={invoice.total} money /></td><td><Numeric value={invoice.outstanding} money /></td><td>{financeDocumentStatus(invoice)}</td></tr>)}</tbody></table></div> : empty("لا توجد فواتير مرتبطة بهذا العميل"))}
        {selection.tab === "payments" && (data.payments.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="دفعات العميل"><table><caption>دفعات العميل</caption><thead><tr><th>عملية الدفع</th><th>الفاتورة</th><th>التاريخ</th><th>الحساب</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>{data.payments.map(payment => <tr key={payment.id}><td>{link(payment.initial ? "دفعة عند إصدار الفاتورة" : <bdi>#{number(payment.number)}</bdi>, () => openPayment(payment.invoiceId, payment.id))}</td><td>{link(<bdi>#{number(payment.invoiceNumber)}</bdi>, () => openInvoice(payment.invoiceId))}</td><td>{financeDate(payment.date)}</td><td>{payment.accountName || "غير مسجل"}</td><td><Numeric value={payment.amount} money /></td><td>{paymentLabels[payment.status]}</td></tr>)}</tbody></table></div> : empty("لا توجد دفعات مرتبطة بهذا العميل"))}
        {selection.tab === "quotes" && (data.quotes.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="عروض أسعار العميل"><table><caption>عروض أسعار العميل</caption><thead><tr><th>عرض السعر</th><th>التاريخ</th><th>صالح حتى</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>{data.quotes.map(quote => <tr key={quote.id}><td>{onQuote ? link(<bdi>#{quote.displayNumber || number(quote.number)}</bdi>, () => onQuote(quote.id)) : <bdi>#{quote.displayNumber || number(quote.number)}</bdi>}</td><td>{financeDate(quote.payload.date)}</td><td>{quote.payload.validUntil ? financeDate(quote.payload.validUntil) : "غير محدد"}</td><td><Numeric value={quote.total} money /></td><td>{quoteStatusLabels[quoteStatus(quote)]}</td></tr>)}</tbody></table></div> : empty("لا توجد عروض أسعار مرتبطة بهذا العميل"))}
        {selection.tab === "messages" && (data.messages.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="سجل الرسائل المرتبطة بفواتير العميل"><table><caption>سجل الرسائل المرتبطة بفواتير العميل</caption><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>حالة الإرسال</th><th>حالة التسليم</th></tr></thead><tbody>{data.messages.map(message => <tr key={message.id}><td>{link(<bdi>#{number(message.invoiceNumber)}</bdi>, () => openInvoice(message.invoiceId))}</td><td>{financeDate(message.finishedAt || message.createdAt)}</td><td>{messageLabels[message.status] || "حالة غير معروفة"}</td><td>{message.deliveryStatus ? deliveryLabels[message.deliveryStatus] || "حالة غير معروفة" : "غير مسجل"}</td></tr>)}</tbody></table></div> : empty("لا توجد رسائل مسجلة لهذا العميل"))}
        {selection.tab === "timeline" && (data.timeline.length ? <ol className={styles.timeline}>{data.timeline.map(entry => <li key={entry.id}><span className={styles.timelineMark} aria-hidden="true" /><div><strong>{entry.action}</strong><p>{entry.actor || "غير مسجل"}</p><time dateTime={entry.date}>{financeDate(entry.date)}</time>{entry.quoteId && onQuote ? link("عرض السعر", () => onQuote(entry.quoteId!)) : entry.documentId && ["sale", "activity", "message"].includes(entry.kind) ? link("عرض الفاتورة", () => openInvoice(entry.documentId!)) : entry.documentId && onJournal ? link("عرض القيد", () => onJournal(entry.documentId!)) : null}</div></li>)}</ol> : empty("لا توجد نشاطات مسجلة لهذا العميل"))}
        {selection.tab !== "details" && selection.tab !== "balance" && <nav className={styles.pagination} aria-label="صفحات سجل العميل"><button type="button" disabled={blocked || selection.page <= 1} onClick={() => { if (!blocked && selection.page > 1) setSelection(value => ({ ...value, page: value.page - 1 })); }}>السابق</button><span>صفحة <Numeric value={selection.page} /> من <Numeric value={Math.max(1, Math.ceil(data.total / data.pageSize))} /><small><Numeric value={data.total} /> سجل</small></span><button type="button" disabled={blocked || !data.hasMore} onClick={() => { if (!blocked && data.hasMore) setSelection(value => ({ ...value, page: value.page + 1 })); }}>التالي</button></nav>}
      </>}
    </div>
    {statementVisited && <section id={`${uid}-statement-panel`} role="tabpanel" aria-labelledby={`${uid}-balance`} tabIndex={0} hidden={!!profileSection || selection.tab !== "balance"} className={styles.statementPanel} aria-label="كشف حساب العميل"><PartyAccountStatement slug={slug} partyId={id} kind="customer" contextKey={`${contextKey}:${revision}`} onJournal={onJournal} /></section>}
    {profile?.sections.filter(section => visitedSections.includes(section.id)).map(section => <section key={section.id} hidden={profileSection !== section.id} className={styles.profileSection} aria-label={section.label}><h3>{section.label}</h3>{section.content}</section>)}
  </section>;
}
